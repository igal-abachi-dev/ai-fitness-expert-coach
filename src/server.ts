import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import {
  createInMemoryExerciseLibrary,
  seedExercises,
} from './features/coach/tools/exercise-library.tool.js';
import { createModels } from './lib/ai/models.js';
import { createDb } from './lib/db/index.js';

const env = loadEnv();

/** Drizzle client when DATABASE_URL is set; inject into routes/repos as needed. */
export const db = env.DATABASE_URL
  ? createDb({ databaseUrl: env.DATABASE_URL })
  : undefined;

const app = buildApp({
  env,
  models: createModels(env),
  // Swap for a DB-backed implementation when the catalogue grows:
  exerciseLibrary: createInMemoryExerciseLibrary(seedExercises),
});

if (db) {
  app.log.info('PostgreSQL configured (Drizzle + Neon HTTP driver)');
}


for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    app.log.info({ signal }, 'shutting down');
    await app.close(); // waits for in-flight requests, runs onClose hooks
    process.exit(0);
  });
}

await app.listen({ host: env.HOST, port: env.PORT });
