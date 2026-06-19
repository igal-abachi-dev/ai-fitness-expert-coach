import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';

export interface CreateDbOptions {
  /** Neon pooled connection string for runtime queries. */
  databaseUrl: string;
}

/**
 * Creates a Drizzle client backed by Neon's HTTP driver (one query per request).
 * Use a pooled `DATABASE_URL` from the Neon console for production traffic.
 */
export function createDb({ databaseUrl }: CreateDbOptions) {
  const sql = neon(databaseUrl);
  return drizzle({ client: sql, schema });
}

export type Database = ReturnType<typeof createDb>;
