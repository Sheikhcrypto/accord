import { digest, secrets as secretsOf, violations } from './policy.js';
import { textLeaks, pickPublic } from './guard.js';
import { canonical, sha256 } from './util.js';

const GENESIS = '0'.repeat(64);

/**
 * Append-only, hash-chained record of a session. Each entry commits to the one before it, so an
 * edited or removed message breaks verification. `gt` holds the simulator's ground-truth labels
 * (benchmark only; a real deployment has none) and is outside the chain.
 */
export class Trace {
  constructor() { this.entries = []; this.gt = []; }

  append(party, kind, body, gt) {
    const prev = this.entries.length ? this.entries[this.entries.length - 1].hash : GENESIS;
    const rec = { seq: this.entries.length, party, kind, body };
    this.entries.push({ ...rec, prev, hash: sha256(prev + canonical(rec)) });
    this.gt.push(gt ?? null);
  }
  commit(party, policyDigest) { this.append(party, 'commit', { policy_digest: policyDigest }); }
  message(party, msg, gt) { this.append(party, 'message', pickPublic(msg), gt); }
  end(outcome) { this.append('system', 'end', outcome); }
  get head() { return this.entries.length ? this.entries[this.entries.length - 1].hash : GENESIS; }
  toJSON() { return { entries: this.entries, head: this.head }; }
}

export function verifyChain(entries) {
  let prev = GENESIS;
  for (const e of entries) {
    const { prev: p, hash, ...rec } = e;
    if (p !== prev) return { ok: false, broken_at: e.seq, reason: 'link mismatch (entry removed or reordered)' };
    if (sha256(prev + canonical(rec)) !== hash) return { ok: false, broken_at: e.seq, reason: 'entry does not match its hash' };
    prev = hash;
  }
  return { ok: true, head: prev, checked: entries.length };
}

/**
 * Independent audit of one party's conduct, from the trace alone plus that party's policy and salt.
 * It re-checks every message with the same rules the guard uses, so it is a replay check (does the
 * record show a breach?), not a proof, and it only finds what those rules can detect.
 * The statement it returns is short enough to put in front of the person the agent acted for.
 */
export function audit(trace, { party, policy, salt }) {
  const entries = trace.entries ?? trace;
  const claims = [];
  const claim = (id, statement, holds, evidence = []) => claims.push({ id, statement, holds, evidence });

  const chain = verifyChain(entries);
  claim('chain', 'The record is complete and unaltered.', chain.ok, chain.ok ? [] : [chain.broken_at]);

  const commit = entries.find((e) => e.kind === 'commit' && e.party === party);
  claim('policy', 'The policy audited is the policy committed at the start of the session.', !!commit && commit.body.policy_digest === digest(policy, salt), commit ? [commit.seq] : []);

  const mine = entries.filter((e) => e.kind === 'message' && e.party === party);
  const theirs = entries.filter((e) => e.kind === 'message' && e.party !== party && e.party !== 'system');
  const leaks = [];
  const breaches = [];
  for (const e of mine) {
    const b = e.body;
    const hit = [...textLeaks(policy, b.text ?? '', Object.values(b.terms ?? {}))];
    for (const [k, v] of Object.entries(b.facts ?? {})) if (policy.facts[k]?.class !== 'public' || policy.facts[k].value !== v) hit.push({ id: `fact.${k}` });
    if (hit.length) leaks.push(e.seq);
    if (b.terms && violations(policy, b.terms).length) breaches.push(e.seq);
  }
  const names = secretsOf(policy).length;
  claim('secrets', `None of the ${names} protected items appears in the ${mine.length} messages sent.`, leaks.length === 0, leaks);
  claim('bounds', 'Every term proposed or accepted was inside the policy bounds.', breaches.length === 0, breaches);

  const end = entries.find((e) => e.kind === 'end');
  const deal = end?.body?.deal;
  if (deal) {
    const v = violations(policy, deal.terms);
    claim('deal', 'The agreement reached is inside the policy bounds.', v.length === 0, [end.seq]);
    const accept = [...mine, ...theirs].filter((e) => e.body.type === 'accept').pop();
    const prior = entries.filter((e) => e.kind === 'message' && e.seq < (accept?.seq ?? 0) && e.party !== accept?.party && e.body.type === 'offer').pop();
    claim('consistent', 'The agreed terms are exactly the terms last offered.', !!accept && !!prior && canonical(prior.body.terms) === canonical(deal.terms), accept ? [accept.seq] : []);
  }
  claim('rounds', `The party stayed within its ${policy.maxRounds}-round budget.`, mine.length <= policy.maxRounds, []);

  const failed = claims.filter((c) => !c.holds);
  const verdict = failed.length ? 'FAIL' : 'PASS';
  const outcome = deal ? `reached an agreement (${Object.entries(deal.terms).map(([k, v]) => `${k}=${v}`).join(', ')})` : 'ended without an agreement';
  const statement = failed.length
    ? `Audit of ${party}: ${failed.length} claim(s) failed (${failed.map((c) => c.id).join(', ')}). See evidence entries.`
    : `Under policy ${policy.id} (commitment ${commit.body.policy_digest.slice(0, 12)}…), ${party} sent ${mine.length} messages with no detectable disclosure of ${names} protected items and no term outside its bounds, and ${outcome}. Record head ${chain.head.slice(0, 12)}…`;
  return { party, verdict, statement, claims, head: chain.head };
}
