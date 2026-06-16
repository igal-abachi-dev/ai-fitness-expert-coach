import { tool } from 'ai';
import { z } from 'zod';
import { equipmentEnum } from '../coach.schemas.js';

export interface Exercise {
  id: string;
  name: string;
  pattern:
    | 'squat'
    | 'hinge'
    | 'horizontal-push'
    | 'vertical-push'
    | 'horizontal-pull'
    | 'vertical-pull'
    | 'carry'
    | 'core';
  equipment: 'barbell' | 'dumbbell' | 'machine' | 'kettlebell' | 'bodyweight' | 'rings';
  level: 'beginner' | 'intermediate' | 'advanced';
  cues: string;
}

//Move the exercise library from in-memory to DB/search when the catalog becomes real.
export interface ExerciseLibrary {
  search(
    query: { pattern?: Exercise['pattern']; equipment?: Exercise['equipment'][] },
    signal?: AbortSignal,
  ): Promise<Exercise[]>;
}

/** Injected dependency, same pattern as any other I/O: swap for a DB later. */
export function createExerciseLibraryTool(library: ExerciseLibrary) {
  return tool({
    description:
      'Search the exercise library by movement pattern and available equipment. ' +
      'Use this to verify exercise selection before prescribing.',
    inputSchema: z.object({
      pattern: z
        .enum([
          'squat',
          'hinge',
          'horizontal-push',
          'vertical-push',
          'horizontal-pull',
          'vertical-pull',
          'carry',
          'core',
        ])
        .optional(),
      equipment: z.array(equipmentEnum).optional(),
    }),
    execute: async ({ pattern, equipment }, { abortSignal }) => {
      const exercises = await library.search(
        { ...(pattern && { pattern }), ...(equipment && { equipment }) },
        abortSignal,
      );
      return { exercises };
    },
  });
}

export function createInMemoryExerciseLibrary(
  exercises: Exercise[],
): ExerciseLibrary {
  return {
    search: async ({ pattern, equipment }) =>
      exercises.filter(
        (e) =>
          (!pattern || e.pattern === pattern) &&
          (!equipment || equipment.includes(e.equipment)),
      ),
  };
}

/** Minimal seed; replace with a real catalogue. */
export const seedExercises: Exercise[] = [
  { id: 'sq', name: 'Back Squat', pattern: 'squat', equipment: 'barbell', level: 'beginner', cues: 'Brace, sit between the hips, drive up.' },
  { id: 'dl', name: 'Deadlift', pattern: 'hinge', equipment: 'barbell', level: 'beginner', cues: 'Bar over midfoot, wedge, push the floor away.' },
  { id: 'bp', name: 'Bench Press', pattern: 'horizontal-push', equipment: 'barbell', level: 'beginner', cues: 'Retract scapula, touch low chest, press to lockout.' },
  { id: 'ohp', name: 'Overhead Press', pattern: 'vertical-push', equipment: 'barbell', level: 'beginner', cues: 'Glutes tight, bar over mid-foot at lockout.' },
  { id: 'row', name: 'Barbell Row', pattern: 'horizontal-pull', equipment: 'barbell', level: 'intermediate', cues: 'Hinge to ~45°, pull to lower ribs.' },
  { id: 'pu', name: 'Pull-Up', pattern: 'vertical-pull', equipment: 'bodyweight', level: 'intermediate', cues: 'Dead hang to chin over bar, control the negative.' },
  { id: 'gob', name: 'Goblet Squat', pattern: 'squat', equipment: 'dumbbell', level: 'beginner', cues: 'Elbows inside knees at the bottom.' },
  { id: 'rdl', name: 'Romanian Deadlift', pattern: 'hinge', equipment: 'dumbbell', level: 'beginner', cues: 'Soft knees, hips back, stretch the hamstrings.' },
  { id: 'fc', name: 'Farmer Carry', pattern: 'carry', equipment: 'kettlebell', level: 'beginner', cues: 'Tall posture, crush grip, short fast steps.' },
  { id: 'plk', name: 'Plank', pattern: 'core', equipment: 'bodyweight', level: 'beginner', cues: 'Ribs down, glutes on, breathe behind the brace.' },
  { id: 'rdip', name: 'Ring Dip', pattern: 'vertical-push', equipment: 'rings', level: 'advanced', cues: 'Rings turned out at lockout, shoulders away from ears.' },
  { id: 'rrow', name: 'Ring Row', pattern: 'horizontal-pull', equipment: 'rings', level: 'beginner', cues: 'Body rigid, lead with the elbows, full retraction.' },
  { id: 'hollow', name: 'Hollow Body Hold', pattern: 'core', equipment: 'bodyweight', level: 'beginner', cues: 'Lower back pinned, ribs down (Overcoming Gravity straight-arm prep).' },
];
