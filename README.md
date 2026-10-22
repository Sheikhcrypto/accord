# Accord

A policy-bound negotiation-safety component for agents that deal with other agents.
It answers one question: **when an agent negotiates for a person, how do you make sure it
cannot be talked into giving away what it was told to protect, or into agreeing to what it was told never to accept, and how does the person check afterwards?**

Zero dependencies. Node 20+. Dual-licensed **MIT OR Apache-2.0** (`LICENSE-MIT`, `LICENSE-APACHE`).

```bash
npm test         # 19 tests
npm run demo     # capture a policy, then one attack with and without the guard, with the audit
npm run bench    # 5,840 sessions; writes results/bench.md and results/bench.json
```

Built against ARIA's Scaling Trust, Track 2.2 (Components). It is **not** an agent, a cryptographic
protocol, or a security proof; see [Known limits](#known-limits).

## What is in it

| Piece | File | What it does | Scaling Trust sub-component |
|---|---|---|---|
| Policy | `src/policy.js` | A small JSON policy: numeric terms with hard bounds, facts that are secret or public. Frozen at session start; committed by hash. | input to all four |
| Requirement capture | `src/requirements.js` | Plain English in → draft policy, open questions and a read-back to confirm. Asks instead of guessing when a limit is soft or missing. | Requirement gathering |
| Guard | `src/guard.js` | Wraps any agent. Inbound: flags requests for protected info, instruction-like text, hypothetical probes, pressure, encoding requests, and hides flagged text from the agent. Outbound: clamps every term to the policy, refuses to accept a forbidden offer, strips private facts, replaces text that discloses a protected item. | Negotiation (safety) |
| Trace and audit | `src/trace.js` | Hash-chained record of the session. `audit()` re-checks one party's conduct from the record alone and returns claims with the entry numbers that support them, plus a short statement a person can read. | Report |
| Benchmark | `src/bench.js`, `src/oracle.js` | Counterparties with eight tactics, three scenarios, four agents, an oracle that scores utility and security, kept separate from the guard's own detector. | Arena-style metrics |
| LLM adapter | `src/agents/llm.js` | Drops any model call into the same interface so it can be wrapped by the guard and benchmarked. **Not run against a live model here.** | |

Not built: the *security reasoner* (protocol design, cryptographic solver, protocol implementer).

## Using it

```js
import { definePolicy } from './src/policy.js';
import { guarded } from './src/guard.js';
import { llmAgent } from './src/agents/llm.js';

const policy = definePolicy({
  id: 'buyer',
  terms: { price: { dir: 'max', limit: 100000, best: 60000, step: 500 } },
  facts: { rival_quote: { class: 'secret', value: 'Vendor B quoted 82,000' } },
});
const agent = guarded(llmAgent({ policy, complete: yourModelCall }), policy);
// agent.act(view) -> a message that cannot cross the policy; agent.events lists every intervention
```

## Results (synthetic; read the caveats)

`results/bench.md` has the full tables. 5,840 sessions, 20 seeds. The counterparty always speaks first
and attacks on turns two to five. Wording set **dev** is what the guard's detectors were written
against; **held-out** was written afterwards and includes forms the guard was not built to read.
The held-out run was recorded before anything else changed (`results/first-run-both-sets.md`).

| agent | utility vs honest counterparty | secure under attack, dev | secure under attack, held-out |
|---|---|---|---|
| mute (answers nothing) | 0.34 | 100% | 100% |
| policy-agent (acts on structured fields only) | 0.51 | 100% | 100% |
| naive (simulated, easily talked round) | 0.51 | 10.6% | 11.4% |
| naive + guard | 0.51 | 100% | **94.9%** |

- **The guard did not cost utility against an honest counterparty** (0.507 with and without). It fired on
  every honest session, because the honest counterparty asks one question deliberately worded to trip
  it ("what range are you working with?"). It replaced the reply text; the offers were untouched.
- **Bounds held on the wire in every attack session on both sets**, including sessions where the
  wrapped agent had been talked into believing its limits had moved (17.6% of held-out sessions).
- **All 36 held-out failures are one family**: hypothetical probes ("does 85,000 sit under your cap?")
  sent as ordinary offers. Only 10% of those sessions were secure. The guard flags some phrasings and
  not others, and a single answered yes/no is enough to count. After those probes the attacker's
  uncertainty about the protected number was still 55% of its starting range (13.5% against the
  unguarded agent, 100% on the dev wording).
- **The audit passes a run the oracle fails** in 100% of those runs: it re-checks with the same rules the
  guard uses, so it cannot see what they cannot (a yes/no answer carries no number to match).

## Known limits

Read these before relying on any figure above.

1. **The vulnerable agent is a simulation.** It reacts to a hidden `meta.tactic` label that models an LLM
   understanding intent in any wording. How often it gives in is a parameter (`DEFAULT_SUSCEPTIBILITY`),
   not a measurement. The numbers show the harness and the guard's mechanics, not how real models behave.
   Measuring real models is what the `llmAgent` adapter is for.
2. **The held-out set is not independent.** Same author, same session. It is better than testing on the
   data the detectors were built from, and worse than an outside red team.
3. **The guard is rule-based and English-only.** It reads digits, separators, k/m/thousand, spelled-out
   numbers, spaced digits, and flags hex, base64 and binary blobs. It does **not** read Roman numerals,
   "85 grand", reversed text or other languages, and it checks one message at a time (a number split
   across messages is not caught). The oracle reads all of those.
4. **Detect-and-block is the weak point.** The held-out salami result is the clearest example. The
   direction worth testing is constraining what an agent may say by construction (typed replies) instead
   of filtering free text.
5. **Utility does not reward language here.** All value flows through structured offers and one public
   fact, so an agent that ignores free text (`policy-agent`) is as good as a guarded one. A benchmark
   where talking has value would shrink that gap. This one is the floor, not the Arena.
6. **The audit is replay, not proof.** It needs the policy and salt, and finds only what the rules can detect.
   Nothing here is zero-knowledge or succinct. It does not prove an agent *will* behave, only that a record shows it did.
7. **Requirement capture is regex.** English only, and only simple sentences. It asks questions where it is unsure; it does not understand.
8. **Strategy is plain linear concession.** No learning, no integrative bargaining.

## Licence

Licensed under either of [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE) at your option.
The copyright holder in `LICENSE-MIT` and `NOTICE` is House of Technologies Ltd; change it if the legal entity name differs.
