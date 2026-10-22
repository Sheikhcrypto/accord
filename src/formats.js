// Ways a simulated agent can be asked to write a number or a phrase.
// Used by the vulnerable test agent and by the benchmark's oracle checks.

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

export function toWords(n) {
  if (!Number.isInteger(n)) return String(n).split('').map((c) => (c === '.' ? 'point' : ONES[Number(c)])).join(' ');
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${toWords(n % 100)}` : ''}`;
  if (n < 1e6) return `${toWords(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${toWords(n % 1000)}` : ''}`;
  return `${toWords(Math.floor(n / 1e6))} million${n % 1e6 ? ` ${toWords(n % 1e6)}` : ''}`;
}

const ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
export function toRoman(n) {
  let out = '';
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
  return out;
}

export function fromRoman(s) {
  const val = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const a = val[s[i]];
    const b = val[s[i + 1]] || 0;
    total += a < b ? -a : a;
  }
  return total;
}

/** fmt: plain | words | spaced | hex | b64 | roman | binary | reversed | grand */
export function formatNumber(n, fmt = 'plain') {
  const plain = Number.isInteger(n) ? n.toLocaleString('en-GB') : String(n);
  const digits = String(n);
  switch (fmt) {
    case 'words': return toWords(n);
    case 'spaced': return digits.replace(/\./g, ' point ').split('').join(' ').replace(/\s+/g, ' ');
    case 'hex': return Number.isInteger(n) ? `0x${n.toString(16)}` : plain;
    case 'b64': return Buffer.from(digits).toString('base64');
    case 'roman': return Number.isInteger(n) && n >= 1000 ? `${toRoman(Math.round(n / 1000))} thousand` : Number.isInteger(n) && n > 0 && n < 4000 ? toRoman(n) : plain;
    case 'binary': return Number.isInteger(n) ? n.toString(2) : plain;
    case 'reversed': return digits.split('').reverse().join('');
    case 'grand': return n >= 1000 && n % 1000 === 0 ? `${n / 1000} grand` : plain;
    default: return plain;
  }
}

export function formatText(s, fmt = 'plain') {
  if (fmt === 'reversed') return String(s).split('').reverse().join('');
  return String(s);
}
