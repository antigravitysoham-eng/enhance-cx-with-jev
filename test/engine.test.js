import test from 'node:test';
import assert from 'node:assert/strict';

import { createJevClient, assertWithinLimits, estimateTokens, costUsd, LIMITS, JevError } from '../src/engine/jevClient.js';
import { SIGNAL_RUBRIC, ACCOUNT_RUBRIC, REPLY_QA_RUBRIC, RUBRICS, subset } from '../src/engine/rubrics.js';
import { gate, gateAll, priorityScore, queueFor, calibrate, THRESHOLDS, NOUL_TRUE_AT } from '../src/engine/policy.js';
import { buildSignalState, buildAccountState, buildReplyState } from '../src/engine/state.js';
import { createLedger, formatUsd, BASELINES } from '../src/engine/ledger.js';
import { createEngine, mapWithConcurrency } from '../src/engine/pipeline.js';
import { accounts, signals, draftReplies } from '../src/data/seed.js';

/* ------------------------------------------------------------------ rubrics */

test('every question in every pack is well formed', () => {
  for (const [packName, pack] of Object.entries(RUBRICS)) {
    for (const [id, q] of Object.entries(pack)) {
      assert.ok(['choice', 'score', 'noul'].includes(q.type), `${packName}.${id}: bad type`);
      assert.ok(q.instructions, `${packName}.${id}: no instructions`);

      // The question ID never reaches the model, so the instructions must be a
      // whole question on their own — not a label expanded into a sentence.
      assert.ok(q.instructions.length >= 40, `${packName}.${id}: instructions too thin to stand without the ID`);

      if (q.type === 'choice') {
        const keys = Object.keys(q.criteria ?? {});
        assert.ok(keys.length >= 2, `${packName}.${id}: needs 2+ options`);
        assert.ok(keys.length <= LIMITS.choiceOptions, `${packName}.${id}: over the 255-option ceiling`);
        for (const k of keys) {
          assert.ok(q.criteria[k].length >= 20, `${packName}.${id}.${k}: option description is a label, not a bucket`);
        }
      }
      if (q.type === 'score') {
        assert.ok(Array.isArray(q.criteria), `${packName}.${id}: score criteria must be an ordered array`);
        assert.ok(q.criteria.length >= 3, `${packName}.${id}: a scale needs 3+ levels`);
      }
      if (q.type === 'noul') {
        assert.ok(!('criteria' in q) || typeof q.criteria === 'object', `${packName}.${id}: odd criteria`);
      }
    }
  }
});

test('every question has a threshold, and no threshold is orphaned', () => {
  const allIds = new Set(Object.values(RUBRICS).flatMap((p) => Object.keys(p)));
  for (const id of allIds) {
    assert.ok(id in THRESHOLDS, `${id} has no threshold in policy.js`);
  }
  for (const id of Object.keys(THRESHOLDS)) {
    assert.ok(allIds.has(id), `threshold "${id}" refers to no question`);
  }
});

test('the signal pack is deep, because questions in one call are nearly free', () => {
  assert.ok(Object.keys(SIGNAL_RUBRIC).length >= 20);
  assert.ok(Object.keys(ACCOUNT_RUBRIC).length >= 12);
  assert.ok(Object.keys(REPLY_QA_RUBRIC).length >= 10);
});

test('subset() keeps only the questions asked for', () => {
  const s = subset(SIGNAL_RUBRIC, ['urgency', 'sentiment', 'not_a_question']);
  assert.deepEqual(Object.keys(s).sort(), ['sentiment', 'urgency']);
});

/* ------------------------------------------------------------------- limits */

test('a choice over 255 options is refused before it is paid for', () => {
  const criteria = Object.fromEntries(
    Array.from({ length: 300 }, (_, i) => [`opt_${i}`, `A distinct bucket number ${i} for testing.`]),
  );
  assert.throws(
    () => assertWithinLimits('hello', { q: { type: 'choice', instructions: 'Which bucket does this belong in, considering all of them?', criteria } }),
    /255/,
  );
});

test('an oversized state is refused before it is paid for', () => {
  const huge = 'x'.repeat(LIMITS.stateTokens * 4 + 5_000);
  assert.throws(
    () => assertWithinLimits(huge, { q: { type: 'noul', instructions: 'This is a statement long enough to be a real question.' } }),
    /Trim the state/,
  );
});

test('a question whose instructions carry no question is refused', () => {
  assert.throws(
    () => assertWithinLimits('hi', { is_urgent: { type: 'noul', instructions: 'urgent' } }),
    /question ID is never sent/,
  );
});

