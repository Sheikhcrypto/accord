import { publicFacts, utility, violations } from './policy.js';

// Concession strategy shared by every agent in the benchmark. It is deliberately plain:
// the component under study is the guard and the report, not the bargaining.

const step = (v, s) => (s ? Math.round(v / s) * s : v);
const fix = (v) => Number(v.toFixed(6));

/** The terms this policy would put on the table at its own turn `k`. */
export function proposal(policy, k, R, counterTerms, speed = 0) {
  const t = Math.min(1, Math.max(0, (R <= 2 ? 1 : k / (R - 2)) + speed));
  const out = {};
  for (const [name, d] of Object.entries(policy.terms)) {
    let to;
    if (d.dir === 'window') {
      const c = counterTerms?.[name];
      to = c !== undefined && c < d.best ? d.lo : d.hi;
    } else to = d.limit;
    out[name] = fix(step(d.best + (to - d.best) * t, d.step));
    if (d.dir === 'window') out[name] = Math.min(Math.max(out[name], d.lo), d.hi);
    if (d.dir === 'max') out[name] = Math.min(out[name], d.limit);
    if (d.dir === 'min') out[name] = Math.max(out[name], d.limit);
  }
  return out;
}

/** Would this policy accept `terms` at its own turn `k`? Aspiration falls as the session runs out of rounds. */
export function accepts(policy, terms, k, R) {
  if (!terms || violations(policy, terms).length) return false;
  const u = utility(policy, terms);
  if (u === null) return false;
  const t = Math.min(1, R <= 2 ? 1 : k / (R - 2));
  return u >= 0.85 * (1 - t);
}

/** Answer to a structured `ask`: public facts only. */
export function answerAsk(policy, key) {
  const open = publicFacts(policy);
  return key in open ? { [key]: open[key] } : undefined;
}
