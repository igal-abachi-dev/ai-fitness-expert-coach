# ai-fitness-expert-coach
ai-fitness-expert-coach agent , using Vercel AI SDK v6 for (OpenAI/Gemini/Claude)

Elite fitness-coach agent API. Fastify 5 + TypeScript (strict) + AI SDK 6.

https://ai-sdk.dev


Verified against: `ai@6.0.x`, `fastify@5.8.x`, `zod@4.x`,
`fastify-type-provider-zod@6.x`, `@fastify/helmet@13`, `@fastify/cors@11`,
`@fastify/rate-limit@10`, Node 22. Typecheck + 18 tests pass; build smoke-tested.

## Quick start

```bash
cp .env.example .env   # set ANTHROPIC_API_KEY; CORS_ORIGIN to your Vite origin
npm install
npm run dev
```

`npm test` · `npm run typecheck` · `npm run build && npm start`

## Endpoints

```
GET  /health                unlimited (platform health probes)
POST /v1/coach/plan         assessment -> structured elite plan (safety pipeline)
POST /v1/coach/ask          one-shot question, optional profile context
POST /v1/coach/chat         streaming chat (UI message stream / SSE, useChat-ready)
```

```bash
curl -X POST localhost:3000/v1/coach/plan -H 'content-type: application/json' -d '{
  "age": 32, "sex": "male", "heightCm": 178, "weightKg": 82,
  "primaryGoal": "pure_strength", "experienceLevel": "intermediate",
  "trainingDaysPerWeek": 3, "equipment": ["barbell", "bodyweight"]
}'
```

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
 1. FASTIFY LAYER ────────────────► Auto-validates shape via 'userAssessmentSchema'
       │
       ▼
 2. PRE-CHECK LAYER ──────────────► 'detectSafetyFlags(assessment)' -> yields ['HAS_INJURIES']
       │
       ▼
 3. AGENT FACTORY ────────────────► 'buildPlanInstructions(flags)'
       │                            Compiles: COACH_SYSTEM_PROMPT + PLAN_TASK + Flags
       │                            Set as Agent's "Instructions" (System Prompt)
       │
       ▼
 4. REQUEST PROMPT ───────────────► 'assessmentPrompt(assessment)'
       │                            Feeds raw, clean JSON data into Agent's execution pass
       │
       ▼
 5. THE AGENT TOOL-LOOP ──────────► Runs up to 10 turns calling your exercise libraries & math tools
       │
       ▼
 6. POST-VALIDATION LOOP ─────────► 'validateCoachPlanDomain(plan)' 
                                    Checks for business-logic violations
                                    If errors found -> Triggers 1 Repair Attempt via prompt injection
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

## Provider note

Defaults to Anthropic (`createAnthropic`, `claude-sonnet-4-5`). To use OpenAI
instead, `npm i @ai-sdk/openai` and change the two lines in `lib/ai/models.ts`
— nothing else depends on the concrete provider.

## Next (kept behind interfaces, not built yet)

RAG over your training literature (PDF knowledge base) belongs behind a
`KnowledgeBase` interface as another tool, exactly like `ExerciseLibrary` —
swap the in-memory stub for pgvector/Qdrant without touching routes.
