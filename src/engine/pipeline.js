/**
 * pipeline.js — the loop.
 *
 * Three passes, and the order matters:
 *
 *   1. judgeSignal   one call per inbound message, 22 questions in parallel
 *   2. judgeAccount  one call per account, over the first pass's verdicts
 *   3. judgeReply    one call per outbound draft, before a customer sees it
 *
 * The shape is the one Jev Engineering describes: an LLM writes, Jev decides,
 * and code acts. Nothing in this file asks a model to write anything. The
 * arithmetic — priority, ordering, portfolio rollups — stays in code, because
 * code gets arithmetic right every time and Jev is not a calculator.
 *
 * Concurrency is bounded deliberately. Jev's published ceiling is 1,200
 * requests a minute; the default here is well under it so a batch cannot take
 * the whole budget of a shared key.
 */

import { createJevClient } from './jevClient.js';
import { SIGNAL_RUBRIC, ACCOUNT_RUBRIC, REPLY_QA_RUBRIC } from './rubrics.js';
import { gateAll, priorityScore, queueFor } from './policy.js';
import { buildSignalState, buildAccountState, buildReplyState } from './state.js';
import { createLedger } from './ledger.js';

export function createEngine(options = {}) {
  const client = options.client ?? createJevClient(options);
  const ledger = options.ledger ?? createLedger({ baseline: options.baseline });
  const thresholds = options.thresholds;
  const concurrency = options.concurrency ?? 12;

  /** Pass 1: one signal → typed verdicts, a priority and a destination. */
  async function judgeSignal(signal, account, { rubric = SIGNAL_RUBRIC } = {}) {
    const state = buildSignalState(signal, account);
    const { answers, usage, meta } = await client.ask(state, rubric);
    const gated = gateAll(answers, { thresholds });
    const priority = priorityScore(answers);
    const queue = queueFor(answers, gated);

    ledger.record({
      kind: 'signal',
      subjectId: signal.id,
      questionCount: Object.keys(rubric).length,
      meta, usage, gated,
    });

    return { signal, account, answers, gated, priority, queue, meta, usage };
  }

  /** Pass 1, over a batch, with bounded concurrency. */
  async function judgeSignals(signals, accountsById, opts = {}) {
    return mapWithConcurrency(signals, concurrency, (s) =>
      judgeSignal(s, accountsById[s.accountId], opts),
    );
  }

  /**
   * Pass 2: one account → a health verdict grounded in the first pass.
   *
   * `judged` must be the output of pass 1 for this account's signals. Passing
   * an empty set is allowed and is not an error — it is the case the
   * `evidence_is_thin` question exists for, and the caller should honour it.
   */
  async function judgeAccount(account, judged, { rubric = ACCOUNT_RUBRIC } = {}) {
    const built = buildAccountState(account, judged);
    const { answers, usage, meta } = await client.ask(built.text, rubric);
    const gated = gateAll(answers, { thresholds });

    ledger.record({
      kind: 'account',
      subjectId: account.id ?? account.name,
      questionCount: Object.keys(rubric).length,
      meta, usage, gated,
    });

    return {
      account,
      answers,
      gated,
      evidence: {
        signalsConsidered: judged.length,
        signalsIncluded: built.includedSignals,
        signalsDropped: built.droppedSignals,
        estimatedStateTokens: built.estimatedTokens,
      },
      // Code owns the derived fields. A model is not asked to do arithmetic.
      derived: deriveAccountFields(account, answers, judged),
      meta, usage,
    };
  }

  async function judgeAccounts(accounts, judgedByAccount, opts = {}) {
    return mapWithConcurrency(accounts, Math.min(concurrency, 6), (a) =>
      judgeAccount(a, judgedByAccount[a.id] ?? [], opts),
    );
  }

  /** Pass 3: one draft reply → fit to send, or not. */
  async function judgeReply({ draft, signal, account, knownFacts }, { rubric = REPLY_QA_RUBRIC } = {}) {
    const state = buildReplyState({ draft, originalSignal: signal, account, knownFacts });
    const { answers, usage, meta } = await client.ask(state, rubric);
    const gated = gateAll(answers, { thresholds });

    ledger.record({
      kind: 'reply_qa',
      subjectId: signal.id,
      questionCount: Object.keys(rubric).length,
      meta, usage, gated,
    });

    // The send decision is code's, not the model's. Any hard blocker vetoes the
    // send regardless of what `send_readiness` picked, and an uncertain verdict
    // on a blocker is treated as a blocker.
    const blockers = [];
    const blocked = (id) => {
      const d = gated.decisions[id];
      if (!d) return;
      if (d.value === true) blockers.push(id);
      else if (d.verdict !== 'act') blockers.push(`${id}:uncertain`);
    };
    blocked('leaks_internal_information');
    blocked('legally_sensitive');
    if (gated.decisions.factually_supported?.value !== true) blockers.push('factually_supported');

    const readiness = gated.decisions.send_readiness;
    const decision = blockers.length
      ? 'hold_for_human'
      : readiness?.verdict === 'act' && readiness.value === 'send_as_is'
        ? 'send'
        : readiness?.verdict === 'act' && readiness.value === 'minor_edit'
          ? 'send_after_edit'
          : 'hold_for_human';

    return { draft, signal, answers, gated, decision, blockers, meta, usage };
  }

  /**
   * The whole loop, end to end. Returns everything the UI and the CLI need,
   * plus the ledger summary that justifies the build.
   */
  async function run({ signals, accounts, replies = [] }) {
    const accountsById = Object.fromEntries(accounts.map((a) => [a.id, a]));
    const startedAt = Date.now();

    const judged = await judgeSignals(signals, accountsById);

    const byAccount = {};
    for (const j of judged) (byAccount[j.signal.accountId] ??= []).push(j);

    const accountVerdicts = await judgeAccounts(accounts, byAccount);

    const replyVerdicts = [];
    for (const r of replies) {
      const signal = signals.find((s) => s.id === r.signalId);
      if (!signal) continue;
      replyVerdicts.push(
        await judgeReply({
          draft: r.draft,
          signal,
          account: accountsById[signal.accountId],
          knownFacts: r.knownFacts,
        }),
      );
    }

    return {
      signals: judged,
      accounts: accountVerdicts,
      replies: replyVerdicts,
      portfolio: rollUpPortfolio(accountVerdicts, judged),
      ledger: ledger.summary(),
      wallClockMs: Date.now() - startedAt,
      provider: client.provider,
      simulated: !client.live,
    };
  }

  return { judgeSignal, judgeSignals, judgeAccount, judgeAccounts, judgeReply, run, ledger, client };
}