test('token estimate and cost track the published price', () => {
  assert.equal(estimateTokens('abcd'), 1);
  // $0.042 per million input tokens.
  assert.ok(Math.abs(costUsd(1_000_000) - 0.042) < 1e-9);
});

/* ------------------------------------------------------------------- client */

test('the simulator answers every question type with the right shape', async () => {
  const client = createJevClient({ provider: 'simulator' });
  const { answers, usage, meta } = await client.ask('The payment failed and I am blocked.', {
    which_team: { type: 'choice', instructions: 'Which team should handle this message and take the first action?', criteria: { billing: 'Payment, invoice or subscription problems.', technical: 'Bugs, errors and integration failures.' } },
    how_urgent: { type: 'score', instructions: 'How quickly must someone respond before this gets worse for the customer?', criteria: ['Not at all urgent.', 'Within a day or two.', 'Same day.', 'Within hours.'] },
    is_blocked: { type: 'noul', instructions: 'The customer cannot do their work in the product right now because of this issue.' },
  });

  assert.equal(answers.which_team.type, 'choice');
  assert.ok(['billing', 'technical'].includes(answers.which_team.choice));
  assert.ok(Math.abs(Object.values(answers.which_team.probabilities).reduce((a, b) => a + b, 0) - 1) < 0.02);
  assert.ok(answers.which_team.confidence >= 0 && answers.which_team.confidence <= 1);

  assert.equal(answers.how_urgent.type, 'score');
  assert.ok(answers.how_urgent.score >= 0 && answers.how_urgent.score <= 3);

  assert.equal(answers.is_blocked.type, 'noul');
  assert.ok(answers.is_blocked.noul >= 0 && answers.is_blocked.noul <= 1);

  assert.ok(usage.input_tokens > 0);
  assert.equal(usage.output_tokens, 0, 'output is free, and free means none is billed');
  assert.equal(meta.simulated, true);
  assert.equal(meta.costUsd, 0);
  assert.ok(meta.wouldHaveCostUsd > 0, 'the simulator still models what Jev would have charged');
});

test('the simulator is deterministic', async () => {
  const client = createJevClient({ provider: 'simulator' });
  const q = { tone: { type: 'choice', instructions: 'What is the overall tone of this message towards us?', criteria: { good: 'Pleased or grateful overall with no complaint.', bad: 'Unhappy or disappointed overall about what happened.' } } };
  const a = await client.ask('This was a great experience, thank you.', q);
  const b = await client.ask('This was a great experience, thank you.', q);
  assert.deepEqual(a.answers, b.answers);
});

test('a live provider without a key fails loudly rather than silently simulating', () => {
  assert.throws(() => createJevClient({ provider: 'direct', apiKey: undefined }), JevError);
});

test('a live call parses a gateway response and prices it from reported usage', async () => {
  const fetchImpl = async () => ({
    ok: true, status: 200,
    json: async () => ({
      model: 'jev-1.13.0',
      answers: {
        team: { type: 'choice', choice: 'billing', probabilities: { billing: 0.84, technical: 0.159, sales: 0.001 }, confidence: 0.596 },
        urgent: { type: 'noul', noul: 0.999 },
      },
      usage: { input_tokens: 426, output_tokens: 73 },
    }),
  });
  const client = createJevClient({ provider: 'direct', apiKey: 'k', fetchImpl });
  const res = await client.ask('Stripe has been failing for three days and I am losing sales.', {
    team: { type: 'choice', instructions: 'Which team should handle this customer message first?', criteria: { billing: 'Payment or subscription issues of any kind.', technical: 'Bugs or integration problems in the product.', sales: 'Pricing or new-account questions from a buyer.' } },
    urgent: { type: 'noul', instructions: 'The message conveys urgency or time-sensitivity that changes how fast we must act.' },
  });
  assert.equal(res.answers.team.choice, 'billing');
  assert.equal(res.answers.team.confidence, 0.596);
  assert.equal(res.meta.simulated, false);
  assert.ok(Math.abs(res.meta.costUsd - 426 * (0.042 / 1e6)) < 1e-12);
});

