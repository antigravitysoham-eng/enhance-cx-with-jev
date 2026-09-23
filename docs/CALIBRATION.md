# Calibration

**Confidence is not accuracy.** Jev's confidence is calibrated — higher confidence does mean
higher accuracy — but the *threshold* at which you stop asking a human is a claim about your
data, your rubric wording and your tolerance for being wrong. Nobody can hand you that
number, and the defaults in `policy.js` are a starting point, not a recommendation.

Until you have done the exercise below, treat the autonomy rate the demo prints as a demo
number.

## The exercise

**1. Collect 200 real signals.** Not 20. Stratify them: roughly half ordinary, and the rest
deliberately awkward — polite churn, angry nothings, near-ties, quiet accounts, messages in
a second language. The seed corpus in `src/data/seed.js` is built to that shape and is a
reasonable template.

**2. Grade them by hand, before you look at what Jev said.** Two people, independently, on
the decisions that matter most: `routing_team`, `urgency`, `churn_signal`,
`exec_escalation`, `security_or_privacy`. Where the two of you disagree, the rubric wording
is ambiguous — fix the wording, not the disagreement. This step finds more rubric bugs than
any other.

**3. Run them.**

```js
const judged = await engine.judgeSignals(signals, accountsById);
const labelled = judged.flatMap((j) =>
  ['routing_team', 'urgency', 'churn_signal'].map((q) => ({
    questionId: q,
    answer: j.answers[q],
    truth: truthFor(j.signal.id, q),
  })));
```

**4. Sweep the grid.**

```js
import { calibrate } from './src/engine/policy.js';
console.table(calibrate(labelled).routing_team);
```

```
threshold  coverage  precisionWhenActing   n
0.45       0.91      0.83                  200
0.55       0.78      0.91                  200
0.65       0.61      0.96                  200
0.75       0.42      0.99                  200
```

(Illustrative shape, not results. Your numbers will differ.)

**5. Pick per decision, from the cost of being wrong.** Routing wrongly costs one handover,
so a bar that automates 78% at 91% precision is a good trade. Escalating to an executive
wrongly costs credibility that is hard to rebuild, so take the high bar and accept that most
of those go to a human.

There is no global right answer, which is exactly why the thresholds live in one reviewable
file rather than scattered through the pipeline.

## Re-run it

- whenever you change any rubric wording — even one criterion
- when TypeSafe ships a new Jev version. `jev-latest` moves under you; pin `JEV_MODEL` in
  production if you do not want that.
- quarterly, because your customers' vocabulary drifts

## What calibration cannot fix

A confidently wrong answer. If Jev returns `routing_team=billing` at confidence 0.94 and it
is really a security incident, no threshold catches it. Two things help: write the option
descriptions so the buckets genuinely do not overlap, and keep the high-stakes flags as
separate nouls so a miss on one does not depend on a choice going right.

## A note on the two-pass pattern

If a rubric ever needs more than 255 options — a product taxonomy, a skill list, a route
table — do not split it into several calls. Score everything in one pass, then run a second
call over the shortlist. TypeSafe's own skill-suggestion cookbook picks one of 182 skills
that way: one request ranks them all, a second reads the top three.
