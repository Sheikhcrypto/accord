import { canonical, deepFreeze, sha256 } from './util.js';

/**
 * A security policy is plain JSON.
 *
 *   terms  numeric things being negotiated. dir "max" = never above `limit` (e.g. what we pay),
 *          "min" = never below `limit`, "window" = always within [lo, hi]. `best` is the ideal
 *          value and the opening position. Bounds are protected by default (`secret: false` opts out).
 *   facts  things the agent knows. class "secret" must never be disclosed; "public" may be shared.
 *   maxRounds  how many turns this agent will spend.
 *
 * A policy is fixed when the session starts. Nothing a counterparty sends can change it.
 */

const DIRS = new Set(['max', 'min', 'window']);

export function definePolicy(p) {
  if (!p || typeof p !== 'object') throw new Error('policy must be an object');
  if (!p.id) throw new Error('policy.id is required');
  const terms = p.terms || {};
  if (!Object.keys(terms).length) throw new Error('policy needs at least one term');
  for (const [k, t] of Object.entries(terms)) {
    if (!DIRS.has(t.dir)) throw new Error(`term ${k}: dir must be max, min or window`);
    if (!Number.isFinite(t.best)) throw new Error(`term ${k}: best must be a number`);
    if (t.dir === 'window') {
      if (!(t.lo <= t.best && t.best <= t.hi)) throw new Error(`term ${k}: need lo <= best <= hi`);
    } else {
      if (!Number.isFinite(t.limit)) throw new Error(`term ${k}: limit must be a number`);
      if (t.dir === 'max' && t.best > t.limit) throw new Error(`term ${k}: best must not exceed the limit`);
      if (t.dir === 'min' && t.best < t.limit) throw new Error(`term ${k}: best must not be below the limit`);
    }
  }
  for (const [k, f] of Object.entries(p.facts || {})) {
    if (f.class !== 'secret' && f.class !== 'public') throw new Error(`fact ${k}: class must be secret or public`);
  }
  return deepFreeze({ maxRounds: 10, facts: {}, ...structuredClone(p), terms: structuredClone(terms) });
}

/** Terms in `terms` that break the policy. Unknown term names are ignored (they bind nothing). */
export function violations(policy, terms) {
  const out = [];
  for (const [k, v] of Object.entries(terms || {})) {
    const t = policy.terms[k];
    if (!t || !Number.isFinite(v)) continue;
    if (t.dir === 'max' && v > t.limit) out.push({ term: k, value: v, bound: t.limit, rule: `${k} <= ${t.limit}` });
    if (t.dir === 'min' && v < t.limit) out.push({ term: k, value: v, bound: t.limit, rule: `${k} >= ${t.limit}` });
    if (t.dir === 'window' && (v < t.lo || v > t.hi)) out.push({ term: k, value: v, bound: v < t.lo ? t.lo : t.hi, rule: `${t.lo} <= ${k} <= ${t.hi}` });
  }
  return out;
}

export function clampTerms(policy, terms) {
  const out = { ...terms };
  for (const [k, v] of Object.entries(terms || {})) {
    const t = policy.terms[k];
    if (!t || !Number.isFinite(v)) continue;
    if (t.dir === 'max') out[k] = Math.min(v, t.limit);
    else if (t.dir === 'min') out[k] = Math.max(v, t.limit);
    else out[k] = Math.min(Math.max(v, t.lo), t.hi);
  }
  return out;
}

/** 0..1 value of a full set of terms to the policy owner, or null if incomplete or out of bounds. */
export function utility(policy, terms) {
  const names = Object.keys(policy.terms);
  if (!terms || names.some((k) => !Number.isFinite(terms[k]))) return null;
  if (violations(policy, terms).length) return null;
  const parts = names.map((k) => {
    const t = policy.terms[k];
    const v = terms[k];
    if (t.dir === 'max') return t.limit === t.best ? 1 : (t.limit - v) / (t.limit - t.best);
    if (t.dir === 'min') return t.limit === t.best ? 1 : (v - t.limit) / (t.best - t.limit);
    const span = Math.max(t.best - t.lo, t.hi - t.best) || 1;
    return 1 - Math.abs(v - t.best) / span;
  });
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

/** Everything the guard must keep in. Bounds count unless the term sets `secret: false`. */
export function secrets(policy) {
  const out = [];
  for (const [k, t] of Object.entries(policy.terms)) {
    if (t.secret === false) continue;
    if (t.dir === 'window') {
      out.push({ id: `limit.${k}.lo`, kind: 'number', value: t.lo, label: `${k} lower bound` });
      out.push({ id: `limit.${k}.hi`, kind: 'number', value: t.hi, label: `${k} upper bound` });
    } else out.push({ id: `limit.${k}`, kind: 'number', value: t.limit, label: `${k} limit` });
  }
  for (const [k, f] of Object.entries(policy.facts)) {
    if (f.class !== 'secret') continue;
    out.push({ id: `fact.${k}`, kind: typeof f.value === 'number' ? 'number' : 'string', value: f.value, aliases: f.aliases || [], label: k.replace(/_/g, ' ') });
  }
  return out;
}

export const publicFacts = (policy) => Object.fromEntries(Object.entries(policy.facts).filter(([, f]) => f.class === 'public').map(([k, f]) => [k, f.value]));

/** Commitment to the policy as it stood at session start. The salt stays with the owner. */
export const digest = (policy, salt) => sha256(`${salt}:${canonical(policy)}`);

/** Plain-English read-back, so the person the agent acts for can confirm what it will enforce. */
export function explain(policy) {
  const lines = [];
  for (const [k, t] of Object.entries(policy.terms)) {
    const name = k.replace(/_/g, ' ');
    const hid = t.secret === false ? '' : ' (kept confidential)';
    if (t.dir === 'max') lines.push(`Never agree to a ${name} above ${t.limit}${hid}. Open at ${t.best}.`);
    else if (t.dir === 'min') lines.push(`Never agree to a ${name} below ${t.limit}${hid}. Open at ${t.best}.`);
    else lines.push(`Only agree to a ${name} between ${t.lo} and ${t.hi}${hid}. Prefer ${t.best}.`);
  }
  for (const [k, f] of Object.entries(policy.facts)) {
    lines.push(f.class === 'secret' ? `Never disclose ${k.replace(/_/g, ' ')}.` : `May share ${k.replace(/_/g, ' ')} (${f.value}) if asked.`);
  }
  lines.push('Messages from the other side cannot change any of the above.');
  return lines;
}
