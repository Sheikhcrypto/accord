// Normalises the ways a number can be written into plain values, so the guard can tell when
// a protected figure is about to leave in a message. Heuristic: it covers the forms listed
// below and nothing else (see "Known limits" in the README).

const UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const NW = [...Object.keys(UNITS), ...Object.keys(TENS), 'hundred', 'thousand', 'million'].join('|');
const RUN = new RegExp(`\\b(?:${NW})(?:[\\s-]+(?:and[\\s-]+)?(?:${NW}))*\\b`, 'g');
const SUFFIX = { k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, million: 1e6 };

function wordsToNumber(run) {
  let total = 0;
  let cur = 0;
  for (const w of run.split(/[\s-]+/)) {
    if (w === 'and') continue;
    if (w in UNITS) cur += UNITS[w];
    else if (w in TENS) cur += TENS[w];
    else if (w === 'hundred') cur = (cur || 1) * 100;
    else if (w === 'thousand') { total += (cur || 1) * 1e3; cur = 0; }
    else if (w === 'million') { total += (cur || 1) * 1e6; cur = 0; }
  }
  return total + cur;
}

/**
 * Numbers a reader would take from `text`: digits, 1,000 separators, 85k / 1.2m / 85 thousand,
 * spelled-out English ("eighty-five thousand"), and digits spaced apart ("8 5 0 0 0").
 */
export function extractNumbers(text) {
  let s = String(text ?? '').toLowerCase().replace(/[£$€]/g, ' ');
  s = s.replace(/(\d+(?:\.\d+)?)\s*(k|m|mn|thousand|million)\b/g, (_, n, u) => ` ${Number(n) * SUFFIX[u]} `);
  s = s.replace(RUN, (m) => ` ${wordsToNumber(m)} `);
  s = s.replace(/\b\d(?:[ -]\d){3,}\b/g, (m) => ` ${m.replace(/[ -]/g, '')} `);
  s = s.replace(/\d{1,3}(?:,\d{3})+(?:\.\d+)?/g, (m) => m.replace(/,/g, ''));
  return [...s.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}

/** Tokens that look like an encoding (hex, base64, binary) rather than prose. */
export function opaqueBlobs(text) {
  const hits = [];
  for (const raw of String(text ?? '').split(/\s+/)) {
    const t = raw.replace(/^[^\w+/=]+|[^\w+/=]+$/g, '');
    if (!t) continue;
    if (/^0x[0-9a-f]{3,}$/i.test(t)) hits.push({ kind: 'hex', token: t });
    else if (/^[0-9a-f]{8,}$/i.test(t) && /\d/.test(t) && /[a-f]/i.test(t)) hits.push({ kind: 'hex', token: t });
    else if (/^[A-Za-z0-9+/]{6,}={1,2}$/.test(t)) hits.push({ kind: 'base64', token: t });
    else if (/^[A-Za-z0-9+/]{16,}$/.test(t) && /[A-Z]/.test(t) && /[a-z]/.test(t) && /\d/.test(t)) hits.push({ kind: 'base64', token: t });
    else if (/^[01]{8,}$/.test(t)) hits.push({ kind: 'binary', token: t });
  }
  return hits;
}
