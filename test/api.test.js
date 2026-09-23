import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApi } from '../src/server/api.js';

/**
 * The dashboard is a single HTML file that reads the /dashboard payload
 * directly. Nothing type-checks that contract, so these tests do: every path
 * the page dereferences must exist in a real response.
 */
test('the dashboard payload carries every field the page reads', async () => {
  const api = createApi();
  const d = await api.run({});

  for (const path of [
    'provider', 'simulated', 'wallClockMs',
    'ledger.calls', 'ledger.decisions', 'ledger.decisionsPerCall', 'ledger.inputTokens',
    'ledger.cost.modelledUsd', 'ledger.cost.perDecisionUsd', 'ledger.cost.decisionsPerDollar',
    'ledger.latency.p50Ms', 'ledger.latency.p90Ms',
    'ledger.gate.meanAutonomyRate', 'ledger.gate.totalUncertain', 'ledger.gate.totalEscalations',
    'ledger.comparedWith.baseline', 'ledger.comparedWith.baselineCostUsd',
    'ledger.comparedWith.baselineSeconds', 'ledger.comparedWith.cheaperBy', 'ledger.comparedWith.note',
    'portfolio.signals', 'portfolio.valueAtRiskUsd', 'portfolio.accountsAtRisk', 'portfolio.rootCauseRanking',
  ]) {
    assert.notEqual(dig(d, path), undefined, `dashboard payload is missing ${path}`);
  }

  const s = d.signals[0];
  for (const path of ['priority.band', 'priority.score', 'account.name', 'signal.channel', 'signal.body', 'queue', 'autonomyRate', 'uncertain', 'escalations', 'answers.sentiment.choice', 'answers.urgency.score', 'answers.effort.score']) {
    assert.notEqual(dig(s, path), undefined, `signal row is missing ${path}`);
  }

  const a = d.accounts[0];
  for (const path of ['account.name', 'account.health', 'account.value', 'account.renewals', 'derived.healthGrade', 'derived.valueAtRisk', 'derived.thinEvidence', 'evidence.signalsIncluded', 'evidence.signalsDropped', 'latencyMs', 'escalations', 'answers.renewal_risk.score', 'answers.primary_risk_driver.choice', 'answers.outlook.choice', 'answers.value_realisation.score', 'answers.recommended_play.choice']) {
    assert.notEqual(dig(a, path), undefined, `account card is missing ${path}`);
  }

  const r = d.replies[0];
  for (const path of ['signalId', 'decision', 'blockers', 'readiness', 'clarity', 'answers.factually_supported.noul', 'answers.makes_a_commitment.noul']) {
    assert.notEqual(dig(r, path), undefined, `reply row is missing ${path}`);
  }
});

test('the dashboard html only reads flags that exist in the rubric', async () => {
  const html = readFileSync(new URL('../src/server/dashboard.html', import.meta.url), 'utf8');
  const api = createApi();
  const packs = await api.rubrics();
  const known = new Set(packs.signal.items.map((i) => i.id));

  // Pull the FLAGS table out of the page and check each id is a real question.
  const block = html.match(/const FLAGS = \[([\s\S]*?)\];/)[1];
  const ids = [...block.matchAll(/\['([a-z_]+)',/g)].map((m) => m[1]);
  assert.ok(ids.length >= 8);
  for (const id of ids) assert.ok(known.has(id), `dashboard reads "${id}", which is not a question in the signal pack`);
});

test('health reports the published limits and price', async () => {
  const h = await createApi().health();
  assert.equal(h.limits.choiceOptions, 255);
  assert.equal(h.limits.contextTokens, 64000);
  assert.ok(Math.abs(h.pricePerInputToken * 1e6 - 0.042) < 1e-9);
});

test('bad input is rejected with a 400, not a stack trace', async () => {
  const api = createApi();
  await assert.rejects(() => api.judgeSignal({}), (e) => e.status === 400);
  await assert.rejects(() => api.judgeReply({ draft: 'x' }), (e) => e.status === 400);
  await assert.rejects(() => api.calibrate({ labelled: [] }), (e) => e.status === 400);
});

function dig(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
