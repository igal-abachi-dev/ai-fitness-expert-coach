import type { UserAssessment } from '../coach.schemas.js';

/**
 * Pure nutrition math. Tools wrap these; routes and validators call them
 * directly. No I/O, no AI — plain unit-testable functions.
 */

export function mifflinStJeorBmr(a: {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: 'male' | 'female';
}): number {
  return Math.round(
    10 * a.weightKg + 6.25 * a.heightCm - 5 * a.age + (a.sex === 'male' ? 5 : -161),
  );
}

export const activityMultipliers = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
  athlete: 1.9,
} as const;
export type ActivityLevel = keyof typeof activityMultipliers;

export function estimateTdee(bmrKcal: number, activity: ActivityLevel): number {
  return Math.round(bmrKcal * activityMultipliers[activity]);
}

/** Igal's core mandate: protein 1.6–2.2 g/kg, spread across eating windows. */
export function proteinRangeGrams(weightKg: number): { min: number; max: number } {
  return { min: Math.round(weightKg * 1.6), max: Math.round(weightKg * 2.2) };
}

export function leanBodyMassKg(weightKg: number, bodyFatPct: number): number {
  return Math.round(weightKg * (1 - bodyFatPct / 100) * 10) / 10;
}

export function bmi(weightKg: number, heightCm: number): number {
  const h = heightCm / 100;
  return Math.round((weightKg / (h * h)) * 10) / 10;
}

/** Conservative calorie floor used by domain validation. */
export function calorieFloor(assessment: UserAssessment): number {
  const bmr = mifflinStJeorBmr(assessment);
  // Minors never get plans below light-activity TDEE.
  return assessment.age < 18 ? Math.round(bmr * 1.2) : bmr;
}
