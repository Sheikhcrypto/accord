import { definePolicy, explain } from './policy.js';

/**
 * Requirement capture: turn what a person says into a draft policy, and ask about whatever is
 * missing or ambiguous instead of guessing. Rule-based, English only, and intentionally modest:
 * it shows the interface (text in, policy + open questions + read-back out). A model-driven
 * extractor can replace `elicit` as long as it returns the same shape.
 *
 * vocab: { termName: { words: ['price','cost'], unit?: 'GBP', step?: n } }
 */

const NUM = '(?:£|\\$|€)?\\s*(\\d+(?:[.,]\\d+)*)\\s*(k|m|million|thousand)?';
const MULT = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6 };
const toNum = (s, u) => Number(String(s).replace(/,/g, '')) * (MULT[u?.toLowerCase()] ?? 1);
const SOFT = /\b(ideally|aim(?:ing)?|target|prefer|hope|hoping|around|about|roughly|try|would like|want)\b/i;
const MAX_WORDS = /\b(at most|no more than|maximum|max|up to|under|below|not (?:go |pay |spend |agree )?(?:to )?(?:over|above|beyond|more than)|never (?:pay|spend|agree|go)[^.]*?(?:over|above|more than)|cap(?:ped)? (?:at|of))\b/i;
const MIN_WORDS = /\b(at least|no less than|no lower than|minimum|min|not (?:go |accept |agree )?(?:to )?(?:under|below|less than|lower than)|never (?:accept|agree|go)[^.]*?(?:under|below|less than)|floor (?:of|at))\b/i;
const SECRET = /\b(confidential|secret|private|don'?t (?:tell|share|reveal|disclose|mention)|do not (?:tell|share|reveal|disclose|mention)|keep (?:it |this )?(?:quiet|private|confidential)|never (?:tell|share|reveal|disclose))\b/i;
const OPEN = /\b(you (?:can|may) (?:tell|share|say|mention)|fine to (?:share|mention|say)|not secret|public)\b/i;

export function elicit(text, vocab, { id = 'draft', maxRounds = 10 } = {}) {
  const sentences = String(text).split(/(?<=[.!?\n])\s+/).map((s) => s.trim()).filter(Boolean);
  const terms = {};
  const facts = {};
  const questions = [];

  let lastNamed = [];
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    const mentions = (v) => v.words.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(lower));
    const named = Object.keys(vocab).filter((n) => mentions(vocab[n]));
    // "Ideally around 60k." names no term, so it belongs to the one the previous sentence was about
    const about = named.length ? named : lastNamed.length === 1 ? lastNamed : [];
    if (named.length) lastNamed = named;
    for (const name of about) {
      const v = vocab[name];
      const m = sentence.match(new RegExp(NUM, 'i'));
      if (!m) continue;
      const value = toNum(m[1], m[2]);
      const soft = SOFT.test(sentence) && !MAX_WORDS.test(sentence) && !MIN_WORDS.test(sentence);
      const dir = MAX_WORDS.test(sentence) ? 'max' : MIN_WORDS.test(sentence) ? 'min' : v.dir ?? null;
      const t = (terms[name] ??= { words: v.words, step: v.step });
      if (soft) { t.best = value; t.softOnly = !t.limit; }
      else if (dir) {
        if (t.limit !== undefined && t.limit !== value) questions.push(`You gave two different limits for ${name} (${t.limit} and ${value}). Which is the real one?`);
        t.limit = value; t.dir = dir; t.softOnly = false;
      } else questions.push(`Is ${value} for ${name} a ceiling, a floor, or a target?`);
    }
    if (SECRET.test(sentence) && !OPEN.test(sentence)) {
      const quoted = sentence.match(/["“']([^"”']{3,})["”']/)?.[1];
      const key = quoted ? quoted.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 24) : `confidential_${Object.keys(facts).length + 1}`;
      const names = Object.keys(vocab).filter((n) => vocab[n].words.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(sentence)));
      if (names.length && !quoted) continue; // "don't tell them my limit" marks the bound itself as protected, which is the default
      facts[key] = { class: 'secret', value: quoted ?? sentence.replace(SECRET, '').replace(/[.!]$/, '').trim(), aliases: [] };
    }
  }

  const draft = { id, maxRounds, terms: {}, facts };
  for (const [name, t] of Object.entries(terms)) {
    if (t.limit === undefined) {
      questions.push(`You mentioned ${name} as something to aim for${t.best !== undefined ? ` (${t.best})` : ''}. What is the hard limit I must never cross?`);
      continue;
    }
    const best = t.best ?? (t.dir === 'max' ? t.limit * 0.6 : t.limit * 1.4);
    if (t.best === undefined) questions.push(`What should I open with for ${name}? I assumed ${best} (the limit is ${t.limit}).`);
    draft.terms[name] = { dir: t.dir, limit: t.limit, best, ...(t.step ? { step: t.step } : {}) };
  }
  for (const name of Object.keys(vocab)) if (!terms[name]) questions.push(`I have no limit for ${name}. Is it negotiable at all, and what is the bound?`);
  if (!Object.keys(facts).length) questions.push('Is there anything I must never mention to the other side (reasons, alternatives, deadlines)?');

  let policy = null;
  let error = null;
  try { policy = Object.keys(draft.terms).length ? definePolicy(draft) : null; } catch (e) { error = e.message; }
  return { policy, draft, questions, readback: policy ? explain(policy) : [], error };
}
