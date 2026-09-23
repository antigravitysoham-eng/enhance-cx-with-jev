/**
 * api.js — the HTTP surface, framework-free.
 *
 * One object of async handlers. `standalone.js` serves them over node:http so
 * the engine runs with `npm run serve` and nothing installed; `router.js` wraps
 * the same handlers in an Express router so they mount straight into CXM-Tool's
 * existing server without pulling a second framework into that app.
 *
 * Nothing here holds state beyond an in-process cache of the last run, which is
 * what the dashboard reads. Persisting verdicts is the host application's job —
 * CXM-Tool already has SQLite, and `docs/INTEGRATION.md` shows the two tables.
 */

import { createEngine } from '../engine/pipeline.js';
import { RUBRICS, questionCount } from '../engine/rubrics.js';
import { THRESHOLDS, calibrate } from '../engine/policy.js';
import { LIMITS, USD_PER_INPUT_TOKEN } from '../engine/jevClient.js';
import { accounts as seedAccounts, signals as seedSignals, draftReplies as seedReplies } from '../data/seed.js';

export function createApi(options = {}) {
  const engine = options.engine ?? createEngine(options);
  let lastRun = null;
  let lastRunAt = null;

  const dataset = {
    accounts: options.accounts ?? seedAccounts,
    signals: options.signals ?? seedSignals,
    replies: options.replies ?? seedReplies,
  };

  return {
    /** GET /api/jev/health — is the layer up, and is it talking to the real model? */
    async health() {
      return {
        ok: true,
        provider: engine.client.provider,
        live: engine.client.live,
        model: engine.client.model,
        simulated: !engine.client.live,
        limits: LIMITS,
        pricePerInputToken: USD_PER_INPUT_TOKEN,
        lastRunAt,
      };
    },

    /** GET /api/jev/rubrics — the question packs, for the UI and for review. */
    async rubrics() {
      return Object.fromEntries(
        Object.entries(RUBRICS).map(([name, pack]) => [
          name,
          {
            questions: questionCount(pack),
            // One call answers all of them in parallel, so a deep pack costs
            // about what a shallow one costs. That is the whole design.
            items: Object.entries(pack).map(([id, q]) => ({
              id,
              type: q.type,
              instructions: q.instructions,
              options: q.type === 'choice' ? Object.keys(q.criteria) : q.type === 'score' ? q.criteria.length : null,
              threshold: THRESHOLDS[id] ?? null,
            })),
          },
        ]),
      );
    },

    /** GET /api/jev/thresholds */
    async thresholds() {
      return { thresholds: THRESHOLDS, note: 'Calibrate these against labelled examples of your own data. They are defaults, not recommendations.' };
    },

    /** POST /api/jev/signal — judge one inbound message. */
    async judgeSignal(body) {
      const { signal, account } = body ?? {};
      if (!signal?.body) throw httpError(400, 'a signal with a body is required');
      const resolvedAccount = account ?? dataset.accounts.find((a) => a.id === signal.accountId);
      const judged = await engine.judgeSignal(signal, resolvedAccount);
      return strip(judged);
    },

    /** POST /api/jev/reply-qa — judge one outbound draft before it is sent. */
    async judgeReply(body) {
      const { draft, signal, account, knownFacts } = body ?? {};
      if (!draft) throw httpError(400, 'a draft is required');
      if (!signal?.body) throw httpError(400, 'the customer message being answered is required');
      const r = await engine.judgeReply({ draft, signal, account, knownFacts });
      return { decision: r.decision, blockers: r.blockers, answers: r.answers, gated: r.gated, meta: r.meta };
    },

    /** POST /api/jev/run — the whole loop over the configured dataset. */
    async run(body = {}) {
      const signals = body.signals ?? dataset.signals;
      const accounts = body.accounts ?? dataset.accounts;
      const replies = body.replies ?? dataset.replies;
      lastRun = await engine.run({ signals, accounts, replies });
      lastRunAt = new Date().toISOString();
      return summarise(lastRun);
    },

    /** GET /api/jev/dashboard — the last run, shaped for the UI. */
    async dashboard() {
      if (!lastRun) await this.run();
      return summarise(lastRun);
    },

    /** GET /api/jev/ledger — cost and latency for the last run. */
    async ledger() {
      if (!lastRun) await this.run();
      return { ...lastRun.ledger, entries: engine.ledger.entries.slice(-200) };
    },

    /** POST /api/jev/calibrate — hand-graded answers in, a threshold grid out. */
    async calibrate(body) {
      const labelled = body?.labelled;
      if (!Array.isArray(labelled) || labelled.length === 0) {
        throw httpError(400, 'labelled must be a non-empty array of {questionId, answer, truth}');
      }
      return calibrate(labelled, body.options ?? {});
    },
  };
}

function summarise(run) {
  return {
    provider: run.provider,
    simulated: run.simulated,
    wallClockMs: run.wallClockMs,
    ledger: run.ledger,
    portfolio: run.portfolio,
    signals: run.signals.map(strip),
    accounts: run.accounts.map((a) => ({
      account: a.account,
      answers: a.answers,
      derived: a.derived,
      evidence: a.evidence,
      uncertain: a.gated.uncertain,
      escalations: a.gated.escalations,
      autonomyRate: a.gated.autonomyRate,
      latencyMs: a.meta.latencyMs,
    })),
    replies: run.replies.map((r) => ({
      signalId: r.signal.id,
      decision: r.decision,
      blockers: r.blockers,
      readiness: r.answers.send_readiness?.choice,
      clarity: r.answers.clarity?.score,
      answers: r.answers,
      latencyMs: r.meta.latencyMs,
    })),
  };
}

function strip(j) {
  return {
    signal: {
      id: j.signal.id, accountId: j.signal.accountId, channel: j.signal.channel,
      receivedAt: j.signal.receivedAt, subject: j.signal.subject, from: j.signal.from,
      body: j.signal.body,
    },
    account: j.account ? { id: j.account.id, name: j.account.name, value: j.account.value, renewals: j.account.renewals } : null,
    answers: j.answers,
    priority: j.priority,
    queue: j.queue,
    uncertain: j.gated.uncertain,
    escalations: j.gated.escalations,
    autonomyRate: j.gated.autonomyRate,
    latencyMs: j.meta.latencyMs,
    costUsd: j.meta.simulated ? j.meta.wouldHaveCostUsd : j.meta.costUsd,
    simulated: j.meta.simulated,
  };
}

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/** Route table shared by both transports. */
export const ROUTES = [
  { method: 'GET', path: '/health', handler: 'health' },
  { method: 'GET', path: '/rubrics', handler: 'rubrics' },
  { method: 'GET', path: '/thresholds', handler: 'thresholds' },
  { method: 'GET', path: '/dashboard', handler: 'dashboard' },
  { method: 'GET', path: '/ledger', handler: 'ledger' },
  { method: 'POST', path: '/run', handler: 'run' },
  { method: 'POST', path: '/signal', handler: 'judgeSignal' },
  { method: 'POST', path: '/reply-qa', handler: 'judgeReply' },
  { method: 'POST', path: '/calibrate', handler: 'calibrate' },
];
