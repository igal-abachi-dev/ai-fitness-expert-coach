# AI Fitness Coach Agent API

Structured, tool-using fitness coaching agent — not a simple chatbot. Deterministic
domain logic (nutrition math, training load, safety rules) wraps the LLM; the model
reasons and explains over tool output, then post-validation refuses invalid plans.
Built as a reusable domain-agent template: Fastify 5 + TypeScript (strict) +
[Vercel AI SDK 6](https://ai-sdk.dev) (`ToolLoopAgent`, `Output.object`).

**Scope:** a real Level-3 domain agent (tools + schema + validation). Not
medical-grade and not a human coach replacement. Planned next: RAG citations,
persistent memory, optional Neon/Postgres profiles.

Verified against: `ai@6.0.x`, `fastify@5.8.x`, `zod@4.x`,
`fastify-type-provider-zod@6.x`, `@fastify/helmet@13`, `@fastify/cors@11`,
`@fastify/rate-limit@11`, `@fastify/swagger@9`, Node 22. Typecheck + 29 tests
pass; `npm ci` + build smoke-tested.

## Quick start

```bash
cp .env.example .env   # fill in API keys; set CORS_ORIGIN to your frontend origin
npm install            # local dev
npm run dev
```

For CI and deployment use `npm ci` (requires a committed `package-lock.json` in sync
with `package.json`).

Server listens on `http://localhost:3000` by default.

`npm test` · `npm run typecheck` · `npm run build && npm start`

OpenAPI UI: `http://localhost:3000/documentation` (JSON at `/documentation/json`).

### Environment

All keys below are validated at startup (see `src/config/env.ts`). Placeholder
values in `.env.example` are enough for local boot; real keys are required before
calling the coach endpoints. Only API keys for providers referenced by your
configured model roles are required.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `3000` | Listen port |
| `LOG_LEVEL` | `info` | Pino log level |
| `GOOGLE_GENERATIVE_AI_API_KEY` | — | Google Gemini (free tier; default quality + cheap roles) |
| `CEREBRAS_API_KEY` | — | Cerebras (free tier; default fast role) |
| `GROQ_API_KEY` | — | Groq (free tier; optional fast/backup) |
| `ANTHROPIC_API_KEY` | — | Claude (optional) |
| `OPENAI_API_KEY` | — | OpenAI (optional) |
| `XAI_API_KEY` | — | xAI Grok (optional) |
| `QUALITY_MODEL` | `google/gemini-3.5-flash` | `/plan` primary — best free structured output |
| `CHEAP_MODEL` | `google/gemini-3.1-flash-lite` | `/ask` + `/plan` quota-overflow fallback |
| `FAST_MODEL` | `cerebras/gpt-oss-120b` | Intended for `/chat` stream — lowest latency |
| `AGENT_MODEL` | `google/gemini-3-flash-preview` | Per-role fallback when a role var is unset |
| `CORS_ORIGIN` | `http://localhost:5173` | Frontend origin; `*` is rejected in production |
| `RATE_LIMIT_MAX` | `30` | Coach requests per IP per minute (`/health` is unlimited) |

## Endpoints

```
GET  /health                unlimited (platform health probes)
GET  /documentation         OpenAPI UI (Swagger)
GET  /documentation/json    OpenAPI spec (for client codegen)
POST /v1/coach/plan         assessment -> structured elite plan (safety pipeline)
POST /v1/coach/ask          one-shot question, optional profile context
POST /v1/coach/chat         streaming chat (UI message stream / SSE, useChat-ready)
```

### Examples

**Plan** — full assessment schema in `src/features/coach/coach.schemas.ts`:

```bash
curl -X POST localhost:3000/v1/coach/plan -H 'content-type: application/json' -d '{
  "age": 32, "sex": "male", "heightCm": 178, "weightKg": 82,
  "primaryGoal": "pure_strength", "experienceLevel": "intermediate",
  "trainingDaysPerWeek": 3, "equipment": ["barbell", "bodyweight"]
}'
```

**Ask** — optional `profile` is a partial assessment for context; response includes
`text`, tool-loop `steps`, and token `usage`. Prompts with brevity keywords
(`one sentence`, `brief`, `short`, etc.) get a tighter output cap (600 vs 1500 tokens).

```bash
curl -X 'POST' \
  'http://localhost:3000/v1/coach/ask' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '{
  "prompt": "What is a good warm-up before squats? One sentence. How should I warm up before heavy squats",
  "profile": {
    "age": 39,
    "sex": "male",
    "heightCm": 160,
    "weightKg": 60,
    "bodyFatPct": 11,
    "primaryGoal": "athletic_performance",
    "experienceLevel": "intermediate",
    "trainingDaysPerWeek": 3,
    "equipment": [
      "barbell","dumbbell","cables","kettlebell","bodyweight"
    ],
    "limitationsOrInjuries": [],
    "currentDietStyle": "healthy food mostly"
  }
}'


response:
{
  "text": "A effective squat warm-up ...",
  "steps": 2,
  "usage": {
    "inputTokens": 3659,
    "outputTokens": 1704
  }
}
```



**Chat** — SSE stream compatible with AI SDK `useChat` (`DefaultChatTransport` → `/v1/coach/chat`).

The request body is an array of AI SDK **`UIMessage`** objects (`{ id, role, parts: [{ type, text }] }`),
*not* a flat `{ role, content }` shape:

```bash
curl -N -X POST localhost:3000/v1/coach/chat -H 'content-type: application/json' -d '{
  "messages": [{ "id": "1", "role": "user", "parts": [{ "type": "text", "text": "Hi, what the top 5 barbell squats? ,rank by emg/activation/efficiency" }] }]
}'
```

**System prompt & context** — `/chat` already uses the full coach system prompt (`COACH_SYSTEM_PROMPT` in
`coach.agent.ts`). There is no separate `profile` field like `/ask`; context is **multi-turn** via the
`messages` array (send prior user/assistant turns on each request). With little or no context, the coach
will ask clarifying questions before prescribing — that is intentional. For a one-shot concise answer with
optional profile, use `/ask` instead.

**Verbosity** — `/chat` is conversational and thorough by default. `/ask` adds brevity rules and a token cap.
If you want shorter `/chat` replies, say so in the message (e.g. "one sentence") or add chat-specific
instructions in `coach.prompt.ts`.

The response is a **UI message stream** (`Content-Type: text/event-stream`), not JSON. Consume it
with the AI SDK (`useChat` / `DefaultChatTransport`) or `curl -N` — Swagger's "Try it out" can send the
request but cannot render the streamed `text/event-stream` body, so use it only for the JSON endpoints
(`/plan`, `/ask`).

**SSE event sequence** (AI SDK UI message stream protocol):

```
start → start-step → reasoning-start / reasoning-delta / reasoning-end (if the model emits reasoning)
  → text-start → text-delta … → text-end → finish-step → finish → [DONE]
```

- `text-delta` chunks are the visible answer; `reasoning-delta` is internal chain-of-thought (some models only).
- `finish` includes `finishReason` (e.g. `"stop"` = completed normally).
- Tool calls appear as additional event types (`tool-input-start`, `tool-output-available`, etc.) when the agent uses tools.

Set `CORS_ORIGIN` to your Vite dev server (e.g. `http://localhost:5173`) so the
browser can reach `/v1/coach/chat`.

**Frontend:**

```typescript
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

const { messages, sendMessage } = useChat({
  transport: new DefaultChatTransport({
    api: 'http://localhost:3000/v1/coach/chat',
  }),
});
```

## Structure

```
src/
├── server.ts                       entrypoint: env -> deps -> listen -> graceful shutdown
├── app.ts                          composition root: buildApp(deps), pure, no I/O
├── config/env.ts                   zod-validated env (forbids CORS '*' in prod)
├── lib/
│   ├── ai/
│   │   ├── models.ts               only place a concrete provider is built
│   │   └── provider-spec.ts        "<provider>/<modelId>" parsing + key mapping
│   └── http/abort-on-client-disconnect.ts
└── features/
    ├── health/health.routes.ts
    └── coach/
        ├── coach.prompt.ts         elite persona + per-request safety-flag injection
        ├── coach.agent.ts          chat agent + structured-plan agent factory
        ├── coach.schemas.ts        assessment + rich CoachOutput contract
        ├── coach.routes.ts         safety pipeline + ask + chat
        ├── domain/                 PURE deterministic logic, AI-free, unit-tested
        │   ├── nutrition.ts        Mifflin-St Jeor, TDEE, protein range, LBM, BMI
        │   ├── training-load.ts    Epley 1RM + working loads
        │   ├── safety-flags.ts     pre-model rule checks
        │   └── validate-coach-plan.ts  post-model domain validation
        └── tools/                  AI SDK wrappers around domain logic / I/O
            ├── exercise-library.tool.ts    injected I/O (in-memory -> DB later)
            ├── estimate-training-load.tool.ts
            ├── estimate-nutrition.tool.ts
            └── index.ts
```

## Agent vs chatbot

| Simple chatbot | This agent |
| --- | --- |
| user prompt → LLM → text | validated assessment → safety flags → tools/math → `ToolLoopAgent` → `Output.object` → domain validation → repair or refuse |

Properties: goal-directed plans, tool use (nutrition, load, exercise library),
structured output, deterministic guardrails, post-validation with one repair pass,
Fastify API with streaming and client-disconnect abort.

## The plan safety pipeline (the important part)

`POST /v1/coach/plan` does NOT trust the model alone:

```
assessment
  -> detectSafetyFlags()              deterministic pre-check (injuries, overreach)
  -> ToolLoopAgent + Output.object    flags injected into instructions; tools compute numbers
  -> validateCoachPlanDomain()        day count, calorie floor, protein g/kg, macro energy,
                                       TDEE plausibility, injury->safetyNotes, gymnastics goal
  -> one repair attempt               failed checks fed back to the agent
  -> 502 + issues                     if still invalid: refuse, don't ship a bad plan
```

```
[User Assessment Payload]
       │
       ▼
 1. FASTIFY LAYER ────────────────► Auto-validates shape via userAssessmentSchema
       │
       ▼
 2. PRE-CHECK LAYER ──────────────► detectSafetyFlags(assessment) -> e.g. HAS_INJURIES
       │
       ▼
 3. AGENT FACTORY ────────────────► buildPlanInstructions(flags)
       │                            COACH_SYSTEM_PROMPT + PLAN_TASK + flags
       │
       ▼
 4. REQUEST PROMPT ───────────────► assessmentPrompt(assessment)
       │
       ▼
 5. AGENT TOOL-LOOP ──────────────► Up to 12 steps; exercise library + math tools
       │
       ▼
 6. POST-VALIDATION ──────────────► validateCoachPlanDomain(plan)
       │                            If errors -> one repair attempt via prompt injection
       ▼
 7. REFUSE OR SHIP ───────────────► 502 + issues if still invalid; else 200 + plan
```

`Output.object` only guarantees the plan is *schema*-valid. The domain layer
makes it *domain*-valid. Both the pre-check and post-check are plain functions
with their own unit tests (zero AI involvement). Schema-valid but empty model
output returns `502` via `NoOutputGeneratedError`.

## domain/ vs tools/

The key separation: `domain/` holds pure business logic (the math, the rules);
`tools/` holds thin AI SDK wrappers around it. Business logic is never trapped
inside an agent tool — routes and validators call the same functions directly,
and the math is tested without a model.

Agent tools: `searchExerciseLibrary`, `estimateTrainingLoad`, `estimateNutrition`.

## Agents

Both agents use AI SDK [`ToolLoopAgent`](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent).

- **ask agent** (`/ask`): concise-by-default instructions; per-request `maxOutputTokens` (1500 default, 600 when the prompt asks for brevity).
- **chat agent** (`/chat`): static instructions, built once, reused; up to 10 tool-loop steps.
- **plan agent** (`/plan`): built per-request because deterministic safety flags
  are injected into its instructions; `Output.object` schema + up to 12 steps.
  Both share the same toolset.

## Design rules (carried through the whole project)

Explicit composition (no autoload, no decorators-as-DI, no container); vertical
slices; zod end-to-end (env, request, response, model output); provider-neutral
`LanguageModel` with one swap point in `lib/ai/models.ts`; client-disconnect
`AbortSignal` propagated through the agent loop into tool I/O; tests inject
`MockLanguageModelV3` into the real `buildApp` and use `app.inject`.

Hardening: `@fastify/helmet`; CORS locked to a concrete origin in production
(env rejects `*`); rate limiting scoped to `/v1/coach` only, so `/health` is
never throttled; `trustProxy` enabled in production for correct client IPs behind
Render/similar proxies.

Auth/API-key protection on coach endpoints is not implemented yet — add before
public deployment.

## Why Node.js / TypeScript (not C# / Python)

The agent stack is TypeScript-first. [Vercel AI SDK](https://ai-sdk.dev),
OpenAI's Node SDK, Anthropic, and tooling from Cursor and the broader agent
ecosystem ship their best-supported, most up-to-date APIs for TypeScript — typed
`ToolLoopAgent`, `Output.object`, streaming UI protocols, and provider adapters
land here first.

C# (ASP.NET) and Python (FastAPI, LangChain) are fine for production APIs, but
for this project the friction is higher: fewer first-class agent primitives, more
glue between HTTP and the model loop, and a weaker path to the same Zod-typed
contracts end-to-end. Node 22 + strict TypeScript keeps the backend on the same
language and type system as a React/Vite frontend and matches how modern agent
APIs are documented and evolved.

## Why Fastify (not NestJS)

This repo is a native [Fastify](https://fastify.dev) project, not a NestJS app on
the Fastify adapter. Nest with Fastify is valid — Nest documents
[`FastifyAdapter`](https://docs.nestjs.com/techniques/performance) as an
alternative HTTP provider, and Nest's own benchmarks show Fastify ahead of Express
— but for an AI agent API the extra framework layer buys little and costs control.

**This project is shaped for agent work**, not general REST scaffolding:

```
request
  → Fastify route
  → Zod schema
  → safety / domain pre-check
  → ToolLoopAgent
  → deterministic tools
  → Output.object schema validation
  → domain validation
  → one repair attempt
  → response
```

That pipeline — streaming, tool loops, structured output, deterministic validation,
repair flow, safety flags, explicit dependency injection, and testable tools — is
the hard part of an agent backend. A typical Nest starter (demo routes, worker
threads, generic logging) does not solve it: no AI SDK integration, no agent tools,
no stream protocol, no safety pipeline, no repair loop, no domain validation.

Native Fastify gives the useful parts directly:

| Need | Fastify (this repo) |
| --- | --- |
| Validation / serialization | Schema-first hooks; fits `fastify-type-provider-zod` + Zod end-to-end |
| Streaming | First-class route handlers; SSE for `/v1/coach/chat` without adapter friction |
| Composition | Plugins + explicit `buildApp(deps)` — no decorator/container magic |
| Testing | `app.inject()` against the real app with `MockLanguageModelV3` injected |
| AI SDK v6 | `ToolLoopAgent`, `Output.object`, tool `inputSchema`, `stopWhen` wired straight into routes |

Compared to a Nest+Fastify starter zip, this repo also keeps production posture
tighter: CORS locked to a concrete origin in production (env rejects `*`), rate
limiting scoped to expensive coach routes, and e2e tests that exercise the actual
Fastify instance — not `createNestApplication()` without the Fastify adapter.

**When Nest would make sense:** decorator-heavy architecture, large enterprise
module trees, guards/interceptors/pipes everywhere, GraphQL or microservice patterns
through Nest, or a team already standardized on Nest conventions.

**For this fitness coach agent API, native Fastify is cleaner:** less framework
magic, better streaming control, simpler dependency injection, easier AI SDK
integration, faster route/test feedback, and fewer layers between the agent loop
and HTTP.

## Provider / model

`lib/ai/models.ts` is a multi-provider role factory. A model is named by a
`"<provider>/<modelId>"` spec (parsed in `provider-spec.ts`), so switching
provider or model is an env change, never a code change. Providers wired:
`google`, `cerebras`, `groq`, `xai`, `anthropic`, `openai`. Everything
downstream depends only on the provider-neutral `LanguageModel` type.

Reasoning models (Gemini 3, gpt-oss, Claude 4.x, o-series, etc.) omit
`temperature` and receive provider-specific `providerOptions` (thinking/reasoning
effort) via `isReasoningModel()`. Effort is **role-based**, not global:

| Role | Reasoning | Used by |
| --- | --- | --- |
| `quality` | high | `/plan` (tool loop + structured output) |
| `cheap` | medium (+ thought traces) | `/ask`, `/plan` overflow |
| `fast` | minimal | `/chat` (intended — see note below) |

Thought summaries (`includeThoughts` on Gemini, `reasoningSummary` on OpenAI)
are enabled only for **medium** and **high** effort — off for **low** and
**minimal** so `/ask` and `/chat` stay lean.

Three roles drive per-endpoint routing — all default to a **free-tier** stack
(Google Gemini + Cerebras, no credit card):

| Role | Default | Used by |
| --- | --- | --- |
| `QUALITY_MODEL` | `google/gemini-3.5-flash` | `/plan` (quality-first) |
| `CHEAP_MODEL` | `google/gemini-3.1-flash-lite` | `/ask` + `/plan` overflow |
| `FAST_MODEL` | `cerebras/gpt-oss-120b` | `/chat` (intended — see note below) |

`env.ts` validates **only** the API keys for providers actually referenced by
the configured roles, with an error naming the missing key and the role that
needs it. Each role falls back to `AGENT_MODEL` when its own var is unset.

`/plan` is quality-first with real overflow: it runs the quality model with
`maxRetries: 0`, and on quota or transient provider errors (`429`, `502`,
`503`, `504`) it overflows to the cheap model (`isOverflowEligibleError`
unwraps the SDK's `RetryError`) rather than failing the user. Domain-validation
repair still re-prompts the same model, then `502`s if the plan stays invalid.

**Note:** `app.ts` currently wires `/chat` to `models.cheap` (same as `/ask`).
Swap to `models.fast` in `buildApp` when you want Cerebras low-latency streaming.

## Deploy

[`render.yaml`](render.yaml) is a Render Blueprint: `npm ci && npm run build`,
`npm start`, health check on `/health`, production env vars for model roles.
Set `GOOGLE_GENERATIVE_AI_API_KEY`, `CEREBRAS_API_KEY`, and `CORS_ORIGIN` as
secrets in the Render dashboard.

## Next (kept behind interfaces, not built yet)

| Area | Approach |
| --- | --- |
| **RAG / citations** | `KnowledgeBase` interface as another tool (like `ExerciseLibrary`); swap in-memory stub for pgvector/Qdrant without touching routes |
| **Memory** | Persistent user/session memory per [AI SDK memory](https://ai-sdk.dev/docs/agents/memory) patterns |
| **Profiles** | Optional Neon/Postgres for long-lived user assessments and history |
| **Auth** | API-key or JWT gate on `/v1/coach/*` before public exposure |

## References

- [AI SDK agents overview](https://ai-sdk.dev/docs/agents/overview)
- [Building agents](https://ai-sdk.dev/docs/agents/building-agents)
- [`ToolLoopAgent`](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent)
- [Loop control](https://ai-sdk.dev/docs/agents/loop-control)
- [Memory](https://ai-sdk.dev/docs/agents/memory)
- [Workflows](https://ai-sdk.dev/docs/agents/workflows)
- [Google Generative AI Provider - @ai-sdk/google](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai)




## Gemini Flash - Call Example for testing key (call happens inside vercel sdk):
https://ai.google.dev/gemini-api/docs/api-key

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent" \
  -H 'Content-Type: application/json' \
  -H 'X-goog-api-key: YOUR_API_KEY_HERE' \
  -X POST \
  -d '{
    "contents": [
      {
        "parts": [
          {
            "text": "Explain how AI works in a few words"
          }
        ]
      }
    ]
  }'
```

use curl.exe (not the curl alias) and put JSON bodies in a file with -d "@file.json" to avoid quoting pain.
```powershell
\$key = "YOUR_API_KEY_HERE"

\$body = '{
  "contents": [
    {
      "parts": [
        {
          "text": "Explain how AI works in a few words"
        }
      ]
    }
  ]
}'

try { 
    \$r = Invoke-RestMethod `
        -Uri "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent" `
        -Method POST `
        -Headers @{ "x-goog-api-key" = \$key } `
        -ContentType "application/json" `
        -Body \$body
        
    Write-Host "SUCCESS:"
    \$r | ConvertTo-Json -Depth 8 
} catch { 
    Write-Host "HTTP STATUS:" \$_.Exception.Response.StatusCode.value__
    \(reader = [System.IO.StreamReader]::new(\)_.Exception.Response.GetResponseStream())
    Write-Host "BODY:"
    \$reader.ReadToEnd() 
}
```

```powershell
curl.exe -s "https://generativelanguage.googleapis.com/v1beta/models" -H "x-goog-api-key: YOUR_API_KEY_HERE"

curl.exe -s `
  -w "`nHTTP_STATUS:%{http_code}`n" `
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent" `
  -H "Content-Type: application/json" `
  -H "x-goog-api-key: YOUR_API_KEY_HERE" `
  -X POST `
  -d "@.tmp-gemini-test.json"
```
