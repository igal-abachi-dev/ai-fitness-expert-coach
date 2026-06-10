import { Output, stepCountIs, ToolLoopAgent, type LanguageModel } from 'ai';
import { buildPlanInstructions, COACH_SYSTEM_PROMPT } from './coach.prompt.js';
import { coachOutputSchema } from './coach.schemas.js';
import { createCoachTools, type ToolDeps } from './tools/index.js';

export interface CoachAgentDeps extends ToolDeps {
  model: LanguageModel;
}

/** Conversational / one-shot coach: streams or generates text, free to call tools. */
export function createCoachChatAgent(deps: CoachAgentDeps) {
  return new ToolLoopAgent({
    model: deps.model,
    instructions: COACH_SYSTEM_PROMPT,
    tools: createCoachTools(deps),
    stopWhen: stepCountIs(8),
    temperature: 0.3,
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
    temperature: 0.2,
  });
}
export type CoachPlanAgent = ReturnType<typeof createCoachPlanAgent>;


/*
export function createCoachChatAgent(deps: CoachAgentDeps) {
  const isReasoningModel = deps.model.modelId.includes('gemini-3.5') || deps.model.modelId.includes('gpt-5.5');

  return new ToolLoopAgent({
    model: deps.model,
    instructions: COACH_SYSTEM_PROMPT,
    tools: createCoachTools(deps),
    stopWhen: stepCountIs(8),
    // Strip temperature to support next-gen reasoning options natively
    ...(isReasoningModel ? {} : { temperature: 0.3 }) 
  });
}

export function createCoachPlanAgent(deps: CoachAgentDeps, safetyFlags: string[]) {
  const isReasoningModel = deps.model.modelId.includes('gemini-3.5') || deps.model.modelId.includes('gpt-5.5');

  return new ToolLoopAgent({
    model: deps.model,
    instructions: buildPlanInstructions(safetyFlags),
    tools: createCoachTools(deps),
    output: Output.object({ schema: coachOutputSchema }),
    stopWhen: stepCountIs(10),
    ...(isReasoningModel ? {} : { temperature: 0.2 })
  });
}

*/