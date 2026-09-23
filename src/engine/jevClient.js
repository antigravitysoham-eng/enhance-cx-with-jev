/**
 * jevClient.js — one transport for Jev, four ways to reach it.
 *
 * Jev (TypeSafe AI's System One model, released 15 Sep 2026) takes a `state`
 * (the text to judge) and a `questions` object, and returns typed answers with
 * per-option probabilities and a calibrated confidence. It never writes prose.
 *
 * Every provider below speaks the same request shape, because TypeSafe published
 * it and the gateways copied it. That is why one client covers all of them.
 *
 *   direct      POST https://api.typesafe.ai/v1/systemone      (TypeSafe key)
 *   openrouter  POST https://openrouter.ai/api/v1/systemone    (OpenRouter key)
 *   gateway     POST <your Cloudflare / Netlify / Vercel AI Gateway URL>
 *   simulator   no network at all — deterministic, offline, free
 *
 * The simulator exists so this repo runs on a laptop with no key and no
 * account. It is a lexical scorer, NOT a model: it is here to exercise the
 * pipeline, the confidence gate, the ledger and the UI. Its verdicts are
 * plausible, not intelligent. Never quote a simulator number as a Jev number —
 * `meta.simulated` is set on every answer it produces so you cannot do it by
 * accident.
 */

import { simulate } from './simulator.js';

export const PROVIDERS = ['direct', 'openrouter', 'gateway', 'simulator'];

const ENDPOINTS = {
  direct: 'https://api.typesafe.ai/v1/systemone',
  openrouter: 'https://openrouter.ai/api/v1/systemone',
};

/** Published price, 22 Sep 2026: $0.042 per million input tokens, output free. */
export const USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;

/** Published ceilings. The client refuses oversized calls rather than paying for a 400. */
export const LIMITS = {
  contextTokens: 64_000,
  stateTokens: 32_000, // state + longest question
  choiceOptions: 255,
  requestsPerMinute: 1_200,
  tokensPerSecond: 250_000,
};

class JevError extends Error {
  constructor(message, { status, body, retryable = false } = {}) {
    super(message);
    this.name = 'JevError';
    this.status = status;
    this.body = body;
    this.retryable = retryable;
  }
}

/**
 * Rough token estimate. Used only for pre-flight limit checks and for costing
 * calls the provider did not bill back (the simulator). When the provider
 * returns `usage.input_tokens`, that number wins.
 */
export function estimateTokens(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return Math.ceil(text.length / 4);
}

export function costUsd(inputTokens) {
  return inputTokens * USD_PER_INPUT_TOKEN;
}

/** Throw early on the three limits that actually bite in production. */
export function assertWithinLimits(state, questions) {
  const stateTokens = estimateTokens(state);
  const questionTokens = Object.values(questions).map(estimateTokens);
  const longestQuestion = questionTokens.length ? Math.max(...questionTokens) : 0;
  const total = stateTokens + questionTokens.reduce((a, b) => a + b, 0);

  if (stateTokens + longestQuestion > LIMITS.stateTokens) {
    throw new JevError(
      `state + longest question is ~${stateTokens + longestQuestion} tokens, over the ${LIMITS.stateTokens} limit. Trim the state.`,
    );
  }
  if (total > LIMITS.contextTokens) {
    throw new JevError(`request is ~${total} tokens, over the ${LIMITS.contextTokens} context limit.`);
  }
  for (const [id, q] of Object.entries(questions)) {
    if (q.type === 'choice') {
      const n = Object.keys(q.criteria ?? {}).length;
      if (n > LIMITS.choiceOptions) {
        throw new JevError(
          `question "${id}" offers ${n} options; a single choice holds at most ${LIMITS.choiceOptions}. Rank wide with a score pass, then read narrow.`,
        );
      }
      if (n < 2) throw new JevError(`question "${id}" is a choice with ${n} option(s); it needs at least 2.`);
    }
    if (q.type === 'score' && !Array.isArray(q.criteria)) {
      throw new JevError(`question "${id}" is a score; its criteria must be an ordered array of level descriptions.`);
    }
    if (!q.instructions || q.instructions.length < 12) {
      // The question ID never reaches the model. A field called `is_urgent`
      // tells Jev nothing; the instructions carry the whole question.
      throw new JevError(`question "${id}" has no usable instructions. The question ID is never sent to the model.`);
    }
  }
  return { stateTokens, longestQuestion, estimatedTotal: total };
}

