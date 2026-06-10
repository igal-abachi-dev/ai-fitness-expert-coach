import type { CoachOutput, UserAssessment } from '../coach.schemas.js';
import { calorieFloor } from './nutrition.js';

/**
 * Deterministic post-check that runs AFTER the model. Output.object only
 * guarantees the plan is schema-valid — these rules make it domain-valid.
 * Returned issues feed one repair attempt; persistent failure → 502.
 */
export function validateCoachPlanDomain(
  plan: CoachOutput,
  assessment: UserAssessment,
): string[] {
  const issues: string[] = [];
  const days = plan.trainingProgram.weeklyLayout;

  if (days.length !== assessment.trainingDaysPerWeek) {
    issues.push(
      `weeklyLayout has ${days.length} days but the user requested ${assessment.trainingDaysPerWeek}`,
    );
  }

  const { calories, proteinGrams, carbohydratesGrams, fatsGrams } =
    plan.periodizedNutrition.macronutrientTargets;

  const floor = calorieFloor(assessment);
  if (calories < floor) {
    issues.push(`calories (${calories}) below the conservative floor (${floor})`);
  }

  const gPerKg = proteinGrams / assessment.weightKg;
  if (gPerKg < 1.4 || gPerKg > 2.6) {
    issues.push(
      `proteinGrams is ${gPerKg.toFixed(2)} g/kg — outside the acceptable 1.4–2.6 g/kg band`,
    );
  }

  // Macros must roughly add up to the calorie target (4/4/9 kcal per gram).
  const macroKcal = proteinGrams * 4 + carbohydratesGrams * 4 + fatsGrams * 9;
  if (Math.abs(macroKcal - calories) / calories > 0.15) {
    issues.push(
      `macro energy (${macroKcal} kcal) deviates >15% from the calorie target (${calories})`,
    );
  }

  const tdee = plan.physiologicalProfile.estimatedTdee;
  const bmrFloor = calorieFloor({ ...assessment, age: Math.max(assessment.age, 18) });
  if (tdee < bmrFloor || tdee > bmrFloor * 2.4) {
    issues.push(`estimatedTdee (${tdee}) is outside a physiologically plausible range`);
  }

  if (assessment.limitationsOrInjuries.length > 0 && plan.safetyNotes.length === 0) {
    issues.push('user reported limitations/injuries but safetyNotes is empty');
  }

  if (assessment.primaryGoal === 'gymnastics_skills' && plan.gymnasticsAndSkillWork === null) {
    issues.push('primaryGoal is gymnastics_skills but gymnasticsAndSkillWork is null');
  }

  return issues;
}
