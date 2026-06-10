import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import swagger from '@fastify/swagger';
import {
  createInMemoryExerciseLibrary,
  seedExercises,
} from './features/coach/tools/exercise-library.tool.js';
import { createAgentModel } from './lib/ai/models.js';

const env = loadEnv();

const app = buildApp({
  env,
  model: createAgentModel(env),
  // Swap for a DB-backed implementation when the catalogue grows:
  exerciseLibrary: createInMemoryExerciseLibrary(seedExercises),
});

// Register this right after initializing your 'app' instance
await app.register(swagger, {
  openapi: {
    info: { title: 'AI Fitness Coach API', version: '1.0.0' },
  },
}); //gen react: npx openapi-typescript http://localhost:3000/documentation/json --output ./src/api/v1.d.ts

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    app.log.info({ signal }, 'shutting down');
    await app.close(); // waits for in-flight requests, runs onClose hooks
    process.exit(0);
  });
}

await app.listen({ host: env.HOST, port: env.PORT });
