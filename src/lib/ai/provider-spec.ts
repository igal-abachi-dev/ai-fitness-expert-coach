/**
 * Provider/model spec resolution shared by `env.ts` (key validation) and
 * `models.ts` (provider construction). Kept dependency-free so neither module
 * needs a runtime import of the other.
 *
 * A model is named by a `"<provider>/<modelId>"` spec (e.g.
 * `google/gemini-3-flash-preview`) or a bare id when the family is
 * unambiguous (`gemini-3-flash-preview`, `grok-4.3`, `claude-opus-4-8`).
 */
export type ModelProvider =
  | 'google'
  | 'cerebras'
  | 'groq'
  | 'xai'
  | 'anthropic'
  | 'openai';

export const PROVIDER_PREFIXES: readonly ModelProvider[] = [
  'google',
  'cerebras',
  'groq',
  'xai',
  'anthropic',
  'openai',
];

/** Provider -> the env var that must hold its API key. */
export const PROVIDER_KEY_ENV: Record<ModelProvider, string> = {
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  cerebras: 'CEREBRAS_API_KEY',
  groq: 'GROQ_API_KEY',
  xai: 'XAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
};

/**
 * Resolves which provider owns a model spec.
 * Accepts `provider/model-id` or bare ids that match known families.
 *
 * Open-weight ids (gpt-oss, qwen, llama) are served by multiple free
 * providers, so they must be prefixed (e.g. `cerebras/gpt-oss-120b`).
 */
export function resolveModelProvider(modelName: string): ModelProvider {
  const prefixed = PROVIDER_PREFIXES.find((provider) =>
    modelName.startsWith(`${provider}/`),
  );
  if (prefixed) {
    return prefixed;
  }

  const id = modelName.toLowerCase();
  if (id.startsWith('gemini-')) return 'google';
  if (id.startsWith('grok-')) return 'xai';
  if (id.startsWith('claude-')) return 'anthropic';
  if (
    id.startsWith('gpt-') ||
    id.startsWith('o3') ||
    id.startsWith('o4') ||
    id.startsWith('chatgpt-')
  ) {
    return 'openai';
  }

  throw new Error(
    `Cannot infer provider for model spec "${modelName}". ` +
      'Use a prefixed id such as google/gemini-3-flash-preview, ' +
      'cerebras/gpt-oss-120b, groq/llama-3.3-70b-versatile, ' +
      'xai/grok-4.3, anthropic/claude-opus-4-8, or openai/gpt-5.2.',
  );
}

/** Strips an optional `provider/` prefix before passing the id to a factory. */
export function stripProviderPrefix(
  modelName: string,
  provider: ModelProvider,
): string {
  const prefix = `${provider}/`;
  return modelName.startsWith(prefix)
    ? modelName.slice(prefix.length)
    : modelName;
}
