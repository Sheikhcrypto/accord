import { accepts, answerAsk, proposal } from '../strategy.js';

/**
 * Reference agents with no language model.
 *  policyAgent  enforces its policy by construction: it acts on structured fields only,
 *               never reads free text, and answers `ask` for public facts alone.
 *  muteAgent    the same, but never answers any ask. The "say nothing" end of the frontier.
 */
export function policyAgent({ policy, answerAsks = true, id = 'policy-agent' }) {
  return {
    id,
    policy,
    async act(view) {
      const inb = view.inbound;
      const k = view.round;
      const R = view.maxRounds;
      const facts = answerAsks && inb?.ask ? answerAsk(policy, inb.ask) : undefined;
      const msg = (m) => (facts ? { ...m, facts } : m);
      if (inb && inb.type === 'offer' && inb.terms && accepts(policy, inb.terms, k, R)) return msg({ type: 'accept', terms: inb.terms });
      return msg({ type: 'offer', terms: proposal(policy, k, R, inb?.terms) });
    },
  };
}

export const muteAgent = ({ policy }) => policyAgent({ policy, answerAsks: false, id: 'mute-agent' });
