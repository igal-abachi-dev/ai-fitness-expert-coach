import { describe, expect, it } from 'vitest';
import { createDb } from './client.js';

describe('createDb', () => {
  it('returns a Drizzle client for a connection string', () => {
    const db = createDb({
      databaseUrl: 'postgresql://user:pass@localhost:5432/test',
    });
    expect(db).toBeDefined();
    expect(db.$client).toBeDefined();
  });
});
