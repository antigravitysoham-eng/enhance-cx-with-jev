#!/usr/bin/env node
/**
 * demo.js — run the whole loop over the seeded corpus and print what happened.
 *
 *   npm run demo                      offline simulator, no key needed
 *   JEV_PROVIDER=direct JEV_API_KEY=… npm run demo
 *   npm run demo -- --json            machine-readable output
 *   npm run demo -- --account "Acme Corp"
 */

import { createEngine } from '../engine/pipeline.js';
import { formatUsd } from '../engine/ledger.js';
import { accounts, signals, draftReplies } from '../data/seed.js';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const only = value('account');
const asJson = flag('json');

const selectedAccounts = only ? accounts.filter((a) => a.name.toLowerCase().includes(only.toLowerCase())) : accounts;
const ids = new Set(selectedAccounts.map((a) => a.id));
const selectedSignals = signals.filter((s) => ids.has(s.accountId));
const selectedReplies = draftReplies.filter((r) => selectedSignals.some((s) => s.id === r.signalId));

if (selectedAccounts.length === 0) {
  console.error(`No account matched "${only}". Known: ${accounts.map((a) => a.name).join(', ')}`);
  process.exit(1);
}

const engine = createEngine({ baseline: value('baseline') ?? 'sonnet-5' });

const result = await engine.run({
  signals: selectedSignals,
  accounts: selectedAccounts,
  replies: selectedReplies,
});

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

/* ------------------------------- presentation ------------------------------ */