/* -------------------------------------------------------------------------- */

/** Derived account fields. Pure arithmetic over Jev's typed answers. */
function deriveAccountFields(account, answers, judged) {
  const healthScore = answers.health?.score ?? null;
  const renewalRisk = answers.renewal_risk?.score ?? null;
  const contractValue = parseMoney(account.value);

  // Value at risk: contract value weighted by where renewal_risk sits on its
  // 0-4 scale. Deliberately linear and boring — it must be explicable to a CFO.
  const valueAtRisk = contractValue !== null && renewalRisk !== null
    ? Number((contractValue * (renewalRisk / 4)).toFixed(0))
    : null;

  const p1 = judged.filter((j) => j.priority.band === 'P1').length;

  return {
    healthScore,
    healthGrade: gradeFrom(healthScore),
    renewalRisk,
    valueAtRisk,
    contractValue,
    openP1Signals: p1,
    churn90: answers.churn_within_90_days?.noul ?? null,
    expansionReady: (answers.expansion_ready?.noul ?? 0) >= 0.7,
    referenceReady: (answers.reference_ready?.noul ?? 0) >= 0.7,
    thinEvidence: (answers.evidence_is_thin?.noul ?? 0) >= 0.5,
  };
}

function gradeFrom(score) {
  if (score === null || score === undefined) return 'Unknown';
  if (score >= 3.5) return 'Excellent';
  if (score >= 2.5) return 'Good';
  if (score >= 1.5) return 'Neutral';
  if (score >= 0.75) return 'Poor';
  return 'Critical';
}

function parseMoney(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const m = value.replace(/,/g, '').match(/\$?\s*([\d.]+)\s*([km])?/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (Number.isNaN(n)) return null;
  const mult = m[2]?.toLowerCase() === 'm' ? 1_000_000 : m[2]?.toLowerCase() === 'k' ? 1_000 : 1;
  return n * mult;
}

/** Portfolio view. Arithmetic, in code, over typed answers. */
function rollUpPortfolio(accountVerdicts, judged) {
  const atRisk = accountVerdicts.filter((a) => (a.answers.renewal_risk?.score ?? 0) >= 2.5);
  const valueAtRisk = accountVerdicts.reduce((a, v) => a + (v.derived.valueAtRisk ?? 0), 0);
  const expansion = accountVerdicts.filter((a) => a.derived.expansionReady);
  const references = accountVerdicts.filter((a) => a.derived.referenceReady);
  const thin = accountVerdicts.filter((a) => a.derived.thinEvidence);

  const byQueue = {};
  for (const j of judged) byQueue[j.queue] = (byQueue[j.queue] ?? 0) + 1;

  const byBand = { P1: 0, P2: 0, P3: 0, P4: 0 };
  for (const j of judged) byBand[j.priority.band]++;

  const byCause = {};
  for (const j of judged) {
    const c = j.answers.root_cause_area?.choice;
    if (c && c !== 'none') byCause[c] = (byCause[c] ?? 0) + 1;
  }

  return {
    accounts: accountVerdicts.length,
    signals: judged.length,
    accountsAtRisk: atRisk.map((a) => a.account.name),
    valueAtRiskUsd: valueAtRisk,
    expansionReady: expansion.map((a) => a.account.name),
    referenceReady: references.map((a) => a.account.name),
    thinEvidence: thin.map((a) => a.account.name),
    signalsByQueue: byQueue,
    signalsByPriority: byBand,
    rootCauseRanking: Object.entries(byCause).sort((a, b) => b[1] - a[1]),
  };
}

/** Bounded-concurrency map. Preserves input order in the result. */
export async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
