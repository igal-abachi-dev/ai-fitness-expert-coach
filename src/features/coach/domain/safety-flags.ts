import type { UserAssessment } from '../coach.schemas.js';

const MEDICAL_PATTERN =
  /pain|tear|rupture|fracture|surgery|hernia|dizz|chest|heart|faint|stress fracture/i;

/**
 * Deterministic pre-check that runs BEFORE the model. Flags are injected
 * into the plan prompt (the model must address each in safetyNotes) and are
 * never left to the model's discretion alone.
 */
export function detectSafetyFlags(a: UserAssessment): string[] {
  const flags: string[] = [];

  if (a.age < 18) {
    flags.push(
      'minor: conservative programming only, no aggressive deficits, recommend adult/professional supervision',
    );
  }
  if (a.age < 18 && a.primaryGoal === 'fat_loss') {
    flags.push(
      'minor requesting fat loss: prioritize habits and modest recomposition, refer to pediatric professional for any deficit',
    );
  }
  if (a.limitationsOrInjuries.some((x) => MEDICAL_PATTERN.test(x))) {
    flags.push(
      'reported limitation suggests medical clearance is needed before loading the affected area',
    );
  }
  if (a.experienceLevel === 'beginner' && a.trainingDaysPerWeek >= 6) {
    flags.push(
      'beginner requesting 6+ days/week: high overreach risk, plan must manage volume and include recovery guidance',
    );
  }
  return flags;
}
