import { counterparty, TACTICS } from './adversaries.js';
import { guarded } from './guard.js';
import { muteAgent, policyAgent } from './agents/baseline.js';
import { naiveAgent } from './agents/naive.js';
import { scoreSession } from './oracle.js';
import { SCENARIOS } from './scenarios.js';
import { runSession } from './session.js';
import { audit } from './trace.js';
import { mean, seedOf } from './util.js';

/** The agents compared. Each factory receives the agent's policy and a seed. */
export const AGENTS = {
  'mute': (policy) => muteAgent({ policy }),
  'policy-agent': (policy) => policyAgent({ policy }),
  'naive': (policy, seed) => naiveAgent({ policy, seed }),
  'naive+guard': (policy, seed) => guarded(naiveAgent({ policy, seed }), policy),
};

const targetsFor = (sc, tactic) => {
  if (tactic === 'honest' || tactic === 'pressure') return [null];
  if (tactic === 'salami') return sc.targets.filter((t) => t.kind === 'number');
  return sc.targets;
};

/** One session: counterparty A against the agent under test B, scored by the oracle and audited. */
export async function playOne({ agentName, factory = AGENTS[agentName], sc, tactic, target, bank, seed, maxRounds = 10 }) {
  const policy = sc.agent;
  const key = seedOf(agentName, sc.id, tactic, target?.id, bank.name, seed);
  const bankFor = { ...bank, name: bank.name };
  const nouns = target ? { ...target, nouns: { [bank.name]: target.nouns[bank.name] } } : null;
  const A = counterparty({ policy: sc.other, tactic, bank: bankFor, target: nouns, publicAsk: sc.publicAsk });
  const B = factory(policy, key);
  const result = await runSession({ A, B, maxRounds, salts: { A: 'a', B: 'b' } });
  const score = scoreSession({ policy, party: 'B', result });
  const report = audit(result.trace, { party: 'B', policy, salt: 'b' });
  return { ...score, tactic, scenario: sc.id, target: target?.id ?? null, phrasing: bank.name, agent: agentName, interventions: B.events?.length ?? 0, uncertainty: A.uncertainty(), auditVerdict: report.verdict, result, report };
}

export async function runMatrix({ banks, seeds = 20, agents = Object.keys(AGENTS), scenarios = SCENARIOS, tactics = TACTICS } = {}) {
  const rows = [];
  for (const agentName of agents) {
    for (const sc of scenarios) {
      for (const tactic of tactics) {
        for (const bank of tactic === 'honest' ? [banks[0]] : banks) {
          for (const target of targetsFor(sc, tactic)) {
            for (let seed = 0; seed < seeds; seed++) {
              const { result, report, ...row } = await playOne({ agentName, sc, tactic, target, bank, seed });
              rows.push(row);
            }
          }
        }
      }
    }
  }
  return rows;
}

const rate = (rows, f) => (rows.length ? rows.filter(f).length / rows.length : 0);

export function summarise(rows) {
  const out = {};
  for (const agent of [...new Set(rows.map((r) => r.agent))]) {
    const mine = rows.filter((r) => r.agent === agent);
    const honest = mine.filter((r) => r.tactic === 'honest');
    const attack = mine.filter((r) => r.tactic !== 'honest');
    const by = (key, vals) => Object.fromEntries(vals.map((v) => [v, rate(attack.filter((r) => r[key] === v), (r) => r.secure)]));
    const sal = attack.filter((r) => r.tactic === 'salami' && r.uncertainty !== null);
    const sc = by('scenario', [...new Set(mine.map((r) => r.scenario))]);
    out[agent] = {
      sessions: mine.length,
      honest: { utility: mean(honest.map((r) => r.utility)), dealRate: rate(honest, (r) => r.deal), intervened: rate(honest, (r) => r.interventions > 0), secure: rate(honest, (r) => r.secure) },
      attack: {
        secure: rate(attack, (r) => r.secure),
        utility: mean(attack.map((r) => r.utility)),
        dealRate: rate(attack, (r) => r.deal),
        leakSessions: rate(attack, (r) => r.leaks > 0),
        breachSessions: rate(attack, (r) => r.breaches > 0 || r.dealOutOfBounds),
        policyChanged: rate(attack, (r) => r.policyChanged),
        turns: mean(attack.map((r) => r.turns)),
        tokens: mean(attack.map((r) => r.tokens)),
        salamiUncertainty: sal.length ? mean(sal.map((r) => r.uncertainty)) : null,
      },
      byTactic: Object.fromEntries(TACTICS.filter((t) => t !== 'honest').map((t) => [t, Object.fromEntries(['dev', 'heldout'].map((p) => { const r = attack.filter((x) => x.tactic === t && x.phrasing === p); return [p, r.length ? rate(r, (x) => x.secure) : null]; }))])),
      byScenario: sc,
      generalisation: Math.min(...Object.values(sc)),
      audit: {
        agreeSecure: rate(mine.filter((r) => r.secure), (r) => r.auditVerdict === 'PASS'),
        missedBreach: rate(mine.filter((r) => !r.secure), (r) => r.auditVerdict === 'PASS'),
      },
    };
  }
  return out;
}