test('a live call retries a 429 and then succeeds', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    if (calls < 3) return { ok: false, status: 429, text: async () => 'slow down' };
    return { ok: true, status: 200, json: async () => ({ answers: { ok: { type: 'noul', noul: 0.9 } }, usage: { input_tokens: 10 } }) };
  };
  const client = createJevClient({ provider: 'direct', apiKey: 'k', fetchImpl });
  const res = await client.ask('hello', { ok: { type: 'noul', instructions: 'This message is a greeting rather than a request for help.' } });
  assert.equal(calls, 3);
  assert.equal(res.answers.ok.noul, 0.9);
});

/* ------------------------------------------------------------------- policy */

test('the gate branches on confidence, not on the winning probability', () => {
  // 0.84 looks decisive. The confidence says it is not, and the confidence wins.
  const answer = { type: 'choice', choice: 'billing', probabilities: { billing: 0.84, technical: 0.159 }, confidence: 0.4 };
  const g = gate('routing_team', answer);
  assert.equal(g.verdict, 'review');
  assert.equal(g.value, 'billing');

  const sure = { ...answer, confidence: 0.9 };
  assert.equal(gate('routing_team', sure).verdict, 'act');
});

test('an uncertain high-stakes decision escalates rather than queueing', () => {
  const unsure = { type: 'noul', noul: 0.5 };
  assert.equal(gate('security_or_privacy', unsure).verdict, 'escalate');
  assert.equal(gate('feature_request', unsure).verdict, 'review');
});

test('a noul is decided only outside the middle band', () => {
  assert.equal(gate('feature_request', { type: 'noul', noul: NOUL_TRUE_AT + 0.01 }).verdict, 'act');
  assert.equal(gate('feature_request', { type: 'noul', noul: 0.5 }).verdict, 'review');
  assert.equal(gate('feature_request', { type: 'noul', noul: 0.05 }).verdict, 'act');
  assert.equal(gate('feature_request', { type: 'noul', noul: 0.05 }).value, false);
});

test('destructive decisions carry higher bars than filing ones', () => {
  assert.ok(THRESHOLDS.security_or_privacy > THRESHOLDS.routing_team);
  assert.ok(THRESHOLDS.churn_within_90_days > THRESHOLDS.issue_type);
  assert.ok(THRESHOLDS.leaks_internal_information >= 0.8);
});

test('gateAll reports an autonomy rate', () => {
  const { autonomyRate, uncertain, escalations } = gateAll({
    routing_team: { type: 'choice', choice: 'billing', probabilities: { billing: 0.9, x: 0.1 }, confidence: 0.9 },
    security_or_privacy: { type: 'noul', noul: 0.5 },
    feature_request: { type: 'noul', noul: 0.5 },
  });
  assert.equal(uncertain.length, 1);
  assert.equal(escalations.length, 1);
  assert.ok(Math.abs(autonomyRate - 1 / 3) < 0.01);
});

test('priority is arithmetic over typed answers, and advocacy pushes a case down', () => {
  const base = {
    urgency: { type: 'score', score: 4 },
    effort: { type: 'score', score: 2 },
    sentiment: { type: 'choice', choice: 'negative', probabilities: { negative: 0.8, hostile: 0.1 } },
    blocked_now: { type: 'noul', noul: 0.95 },
    churn_signal: { type: 'noul', noul: 0.9 },
  };
  const hot = priorityScore(base);
  assert.equal(hot.band, 'P1');

  const calm = priorityScore({
    urgency: { type: 'score', score: 0 },
    effort: { type: 'score', score: 0 },
    sentiment: { type: 'choice', choice: 'positive', probabilities: { positive: 0.95 } },
    advocacy_signal: { type: 'noul', noul: 0.95 },
  });
  assert.equal(calm.band, 'P4');
  assert.ok(calm.score < hot.score);
});

test('a confident security flag routes to the security queue; an unsure one does not', () => {
  const answers = { security_or_privacy: { type: 'noul', noul: 0.98 }, routing_team: { type: 'choice', choice: 'support', probabilities: { support: 0.9 }, confidence: 0.9 } };
  assert.equal(queueFor(answers, gateAll(answers)), 'security-incident');

  const unsure = { security_or_privacy: { type: 'noul', noul: 0.52 }, routing_team: { type: 'choice', choice: 'support', probabilities: { support: 0.9 }, confidence: 0.9 } };
  assert.notEqual(queueFor(unsure, gateAll(unsure)), 'security-incident');
});

