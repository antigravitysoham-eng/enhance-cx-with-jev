/**
 * policy.js — where the thresholds live.
 *
 * Jev returns a probability and a confidence. It does not decide what to do
 * with them, and it should not: the consequence of being wrong belongs to the
 * business, not to the model. This file is that business logic, kept in one
 * place so it can be reviewed, versioned and argued about by people who do not
 * read the pipeline code.
 *
 * Two things everybody gets wrong on the first build, stated here once:
 *
 *  - Branch on the CONFIDENCE, not on the probability. The probabilities say
 *    which option Jev picked. The confidence says how much weight the
 *    alternatives still carry, and that is the number your code should read.
 *
 *  - Confidence is not accuracy. A threshold is an empirical claim about YOUR
 *    data. The numbers below are defaults to start from and calibrate against
 *    labelled examples — see `calibrate()` at the bottom, and the note in
 *    docs/ARCHITECTURE.md. They are not a recommendation to trust 0.75.
 *
 * The asymmetry that matters: a wrong "route this to billing" costs a handover.
 * A wrong "cancel the renewal alert" costs the renewal. So destructive,
 * irreversible or customer-visible actions carry higher bars than filing ones.
 */

/** Threshold per decision, by what it costs to be wrong about it. */
export const THRESHOLDS = {
  // Filing decisions. Cheap to get wrong, trivially reversible.
  routing_team: 0.55,
  issue_type: 0.45,
  root_cause_area: 0.45,
  churn_reason: 0.40,
  mentions_competitor: 0.60,

  // Prioritisation. A wrong answer wastes someone's morning.
  urgency: 0.55,
  sentiment: 0.50,
  effort: 0.45,
  next_best_action: 0.60,

  // Alerting a human. Too low and you cry wolf; too high and you miss the churn.
  churn_signal: 0.65,
  expansion_signal: 0.65,
  advocacy_signal: 0.60,
  blocked_now: 0.60,
  needs_human: 0.55,
  onboarding_blocker: 0.60,
  usage_decline: 0.60,
  feature_request: 0.55,
  reference_quality_evidence: 0.60,

  // Waking up a senior person, or touching legal ground. High bars.
  exec_escalation: 0.75,
  contractual_risk: 0.75,
  security_or_privacy: 0.80,
  sla_breach_risk: 0.70,

  // Account-level verdicts drive money decisions, so they sit high.
  health: 0.55,
  renewal_risk: 0.60,
  primary_risk_driver: 0.55,
  recommended_play: 0.60,
  engagement_depth: 0.50,
  value_realisation: 0.55,
  expansion_ready: 0.70,
  reference_ready: 0.70,
  needs_exec_sponsor: 0.75,
  onboarding_at_risk: 0.65,
  support_burden_unsustainable: 0.65,
  outlook: 0.55,
  churn_within_90_days: 0.75,
  evidence_is_thin: 0.50,

  // Outbound QA. Anything that could reach a customer wrongly sits highest.
  answers_the_question: 0.65,
  factually_supported: 0.75,
  makes_a_commitment: 0.60,
  tone_fits: 0.60,
  acknowledges_the_frustration: 0.55,
  contains_jargon: 0.55,
  leaks_internal_information: 0.80,
  legally_sensitive: 0.80,
  clarity: 0.55,
  send_readiness: 0.70,
};

export const DEFAULT_THRESHOLD = 0.6;

/**
 * A noul returns a probability that a statement is true. Two numbers govern it:
 * how sure we want to be before we act on "true", and the band in the middle
 * where we are not sure of either answer and someone else should look.
 */
export const NOUL_TRUE_AT = 0.7;
export const NOUL_FALSE_BELOW = 0.3;

export function thresholdFor(questionId) {
  return THRESHOLDS[questionId] ?? DEFAULT_THRESHOLD;
}

/**
 * Classify one answer into act / review / escalate.
 *
 *  act       — above the bar. The system may use this without asking anyone.
 *  review    — below the bar. Show it to a person, flagged as uncertain.
 *  escalate  — below the bar AND the decision is consequential enough that it
 *              should go to a larger model or a named human rather than a queue.
 */
export function gate(questionId, answer, { thresholds = THRESHOLDS } = {}) {
  const threshold = thresholds[questionId] ?? DEFAULT_THRESHOLD;
  if (!answer) return { verdict: 'missing', threshold, confidence: 0 };

  if (answer.type === 'noul') {
    const p = answer.noul;
    const decided = p >= NOUL_TRUE_AT || p <= NOUL_FALSE_BELOW;
    const confidence = Math.abs(p - 0.5) * 2;
    return {
      verdict: decided ? 'act' : HIGH_STAKES.has(questionId) ? 'escalate' : 'review',
      value: p >= 0.5,
      probability: p,
      confidence: Number(confidence.toFixed(3)),
      threshold: NOUL_TRUE_AT,
    };
  }

  const confidence = answer.confidence ?? 0;
  const value = answer.type === 'score' ? answer.score : answer.choice;
  if (confidence >= threshold) {
    return { verdict: 'act', value, confidence, threshold, level: answer.level };
  }
  return {
    verdict: HIGH_STAKES.has(questionId) ? 'escalate' : 'review',
    value,
    confidence,
    threshold,
    level: answer.level,
  };
}

