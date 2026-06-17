import {
  convertToModelMessages,
  JsonToSseTransformStream,
  NoOutputGeneratedError,
  UI_MESSAGE_STREAM_HEADERS,
  validateUIMessages,
} from 'ai';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { isRateLimitError, type RoleModels } from '../../lib/ai/models.js';
import { abortOnClientDisconnect } from '../../lib/http/abort-on-client-disconnect.js';
import { maxOutputTokensForAsk } from './ask-length.js';
import {
  agentDepsFromBundle,
  createCoachPlanAgent,
  type CoachAskAgent,
  type CoachChatAgent,
} from './coach.agent.js';
import {
  askRequestSchema,
  askResponseSchema,
  chatRequestSchema,
  planResponseSchema,
  userAssessmentSchema,
  type CoachOutput,
  type UserAssessment,
} from './coach.schemas.js';
import { detectSafetyFlags } from './domain/safety-flags.js';
import { validateCoachPlanDomain } from './domain/validate-coach-plan.js';
import type { ToolDeps } from './tools/index.js';

export interface CoachRoutesDeps extends ToolDeps {
  /** quality (/plan primary) + cheap (/plan overflow) role models. */
  models: RoleModels;
  /** Streaming /chat agent (fast role). */
  chatAgent: CoachChatAgent;
  /** One-shot /ask agent (cheap role). */
  askAgent: CoachAskAgent;
}

function assessmentPrompt(a: UserAssessment, repairIssues?: string[]): string {
  const base = `User assessment:\n${JSON.stringify(a, null, 2)}`;
  if (!repairIssues?.length) return base;
  return `${base}\n\nYour previous plan failed these domain checks. Fix every one and regenerate the full plan:\n${repairIssues.map((i) => `- ${i}`).join('\n')}`;
}

interface AgentGenerateResult {
  reasoningText: string | undefined;
  totalUsage: {
    outputTokenDetails?: { reasoningTokens?: number | undefined } | undefined;
  };
}

/** Omits reasoning fields when the provider did not return them. */
function pickOptionalReasoning(meta: {
  reasoningText?: string | undefined;
  reasoningTokens?: number | undefined;
}): { reasoningText?: string; reasoningTokens?: number } {
  const fields: { reasoningText?: string; reasoningTokens?: number } = {};
  if (meta.reasoningText) {
    fields.reasoningText = meta.reasoningText;
  }
  if (meta.reasoningTokens != null) {
    fields.reasoningTokens = meta.reasoningTokens;
  }
  return fields;
}