test('calibrate() reports coverage and precision across a threshold grid', () => {
  const labelled = [
    { questionId: 'routing_team', answer: { type: 'choice', choice: 'billing', probabilities: { billing: 0.95 }, confidence: 0.95 }, truth: 'billing' },
    { questionId: 'routing_team', answer: { type: 'choice', choice: 'billing', probabilities: { billing: 0.52 }, confidence: 0.2 }, truth: 'support' },
  ];
  const report = calibrate(labelled);
  const low = report.routing_team.find((r) => r.threshold === 0.3);
  const high = report.routing_team.find((r) => r.threshold === 0.9);
  assert.equal(low.coverage, 0.5);
  assert.equal(low.precisionWhenActing, 1);
  assert.equal(high.coverage, 0.5, 'the confident one still clears 0.9');
});

/* -------------------------------------------------------------------- state */

test('the signal state carries evidence, not a summary', () => {
  const signal = signals.find((s) => s.id === 'sig-001');
  const account = accounts.find((a) => a.id === signal.accountId);
  const state = buildSignalState(signal, account);

  assert.ok(state.includes('ACCOUNT FACTS'));
  assert.ok(state.includes('Acme Corp'));
  assert.ok(state.includes('Renewal date: Oct 12, 2026'));
  assert.ok(state.includes('STILL OPEN ON THIS ACCOUNT'));
  assert.ok(state.includes('ENG-4412'));
  assert.ok(state.includes('--- THE MESSAGE ---'));
  assert.ok(state.includes(signal.body.slice(0, 40)), 'the customer’s own words survive intact');
});

test('the account state trims to budget and says what it dropped', () => {
  const account = accounts[0];
  const judged = Array.from({ length: 40 }, (_, i) => ({
    signal: { id: `s${i}`, receivedAt: `2026-09-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`, channel: 'email', from: { name: 'X' }, subject: 'S', body: 'y'.repeat(4_000) },
    answers: {},
    priority: { band: 'P3', score: 30 },
  }));
  const built = buildAccountState(account, judged, { budgetTokens: 4_000 });
  assert.ok(built.droppedSignals > 0);
  assert.ok(built.text.includes('omitted to stay within the request budget'));
  assert.ok(built.estimatedTokens <= 4_000);
});

test('the reply state separates what is established from what the draft claims', () => {
  const signal = signals.find((s) => s.id === 'sig-001');
  const state = buildReplyState({
    draft: 'We fixed it.',
    originalSignal: signal,
    account: accounts[0],
    knownFacts: ['ENG-4412 remains open.'],
  });
  assert.ok(state.indexOf('ESTABLISHED FACTS') < state.indexOf('THE DRAFT REPLY UNDER REVIEW'));
  assert.ok(state.includes('ENG-4412 remains open.'));
});

/* ------------------------------------------------------------------- ledger */

test('the ledger prices the simulator at zero but still models Jev list price', () => {
  const ledger = createLedger({ baseline: 'sonnet-5' });
  ledger.record({
    kind: 'signal', subjectId: 's1', questionCount: 22,
    meta: { latencyMs: 12, simulated: true, wouldHaveCostUsd: 0.00005, provider: 'simulator' },
    usage: { input_tokens: 1200 },
    gated: { autonomyRate: 0.8, uncertain: [1], escalations: [] },
  });
  const s = ledger.summary();
  assert.equal(s.calls, 1);
  assert.equal(s.decisions, 22);
  assert.equal(s.cost.billedUsd, 0);
  assert.ok(s.cost.modelledUsd > 0);
  assert.equal(s.cost.simulated, true);
  assert.equal(s.comparedWith.baselineCostUsd, BASELINES['sonnet-5'].costPerCase);
  assert.ok(s.comparedWith.note.includes('Estimate'));
});

test('formatUsd keeps sub-cent figures legible', () => {
  assert.equal(formatUsd(0), '$0');
  assert.equal(formatUsd(0.000068), '$0.000068');
  assert.equal(formatUsd(12.5), '$12.50');
});

/* ----------------------------------------------------------------- pipeline */

test('mapWithConcurrency preserves order and respects the limit', async () => {
  let inFlight = 0;
  let peak = 0;
  const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 3, async (n) => {
    inFlight++; peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return n * 2;
  });
  assert.deepEqual(out, [2, 4, 6, 8, 10, 12, 14, 16]);
  assert.ok(peak <= 3);
});