const C = process.stdout.isTTY
  ? { dim: (s) => `\x1b[2m${s}\x1b[0m`, b: (s) => `\x1b[1m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, y: (s) => `\x1b[33m${s}\x1b[0m`, g: (s) => `\x1b[32m${s}\x1b[0m`, c: (s) => `\x1b[36m${s}\x1b[0m` }
  : { dim: (s) => s, b: (s) => s, r: (s) => s, y: (s) => s, g: (s) => s, c: (s) => s };

const rule = (label = '') => console.log(C.dim(`\n${'─'.repeat(78)}${label ? `\n${label}` : ''}`));

console.log(C.b('\n  CX Sentinel — a Jev decision layer for Customer Success'));
console.log(C.dim(`  provider: ${result.provider}${result.simulated ? '  ⚠ SIMULATED — no Jev call was made' : ''}`));

/* ---- 1. triage board ---- */
rule(C.b('  1. TRIAGE — every inbound signal, judged'));
const board = [...result.signals].sort((a, b) => b.priority.score - a.priority.score);
for (const j of board) {
  const bandColour = { P1: C.r, P2: C.y, P3: C.c, P4: C.dim }[j.priority.band];
  const flags = [
    j.answers.churn_signal?.noul >= 0.7 && 'CHURN',
    j.answers.expansion_signal?.noul >= 0.7 && 'EXPANSION',
    j.answers.advocacy_signal?.noul >= 0.7 && 'ADVOCACY',
    j.answers.contractual_risk?.noul >= 0.7 && 'LEGAL',
    j.answers.security_or_privacy?.noul >= 0.7 && 'SECURITY',
    j.answers.blocked_now?.noul >= 0.7 && 'BLOCKED',
    j.answers.onboarding_blocker?.noul >= 0.7 && 'ONBOARDING',
  ].filter(Boolean);

  console.log(
    `  ${bandColour(j.priority.band.padEnd(3))} ${String(j.priority.score).padStart(5)}  ` +
    `${j.account.name.padEnd(20)} ${C.dim(j.signal.id)}  → ${C.c(j.queue)}`,
  );
  console.log(
    C.dim(`        ${trunc(j.signal.subject ?? j.signal.channel, 58).padEnd(58)}  `) +
    C.dim(`sentiment=${j.answers.sentiment?.choice}  urgency=${j.answers.urgency?.score}/4  effort=${j.answers.effort?.score}/4`),
  );
  if (flags.length) console.log(`        ${C.y(flags.join(' · '))}`);
  if (j.gated.escalations.length) {
    console.log(C.dim(`        unsure on a high-stakes question → ${j.gated.escalations.join(', ')}`));
  }
}

/* ---- 2. accounts ---- */
rule(C.b('  2. ACCOUNTS — health, renewal risk, and the play to run'));
for (const a of [...result.accounts].sort((x, y) => (y.answers.renewal_risk?.score ?? 0) - (x.answers.renewal_risk?.score ?? 0))) {
  const risk = a.answers.renewal_risk?.score ?? 0;
  const colour = risk >= 3 ? C.r : risk >= 2 ? C.y : C.g;
  console.log(`\n  ${C.b(a.account.name.padEnd(22))} ${colour(`health ${a.derived.healthGrade}`)}  ${C.dim(`(recorded: ${a.account.health})`)}`);
  console.log(`  ${''.padEnd(22)} renewal risk ${colour(`${risk}/4`)}  ·  value at risk ${colour(formatUsd(a.derived.valueAtRisk ?? 0))} of ${formatUsd(a.derived.contractValue ?? 0)}`);
  console.log(`  ${''.padEnd(22)} driver: ${C.c(a.answers.primary_risk_driver?.choice ?? '?')}  ·  outlook: ${a.answers.outlook?.choice ?? '?'}`);
  console.log(`  ${''.padEnd(22)} ${C.b('play:')} ${C.c(a.answers.recommended_play?.choice ?? '?')} ${C.dim(`(confidence ${a.answers.recommended_play?.confidence ?? '?'})`)}`);
  console.log(C.dim(`  ${''.padEnd(22)} evidence: ${a.evidence.signalsIncluded} signals${a.evidence.signalsDropped ? `, ${a.evidence.signalsDropped} dropped for budget` : ''}${a.derived.thinEvidence ? C.y('  ⚠ thin evidence — treat this verdict as weak') : ''}`));
  if (a.gated.escalations.length) {
    console.log(C.y(`  ${''.padEnd(22)} unsure on: ${a.gated.escalations.join(', ')} → send to a larger model or a person`));
  }
}

/* ---- 3. outbound QA ---- */
if (result.replies.length) {
  rule(C.b('  3. OUTBOUND QA — drafts judged before a customer reads them'));
  for (const r of result.replies) {
    const mark = { send: C.g('SEND'), send_after_edit: C.y('EDIT'), hold_for_human: C.r('HOLD') }[r.decision];
    console.log(`\n  ${mark}  ${C.dim(r.signal.id)}  ${trunc(r.signal.subject ?? '', 50)}`);
    console.log(C.dim(`        readiness=${r.answers.send_readiness?.choice}  supported=${pct(r.answers.factually_supported?.noul)}  commits=${pct(r.answers.makes_a_commitment?.noul)}  legal=${pct(r.answers.legally_sensitive?.noul)}  clarity=${r.answers.clarity?.score}/4`));
    if (r.blockers.length) console.log(`        ${C.r(`blocked by: ${r.blockers.join(', ')}`)}`);
  }
}

/* ---- 4. portfolio ---- */
rule(C.b('  4. PORTFOLIO'));
const p = result.portfolio;
console.log(`  accounts at risk     ${p.accountsAtRisk.length ? C.r(p.accountsAtRisk.join(', ')) : C.g('none')}`);
console.log(`  value at risk        ${C.b(formatUsd(p.valueAtRiskUsd))}`);
console.log(`  expansion ready      ${p.expansionReady.length ? C.g(p.expansionReady.join(', ')) : C.dim('none')}`);
console.log(`  reference ready      ${p.referenceReady.length ? C.g(p.referenceReady.join(', ')) : C.dim('none')}`);
console.log(`  thin evidence        ${p.thinEvidence.length ? C.y(p.thinEvidence.join(', ')) : C.dim('none')}`);
console.log(`  priority split       ${Object.entries(p.signalsByPriority).map(([k, v]) => `${k}:${v}`).join('  ')}`);
console.log(`  root causes          ${p.rootCauseRanking.slice(0, 5).map(([k, v]) => `${k}(${v})`).join('  ') || C.dim('none')}`);
console.log(`  queues               ${Object.entries(p.signalsByQueue).map(([k, v]) => `${k}:${v}`).join('  ')}`);

/* ---- 5. ledger ---- */
rule(C.b('  5. LEDGER — what it cost and how long it took'));
const L = result.ledger;
console.log(`  calls                ${L.calls}   (${L.decisions} typed decisions, ${L.decisionsPerCall} per call)`);
console.log(`  input tokens         ${L.inputTokens.toLocaleString()}`);
console.log(`  cost                 ${C.b(formatUsd(L.cost.modelledUsd))}${L.cost.simulated ? C.y('  ← modelled at Jev list price; nothing was actually billed') : ''}`);
console.log(`  per decision         ${formatUsd(L.cost.perDecisionUsd)}   (${L.cost.decisionsPerDollar?.toLocaleString() ?? '—'} decisions per dollar)`);
console.log(`  latency              p50 ${L.latency.p50Ms} ms   p90 ${L.latency.p90Ms} ms   max ${L.latency.maxMs} ms`);
console.log(`  wall clock           ${(result.wallClockMs / 1000).toFixed(1)} s`);
console.log(C.dim(`\n  against ${L.comparedWith.baseline}: ~${formatUsd(L.comparedWith.baselineCostUsd)} and ~${L.comparedWith.baselineSeconds}s for the same ${L.calls} cases`));
console.log(C.dim(`  → ~${L.comparedWith.cheaperBy}× cheaper. ${L.comparedWith.note}`));
console.log(`\n  autonomy rate        ${C.b(`${((L.gate.meanAutonomyRate ?? 0) * 100).toFixed(1)}%`)} of decisions cleared their confidence bar`);
console.log(`  sent for review      ${L.gate.totalUncertain}   escalated: ${L.gate.totalEscalations}`);

if (result.simulated) {
  console.log(C.y('\n  ⚠ This run used the offline simulator, not Jev. The shapes, the gate, the'));
  console.log(C.y('    ledger and the UI are real; the verdicts are lexical, not intelligent.'));
  console.log(C.y('    Set JEV_PROVIDER and JEV_API_KEY to run it against the model.\n'));
} else {
  console.log('');
}

function trunc(s, n) {
  s = String(s ?? '');
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
function pct(n) {
  return n === undefined ? '—' : `${Math.round(n * 100)}%`;
}
