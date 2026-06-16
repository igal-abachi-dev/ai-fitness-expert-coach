import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyError } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Env } from './config/env.js';
import type { RoleModels } from './lib/ai/models.js';
import {
  agentDepsFromBundle,
  createCoachChatAgent,
} from './features/coach/coach.agent.js';
import { coachRoutes } from './features/coach/coach.routes.js';
import type { ExerciseLibrary } from './features/coach/tools/exercise-library.tool.js';
import { healthRoutes } from './features/health/health.routes.js';

export interface AppDeps {
  env: Env;
  /** Role-routed models: quality (/plan), cheap (/ask + plan overflow), fast (/chat). */
  models: RoleModels;
  exerciseLibrary: ExerciseLibrary;
}

/**
 * Composition root. Pure function of its dependencies: builds and wires the
 * app but never reads process.env, never listens, never touches the network.
 * Tests inject a MockLanguageModelV3; server.ts injects the real provider.
 */
export function buildApp({ env, models, exerciseLibrary }: AppDeps) {
  const tools = { exerciseLibrary };
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === 'development' && {
        transport: { target: 'pino-pretty', options: { singleLine: true } },
      }),
    },
    requestIdHeader: 'x-request-id',
    // Render (and similar) terminate TLS at a proxy — required for correct
    // client IPs in rate limiting and logs.
    trustProxy: env.NODE_ENV === 'production',
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook('onRequest', async (request, reply) => {
    if (request.id) {
      reply.header('x-request-id', request.id);
    }
  });

  // gen react: npx openapi-typescript http://localhost:3000/documentation/json --output ./src/api/v1.d.ts
  // Must register before routes so onRoute hooks capture Zod schemas.
  app.register(swagger, {
    openapi: {
      info: { title: 'AI Fitness Coach API', version: '1.0.0' },
    },
    transform: jsonSchemaTransform,
  });
  app.register(swaggerUi, { routePrefix: '/documentation' });

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

  // Long-lived chat agents (instructions are static). The plan agent is built
  // per-request inside the route because safety flags are injected.
  //   /chat streams -> fast (lowest latency)
  //   /ask one-shot -> cheap (Gemini Flash-Lite quality at high volume)
  const chatAgent = createCoachChatAgent(
    agentDepsFromBundle(models.cheap/*models.fast*/, tools),
  );
  const askAgent = createCoachChatAgent(
    agentDepsFromBundle(models.cheap, tools),
  );

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
        coachRoutes({
          models,
          exerciseLibrary,
          chatAgent,
          askAgent,
        }),
      );
    },
    { prefix: '/v1/coach' },
  );

  return app;
}

export type App = ReturnType<typeof buildApp>;
