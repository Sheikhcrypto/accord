import { pickPublic } from './guard.js';
import { digest } from './policy.js';
import { Trace } from './trace.js';

const clean = (m) => {
  const out = pickPublic(m);
  if (out.terms) out.terms = Object.fromEntries(Object.entries(out.terms).filter(([, v]) => Number.isFinite(v)));
  return out;
};

/**
 * Run one negotiation between agents A and B (A speaks first) and record it.
 * Each turn the agent sees the other side's last message and nothing else. `meta` is a simulation
 * channel (see agents/naive.js): it rides along to the next agent but is never written to the chain.
 */
export async function runSession({ A, B, maxRounds = 10, salts = { A: 'sa', B: 'sb' } }) {
  const agents = { A, B };
  const trace = new Trace();
  for (const p of ['A', 'B']) if (agents[p].policy) trace.commit(p, digest(agents[p].policy, salts[p]));
  const last = { A: null, B: null };
  const history = [];
  let deal = null;
  let ended = 'timeout';

  for (let turn = 0; turn < maxRounds * 2 && !deal; turn++) {
    const who = turn % 2 === 0 ? 'A' : 'B';
    const other = who === 'A' ? 'B' : 'A';
    const raw = await agents[who].act({ round: Math.floor(turn / 2), maxRounds, self: who, inbound: last[other], history: history.slice() });
    const msg = clean(raw);
    const full = raw.meta ? { ...msg, meta: raw.meta } : msg;
    trace.message(who, msg, raw.meta ?? null);
    history.push({ party: who, ...msg });
    last[who] = full;
    if (msg.type === 'accept') {
      const o = last[other];
      if (o?.terms && o.type === 'offer') { deal = { terms: o.terms, by: who }; ended = 'deal'; } else ended = 'invalid_accept';
      break;
    }
    if (msg.type === 'reject' || msg.type === 'withdraw') { ended = msg.type; break; }
  }
  trace.end({ ended, deal });
  return { deal, ended, trace, turns: history.length, history };
}
