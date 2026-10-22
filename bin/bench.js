import { writeFileSync } from 'node:fs';
import { runMatrix, summarise } from '../src/bench.js';
import dev from '../src/phrases/dev.js';

const banks = [dev];
try { banks.push((await import('../src/phrases/heldout.js')).default); } catch { /* held-out set not present */ }
const seeds = Number(process.argv.find((a) => a.startsWith('--seeds='))?.split('=')[1] ?? 20);

const rows = await runMatrix({ banks, seeds });
const sum = summarise(rows);
const pct = (x) => (x === null || x === undefined ? '  n/a' : `${(x * 100).toFixed(0).padStart(4)}%`);
const f2 = (x) => x.toFixed(2);

const lines = [];
lines.push(`# Accord benchmark  (${rows.length} sessions, ${seeds} seeds, wording sets: ${banks.map((b) => b.name).join(' + ')})`, '');
lines.push('## Frontier: honest-counterparty utility vs security under attack', '');
lines.push('| agent | utility (honest) | deal rate (honest) | secure under attack | utility under attack | leaked | bound breach | agent talked down | guard fired on honest |');
lines.push('|---|---|---|---|---|---|---|---|---|');
for (const [a, s] of Object.entries(sum)) lines.push(`| ${a} | ${f2(s.honest.utility)} | ${pct(s.honest.dealRate)} | ${pct(s.attack.secure)} | ${f2(s.attack.utility)} | ${pct(s.attack.leakSessions)} | ${pct(s.attack.breachSessions)} | ${pct(s.attack.policyChanged)} | ${pct(s.honest.intervened)} |`);
lines.push('', '## Secure sessions by tactic and wording set', '');
lines.push(`| tactic | ${Object.keys(sum).flatMap((a) => banks.map((b) => `${a} (${b.name})`)).join(' | ')} |`);
lines.push(`|---|${Object.keys(sum).flatMap((a) => banks.map(() => '---')).join('|')}|`);
for (const t of Object.keys(Object.values(sum)[0].byTactic)) lines.push(`| ${t} | ${Object.entries(sum).flatMap(([, s]) => banks.map((b) => pct(s.byTactic[t][b.name]))).join(' | ')} |`);
lines.push('', '## Generalisation, cost and audit', '');
lines.push('| agent | worst scenario | licence | data-share | scheduling | turns | ~tokens sent | salami: range left | audit passes a breached run |');
lines.push('|---|---|---|---|---|---|---|---|---|');
for (const [a, s] of Object.entries(sum)) lines.push(`| ${a} | ${pct(s.generalisation)} | ${pct(s.byScenario.licence)} | ${pct(s.byScenario['data-share'])} | ${pct(s.byScenario.scheduling)} | ${s.attack.turns.toFixed(1)} | ${s.attack.tokens.toFixed(0)} | ${s.attack.salamiUncertainty === null ? 'n/a' : pct(s.attack.salamiUncertainty)} | ${pct(s.audit.missedBreach)} |`);

const md = lines.join('\n');
console.log(md);
writeFileSync(new URL('../results/bench.md', import.meta.url), md + '\n');
writeFileSync(new URL('../results/bench.json', import.meta.url), JSON.stringify({ seeds, banks: banks.map((b) => b.name), summary: sum }, null, 2) + '\n');
