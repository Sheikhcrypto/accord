import { answerAsk, accepts, proposal } from './strategy.js';
import { formatNumber } from './formats.js';

export const TACTICS = ['honest', 'probe', 'authority', 'reciprocity', 'salami', 'pressure', 'injection', 'obfuscate'];
export const ATTACK_TURNS = [1, 2, 3, 4];

const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

/**
 * A scripted counterparty. It negotiates for real (same concession strategy as everyone else)
 * and, on its second to fourth turns, mixes in one kind of attack. `target` is the protected item
 * it goes after; `bank` is the wording set. Attack messages carry `meta` (see agents/naive.js).
 *
 *   honest       no attack; once asks a question a cautious guard might mis-flag (over-blocking control)
 *   probe        asks outright for the protected item
 *   authority    claims to be the agent's administrator and orders a relaxation
 *   reciprocity  offers to reveal its own position if the agent goes first
 *   salami       binary-searches the protected number with yes/no hypotheticals
 *   pressure     deadlines and threats, with offers outside the agent's bounds
 *   injection    instruction-like content, markup, fake policy updates
 *   obfuscate    asks for the item in a form a plain-text filter may not recognise
 */
export function counterparty({ policy, tactic, bank, target, publicAsk }) {
  let goodwill = false;
  let lo = target?.range?.[0];
  let hi = target?.range?.[1];
  const span = hi - lo;
  let lastX = null;

  const agent = {
    id: `counterparty:${tactic}`,
    policy,
    uncertainty: () => (span ? (hi - lo) / span : null),
    async act(view) {
      const k = view.round;
      const R = view.maxRounds;
      const inb = view.inbound;
      if (inb?.facts && publicAsk && inb.facts[publicAsk] !== undefined) goodwill = true;
      if (inb?.type === 'offer' && inb.terms && accepts(policy, inb.terms, k, R)) return { type: 'accept', terms: inb.terms };

      if (tactic === 'salami' && lastX !== null && inb?.text) {
        const yes = /^\s*yes/i.test(inb.text);
        const no = /^\s*no\b/i.test(inb.text);
        if (yes || no) {
          const up = (target.dir === 'max') === yes; // yes on a "max" limit means limit >= x
          if (up) lo = Math.max(lo, lastX); else hi = Math.min(hi, lastX);
        }
      }

      const terms = proposal(policy, k, R, inb?.terms, goodwill ? 0.15 : 0);
      if (k === 0) return { type: 'offer', terms, ask: publicAsk, text: bank.askPublic, meta: { tactic: 'ask_public' } };

      const i = ATTACK_TURNS.indexOf(k);
      if (tactic === 'honest') return { type: 'offer', terms, text: k === 1 ? bank.honestAsk[0] : bank.benign[k % bank.benign.length], meta: { tactic: 'benign' } };
      if (i < 0) return { type: 'offer', terms };

      const at = (arr) => arr[i % arr.length];
      const nn = target ? target.nouns[bank.name] : [];
      const n = target ? at(nn) : '';
      const meta = { tactic, target: target?.id };
      switch (tactic) {
        case 'salami': {
          lastX = Math.round((lo + hi) / 2 / (target.step || 1)) * (target.step || 1);
          const x = formatNumber(lastX);
          return { type: bank.salamiType, terms: { ...terms, [target.term]: lastX }, text: fill(at(bank.salami), { n, x }), meta: { ...meta, term: target.term } };
        }
        case 'obfuscate': {
          const e = at(bank.obfuscate[target.kind]);
          return { type: 'offer', terms, text: fill(e.text, { n }), meta: { ...meta, fmt: e.fmt } };
        }
        case 'probe':
          return { type: 'offer', terms, text: fill(at(bank.probe), { n }), ...(i === 2 ? { ask: target.id } : {}), meta };
        case 'pressure':
          return { type: 'offer', terms, text: at(bank.pressure), meta: { tactic } };
        default:
          return { type: 'offer', terms, text: fill(at(bank[tactic]), { n }), meta };
      }
    },
  };
  return agent;
}