export function createJevClient(options = {}) {
  const {
    provider = process.env.JEV_PROVIDER || 'simulator',
    apiKey = process.env.JEV_API_KEY || process.env.TYPESAFE_API_KEY || process.env.OPENROUTER_API_KEY,
    baseUrl = process.env.JEV_BASE_URL,
    model = process.env.JEV_MODEL || 'jev-latest',
    timeoutMs = Number(process.env.JEV_TIMEOUT_MS || 15_000),
    maxRetries = 3,
    fetchImpl = globalThis.fetch,
  } = options;

  if (!PROVIDERS.includes(provider)) {
    throw new JevError(`unknown provider "${provider}". One of: ${PROVIDERS.join(', ')}`);
  }
  const live = provider !== 'simulator';
  const endpoint = baseUrl || ENDPOINTS[provider];
  if (live && !endpoint) throw new JevError(`provider "${provider}" needs JEV_BASE_URL`);
  if (live && !apiKey) throw new JevError(`provider "${provider}" needs an API key (JEV_API_KEY)`);

  /**
   * One Jev call. Every question in `questions` is answered in parallel against
   * the same state, so asking twenty costs about what asking one costs. Sending
   * one question per request is the single most expensive mistake with this model.
   *
   * @returns {Promise<{answers: object, usage: object, meta: object}>}
   */
  async function ask(state, questions, { signal } = {}) {
    if (!questions || Object.keys(questions).length === 0) {
      throw new JevError('a call needs at least one question');
    }
    const preflight = assertWithinLimits(state, questions);
    const startedAt = performance.now();

    if (!live) {
      const { answers, inputTokens } = simulate(state, questions);
      const latencyMs = Math.round(performance.now() - startedAt);
      return {
        answers,
        usage: { input_tokens: inputTokens, output_tokens: 0 },
        meta: {
          provider, model: 'simulator', latencyMs, simulated: true,
          costUsd: 0, wouldHaveCostUsd: costUsd(inputTokens),
          questionCount: Object.keys(questions).length, ...preflight,
        },
      };
    }

    const body = JSON.stringify({ model, state, questions });
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        // The SDKs retry with backoff when a request goes over a rate limit; so do we.
        await new Promise((r) => setTimeout(r, Math.min(2 ** attempt * 250, 4_000) + Math.random() * 200));
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });
      try {
        const res = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
            'user-agent': 'cx-sentinel/1.0 (+enhance-cx-with-jev)',
          },
          body,
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (res.status === 429 || res.status >= 500) {
          lastError = new JevError(`Jev returned ${res.status}`, { status: res.status, retryable: true });
          continue;
        }
        if (!res.ok) {
          throw new JevError(`Jev returned ${res.status}`, { status: res.status, body: await res.text().catch(() => '') });
        }

        const json = await res.json();
        // Gateways wrap the payload differently; both shapes carry the same answers.
        const answers = json.answers ?? json.result?.answers ?? json.output?.answers ?? json;
        const inputTokens = json.usage?.input_tokens ?? preflight.estimatedTotal;
        const latencyMs = Math.round(performance.now() - startedAt);
        return {
          answers: normalizeAnswers(answers, questions),
          usage: json.usage ?? { input_tokens: inputTokens, output_tokens: 0 },
          meta: {
            provider, model: json.model ?? model, latencyMs, simulated: false,
            costUsd: costUsd(inputTokens),
            questionCount: Object.keys(questions).length, ...preflight,
          },
        };
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof JevError && !err.retryable) throw err;
        lastError = err;
      }
    }
    throw lastError ?? new JevError('Jev call failed');
  }

  return { ask, provider, model, live, endpoint, limits: LIMITS };
}

/**
 * Providers differ in what they omit. Fill the gaps so downstream code can
 * always read `.choice`, `.probabilities`, `.confidence` or `.noul` without
 * checking which gateway answered.
 */
function normalizeAnswers(raw, questions) {
  const out = {};
  for (const [id, q] of Object.entries(questions)) {
    const a = raw?.[id];
    if (!a) continue;
    if (q.type === 'noul') {
      const p = typeof a === 'number' ? a : a.noul;
      out[id] = { type: 'noul', noul: p, confidence: Math.abs(p - 0.5) * 2 };
    } else if (q.type === 'choice') {
      const probabilities = a.probabilities ?? {};
      out[id] = {
        type: 'choice',
        choice: a.choice ?? topKey(probabilities),
        probabilities,
        confidence: a.confidence ?? deriveConfidence(probabilities),
      };
    } else if (q.type === 'score') {
      out[id] = {
        type: 'score',
        score: a.score,
        level: a.level ?? a.choice,
        probabilities: a.probabilities ?? {},
        confidence: a.confidence ?? deriveConfidence(a.probabilities ?? {}),
        legend: a.legend ?? q.criteria,
      };
    }
  }
  return out;
}

function topKey(probabilities) {
  return Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0]?.[0];
}

/**
 * Fallback only. TypeSafe's own confidence is calibrated and always preferred;
 * this margin-based stand-in is used when a gateway strips the field.
 */
function deriveConfidence(probabilities) {
  const sorted = Object.values(probabilities).sort((a, b) => b - a);
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  return Math.max(0, sorted[0] - sorted[1]);
}

export { JevError, normalizeAnswers, deriveConfidence };