function optionalReasoningFields(result: AgentGenerateResult): {
  reasoningText?: string;
  reasoningTokens?: number;
} {
  return pickOptionalReasoning({
    reasoningText: result.reasoningText,
    reasoningTokens: result.totalUsage.outputTokenDetails?.reasoningTokens,
  });
}
//Add auth/API-key protection before making expensive agent endpoints public.
export function coachRoutes(deps: CoachRoutesDeps): FastifyPluginAsyncZod {
  return async (app) => {
    /**
     * Structured plan generation with a deterministic safety envelope:
     *   pre-checks (safety flags) -> agent loop + Output.object
     *   -> domain validation -> one repair attempt -> 502 on persistent failure.
     */
    app.post(
      '/plan',
      {
        schema: {
          body: userAssessmentSchema,
          response: {
            200: planResponseSchema,
            502: z.object({ error: z.string(), issues: z.array(z.string()) }),
          },
        },
      },
      async (request, reply) => {
        const assessment = request.body;
        const signal = abortOnClientDisconnect(reply);
        const tools = { exerciseLibrary: deps.exerciseLibrary };

        // 1. Deterministic pre-check; flags are injected into instructions.
        const flags = detectSafetyFlags(assessment);
        const qualityAgent = createCoachPlanAgent(
          agentDepsFromBundle(deps.models.quality, tools),
          flags,
        );

        interface PlanGenerateResult {
          output: CoachOutput;
          reasoningText?: string;
          reasoningTokens?: number;
        }

        const generateWith = async (
          agent: ReturnType<typeof createCoachPlanAgent>,
          repairIssues?: string[],
        ): Promise<PlanGenerateResult> => {
          const result = await agent.generate({
            prompt: assessmentPrompt(assessment, repairIssues),
            abortSignal: signal,
          });
          return {
            output: result.output,
            ...optionalReasoningFields(result),
          };
        };

        // Quality-first: run the best free model; on a free-tier 429 overflow
        // to the cheap model (built lazily) instead of failing the user.
        let cheapAgent: ReturnType<typeof createCoachPlanAgent> | undefined;
        const generate = async (
          repairIssues?: string[],
        ): Promise<PlanGenerateResult> => {
          try {
            return await generateWith(qualityAgent, repairIssues);
          } catch (error) {
            if (!isRateLimitError(error)) throw error;
            request.log.warn('quality model rate-limited, overflowing to cheap');
            cheapAgent ??= createCoachPlanAgent(
              agentDepsFromBundle(deps.models.cheap, tools),
              flags,
            );
            return generateWith(cheapAgent, repairIssues);
          }
        };

        try {
          // 2. First pass.
          let planResult = await generate();
          let plan = planResult.output;
          let issues = validateCoachPlanDomain(plan, assessment);

          // 3. One repair attempt if domain-invalid.
          if (issues.length > 0) {
            request.log.warn({ issues }, 'plan failed domain checks, repairing');
            planResult = await generate(issues);
            plan = planResult.output;
            issues = validateCoachPlanDomain(plan, assessment);
          }

          // 4. Still invalid -> refuse rather than ship a bad plan.
          if (issues.length > 0) {
            request.log.error({ issues }, 'plan still invalid after repair');
            return reply
              .code(502)
              .send({ error: 'Could not produce a valid plan.', issues });
          }

          return { ...planResult.output, ...pickOptionalReasoning(planResult) };
        } catch (error) {
          if (NoOutputGeneratedError.isInstance(error)) {
            request.log.warn({ err: error }, 'model produced no schema-valid output');
            return reply
              .code(502)
              .send({ error: 'Plan generation failed, please retry.', issues: [] });
          }
          throw error;
        }
      },
    );

    /** One-shot coaching question, optionally with profile context. */
    app.post(
      '/ask',
      { schema: { body: askRequestSchema, response: { 200: askResponseSchema } } },
      async (request, reply) => {
        const { prompt, profile } = request.body;
        const fullPrompt = profile
          ? `User profile: ${JSON.stringify(profile)}\n\n${prompt}`
          : prompt;

        const result = await deps.askAgent.generate({
          prompt: fullPrompt,
          options: { maxOutputTokens: maxOutputTokensForAsk(prompt) },
          abortSignal: abortOnClientDisconnect(reply),
        });

        const reasoning = optionalReasoningFields(result);

        return {
          text: result.text,
          steps: result.steps.length,
          ...(reasoning.reasoningText ? { reasoningText: reasoning.reasoningText } : {}),
          usage: {
            inputTokens: result.totalUsage.inputTokens ?? null,
            outputTokens: result.totalUsage.outputTokens ?? null,
            ...(reasoning.reasoningTokens != null
              ? { reasoningTokens: reasoning.reasoningTokens }
              : {}),
          },
        };
      },
    );

    /** Streaming coaching chat - UI message stream (SSE), useChat-compatible. */
    app.post(
      '/chat',
      { schema: { body: chatRequestSchema } },
      async (request, reply) => {
        const uiMessages = await validateUIMessages({
          messages: request.body.messages,
        });

        const stream = await deps.chatAgent.stream({
          messages: await convertToModelMessages(uiMessages),
          abortSignal: abortOnClientDisconnect(reply),
        });

        reply.headers(UI_MESSAGE_STREAM_HEADERS);
        return reply.send(
          stream.toUIMessageStream().pipeThrough(new JsonToSseTransformStream()),
        );
      },
    );
  };
}
