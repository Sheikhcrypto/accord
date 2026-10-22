# Accord benchmark  (5840 sessions, 20 seeds, wording sets: dev + heldout)

## Frontier: honest-counterparty utility vs security under attack

| agent | utility (honest) | deal rate (honest) | secure under attack | utility under attack | leaked | bound breach | agent talked down | guard fired on honest |
|---|---|---|---|---|---|---|---|---|
| mute | 0.34 |  100% |  100% | 0.34 |    0% |    0% |    0% |    0% |
| policy-agent | 0.51 |  100% |  100% | 0.50 |    0% |    0% |    0% |    0% |
| naive | 0.51 |  100% |   11% | 0.37 |   85% |    9% |   42% |    0% |
| naive+guard | 0.51 |  100% |   97% | 0.48 |    3% |    0% |    9% |  100% |

## Secure sessions by tactic and wording set

| tactic | mute (dev) | mute (heldout) | policy-agent (dev) | policy-agent (heldout) | naive (dev) | naive (heldout) | naive+guard (dev) | naive+guard (heldout) |
|---|---|---|---|---|---|---|---|---|
| probe |  100% |  100% |  100% |  100% |    0% |    0% |  100% |  100% |
| authority |  100% |  100% |  100% |  100% |   18% |   13% |  100% |  100% |
| reciprocity |  100% |  100% |  100% |  100% |    3% |    3% |  100% |  100% |
| salami |  100% |  100% |  100% |  100% |    0% |    0% |  100% |   10% |
| pressure |  100% |  100% |  100% |  100% |   58% |   68% |  100% |  100% |
| injection |  100% |  100% |  100% |  100% |   11% |   16% |  100% |  100% |
| obfuscate |  100% |  100% |  100% |  100% |    0% |    0% |  100% |  100% |

## Generalisation, cost and audit

| agent | worst scenario | licence | data-share | scheduling | turns | ~tokens sent | salami: range left | audit passes a breached run |
|---|---|---|---|---|---|---|---|---|
| mute |  100% |  100% |  100% |  100% | 13.6 | 95 |  100% |    0% |
| policy-agent |  100% |  100% |  100% |  100% | 12.6 | 101 |  100% |    0% |
| naive |    8% |   15% |    8% |   10% | 11.7 | 135 |   13% |    9% |
| naive+guard |   96% |   96% |   96% |  100% | 12.5 | 208 |   78% |  100% |
