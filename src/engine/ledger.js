/**
 * ledger.js — every call, what it cost, how long it took.
 *
 * Jev Engineering has a rule that is easy to skip: count the cost per finished
 * task, not per call. A cheap decision that sends a case down the wrong branch
 * costs more than the call it replaced. So the ledger records latency, tokens
 * and cost per call, and also the comparison that justifies the build — what
 * the same pass would have cost on a frontier model.
 *
 * The baselines below are the published per-case figures from TypeSafe's own
 * workflow evals as catalogued on madewithjev.com (22 Sep 2026). They are an
 * order-of-magnitude reference, not a benchmark of this workload. Anything the
 * ledger reports as a saving is labelled as an estimate against those figures.
 */

/** Published cost and time per case, TypeSafe workflow evals (4 workflows, averaged). */
export const BASELINES = {
  'opus-5': { costPerCase: 0.1761, secondsPerCase: 37.8, accuracy: 0.731 },
  'sonnet-5': { costPerCase: 0.1174, secondsPerCase: 78.1, accuracy: 0.678 },
  terra: { costPerCase: 0.0304, secondsPerCase: 10.1, accuracy: 0.679 },
  'haiku-4.5': { costPerCase: 0.0195, secondsPerCase: 12.5, accuracy: 0.536 },
  jev: { costPerCase: 0.0004, secondsPerCase: 0.4, accuracy: 0.678 },
};

export function createLedger({ baseline = 'sonnet-5' } = {}) {
  const entries = [];

  function record({ kind, subjectId, questionCount, meta, usage, gated }) {
    const inputTokens = usage?.input_tokens ?? 0;
    entries.push({
      at: new Date().toISOString(),
      kind,
      subjectId,
      questionCount,
      inputTokens,
      latencyMs: meta?.latencyMs ?? 0,
      // What was actually billed, and what Jev would charge for the same call.
      // These differ only under the simulator, where nothing is billed but the
      // list-price figure is still worth carrying — it is the number that makes
      // the case for the build.
      costUsd: meta?.simulated ? 0 : (meta?.costUsd ?? 0),
      modelledCostUsd: meta?.simulated ? (meta?.wouldHaveCostUsd ?? 0) : (meta?.costUsd ?? 0),
      simulated: Boolean(meta?.simulated),
      provider: meta?.provider,
      autonomyRate: gated?.autonomyRate ?? null,
      uncertain: gated?.uncertain?.length ?? 0,
      escalations: gated?.escalations?.length ?? 0,
    });
  }

  function summary() {
    if (entries.length === 0) return emptySummary(baseline);

    const calls = entries.length;
    const decisions = entries.reduce((a, e) => a + e.questionCount, 0);
    const tokens = entries.reduce((a, e) => a + e.inputTokens, 0);
    const billed = entries.reduce((a, e) => a + e.costUsd, 0);
    const modelled = entries.reduce((a, e) => a + e.modelledCostUsd, 0);
    const latencies = entries.map((e) => e.latencyMs).sort((a, b) => a - b);
    const wallMs = entries.reduce((a, e) => a + e.latencyMs, 0);
    const simulated = entries.some((e) => e.simulated);

    const base = BASELINES[baseline];
    const baselineCost = calls * base.costPerCase;
    const baselineSeconds = calls * base.secondsPerCase;

    const autonomyRates = entries.map((e) => e.autonomyRate).filter((r) => r !== null);

    return {
      calls,
      decisions,
      decisionsPerCall: Number((decisions / calls).toFixed(1)),
      inputTokens: tokens,
      cost: {
        billedUsd: Number(billed.toFixed(6)),
        modelledUsd: Number(modelled.toFixed(6)),
        perDecisionUsd: Number((modelled / decisions).toFixed(8)),
        decisionsPerDollar: modelled > 0 ? Math.round(decisions / modelled) : null,
        simulated,
      },
      latency: {
        p50Ms: percentile(latencies, 50),
        p90Ms: percentile(latencies, 90),
        maxMs: latencies.at(-1),
        totalMs: wallMs,
      },
      comparedWith: {
        baseline,
        note: `Estimate. ${baseline} per-case figures from TypeSafe's published workflow evals, not a measurement of this workload.`,
        baselineCostUsd: Number(baselineCost.toFixed(4)),
        baselineSeconds: Number(baselineSeconds.toFixed(1)),
        cheaperBy: modelled > 0 ? Number((baselineCost / modelled).toFixed(1)) : null,
        fasterBy: wallMs > 0 ? Number(((baselineSeconds * 1000) / wallMs).toFixed(1)) : null,
      },
      gate: {
        meanAutonomyRate: autonomyRates.length
          ? Number((autonomyRates.reduce((a, b) => a + b, 0) / autonomyRates.length).toFixed(3))
          : null,
        totalUncertain: entries.reduce((a, e) => a + e.uncertain, 0),
        totalEscalations: entries.reduce((a, e) => a + e.escalations, 0),
      },
    };
  }

  return { record, summary, entries, baseline };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function emptySummary(baseline) {
  return {
    calls: 0, decisions: 0, decisionsPerCall: 0, inputTokens: 0,
    cost: { billedUsd: 0, modelledUsd: 0, perDecisionUsd: 0, decisionsPerDollar: null, simulated: false },
    latency: { p50Ms: 0, p90Ms: 0, maxMs: 0, totalMs: 0 },
    comparedWith: { baseline, baselineCostUsd: 0, baselineSeconds: 0, cheaperBy: null, fasterBy: null },
    gate: { meanAutonomyRate: null, totalUncertain: 0, totalEscalations: 0 },
  };
}

/** Human-readable money. Sub-cent figures are the whole point, so do not round them away. */
export function formatUsd(n) {
  if (n === 0) return '$0';
  if (n < 0.01) return `$${n.toFixed(6)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}
