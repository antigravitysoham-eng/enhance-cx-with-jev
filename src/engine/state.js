/**
 * state.js — building the thing Jev actually judges.
 *
 * The single highest-leverage file in this repo, and the one most likely to be
 * skipped. Jev decides on the state you send and nothing else. "The customer
 * is unhappy" tells it almost nothing; the message they wrote, what they pay,
 * what is still open and what happened last time tells it everything.
 *
 * Two constraints shape every builder here:
 *
 *  - Budget. State plus the longest question must fit in 32k tokens, and the
 *    whole request in 64k. Evidence is therefore ranked and trimmed, never
 *    truncated mid-item, and what was dropped is reported back so a thin
 *    verdict can be recognised as thin.
 *
 *  - No summarising. Where a rollup is needed we send the ITEMS, compactly
 *    rendered, rather than a paraphrase of them. A paraphrase is a second
 *    model's opinion smuggled into the evidence.
 */

const CHARS_PER_TOKEN = 4;

export function estimateTokens(text) {
  return Math.ceil(String(text).length / CHARS_PER_TOKEN);
}

/**
 * One inbound signal, rendered for the signal rubric.
 *
 * The account facts are included because several questions cannot be answered
 * without them: whether an SLA is in play, whether "we are reviewing options"
 * is idle talk or a renewal six weeks out.
 */
export function buildSignalState(signal, account) {
  const lines = [];

  lines.push(`CHANNEL: ${signal.channel}`);
  lines.push(`RECEIVED: ${signal.receivedAt}`);
  if (signal.subject) lines.push(`SUBJECT: ${signal.subject}`);
  lines.push(`FROM: ${signal.from?.name ?? 'unknown'}${signal.from?.role ? ` (${signal.from.role})` : ''}`);

  if (account) {
    lines.push('');
    lines.push('--- ACCOUNT FACTS ---');
    lines.push(`Account: ${account.name} · ${account.industry ?? 'industry unknown'} · ${account.type ?? 'Customer'}`);
    lines.push(`Contract value: ${account.value ?? 'unknown'}`);
    lines.push(`Renewal date: ${account.renewals ?? 'not set'}`);
    lines.push(`Recorded health: ${account.health ?? 'unknown'}`);
    lines.push(`Onboarding progress: ${account.progress ?? 0}% complete`);
    if (account.csm) lines.push(`Owner: ${account.csm}`);
    if (account.plan) lines.push(`Plan: ${account.plan}`);
    if (account.supportTier) lines.push(`Support tier: ${account.supportTier}`);
  }

  if (signal.history?.length) {
    lines.push('');
    lines.push('--- THIS CONTACT’S RECENT HISTORY, OLDEST FIRST ---');
    for (const h of signal.history) {
      lines.push(`[${h.at}] ${h.summary}${h.status ? ` (${h.status})` : ''}`);
    }
  }

  if (signal.openItems?.length) {
    lines.push('');
    lines.push('--- STILL OPEN ON THIS ACCOUNT ---');
    for (const o of signal.openItems) {
      lines.push(`- ${o.ref ? `${o.ref}: ` : ''}${o.title} — opened ${o.openedAt}${o.severity ? `, severity ${o.severity}` : ''}`);
    }
  }

  lines.push('');
  lines.push('--- THE MESSAGE ---');
  lines.push(signal.body?.trim() ?? '');

  return lines.join('\n');
}

/**
 * One account, rendered for the account rubric.
 *
 * `signals` here are the raw signals with their Jev verdicts already attached,
 * so the account pass reasons over evidence AND over the first pass's typed
 * conclusions. That is cheaper and more honest than asking a model to
 * re-read every message: the verdicts are typed, so including them adds
 * structure rather than noise.
 */
