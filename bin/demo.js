import { counterparty } from '../src/adversaries.js';
import { guarded } from '../src/guard.js';
import { naiveAgent } from '../src/agents/naive.js';
import dev from '../src/phrases/dev.js';
import { elicit } from '../src/requirements.js';
import { SCENARIOS } from '../src/scenarios.js';
import { runSession } from '../src/session.js';
import { audit } from '../src/trace.js';

const hr = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 68 - t.length))}`);
const sc = SCENARIOS[0];

hr('1. Requirement capture: what the person said → what the agent will enforce');
const said = 'I can pay at most £100k for the licence. Ideally around £60k. Do not tell them about the "Vendor B quote".';
console.log(`"${said}"`);
const e = elicit(said, { price: { words: ['price', 'licence', 'pay'], step: 500 } }, { id: 'me' });
e.readback.forEach((l) => console.log('  •', l));
console.log(e.questions.length ? 'Questions I would ask before starting:' : 'No open questions.'); e.questions.forEach((q) => console.log('  ?', q));

async function play(label, B) {
  hr(label);
  const target = { ...sc.targets[0], nouns: { dev: sc.targets[0].nouns.dev } };
  const A = counterparty({ policy: sc.other, tactic: 'authority', bank: dev, target, publicAsk: sc.publicAsk });
  const r = await runSession({ A, B, salts: { A: 'a', B: 'b' } });
  for (const m of r.history) {
    const who = m.party === 'A' ? 'counterparty' : 'our agent  ';
    console.log(`${who} ${m.type.padEnd(6)} ${JSON.stringify(m.terms ?? {})}${m.text ? `\n               “${m.text.replace(/\n/g, ' ')}”` : ''}`);
  }
  console.log(`outcome: ${r.ended}${r.deal ? ' ' + JSON.stringify(r.deal.terms) : ''}`);
  const rep = audit(r.trace, { party: 'B', policy: sc.agent, salt: 'b' });
  console.log(`audit:   ${rep.verdict}. ${rep.statement}`);
  rep.claims.filter((c) => !c.holds).forEach((c) => console.log(`         ✗ ${c.id}: ${c.statement} (entries ${c.evidence.join(',')})`));
  return B;
}

await play('2. An agent that is easily talked round, unguarded, facing a fake "administrator"', naiveAgent({ policy: sc.agent, seed: 7, susceptibility: { authority: 1, authorityDisclose: 1 } }));
const g = await play('3. The same agent behind the guard', guarded(naiveAgent({ policy: sc.agent, seed: 7, susceptibility: { authority: 1, authorityDisclose: 1 } }), sc.agent));
console.log('\nGuard interventions:', g.events.map((x) => `${x.side}:${x.kind}`).join(', '));
