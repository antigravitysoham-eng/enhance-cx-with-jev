# Architecture

## The split

Jev Engineering names a way of building: **an LLM writes, Jev decides, code acts.** The test
for each step is mechanical.

| If the step | It goes to | In this repo |
|---|---|---|
| Creates text | An LLM | Nothing. This layer never writes. Drafts arrive already written. |
| Picks, scores, or answers yes/no | **Jev** | `rubrics.js` — 46 questions across 3 packs |
| Follows an exact rule | Code | `policy.js` priority, `pipeline.js` rollups, the send veto |

Every arrow points one way: evidence in, typed verdicts out, arithmetic on top.

```
                    ┌──────────────────────────────────────────┐
 ticket ───┐        │  PASS 1 · signal                         │
 email ────┤        │  state.buildSignalState()                │
 survey ───┼──────► │    account facts + history + open items  │
 chat ─────┤        │    + the customer's own words            │
 call note ┘        │  → ONE Jev call, 22 questions in parallel│
                    └────────────────┬─────────────────────────┘
                                     │ typed answers + confidence
                    ┌────────────────▼─────────────────────────┐
                    │  policy.gateAll()   act / review / escalate
                    │  policy.priorityScore()   ← arithmetic, in code
                    │  policy.queueFor()        ← arithmetic, in code
                    └────────────────┬─────────────────────────┘
                                     │
          ┌──────────────────────────┼───────────────────────────┐
          ▼                          ▼                           ▼
  ┌───────────────┐        ┌──────────────────┐        ┌──────────────────┐
  │ PASS 2 account│        │ queues           │        │ PASS 3 reply QA  │
  │ 14 questions  │        │ team:support     │        │ 10 questions     │
  │ over pass 1's │        │ retention-desk   │        │ before it is sent│
  │ own verdicts  │        │ legal-review     │        │ blockers veto    │
  └───────┬───────┘        │ security-incident│        └────────┬─────────┘
          │                │ escalation-review│                 │
          ▼                └──────────────────┘                 ▼
   health, renewal risk,                                  send / edit / hold
   value at risk, the play                                        │
          └─────────────────────► ledger.js ◄─────────────────────┘
                     cost · latency · autonomy rate
```

## Why pass 2 reads pass 1's verdicts

The account pass could re-read every message from scratch. It does not, for two reasons.

The first is budget: state plus the longest question must fit in 32k tokens, and a busy
account's full correspondence does not. The second is better — the first pass's output is
**typed**. Including `sentiment=negative, urgency=3/4, churn language, SLA risk` alongside a
420-character excerpt adds structure to the evidence rather than noise, and it is
reproducible in a way a paraphrase is not.

What it does **not** do is summarise. `state.js` sends the items, compactly rendered, with
the customer's own words intact. A paraphrase is a second model's opinion smuggled into the
evidence, and once it is in there you cannot tell which model was wrong.

When the budget still bites, evidence is ranked most-recent-first and trimmed at item
boundaries, and the number dropped is reported on the verdict. A thin verdict is labelled
thin.

## The confidence gate

```
              confidence ≥ threshold  ────────────────►  act
                                                          │
              confidence < threshold ──┬── high stakes ──► escalate
                                       │                   (bigger model, or a named person)
                                       └── otherwise  ───► review
                                                           (a queue a human reads)
```

A noul returns a probability, not a confidence, so it is gated differently: decided above
0.7 or below 0.3, undecided in the band between. That band is the single most useful output
of the whole system — it is the set of cases a human should actually spend their morning on.

`HIGH_STAKES` in `policy.js` lists the decisions where "unsure" must not simply queue.
Getting `security_or_privacy` wrong in either direction is expensive, so an unsure answer
goes to a person today rather than onto a pile.

## Cost model

Published figures, TypeSafe, as catalogued on madewithjev.com on 22 Sep 2026:

| | |
|---|---|
| Input | $0.042 per million tokens |
| Output | free |
| Latency | 70–500 ms, whatever the question count |
| Context | 64k per request; 32k for state + longest question |
| Choice cardinality | 255 |
| Rate limits | 250,000 tokens/s, 1,200 requests/minute |

The consequence that shapes this whole design: **questions are nearly free, states are not.**
One call with 22 questions costs approximately one call with one question. So the packs go
deep, and the effort goes into the state instead — which is also where the accuracy is.

The ledger's baseline comparison uses TypeSafe's published per-case figures from their four
workflow evals (Opus 5 $0.1761 / 37.8 s, Sonnet 5 $0.1174 / 78.1 s, Terra $0.0304 / 10.1 s,
Haiku 4.5 $0.0195 / 12.5 s, Jev $0.0004 / 0.4 s). Those are averages over workflows that are
not this workload. Every place the number is printed, it is labelled an estimate.

## Failure modes this design expects

| Failure | What happens |
|---|---|
| Jev picks the wrong option | Confidence is usually middling → the gate holds it → a human sees it |
| Jev is confidently wrong | The threshold does not save you. Calibration is the only defence — see `CALIBRATION.md` |
| A quiet account looks healthy | `evidence_is_thin` fires; the UI marks the verdict weak |
| A fluent but false draft reply | `factually_supported` is false → blocker → held, whatever readiness said |
| Rate limit | Client retries with backoff, up to 3 times |
| Oversized state | Refused before the request is sent, with the reason |
| A gateway strips `confidence` | `normalizeAnswers()` derives a margin-based stand-in and the gate still works |

## Sources

- [What is Jev](https://madewithjev.com/what-is-jev) — model, evals, limits
- [How to use Jev](https://madewithjev.com/how-to-use-jev) — the call, the confidence pattern
- [Jev pricing](https://madewithjev.com/jev-pricing) — 15 runs with published volumes and totals
- [What is Jev Engineering](https://madewithjev.com/what-is-jev-engineering) — the write/decide/act split
- [Jev as a judge](https://madewithjev.com/jev-as-a-judge) — the pattern pass 3 belongs to
- [TypeSafe launch post](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
