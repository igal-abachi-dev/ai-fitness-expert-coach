import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import { CoachOutputSchema, type CoachOutput, type UserAssessment } from "./schema.js";
import { SYSTEM_PROMPT } from "./prompt.js";

interface ProcessAssessmentOptions {
  model?: string;
}

export async function processUserAssessment(
  assessment: UserAssessment,
  options: ProcessAssessmentOptions = {}
): Promise<CoachOutput> {
  const modelId = options.model ?? "gpt-4o"; // You can use "gpt-4o-mini" for faster/cheaper runs

  const userPrompt = `
Generate a comprehensive, elite-level coaching structure based on the following user data:

User Physical Data & Constraints:
- Age: ${assessment.age}
- Sex: ${assessment.sex}
- Weight: ${assessment.weightKg} kg
- Height: ${assessment.heightCm} cm
- Body Fat %: ${assessment.bodyFatPct ?? "Not provided"}
- Primary Goal: ${assessment.primaryGoal}
- Experience Level: ${assessment.experienceLevel}
- Desired Weekly Training Frequency: ${assessment.trainingDaysPerWeek} days/week
- Limitations / Injuries: ${assessment.limitationsOrInjuries?.join(", ") || "None declared"}
- Baseline Diet Context: ${assessment.currentDietStyle ?? "None"}

Please evaluate this user's profile and construct a scientific and practical plan utilizing our core parameters. All outputs must match the requested object schema layout exactly. Keep explanations tight, dense, professional, and practical.
`;

  const { output } = await generateText({
    model: openai(modelId),
    output: Output.object({
      schema: CoachOutputSchema,
      name: "coach_output",
      description: "Comprehensive structured output from the elite fitness coach agent containing physiology, diet, and training structures",
    }),
    system: SYSTEM_PROMPT,
    prompt: userPrompt,
    temperature: 0.3, // Lower temp ensures deterministic, logic-based outputs
  });

  return output;
}