test('the whole loop runs on the seed corpus and produces a ledger', async () => {
  const engine = createEngine({ provider: 'simulator' });
  const result = await engine.run({ signals, accounts, replies: draftReplies });

  assert.equal(result.signals.length, signals.length);
  assert.equal(result.accounts.length, accounts.length);
  assert.equal(result.replies.length, draftReplies.length);
  assert.equal(result.simulated, true);

  // One call per signal, one per account, one per reply. Not one per question.
  assert.equal(result.ledger.calls, signals.length + accounts.length + draftReplies.length);
  assert.ok(result.ledger.decisions > result.ledger.calls * 10, 'each call carries a deep rubric');
  assert.ok(result.ledger.cost.modelledUsd > 0);
  assert.ok(result.ledger.comparedWith.cheaperBy > 1);

  for (const a of result.accounts) {
    assert.ok(['Critical', 'Poor', 'Neutral', 'Good', 'Excellent', 'Unknown'].includes(a.derived.healthGrade));
    assert.ok(a.derived.contractValue === null || a.derived.contractValue > 0);
  }
  assert.ok(result.portfolio.signals === signals.length);
});

test('every signal lands in exactly one queue and one priority band', async () => {
  const engine = createEngine({ provider: 'simulator' });
  const accountsById = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const judged = await engine.judgeSignals(signals, accountsById);
  for (const j of judged) {
    assert.ok(typeof j.queue === 'string' && j.queue.length > 0);
    assert.ok(['P1', 'P2', 'P3', 'P4'].includes(j.priority.band));
    assert.equal(Object.keys(j.answers).length, Object.keys(SIGNAL_RUBRIC).length);
  }
});

test('an account with no evidence is still judged, and flagged as thin', async () => {
  const engine = createEngine({ provider: 'simulator' });
  const v = await engine.judgeAccount(accounts[0], []);
  assert.equal(v.evidence.signalsConsidered, 0);
  assert.ok('evidence_is_thin' in v.answers);
});

test('outbound QA holds a draft whose facts are not supported', async () => {
  const engine = createEngine({ provider: 'simulator' });
  const signal = signals.find((s) => s.id === 'sig-001');
  const r = await engine.judgeReply({
    draft: 'We have credited your account with one month of service and the bug is fully fixed.',
    signal,
    account: accounts[0],
    knownFacts: ['ENG-4412 remains OPEN.', 'No service credit has been approved for this account.'],
  });
  assert.ok(['send', 'send_after_edit', 'hold_for_human'].includes(r.decision));
  // A blocker must veto the send whatever the readiness question picked.
  if (r.blockers.length > 0) assert.equal(r.decision, 'hold_for_human');
});

test('a blocker vetoes the send even when readiness says send_as_is', async () => {
  const stub = {
    provider: 'stub', live: false, model: 'stub',
    ask: async () => ({
      answers: {
        send_readiness: { type: 'choice', choice: 'send_as_is', probabilities: { send_as_is: 0.99 }, confidence: 0.99 },
        factually_supported: { type: 'noul', noul: 0.99 },
        leaks_internal_information: { type: 'noul', noul: 0.99 }, // the blocker
        legally_sensitive: { type: 'noul', noul: 0.01 },
      },
      usage: { input_tokens: 10 },
      meta: { latencyMs: 1, simulated: true, wouldHaveCostUsd: 0 },
    }),
  };
  const engine = createEngine({ client: stub });
  const r = await engine.judgeReply({ draft: 'x', signal: signals[0], account: accounts[0] });
  assert.equal(r.decision, 'hold_for_human');
  assert.ok(r.blockers.includes('leaks_internal_information'));
});

/* ---------------------------------------------------------------- seed data */

test('the seed corpus is consistent', () => {
  const ids = new Set(accounts.map((a) => a.id));
  for (const s of signals) {
    assert.ok(ids.has(s.accountId), `${s.id} points at an unknown account`);
    assert.ok(s.body && s.body.length > 20, `${s.id} has no substance`);
    assert.ok(!Number.isNaN(new Date(s.receivedAt).getTime()), `${s.id} has a bad timestamp`);
  }
  assert.equal(new Set(signals.map((s) => s.id)).size, signals.length, 'signal ids are unique');
  for (const r of draftReplies) {
    assert.ok(signals.some((s) => s.id === r.signalId), `reply points at unknown signal ${r.signalId}`);
  }
});

test('the seed accounts match CXM-Tool’s own mock data', () => {
  // Kept identical on purpose so the engine drops into the app with no mapping.
  const acme = accounts.find((a) => a.name === 'Acme Corp');
  assert.equal(acme.value, '$45,000');
  assert.equal(acme.renewals, 'Oct 12, 2026');
  assert.equal(acme.progress, 85);
  assert.equal(accounts.length, 6);
});
