import { Output, stepCountIs, ToolLoopAgent, type LanguageModel } from 'ai';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import { buildPlanInstructions, COACH_SYSTEM_PROMPT } from './coach.prompt.js';
import { coachOutputSchema } from './coach.schemas.js';
import { createCoachTools, type ToolDeps } from './tools/index.js';

const CHAT_TEMPERATURE = 0.3;
const PLAN_TEMPERATURE = 0.2;

export interface CoachAgentDeps extends ToolDeps {
  model: LanguageModel;
  providerOptions?: ProviderOptions;
  /** When false, temperature is omitted (reasoning models). Defaults to true for mocks. */
  supportsTemperature?: boolean;
}

function coachAgentCallSettings(
  deps: CoachAgentDeps,
  temperature: number,
): { temperature?: number; providerOptions?: ProviderOptions } {
  const supportsTemperature = deps.supportsTemperature ?? true;

  return {
    ...(supportsTemperature ? { temperature } : {}),
    ...(deps.providerOptions !== undefined
      ? { providerOptions: deps.providerOptions }
      : {}),
  };
}

/** Conversational / one-shot coach: streams or generates text, free to call tools. */
export function createCoachChatAgent(deps: CoachAgentDeps) {
  return new ToolLoopAgent({
    model: deps.model,
    instructions: COACH_SYSTEM_PROMPT,
    tools: createCoachTools(deps),
    stopWhen: stepCountIs(8),
    ...coachAgentCallSettings(deps, CHAT_TEMPERATURE),
  });
}
export type CoachChatAgent = ReturnType<typeof createCoachChatAgent>;

/**
 * Plan generator: a tool-using agent with a structured output contract.
 * Instructions are built per-request so deterministic safety flags can be
 * injected (see buildPlanInstructions), so this is a factory keyed on flags.
 *
 * This is the v6 upgrade over the original generateText+Output.object: the
 * agent can consult the exercise library and run the nutrition/load tools
 * *while* producing the typed plan.
 */
export function createCoachPlanAgent(deps: CoachAgentDeps, safetyFlags: string[]) {
  return new ToolLoopAgent({
    model: deps.model,
    instructions: buildPlanInstructions(safetyFlags),
    tools: createCoachTools(deps),
    output: Output.object({ schema: coachOutputSchema }),
    stopWhen: stepCountIs(10),
    ...coachAgentCallSettings(deps, PLAN_TEMPERATURE),
  });
}
export type CoachPlanAgent = ReturnType<typeof createCoachPlanAgent>;
