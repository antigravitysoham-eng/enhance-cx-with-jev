# CX Sentinel — Enhance CX with Jev

**A Jev decision layer for Customer Success.** Every inbound message, every account and
every outgoing draft judged with typed decisions and a calibrated confidence, instead of
prose somebody has to read.

Built as a drop-in layer for [CXM-Tool](https://github.com/antigravitysoham-eng/CXM-Tool),
and usable on its own.

```
npm run demo      # the whole loop over 30 seeded CX signals — no API key needed
npm test          # 38 tests
npm run serve     # http://localhost:5100 — API + a dashboard
```

---

## The problem this solves

A Customer Success platform knows a great deal about **what happened** — tickets opened,
seats provisioned, renewal dates, onboarding percentages — and almost nothing about **what
it meant**. CXM-Tool is a good example: it has a customer directory, contract lifecycle
tracking, onboarding milestones and a health field. The health field is set by hand.

The reason every CS tool works this way is arithmetic. Judging whether a message carries
churn intent is a semantic question; an `if` statement cannot derive it from prose. Handing
every message to a frontier LLM to find out costs roughly $0.12 and 78 seconds per case on
published figures — so teams sample, or they score health on login counts and call it a
model.

[Jev](https://madewithjev.com/what-is-jev), TypeSafe AI's System One model, removes that
constraint. It does not write; it returns a typed answer to each of your questions with a
probability per option and a calibrated confidence, in 70–500 ms, at $0.042 per million
input tokens with output free. Questions in one call are answered in parallel, so asking
twenty-two costs about what asking one costs.

That changes the unit of work. You stop sampling and start judging **everything**.

---

## What it does

Three passes. An LLM writes, Jev decides, code acts — and nothing in this repo asks a model
to write anything.

### 1. Triage — one call per inbound signal, 22 questions in parallel

A ticket, email, survey comment, chat transcript or call note goes in with its account
facts and open items. Out come 22 typed answers: routing team, urgency, sentiment, customer
effort, issue type, root cause, churn reason, next best action, and twelve yes/no flags
(churn, expansion, advocacy, blocked, exec escalation, contractual risk, security, SLA
breach, onboarding blocker, usage decline, feature request, competitor mention).

Priority and queue are then computed **in code** from those answers — Jev supplies the
judgement, arithmetic stays where arithmetic belongs.

### 2. Account health — one call per account, over the first pass's verdicts

Health, renewal risk, primary risk driver, recommended play, engagement depth, value
realisation, outlook, and a 90-day churn probability. Fourteen questions grounded in the
customer's own words rather than in login counts.

It also answers `evidence_is_thin` — because a confident-looking verdict built on two
messages in three weeks is the failure mode of every health score ever shipped, and the
quiet accounts are the ones that leave.

### 3. Outbound QA — one call per draft, before a customer reads it

An LLM or an agent writes the reply. Jev judges it against what is actually established:
does it answer the question, is every claim supported, what does it commit to, does it leak
internal information, is it legally sensitive, is it clear. Ten questions for about the
cost of one.

**The send decision is code's, not the model's.** A confident `send_as_is` does not override
a blocker — an unsupported factual claim, a leak, or a legal exposure holds the draft
regardless. There is a test for exactly that.

---

## The pattern, in one screen

```js
import { createEngine } from './src/engine/pipeline.js';

const engine = createEngine();                       // provider from env
const { answers, gated, priority, queue } =
  await engine.judgeSignal(signal, account);         // ONE call, 22 questions

// Branch on the confidence, not on the probability. That is the whole thing.
if (gated.decisions.routing_team.verdict === 'act') {
  route(signal, answers.routing_team.choice);        // 0.84 with confidence 0.72
} else {
  humanTriage(signal);                               // 0.84 with confidence 0.41
}
```

`0.84` is the probability — which option Jev picked. The confidence says how much weight
the alternatives still carry, and it is the number the code reads. A choice that is 0.84
against a 0.159 runner-up is a different situation from 0.84 against nothing, and only the
confidence tells you which you have.

---

## What a run looks like

30 signals, 6 accounts, 5 draft replies, on the offline simulator:

```
  calls                41   (794 typed decisions, 19.4 per call)
  cost                 $0.004521          ← modelled at Jev list price
  per decision         $0.000006          (175,643 decisions per dollar)
  latency              p50 3 ms   p90 5 ms
  autonomy rate        58.8% of decisions cleared their confidence bar
  sent for review      294   escalated: 28

  against sonnet-5: ~$4.81 and ~3202s for the same 41 cases → ~1,065× cheaper
```

The baseline row uses TypeSafe's published per-case workflow-eval figures. It is an
order-of-magnitude estimate against those numbers, not a benchmark of this workload, and the
ledger labels it as such every time it prints.

---

## Running it

### No API key (default)

```
npm run demo
```

Uses the built-in **simulator**: a deterministic lexical scorer that returns the same
response *shape* Jev returns, so the pipeline, the gate, the ledger, the tests and the UI
all work offline. It is not a model. Every answer it produces is tagged `simulated: true`
and the CLI, the API and both dashboards say so on screen.

**Do not quote a simulator number as a Jev number.**

### Against the real model

```bash
JEV_PROVIDER=direct     JEV_API_KEY=sk-…  npm run demo   # TypeSafe API
JEV_PROVIDER=openrouter JEV_API_KEY=sk-…  npm run demo   # OpenRouter (beta)
JEV_PROVIDER=gateway    JEV_BASE_URL=…  JEV_API_KEY=…    # Cloudflare / Netlify / Vercel
```

You do not need a TypeSafe key to reach Jev — it is served through OpenRouter, the
Cloudflare and Netlify AI gateways, LiteLLM, Pydantic AI and `langchain-typesafe`.
`docs/ACCESS.md` has the current list and what each route needs.

| | |
|---|---|
| `JEV_PROVIDER` | `simulator` (default), `direct`, `openrouter`, `gateway` |
| `JEV_API_KEY` | required for anything but `simulator` |
| `JEV_BASE_URL` | required for `gateway` |
| `JEV_MODEL` | default `jev-latest` |
| `JEV_TIMEOUT_MS` | default `15000` |

---

## Dropping it into CXM-Tool

Two lines in `server/server.js` and one page file. Full walkthrough in
[`docs/INTEGRATION.md`](docs/INTEGRATION.md), including the two SQLite tables for
persisting verdicts and the exact sidebar and route edits.

```js
import { jevRouter } from '../../Enhance-CX-with-Jev/src/server/router.js';
app.use('/api/jev', jevRouter());
```

```
cp integration/cxm-tool/pages/JevSentinel.jsx  ../CXM-Tool/src/pages/
```

The page uses CXM-Tool's own design tokens and its `.glass-card`, `.badge` and `.btn`
classes, and its only dependencies — react, lucide-react, recharts — are already in that
app's `package.json`. Nothing new to install.

The six seeded accounts are byte-identical to CXM-Tool's `src/utils/mockData.js` (names,
values, renewal dates, health, progress), so the engine points at the real app with no
mapping layer. There is a test for that too.

---

## Layout

```
src/engine/
  jevClient.js   four providers, one request shape; limits enforced before you pay
  simulator.js   the offline stand-in, and an honest account of what it is not
  rubrics.js     THE PRODUCT — 46 questions across three packs
  policy.js      thresholds, the confidence gate, priority arithmetic, calibration
  state.js       building the evidence Jev judges, within the 32k budget
  ledger.js      cost, latency, autonomy rate, and the baseline comparison
  pipeline.js    the three passes, bounded concurrency, portfolio rollup
src/data/seed.js 6 accounts, 30 signals, 5 drafts — deliberately awkward
src/server/      framework-free API + Express router + a single-file dashboard
src/cli/demo.js  the whole loop, printed
integration/     the CXM-Tool page and server patch
docs/            architecture, integration, access, calibration, submission
test/            38 tests
```

---

## The rubrics are the product

The API call is four lines. Everything that makes this work well lives in
`src/engine/rubrics.js`, and it is worth reading before anything else.

Two rules govern every question there, and both come from how Jev works:

1. **The question ID never reaches the model.** A field called `churn_risk` tells Jev
   nothing. The whole question goes in `instructions`. There is a test that fails any
   question whose instructions are too thin to stand alone.
2. **Each criterion is the description of a bucket, not a label.** Options have to be
   distinguishable from one another by their text alone, because that text is all the model
   sees.

And one rule that comes from the pricing: questions in a single call run in parallel, so
the 22nd is nearly free. That is why these packs are deep rather than minimal. Every extra
answer is a column a CS team did not have before, and it costs almost nothing to ask.

There is also a note in that file about what is deliberately **not** asked — word counts,
language detection, days-since-last-contact. Those are facts, and facts belong to code,
which gets them right every time for nothing.

---

## Thresholds are an empirical claim, not a default

`src/engine/policy.js` sets a threshold per decision, scaled by what it costs to be wrong:

| Decision | Bar | Why |
|---|---|---|
| `issue_type` | 0.45 | Filing. Trivially reversible. |
| `routing_team` | 0.55 | A wrong answer costs one handover. |
| `churn_signal` | 0.65 | Too low and you cry wolf; too high and you miss the churn. |
| `exec_escalation` | 0.75 | Waking a senior person up. |
| `security_or_privacy` | 0.80 | Consequence of a miss is severe in both directions. |
| `leaks_internal_information` | 0.80 | It reaches a customer if you get it wrong. |

**These are starting points.** Confidence is calibrated, but confidence is not accuracy, and
the right bar is a claim about *your* data. `calibrate()` takes hand-graded answers and
reports, per threshold, what you would have automated and what you would have got right.
`docs/CALIBRATION.md` describes the 200-example exercise that should precede any production
use. Until you have run it, treat the autonomy rate as a demo number.

---

## Honest limits

- **Jev cannot write.** Drafts, summaries, explanations and code still need an LLM. This
  layer decides and the LLM writes; neither replaces the other.
- **Text only.** No screenshots, no call audio, no attachments. A voice channel needs
  transcription in front of it.
- **255 options per choice.** Every choice here is well inside that; a taxonomy that is not
  needs the two-pass pattern — score everything, then read the shortlist.
- **Type-safe is not correct.** The answer is always one of yours. It can still be the
  wrong one of yours. That is what the confidence and the escalation path are for.
- **The baseline comparison is an estimate**, against TypeSafe's published per-case figures
  for four workflows that are not this workload.
- **The simulator is not Jev.** It is a lexical scorer. It exists so the repo runs offline.

---

## Licence and affiliation

MIT. Not affiliated with TypeSafe AI or with madewithjev.com. Jev's pricing, limits and
eval figures quoted here are TypeSafe's own published numbers, linked from
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
