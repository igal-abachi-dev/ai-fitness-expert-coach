import {
  convertToModelMessages,
  JsonToSseTransformStream,
  NoOutputGeneratedError,
  UI_MESSAGE_STREAM_HEADERS,
  validateUIMessages,
  type LanguageModel,
} from 'ai';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { abortOnClientDisconnect } from '../../lib/http/abort-on-client-disconnect.js';
import { createCoachPlanAgent, type CoachChatAgent } from './coach.agent.js';
import {
  askRequestSchema,
  askResponseSchema,
  chatRequestSchema,
  coachOutputSchema,
  userAssessmentSchema,
  type CoachOutput,
  type UserAssessment,
} from './coach.schemas.js';
import { detectSafetyFlags } from './domain/safety-flags.js';
import { validateCoachPlanDomain } from './domain/validate-coach-plan.js';
import type { ToolDeps } from './tools/index.js';

export interface CoachRoutesDeps extends ToolDeps {
  model: LanguageModel;
  chatAgent: CoachChatAgent;
}

function assessmentPrompt(a: UserAssessment, repairIssues?: string[]): string {
  const base = `User assessment:\n${JSON.stringify(a, null, 2)}`;
  if (!repairIssues?.length) return base;
  return `${base}\n\nYour previous plan failed these domain checks. Fix every one and regenerate the full plan:\n${repairIssues.map((i) => `- ${i}`).join('\n')}`;
}

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
            200: coachOutputSchema,
            502: z.object({ error: z.string(), issues: z.array(z.string()) }),
          },
        },
      },
      async (request, reply) => {
        const assessment = request.body;
        const signal = abortOnClientDisconnect(reply);

        // 1. Deterministic pre-check; flags are injected into instructions.
        const flags = detectSafetyFlags(assessment);
        const planAgent = createCoachPlanAgent(
          { model: deps.model, exerciseLibrary: deps.exerciseLibrary },
          flags,
        );

        const generate = async (repairIssues?: string[]): Promise<CoachOutput> => {
          const result = await planAgent.generate({
            prompt: assessmentPrompt(assessment, repairIssues),
            abortSignal: signal,
          });
          return result.output;
        };

        try {
          // 2. First pass.
          let plan = await generate();
          let issues = validateCoachPlanDomain(plan, assessment);

          // 3. One repair attempt if domain-invalid.
          if (issues.length > 0) {
            request.log.warn({ issues }, 'plan failed domain checks, repairing');
            plan = await generate(issues);
            issues = validateCoachPlanDomain(plan, assessment);
          }

          // 4. Still invalid -> refuse rather than ship a bad plan.
          if (issues.length > 0) {
            request.log.error({ issues }, 'plan still invalid after repair');
            return reply
              .code(502)
              .send({ error: 'Could not produce a valid plan.', issues });
          }

          return plan;
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

        const result = await deps.chatAgent.generate({
          prompt: fullPrompt,
          abortSignal: abortOnClientDisconnect(reply),
        });

        return {
          text: result.text,
          steps: result.steps.length,
          usage: {
            inputTokens: result.totalUsage.inputTokens ?? null,
            outputTokens: result.totalUsage.outputTokens ?? null,
          },
        };
      },//;
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
