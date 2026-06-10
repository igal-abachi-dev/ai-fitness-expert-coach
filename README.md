# ai-fitness-expert-coach

Elite fitness-coach agent API. Fastify 5 + TypeScript (strict) + [Vercel AI SDK 6](https://ai-sdk.dev) (OpenAI / Gemini / Claude / Grok).

Verified against: `ai@6.0.x`, `fastify@5.8.x`, `zod@4.x`,
`fastify-type-provider-zod@6.x`, `@fastify/helmet@13`, `@fastify/cors@11`,
`@fastify/rate-limit@11`, Node 22. Typecheck + 18 tests pass; build smoke-tested.

## Quick start

```bash
cp .env.example .env   # fill in API keys; set CORS_ORIGIN to your frontend origin
npm install
npm run dev
```

Server listens on `http://localhost:3000` by default.

`npm test` · `npm run typecheck` · `npm run build && npm start`

### Environment

All keys below are validated at startup (see `src/config/env.ts`). Placeholder
values in `.env.example` are enough for local boot; real keys are required before
calling the coach endpoints.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `3000` | Listen port |
| `LOG_LEVEL` | `info` | Pino log level |
| `ANTHROPIC_API_KEY` | — | Claude (active provider) |
| `OPENAI_API_KEY` | — | Required by env schema; used when multi-provider routing is enabled |
| `GOOGLE_GENERATIVE_AI_API_KEY` | — | Required by env schema; used when multi-provider routing is enabled |
| `XAI_API_KEY` | — | Required by env schema; used when multi-provider routing is enabled |
| `AGENT_MODEL` | `claude-opus-4-8` | Model id passed to the active provider |
| `CORS_ORIGIN` | `http://localhost:5173` | Frontend origin; `*` is rejected in production |
| `RATE_LIMIT_MAX` | `30` | Coach requests per IP per minute (`/health` is unlimited) |

## Endpoints

```
GET  /health                unlimited (platform health probes)
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

**Ask** — optional `profile` is a partial assessment for context:

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
├── server.ts                       entrypoint: env -> deps -> listen -> shutdown
├── app.ts                          composition root: buildApp(deps), pure, no I/O
├── config/env.ts                   zod-validated env (forbids CORS '*' in prod)
├── lib/
│   ├── ai/models.ts                only place a concrete provider is built
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
  
 --- 

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
 5. AGENT TOOL-LOOP ──────────────► Up to 10 turns; exercise library + math tools
       │
       ▼
 6. POST-VALIDATION ──────────────► validateCoachPlanDomain(plan)
       │                            If errors -> one repair attempt via prompt injection
       ▼
 7. REFUSE OR SHIP ───────────────► 502 + issues if still invalid; else 200 + plan
```

`Output.object` only guarantees the plan is *schema*-valid. The domain layer
makes it *domain*-valid. Both the pre-check and post-check are plain functions
with their own unit tests (zero AI involvement).

## domain/ vs tools/

The key separation: `domain/` holds pure business logic (the math, the rules);
`tools/` holds thin AI SDK wrappers around it. Business logic is never trapped
inside an agent tool — routes and validators call the same functions directly,
and the math is tested without a model.

## Agents

- **chat agent** (`/ask`, `/chat`): static instructions, built once, reused.
- **plan agent** (`/plan`): built per-request because deterministic safety flags
  are injected into its instructions. Both share the same toolset.

## Design rules (carried through the whole project)

Explicit composition (no autoload, no decorators-as-DI, no container); vertical
slices; zod end-to-end (env, request, response, model output); provider-neutral
`LanguageModel` with one swap point in `lib/ai/models.ts`; client-disconnect
`AbortSignal` propagated through the agent loop into tool I/O; tests inject
`MockLanguageModelV3` into the real `buildApp` and use `app.inject`.

Hardening: `@fastify/helmet`; CORS locked to a concrete origin in production
(env rejects `*`); rate limiting scoped to `/v1/coach` only, so `/health` is
never throttled.

## Provider / model

Active code in `lib/ai/models.ts` uses Anthropic only — `AGENT_MODEL` is the
Claude model id (e.g. `claude-opus-4-8`). Everything else depends on the
provider-neutral `LanguageModel` type.

All four provider SDK packages are installed. Commented code in `models.ts` shows
how to route by prefix (`google/…`, `openai/…`, `xai/…`, `anthropic/…`) using
the matching env API key — uncomment that block to switch providers via
`AGENT_MODEL` without touching routes or agents.

## Next (kept behind interfaces, not built yet)

RAG over your training literature (PDF knowledge base) belongs behind a
`KnowledgeBase` interface as another tool, exactly like `ExerciseLibrary` —
swap the in-memory stub for pgvector/Qdrant without touching routes.
