import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),

  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  AGENT_MODEL: z.string().default('claude-sonnet-4-5'),

  /** Exact frontend origin; '*' is rejected in production (see superRefine). */
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  /** Agent calls are expensive — keep this tight. Per IP, per minute. */
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV === 'production' && env.CORS_ORIGIN === '*') {
    ctx.addIssue({
      code: 'custom',
      path: ['CORS_ORIGIN'],
      message: 'CORS_ORIGIN must not be "*" in production',
    });
  }
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates the environment once at startup. Everything downstream receives
 * a typed `Env` object — no `process.env` access outside this module.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