/**
 * Decisions where an uncertain answer must not simply sit in a queue. These go
 * to a larger model or a named person. Everything else can wait for the daily
 * review of the uncertain pile.
 */
export const HIGH_STAKES = new Set([
  'exec_escalation',
  'contractual_risk',
  'security_or_privacy',
  'churn_signal',
  'churn_within_90_days',
  'sla_breach_risk',
  'needs_exec_sponsor',
  'renewal_risk',
  'factually_supported',
  'leaks_internal_information',
  'legally_sensitive',
  'send_readiness',
]);

/** Apply the gate across a whole answer set. */
export function gateAll(answers, options = {}) {
  const decisions = {};
  const uncertain = [];
  const escalations = [];
  for (const [id, answer] of Object.entries(answers)) {
    const d = gate(id, answer, options);
    decisions[id] = d;
    if (d.verdict === 'review') uncertain.push(id);
    if (d.verdict === 'escalate') escalations.push(id);
  }
  return {
    decisions,
    uncertain,
    escalations,
    autonomyRate: Object.keys(answers).length
      ? Number(((Object.keys(answers).length - uncertain.length - escalations.length) / Object.keys(answers).length).toFixed(3))
      : 0,
  };
}

/**
 * Priority, computed in code from Jev's answers.
 *
 * This is deliberately arithmetic, not another model call. Jev supplies the
 * semantic judgement that an `if` statement cannot derive from prose; combining
 * those judgements into an ordering is exactly the kind of exact rule that code
 * should own. Keeping it here means it is auditable and free.
 */
export function priorityScore(answers) {
  const n = (id) => answers[id]?.noul ?? 0;
  const s = (id) => answers[id]?.score ?? 0;

  const urgency = s('urgency') / 4; // 0..1 over the five-level scale
  const effort = s('effort') / 4;
  const hostility = answers.sentiment?.probabilities?.hostile ?? 0;
  const negative = answers.sentiment?.probabilities?.negative ?? 0;

  const score =
    urgency * 34 +
    n('blocked_now') * 18 +
    n('churn_signal') * 16 +
    n('exec_escalation') * 10 +
    n('sla_breach_risk') * 8 +
    n('contractual_risk') * 5 +
    n('security_or_privacy') * 5 +
    effort * 10 +
    hostility * 8 +
    negative * 3 +
    n('onboarding_blocker') * 4 -
    n('advocacy_signal') * 6;

  const clamped = Math.max(0, Math.min(100, score));
  return {
    score: Number(clamped.toFixed(1)),
    band: clamped >= 70 ? 'P1' : clamped >= 45 ? 'P2' : clamped >= 22 ? 'P3' : 'P4',
  };
}

/** Where a signal should physically go, once the gate has spoken. */
export function queueFor(answers, gated) {
  const d = gated.decisions;
  if (d.security_or_privacy?.value && d.security_or_privacy.verdict === 'act') return 'security-incident';
  if (d.exec_escalation?.value && d.exec_escalation.verdict === 'act') return 'executive-alert';
  if (d.churn_signal?.value && d.churn_signal.verdict === 'act') return 'retention-desk';
  if (d.contractual_risk?.value && d.contractual_risk.verdict === 'act') return 'legal-review';
  if (d.expansion_signal?.value && d.expansion_signal.verdict === 'act') return 'growth-desk';
  if (gated.escalations.length > 0) return 'escalation-review';
  if (d.routing_team?.verdict === 'act') return `team:${d.routing_team.value}`;
  return 'human-triage';
}

/**
 * Calibration helper.
 *
 * Feed it answers you have graded by hand and it tells you, per threshold, what
 * you would have got right and how much you would have automated. A threshold
 * chosen any other way is a guess.
 *
 * @param {Array<{questionId:string, answer:object, truth:any}>} labelled
 */
export function calibrate(labelled, { grid = [0.3, 0.4, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9] } = {}) {
  const byQuestion = {};
  for (const row of labelled) (byQuestion[row.questionId] ??= []).push(row);

  const report = {};
  for (const [questionId, rows] of Object.entries(byQuestion)) {
    report[questionId] = grid.map((threshold) => {
      let acted = 0;
      let actedCorrect = 0;
      for (const { answer, truth } of rows) {
        const g = gate(questionId, answer, { thresholds: { [questionId]: threshold } });
        if (g.verdict !== 'act') continue;
        acted++;
        const predicted = answer.type === 'noul' ? answer.noul >= 0.5 : (answer.choice ?? answer.level ?? answer.score);
        if (String(predicted) === String(truth)) actedCorrect++;
      }
      return {
        threshold,
        coverage: Number((acted / rows.length).toFixed(3)),
        precisionWhenActing: acted ? Number((actedCorrect / acted).toFixed(3)) : null,
        n: rows.length,
      };
    });
  }
  return report;
}
