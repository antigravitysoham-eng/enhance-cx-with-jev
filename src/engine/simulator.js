/**
 * simulator.js — an offline stand-in for Jev.
 *
 * This is NOT a model. It is a deterministic lexical scorer that returns the
 * same response *shape* Jev returns — typed answers, per-option probabilities,
 * a confidence — so the pipeline, the confidence gate, the ledger, the tests
 * and the UI can all be exercised on a laptop with no API key and no account.
 *
 * It works by scoring each option's description (and, for scores, each level's
 * description) against the state by term overlap, then softmaxing. That is
 * enough to make the demo behave sensibly on the seeded CX signals and enough
 * to make a wrong answer show up as low confidence, which is the behaviour the
 * gate is built to handle.
 *
 * Everything it returns is tagged `simulated: true` upstream. Do not publish a
 * simulator figure as a Jev figure.
 */

const STOP = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'of', 'to', 'in', 'on', 'for',
  'and', 'or', 'but', 'it', 'its', 'this', 'that', 'these', 'those', 'with', 'as', 'at', 'by', 'from',
  'has', 'have', 'had', 'we', 'i', 'you', 'they', 'he', 'she', 'our', 'their', 'your', 'my', 'me',
  'not', 'no', 'so', 'if', 'then', 'than', 'about', 'into', 'over', 'out', 'up', 'down', 'do', 'does',
  'did', 'can', 'will', 'would', 'should', 'could', 'there', 'here', 'what', 'which', 'who', 'when',
]);

/** A small hand-built lexicon: CX vocabulary the term-overlap scorer would otherwise miss. */
const SIGNALS = {
  anger: ['angry', 'furious', 'unacceptable', 'ridiculous', 'appalling', 'frustrated', 'fed up', 'disappointed', 'not acceptable', 'no excuse', 'had enough', 'do not know who else'],
  churn: ['cancel', 'cancelling', 'canceling', 'churn', 'terminate', 'termination', 'not renewing', 'non-renewal', 'competitor', 'switching', 'evaluating alternatives', 'wind down', 'offboard', 'refund', 'leave'],
  expansion: ['upgrade', 'more seats', 'additional licences', 'additional licenses', 'expand', 'another team', 'enterprise plan', 'budget approved', 'roll out', 'rollout', 'add users', 'pilot succeeded'],
  urgency: ['asap', 'urgent', 'immediately', 'today', 'right now', 'blocker', 'blocked', 'down', 'outage', 'production', 'losing sales', 'critical', 'emergency', 'sev1', 'p1'],
  praise: ['thank', 'thanks', 'great', 'excellent', 'love', 'brilliant', 'fantastic', 'helpful', 'amazing', 'appreciate', 'smooth', 'impressed'],
  effort: ['three emails', 'fourth time', 'third time', 'yet again', 'once again', 'again and again', 'rescheduling again', 'chased', 'chasing', 'stop chasing', 'no reply', 'still waiting', 'still not', 'sent the logs twice', 'asked me for that', 'bounced', 'transferred', 'reopened', 'by hand', 'asked me twice'],
  legal: ['legal', 'contract', 'sla', 'breach', 'penalty', 'dpa', 'gdpr', 'procurement', 'clause', 'msa', 'liability', 'audit'],
  exec: ['cfo', 'ceo', 'cto', 'vp', 'director', 'head of', 'board', 'exec', 'leadership'],
  bug: ['bug', 'error', 'crash', 'fails', 'failing', 'broken', 'exception', '500', 'timeout', 'stack trace', 'not working'],
  billing: ['invoice', 'billing', 'payment', 'charged', 'card', 'subscription', 'price', 'pricing', 'discount', 'stripe', 'receipt'],
  onboarding: ['kickoff', 'onboarding', 'implementation', 'integration', 'setup', 'go live', 'go-live', 'training', 'migration', 'provisioning'],
  feature: ['feature request', 'would be nice', 'wish', 'roadmap', 'any plans', 'can you add', 'missing', 'support for'],
};

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

function stateText(state) {
  if (typeof state === 'string') return state;
  if (Array.isArray(state)) return state.join('\n');
  return JSON.stringify(state, null, 1);
}

