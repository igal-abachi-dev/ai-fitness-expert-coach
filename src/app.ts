import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyError } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { LanguageModel } from 'ai';
import type { Env } from './config/env.js';
import { createCoachChatAgent } from './features/coach/coach.agent.js';
import { coachRoutes } from './features/coach/coach.routes.js';
import type { ExerciseLibrary } from './features/coach/tools/exercise-library.tool.js';
import { healthRoutes } from './features/health/health.routes.js';

export interface AppDeps {
  env: Env;
  model: LanguageModel;
  exerciseLibrary: ExerciseLibrary;
}

/**
 * Composition root. Pure function of its dependencies: builds and wires the
 * app but never reads process.env, never listens, never touches the network.
 * Tests inject a MockLanguageModelV3; server.ts injects the real provider.
 */
export function buildApp({ env, model, exerciseLibrary }: AppDeps) {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === 'development' && {
        transport: { target: 'pino-pretty', options: { singleLine: true } },
      }),
    },
    requestIdHeader: 'x-request-id',
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(helmet);

  app.register(cors, {
    // In production CORS_ORIGIN is a concrete origin (env forbids '*');
    // in dev we reflect the request origin for convenience.
    origin: env.NODE_ENV === 'production' ? env.CORS_ORIGIN : true,
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.code(400).send({
        error: 'Bad Request',
        issues: error.validation.map((v) => ({
          path: v.instancePath,
          message: v.message,
        })),
      });
    }
    request.log.error({ err: error }, 'unhandled error');
    const status = error.statusCode ?? 500;
    return reply.code(status).send({
      error: status >= 500 ? 'Internal Server Error' : error.message,
    });
  });

  // Long-lived chat agent (instructions are static). The plan agent is built
  // per-request inside the route because safety flags are injected.
  const chatAgent = createCoachChatAgent({ model, exerciseLibrary });

  // Health is unlimited so platform probes (Render/Fly/Railway) are never
  // throttled. Rate limiting is scoped to the expensive coach endpoints.
  app.register(healthRoutes);
  app.register(
    async (coach) => {
      await coach.register(rateLimit, {
        max: env.RATE_LIMIT_MAX,
        timeWindow: '1m',
      });
      await coach.register(
        coachRoutes({ model, exerciseLibrary, chatAgent }),
      );
    },
    { prefix: '/v1/coach' },
  );

  return app;
}

export type App = ReturnType<typeof buildApp>;
