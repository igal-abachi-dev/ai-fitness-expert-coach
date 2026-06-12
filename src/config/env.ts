import { z } from 'zod';

/** Non-empty API key, or undefined when unset / blank. */
const optionalApiKey = z
  .string()
  .optional()
  .transform((value) => (value?.trim() ? value.trim() : undefined));

const API_KEY_FIELDS = [
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'XAI_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
] as const;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),

  GOOGLE_GENERATIVE_AI_API_KEY: optionalApiKey,
  XAI_API_KEY: optionalApiKey,
  OPENAI_API_KEY: optionalApiKey,
  ANTHROPIC_API_KEY: optionalApiKey,
  /**
   * Provider-prefixed id (`anthropic/claude-opus-4-8`) or bare id when unambiguous
   * (`claude-opus-4-8`, `gemini-2.5-flash`, `grok-4.3`, `gpt-5.2`).
   */
  AGENT_MODEL: z.string().default('anthropic/claude-opus-4-8'),

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

  const hasAnyApiKey = API_KEY_FIELDS.some((field) => env[field] !== undefined);
  if (!hasAnyApiKey) {
    ctx.addIssue({
      code: 'custom',
      path: ['ANTHROPIC_API_KEY'],
      message:
        'At least one of GOOGLE_GENERATIVE_AI_API_KEY, XAI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY is required',
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
