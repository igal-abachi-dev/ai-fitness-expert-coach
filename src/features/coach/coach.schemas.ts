import { z } from 'zod';

export const equipmentEnum = z.enum([
  'barbell',
  'dumbbell',
  'machine',
  'cables',
  'kettlebell',
  'bodyweight',
  'rings',
]);
export type Equipment = z.infer<typeof equipmentEnum>;

/** POST /v1/coach/plan — assessment input (evolved from the original project). */
export const userAssessmentSchema = z.object({
  age: z.number().int().min(13).max(100),
  sex: z.enum(['male', 'female']),
  heightCm: z.number().min(100).max(250),
  weightKg: z.number().min(30).max(250),
  bodyFatPct: z.number().min(3).max(60).optional(),
  primaryGoal: z.enum([
    'hypertrophy',
    'pure_strength',
    'gymnastics_skills',
    'athletic_performance',
    'fat_loss',
    'longevity_health',
  ]),
  experienceLevel: z.enum(['beginner', 'intermediate', 'advanced']),
  trainingDaysPerWeek: z.number().int().min(1).max(7),
  equipment: z.array(equipmentEnum).min(1),
  limitationsOrInjuries: z.array(z.string().max(200)).max(10).default([]),
  currentDietStyle: z.string().max(100).optional(),
});
export type UserAssessment = z.infer<typeof userAssessmentSchema>;

/**
 * The elite coach's structured output (carried over from the original
 * project, plus safetyNotes). Sent to the model as the Output contract and
 * used to serialize the HTTP response — keep it free of defaults/transforms.
 */
export const coachOutputSchema = z.object({
  physiologicalProfile: z.object({
    estimatedTdee: z.number().describe('Calculated TDEE based on physical details'),
    leanBodyMassKg: z
      .number()
      .nullable()
      .describe('Calculated if body fat percent was provided'),
    biomechanicalObservations: z
      .string()
      .describe('Mechanical alignment warnings or levers assessment based on constraints'),
  }),
  periodizedNutrition: z.object({
    generalStanceOnNamedDiets: z
      .string()
      .describe('Scientific critique of why generic named diets might fail this objective'),
    macronutrientTargets: z.object({
      calories: z.number(),
      proteinGrams: z.number().describe('Target matching 1.6-2.2 g/kg (or lean-mass adjusted)'),
      carbohydratesGrams: z.number().describe('Periodized to training volume'),
      fatsGrams: z.number().describe('Remainder calories, kept away from peri-workout windows'),
    }),
    periWorkoutProtocol: z.object({
      preWorkoutMeal: z.string(),
      intraWorkoutHydrationAndNutrition: z.string(),
      postWorkoutMeal: z.string(),
    }),
    nonTrainingDayAdjustments: z.string(),
  }),
  trainingProgram: z.object({
    splitName: z.string().describe('e.g. Push/Pull/Legs, Upper/Lower, Full Body'),
    frequencyRationale: z.string().describe('Scientific reason for this split and frequency'),
    weeklyLayout: z
      .array(
        z.object({
          dayNumber: z.number().int(),
          focus: z.string(),
          exercises: z
            .array(
              z.object({
                name: z.string(),
                sets: z.number().int().min(1).max(10),
                reps: z.string().describe('e.g. "3-5", "8-12", "5s hold"'),
                rirTarget: z.number().int().min(0).max(5).describe('Reps in Reserve'),
                restSeconds: z.number().int().min(15).max(600),
                coachingCue: z
                  .string()
                  .describe('Cue bridging lab to gym (biomechanics, tempo, or safety)'),
              }),
            )
            .min(1),
        }),
      )
      .min(1),
  }),
  gymnasticsAndSkillWork: z
    .object({
      straightArmPrep: z.string().describe('Per Overcoming Gravity: scapular/wrist/hollow prep'),
      progressionAdvice: z.string(),
    })
    .nullable(),
  evidenceCitations: z.array(
    z.object({
      topic: z.string(),
      scientificMechanism: z.string().describe("The physiological 'why'"),
      leadingReference: z.string().describe('Author or textbook from the core literature'),
    }),
  ),
  safetyNotes: z
    .array(z.string())
    .describe('Must address every raised safety flag; empty only if no flags and no injuries'),
});
export type CoachOutput = z.infer<typeof coachOutputSchema>;

/** POST /v1/coach/ask — one-shot question, optionally with profile context. */
export const askRequestSchema = z.object({
  prompt: z.string().min(1).max(8_000),
  profile: userAssessmentSchema.partial().optional(),
});

export const askResponseSchema = z.object({
  text: z.string(),
  steps: z.number().int(),
  usage: z.object({
    inputTokens: z.number().nullable(),
    outputTokens: z.number().nullable(),
  }),
});

/** POST /v1/coach/chat — streaming chat envelope (UIMessages, deep-validated by the SDK). */
export const chatRequestSchema = z.object({
  messages: z.array(z.looseObject({})).min(1).max(200),
});
