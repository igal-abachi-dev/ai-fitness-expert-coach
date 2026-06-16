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
`@fastify/rate-limit@11`, `@fastify/swagger@9`, Node 22. Typecheck + 19 tests
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
| `QUALITY_MODEL` | `google/gemini-3-flash-preview` | `/plan` primary — best free structured output |
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
`text`, tool-loop `steps`, and token `usage`:

```bash
curl -X POST localhost:3000/v1/coach/ask -H 'content-type: application/json' -d '{
  "prompt": "How should I warm up before heavy squats?",
  "profile": { "experienceLevel": "intermediate", "limitationsOrInjuries": ["knee pain"] }
}'
```

**Chat** — SSE stream compatible with AI SDK `useChat` (`DefaultChatTransport` → `/v1/coach/chat`):

```bash
curl -N -X POST localhost:3000/v1/coach/chat -H 'content-type: application/json' -d '{
  "messages": [{ "id": "1", "role": "user", "parts": [{ "type": "text", "text": "What is RPE?" }] }]
}'
```

Set `CORS_ORIGIN` to your Vite dev server (e.g. `http://localhost:5173`) so the
browser can reach `/v1/coach/chat`.

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

- **chat agent** (`/ask`, `/chat`): static instructions, built once, reused; up to 10 tool-loop steps.
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

## Provider / model

`lib/ai/models.ts` is a multi-provider role factory. A model is named by a
`"<provider>/<modelId>"` spec (parsed in `provider-spec.ts`), so switching
provider or model is an env change, never a code change. Providers wired:
`google`, `cerebras`, `groq`, `xai`, `anthropic`, `openai`. Everything
downstream depends only on the provider-neutral `LanguageModel` type.

Reasoning models (Gemini 3, gpt-oss, Claude 4.x, o-series, etc.) omit
`temperature` and receive provider-specific `providerOptions` (thinking/reasoning
effort) via `isReasoningModel()`.

Three roles drive per-endpoint routing — all default to a **free-tier** stack
(Google Gemini + Cerebras, no credit card):

| Role | Default | Used by |
| --- | --- | --- |
| `QUALITY_MODEL` | `google/gemini-3-flash-preview` | `/plan` (quality-first) |
| `CHEAP_MODEL` | `google/gemini-3.1-flash-lite` | `/ask` + `/plan` overflow |
| `FAST_MODEL` | `cerebras/gpt-oss-120b` | `/chat` (intended — see note below) |

`env.ts` validates **only** the API keys for providers actually referenced by
the configured roles, with an error naming the missing key and the role that
needs it. Each role falls back to `AGENT_MODEL` when its own var is unset.

`/plan` is quality-first with real overflow: it runs the quality model with
`maxRetries: 0`, and on a free-tier `429` it overflows to the cheap model
(`isRateLimitError` unwraps the SDK's `RetryError`) rather than failing the
user. Domain-validation repair still re-prompts the same model, then `502`s if
the plan stays invalid.

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