export function buildAccountState(account, judgedSignals, { budgetTokens = 24_000, now = new Date() } = {}) {
  const head = [];
  head.push('--- ACCOUNT ---');
  head.push(`Name: ${account.name}`);
  head.push(`Type: ${account.type ?? 'Customer'} · Industry: ${account.industry ?? 'unknown'}`);
  head.push(`Contract value: ${account.value ?? 'unknown'}`);
  head.push(`Renewal date: ${account.renewals ?? 'not set'}${daysUntil(account.renewals, now)}`);
  head.push(`Onboarding progress: ${account.progress ?? 0}% complete`);
  head.push(`Owner: ${account.csm ?? 'unassigned'}`);
  if (account.seats) head.push(`Seats: ${account.seats.used ?? '?'} of ${account.seats.licensed ?? '?'} in use`);
  if (account.contacts?.length) {
    head.push(`Known contacts: ${account.contacts.map((c) => `${c.name} (${c.role})`).join(', ')}`);
  }
  head.push('');
  head.push(`--- EVIDENCE: ${judgedSignals.length} RECENT SIGNALS, MOST RECENT FIRST ---`);
  head.push('Each entry is one thing the customer sent us, with the typed verdicts already returned for it.');
  head.push('');

  // Most recent first, then most consequential — so when the budget bites, what
  // gets dropped is old and quiet rather than recent and loud.
  const ranked = [...judgedSignals].sort((a, b) => {
    const t = new Date(b.signal.receivedAt) - new Date(a.signal.receivedAt);
    if (t !== 0) return t;
    return (b.priority?.score ?? 0) - (a.priority?.score ?? 0);
  });

  const rendered = [];
  let used = estimateTokens(head.join('\n'));
  let dropped = 0;

  for (const item of ranked) {
    const block = renderJudgedSignal(item);
    const cost = estimateTokens(block);
    if (used + cost > budgetTokens) {
      dropped++;
      continue;
    }
    used += cost;
    rendered.push(block);
  }

  const tail = dropped > 0
    ? [`\n[${dropped} older signal(s) omitted to stay within the request budget.]`]
    : [];

  return {
    text: [...head, ...rendered, ...tail].join('\n'),
    includedSignals: rendered.length,
    droppedSignals: dropped,
    estimatedTokens: used,
  };
}

function renderJudgedSignal({ signal, answers, priority }) {
  const flags = [];
  const flag = (id, label) => {
    if ((answers?.[id]?.noul ?? 0) >= 0.5) flags.push(label);
  };
  flag('churn_signal', 'churn language');
  flag('expansion_signal', 'expansion interest');
  flag('advocacy_signal', 'advocacy');
  flag('blocked_now', 'blocked');
  flag('exec_escalation', 'exec attention');
  flag('contractual_risk', 'contractual');
  flag('security_or_privacy', 'security/privacy');
  flag('sla_breach_risk', 'SLA risk');
  flag('onboarding_blocker', 'onboarding blocked');
  flag('usage_decline', 'usage falling');
  flag('feature_request', 'feature request');

  const lines = [];
  lines.push(`[${signal.receivedAt}] ${signal.channel.toUpperCase()} from ${signal.from?.name ?? 'unknown'}${signal.from?.role ? ` (${signal.from.role})` : ''}`);
  if (signal.subject) lines.push(`  Subject: ${signal.subject}`);
  lines.push(`  Verdicts: sentiment=${answers?.sentiment?.choice ?? '?'}, urgency=${fmtScore(answers?.urgency)}, effort=${fmtScore(answers?.effort)}, issue=${answers?.issue_type?.choice ?? '?'}, cause=${answers?.root_cause_area?.choice ?? '?'}, priority=${priority?.band ?? '?'}`);
  if (flags.length) lines.push(`  Flags: ${flags.join(', ')}`);
  lines.push(`  What they wrote: ${oneParagraph(signal.body, 420)}`);
  return lines.join('\n');
}

function fmtScore(a) {
  if (!a) return '?';
  return `${a.score ?? '?'}/4`;
}

function oneParagraph(text, max) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function daysUntil(dateish, now) {
  if (!dateish || dateish === 'N/A') return '';
  const d = new Date(dateish);
  if (Number.isNaN(d.getTime())) return '';
  const days = Math.round((d - now) / 86_400_000);
  if (days < 0) return ` (${Math.abs(days)} days ago)`;
  return ` (in ${days} days)`;
}

/** A draft reply plus the context it must be true against, for the QA rubric. */
export function buildReplyState({ draft, originalSignal, account, knownFacts = [] }) {
  const lines = [];
  lines.push('--- THE CUSTOMER MESSAGE BEING ANSWERED ---');
  lines.push(`From: ${originalSignal.from?.name ?? 'unknown'}${originalSignal.from?.role ? ` (${originalSignal.from.role})` : ''}`);
  if (originalSignal.subject) lines.push(`Subject: ${originalSignal.subject}`);
  lines.push(originalSignal.body?.trim() ?? '');

  if (account) {
    lines.push('');
    lines.push('--- WHAT IS TRUE ABOUT THIS ACCOUNT ---');
    lines.push(`${account.name}, ${account.type ?? 'Customer'}, contract ${account.value ?? 'unknown'}, renewal ${account.renewals ?? 'not set'}.`);
    if (account.supportTier) lines.push(`Support tier: ${account.supportTier}.`);
    if (account.plan) lines.push(`Plan: ${account.plan}.`);
  }

  if (knownFacts.length) {
    lines.push('');
    lines.push('--- ESTABLISHED FACTS THE REPLY MAY RELY ON ---');
    lines.push('Anything asserted in the draft that is not here and not in the customer message is unsupported.');
    for (const f of knownFacts) lines.push(`- ${f}`);
  }

  lines.push('');
  lines.push('--- THE DRAFT REPLY UNDER REVIEW ---');
  lines.push(draft.trim());

  return lines.join('\n');
}
