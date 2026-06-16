import { z } from 'zod';
import {
  PROVIDER_KEY_ENV,
  resolveModelProvider,
} from '../lib/ai/provider-spec.js';

/** Non-empty API key, or undefined when unset / blank. */
const optionalApiKey = z
  .string()
  .optional()
  .transform((value) => (value?.trim() ? value.trim() : undefined));

/**
 * Model roles. Each is a `"<provider>/<modelId>"` spec. Defaults target the
 * free-tier stack so the app runs on free keys out of the box:
 *   - quality: Google Gemini 3 Flash Preview (free tier, strong structured output)
 *   - cheap:   Google Gemini 3.1 Flash-Lite (free tier, high volume + plan overflow)
 *   - fast:    Cerebras gpt-oss-120b (fastest free inference, streaming chat)
 *
 * Each role falls back to AGENT_MODEL when its own var is unset, so a single
 * AGENT_MODEL keeps the legacy single-model behavior.
 */
const ROLE_MODEL_FIELDS = ['QUALITY_MODEL', 'CHEAP_MODEL', 'FAST_MODEL'] as const;

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info'),

    GOOGLE_GENERATIVE_AI_API_KEY: optionalApiKey,
    CEREBRAS_API_KEY: optionalApiKey,
    GROQ_API_KEY: optionalApiKey,
    XAI_API_KEY: optionalApiKey,
    OPENAI_API_KEY: optionalApiKey,
    ANTHROPIC_API_KEY: optionalApiKey,

    /**
     * Legacy single-model knob and per-role fallback. Provider-prefixed id
     * (`google/gemini-3-flash-preview`) or a bare id when unambiguous.
     */
    AGENT_MODEL: z.string().default('google/gemini-3-flash-preview'),
    /** Best structured output: the `/plan` primary. */
    QUALITY_MODEL: z.string().default('google/gemini-3-flash-preview'),
    /** High volume + the `/plan` quota-overflow fallback and `/ask`. */
    CHEAP_MODEL: z.string().default('google/gemini-3.1-flash-lite'),
    /** Lowest latency: the `/chat` stream. */
    FAST_MODEL: z.string().default('cerebras/gpt-oss-120b'),

    /** Exact frontend origin; '*' is rejected in production (see superRefine). */
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    /** Agent calls are expensive — keep this tight. Per IP, per minute. */
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.CORS_ORIGIN === '*') {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGIN'],
        message: 'CORS_ORIGIN must not be "*" in production',
      });
    }

    // Validate only the keys for providers actually referenced by the
    // configured role models — set the key for what you use, nothing more.
    for (const field of ROLE_MODEL_FIELDS) {
      const spec = env[field] || env.AGENT_MODEL;
      let provider;
      try {
        provider = resolveModelProvider(spec);
      } catch (error) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      const keyField = PROVIDER_KEY_ENV[provider];
      if (env[keyField as keyof typeof env] === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [keyField],
          message: `${field}="${spec}" needs provider "${provider}", but ${keyField} is not set.`,
        });
      }
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