/** Deterministic jitter so identical inputs give identical outputs across runs. */
function hashJitter(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * Split the state into the part under judgement and the context around it.
 *
 * A simulator crutch, and worth being honest about. The state builders put the
 * customer's own words under a `--- THE MESSAGE ---` heading, with account
 * facts, ticket history and open items above it. A real model weighs those
 * regions by what the question asks. Term overlap cannot: it reads "severity
 * high" in an open-items list and files a question about month-end exports as
 * a crisis. So the simulator is told where the subject is.
 *
 * Jev needs no such hint. Nothing outside this file depends on the markers.
 */
const PRIMARY_MARKERS = ['--- THE MESSAGE ---', '--- THE DRAFT REPLY UNDER REVIEW ---', '--- EVIDENCE:'];

function splitRegions(text) {
  for (const marker of PRIMARY_MARKERS) {
    const i = text.lastIndexOf(marker);
    if (i >= 0) {
      return { primary: text.slice(i + marker.length), context: text.slice(0, i) };
    }
  }
  return { primary: text, context: '' };
}

const CONTEXT_WEIGHT = 0.3;

/**
 * How much of each signal family the state carries, 0..1 per family. Evidence
 * in the message itself counts in full; evidence in the surrounding context
 * counts for less.
 */
function familyPresence(primaryLower, contextLower) {
  const presence = {};
  for (const [family, terms] of Object.entries(SIGNALS)) {
    let hits = 0;
    for (const t of terms) {
      if (primaryLower.includes(t)) hits += 1;
      else if (contextLower.includes(t)) hits += CONTEXT_WEIGHT;
    }
    presence[family] = Math.min(1, hits / 1.75);
  }
  return presence;
}

/**
 * What a question's option is ABOUT, matched on the vocabulary an option
 * description uses rather than on accidental collisions with the state lexicon.
 *
 * The first version of this matched an option to a family if the description
 * happened to contain two of that family's terms. It put the `hostile`
 * sentiment bucket — "angry, accusatory or threatening: demands escalation,
 * refund, cancellation or legal action" — into the churn AND legal families,
 * because it says "refund", "cancellation" and "legal". Every message on an
 * account whose facts mention a contract then read as hostile. These patterns
 * match what an option means instead.
 */
const FAMILY_HINTS = {
  praise: /pleased|grateful|complimentary|satisf|thankful|advocac|recommend|referenc|public/i,
  anger: /angry|accusator|threaten|hostile|unhappy|disappoint|frustrat|critical of|worn down/i,
  churn: /leav|cancel|not renew|non-renew|competitor|churn|downgrad|exit|terminat|wind.down|alternativ/i,
  expansion: /more seats|upgrade|expand|buy more|higher tier|another team|approved budget|grow|purchas/i,
  urgency: /urgent|blocked|immediately|hours matter|production is down|deadline|time pressure|same-day|losing money/i,
  praise_result: /concrete|quotable|number|time saved|cost avoided|outcome achieved/i,
  billing: /invoice|payment|billing|refund|charge|pricing|price|discount|subscription|plan change/i,
  bug: /bug|error|crash|defect|does not work|broken|fail|behaved badly|regression|instability/i,
  onboarding: /onboard|implement|kickoff|go.live|migration|provision|training|roll.?out|stalled/i,
  legal: /contract|legal|\bsla\b|complian|breach|procurement|liabilit|regulat|data protection|audit|security/i,
  effort: /repeat|chase|re-explain|bounced|handed between|passed between|follow.?up|re-sent|given up/i,
  exec: /senior|executive|leadership|\bboard\b|sponsor|economic buyer/i,
  feature: /feature|roadmap|capability|does not do|would need to be built|missing/i,
};

function familiesOf(description) {
  const out = [];
  for (const [family, pattern] of Object.entries(FAMILY_HINTS)) {
    if (pattern.test(description)) out.push(family === 'praise_result' ? 'praise' : family);
  }
  return [...new Set(out)];
}

/**
 * Affinity between the state and one option description.
 *
 * Normalised by description length, because otherwise the wordiest option wins
 * every question — which is exactly the failure mode a naive term-overlap
 * scorer has, and the reason the first run of this demo filed every message as
 * a security incident.
 */
function affinity(ctx, description, presence) {
  const descTokens = tokenize(description);
  if (descTokens.length === 0) return 0;
  const unique = new Set(descTokens);
  let overlap = 0;
  for (const t of unique) {
    if (ctx.primaryTokens.has(t)) overlap += 1;
    else if (ctx.contextTokens.has(t)) overlap += CONTEXT_WEIGHT;
  }
  const overlapRate = overlap / Math.sqrt(unique.size);

  const phraseHits = description
    .toLowerCase()
    .split(/[,;:/]|\band\b|\bor\b/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10 && ctx.primaryLower.includes(s)).length;

  const families = familiesOf(description);
  const familyScore = families.length
    ? families.reduce((a, f) => a + (presence[f] ?? 0), 0) / Math.sqrt(families.length)
    : 0;

  return { lexical: overlapRate * 1.1 + phraseHits * 1.8, familyScore };
}

const FAMILY_WEIGHT = 1.9;

/**
 * Combine the components across the options of ONE question, centring the
 * lexicon term on that question's own mean.
 *
 * Without the centring, an option whose description happens to touch three
 * lexicon families beats an option that touches none, on every input — which is
 * why the `hostile` sentiment bucket ("angry... demands escalation, refund or
 * legal action" — three families at once) was winning even on a polite question
 * about webhook retries. Centring asks the right question instead: does this
 * option match the state MORE than its rivals do?
 */
function combine(parts) {
  const mean = parts.reduce((a, p) => a + p.familyScore, 0) / parts.length;
  return parts.map((p) => p.lexical + (p.familyScore - mean) * FAMILY_WEIGHT);
}

function softmax(scores, temperature = 0.85) {
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp((s - max) / temperature));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

function round(n, places = 3) {
  return Number(n.toFixed(places));
}

/**
 * Confidence here mirrors what TypeSafe's confidence is *for*: how much weight
 * the alternatives still carry. A near-tie is low confidence even when the top
 * probability looks respectable. The real model's score is calibrated; this one
 * is not — it is only monotone in the same direction.
 */
function confidenceFrom(probabilities) {
  const sorted = [...probabilities].sort((a, b) => b - a);
  if (sorted.length < 2) return round(sorted[0] ?? 0);
  const margin = sorted[0] - sorted[1];
  const entropy = -probabilities.reduce((a, p) => a + (p > 0 ? p * Math.log(p) : 0), 0);
  const maxEntropy = Math.log(probabilities.length);
  const spread = maxEntropy > 0 ? 1 - entropy / maxEntropy : 1;
  return round(Math.max(0, Math.min(1, 0.55 * margin + 0.45 * spread)));
}

export function simulate(state, questions) {
  const text = stateText(state);
  const { primary, context } = splitRegions(text);
  const ctx = {
    primaryLower: primary.toLowerCase(),
    contextLower: context.toLowerCase(),
    primaryTokens: new Set(tokenize(primary)),
    contextTokens: new Set(tokenize(context)),
  };
  const presence = familyPresence(ctx.primaryLower, ctx.contextLower);
  const answers = {};

  for (const [id, q] of Object.entries(questions)) {
    const jitter = hashJitter(id + text.slice(0, 120)) * 0.2;

    if (q.type === 'choice') {
      const keys = Object.keys(q.criteria);
      const parts = keys.map((k) => affinity(ctx, `${k.replace(/_/g, ' ')} ${q.criteria[k]}`, presence));
      const scores = combine(parts).map((v, i) => v + jitter * ((i % 3) / 3));
      const probs = softmax(scores);
      const probabilities = Object.fromEntries(keys.map((k, i) => [k, round(probs[i])]));
      const best = keys[probs.indexOf(Math.max(...probs))];
      answers[id] = { type: 'choice', choice: best, probabilities, confidence: confidenceFrom(probs) };
      continue;
    }

    if (q.type === 'score') {
      const levels = q.criteria; // ordered array of level descriptions
      const parts = levels.map((lvl) => affinity(ctx, lvl, presence));
      const scores = combine(parts).map((v, i) => v + jitter * ((i % 3) / 3));
      const probs = softmax(scores);
      // Expected level, the way an ordinal score reads: a weighted position on the scale.
      const expected = probs.reduce((a, p, i) => a + p * i, 0);
      const probabilities = Object.fromEntries(levels.map((l, i) => [String(i), round(probs[i])]));
      answers[id] = {
        type: 'score',
        score: round(expected, 2),
        level: levels[Math.round(expected)] ?? levels[levels.length - 1],
        probabilities,
        confidence: confidenceFrom(probs),
        legend: levels,
      };
      continue;
    }

    if (q.type === 'noul') {
      // Most statements put to a noul are false, so "no" carries a standing
      // prior and the evidence has to beat it. Without this the long, carefully
      // written instructions that make a GOOD question also make every noul
      // fire — wordiness read as evidence.
      // A noul is one statement against a standing prior, not a field of
      // rivals, so the absolute family score is the right signal here — there
      // is nothing to centre it against.
      const part = affinity(ctx, q.instructions, presence);
      const forScore = part.lexical + part.familyScore * FAMILY_WEIGHT;
      const againstScore = 2.15 + jitter;
      const [p] = softmax([forScore, againstScore], 0.75);
      answers[id] = { type: 'noul', noul: round(p), confidence: round(Math.abs(p - 0.5) * 2) };
      continue;
    }

    throw new Error(`simulator: unknown question type "${q.type}" on "${id}"`);
  }

  const inputTokens = Math.ceil((text.length + JSON.stringify(questions).length) / 4);
  return { answers, inputTokens };
}
