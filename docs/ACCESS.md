# Getting to Jev

Jev is closed-weights and API-only. You do **not** need a TypeSafe key to call it — it is
served through several gateways, which is also the quickest way to try it against a model
you already pay for.

| Route | `JEV_PROVIDER` | What you need |
|---|---|---|
| TypeSafe API | `direct` | A TypeSafe key. Sign in at `console.typesafe.ai`; there is a waitlist. |
| OpenRouter (beta) | `openrouter` | An OpenRouter key. One key across models you already call. |
| Cloudflare AI Gateway | `gateway` | Your gateway URL in `JEV_BASE_URL`, plus its token. |
| Netlify AI Gateway | `gateway` | Same shape, Netlify's URL. |
| Vercel AI Gateway | `gateway` | Same shape. |
| LiteLLM proxy | `gateway` | Point `JEV_BASE_URL` at your proxy. |
| Pydantic AI / LangChain | — | `langchain-typesafe`, or Pydantic AI's typed calls. Different client, same rubrics. |
| **Offline simulator** | `simulator` | Nothing. The default. Not a model. |

## Pricing

$0.042 per million input tokens. Output is free. **There is no free tier.**

A run of this repo's whole seed corpus — 41 calls, 794 typed decisions — models out at under
half a cent. Published figures from other builders sit around $0.000068 a decision, or
roughly 14,700 decisions per dollar; the deep-rubric shape used here lands well under that,
because one state is amortised across 22 questions.

## Open alternatives

Jev's weights are not published, but its **request shape is**, which is why a family of open
System One models exists that the same client can call by changing a base URL: Laya (421M,
Apache 2.0), kev (Qwen2.5-0.5B, trains on a MacBook), OpenJev Verdict, NanoJev, QwenJev.
Their accuracy claims are self-reported on benchmarks they chose. The thing none of them has
matched in public is the *calibrated* confidence — which is the number this entire design
branches on, so swapping one in means re-running `CALIBRATION.md` from scratch.

## The agent route

Two different things, often confused:

```bash
npx skills add typesafe-ai/skills --skill typesafe-ai
```

teaches a coding agent to **write programs that call Jev**. An MCP server instead lets the
agent **ask Jev for a judgement while it works**, as a tool call. For this project you want
neither at runtime — the calls are in the code — but the skill is useful while extending the
rubrics.

## Rate limits

250,000 tokens per second, 1,200 requests per minute. `pipeline.js` bounds concurrency at 12
by default, well under the ceiling, so a batch cannot exhaust a shared key. Raise it with
`createEngine({ concurrency: N })` once you know what else is on that key.
