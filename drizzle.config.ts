import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit uses a direct (non-pooled) Postgres URL for migrations.
 * On Neon, set DATABASE_URL_UNPOOLED to the hostname without `-pooler`.
 */
const migrationUrl =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!migrationUrl) {
  throw new Error(
    'Set DATABASE_URL_UNPOOLED (preferred) or DATABASE_URL before running drizzle-kit.',
  );
}

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: migrationUrl,
  },
});
