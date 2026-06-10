import { tool } from 'ai';
import { z } from 'zod';
import {
  estimateTdee,
  leanBodyMassKg,
  mifflinStJeorBmr,
  proteinRangeGrams,
  type ActivityLevel,
} from '../domain/nutrition.js';

export const estimateNutrition = tool({
  description:
    'Deterministically estimate BMR (Mifflin-St Jeor), TDEE, a conservative ' +
    'protein range (1.6-2.2 g/kg), and lean body mass. Use instead of inventing numbers.',
  inputSchema: z.object({
    age: z.number().int().min(13).max(100),
    sex: z.enum(['male', 'female']),
    heightCm: z.number().positive(),
    weightKg: z.number().positive(),
    activityLevel: z
      .enum(['sedentary', 'light', 'moderate', 'high', 'athlete'])
      .default('moderate'),
    bodyFatPct: z.number().min(3).max(60).optional(),
  }),
  execute: ({ age, sex, heightCm, weightKg, activityLevel, bodyFatPct }) => {
    const bmr = mifflinStJeorBmr({ weightKg, heightCm, age, sex });
    const tdee = estimateTdee(bmr, activityLevel as ActivityLevel);
    return {
      bmrKcal: bmr,
      tdeeKcal: tdee,
      proteinRangeGrams: proteinRangeGrams(weightKg),
      leanBodyMassKg: bodyFatPct != null ? leanBodyMassKg(weightKg, bodyFatPct) : null,
      note: 'Estimates. Adjust to weight trend, performance, hunger, and recovery.',
    };
  },
});
