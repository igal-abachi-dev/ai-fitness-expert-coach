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
  equipment: 'barbell' | 'dumbbell' | 'machine' |'cables'| 'kettlebell' | 'bodyweight' | 'rings';
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
  // Gymnastics / bodyweight progressions (Overcoming Gravity)
  { id: 'rmu', name: 'Ring Muscle-Up', pattern: 'vertical-pull', equipment: 'rings', level: 'advanced', cues: 'False grip, pull to armpits, transition chest over rings, press to lockout.' },
  { id: 'pllean', name: 'Planche Lean on Rings', pattern: 'horizontal-push', equipment: 'rings', level: 'advanced', cues: 'Rings turned out 45°, scapulae depressed/protracted, lean until shoulders pass hands, elbows locked.' },
  { id: 'lsitpu', name: 'L-Sit Pull-Up', pattern: 'vertical-pull', equipment: 'bodyweight', level: 'advanced', cues: 'Strict 90° hip angle, dead hang to chest at rings/bar, full shoulder extension at bottom.' },
  { id: 'flrow', name: 'Front Lever Tuck Row', pattern: 'horizontal-pull', equipment: 'rings', level: 'intermediate', cues: 'Tucked front lever hang, pull hips to rings, active scapular retraction, no hip sag.' },
  { id: 'flrow_adv', name: 'Advanced Tuck Front Lever Row', pattern: 'horizontal-pull', equipment: 'rings', level: 'advanced', cues: 'Advanced tuck lever, pull with hips level, retract scapulae hard at top.' },
  { id: 'archrow', name: 'Archer Ring Row', pattern: 'horizontal-pull', equipment: 'rings', level: 'advanced', cues: 'Pull to one ring, opposite arm straight to side, alternate arms, controlled descent.' },
  { id: 'hspu', name: 'Handstand Push-Up', pattern: 'vertical-push', equipment: 'bodyweight', level: 'advanced', cues: 'Chest-to-wall if assisted (not back-to-wall); tripod at bottom, press straight up, hollow-body stack at lockout.' },
  { id: 'hspu_ctw', name: 'Chest-to-Wall Handstand Push-Up', pattern: 'vertical-push', equipment: 'bodyweight', level: 'advanced', cues: 'Face the wall, hollow-body line, head lightly touches floor, press to lockout with shoulders over wrists.' },
  { id: 'hshold', name: 'Freestanding Handstand Hold', pattern: 'vertical-push', equipment: 'bodyweight', level: 'advanced', cues: 'Stack shoulders over wrists, ribs in, fingers spread for balance corrections.' },
  { id: 'rsup', name: 'Ring Support Hold', pattern: 'vertical-push', equipment: 'rings', level: 'intermediate', cues: 'Elbows locked, rings turned out 45°, shoulders depressed, hollow-body shape.' },
  { id: 'pistol', name: 'Pistol Squat', pattern: 'squat', equipment: 'bodyweight', level: 'intermediate', cues: 'Non-working leg forward, heel flat, control descent, drive through midfoot.' },
  { id: 'cossack', name: 'Cossack Squat', pattern: 'squat', equipment: 'bodyweight', level: 'intermediate', cues: 'Wide stance, shift into one hip, keep heel down, upright torso, alternate sides for frontal-plane mobility.' },
  { id: 'nordic', name: 'Nordic Hamstring Curl', pattern: 'hinge', equipment: 'bodyweight', level: 'advanced', cues: 'Ankles anchored, hips straight, slow eccentric, light push-off to return.' },
  { id: 'slrdl', name: 'Single-Leg Romanian Deadlift', pattern: 'hinge', equipment: 'bodyweight', level: 'intermediate', cues: 'Soft standing knee, hinge with square hips, squeeze glute to stand.' },
  { id: 'hlr', name: 'Hanging Leg Raise', pattern: 'core', equipment: 'bodyweight', level: 'intermediate', cues: 'Dead hang, knees locked, compress abs to lift feet to bar without swing.' },
  { id: 'hrock', name: 'Hollow Body Rock', pattern: 'core', equipment: 'bodyweight', level: 'intermediate', cues: 'Perfect hollow shape, rock smoothly forward and back, core locked.' },
  { id: 'lsit', name: 'L-Sit Hold', pattern: 'core', equipment: 'rings', level: 'intermediate', cues: 'Depress shoulders, compress hips to 90°, legs parallel to floor, pointed toes.' },
  { id: 'vsit', name: 'V-Sit Hold on Rings', pattern: 'core', equipment: 'rings', level: 'advanced', cues: 'Support on rings, lift legs to V-shape, shoulders depressed, hollow compression.' },
  { id: 'dragon', name: 'Dragon Flag', pattern: 'core', equipment: 'bodyweight', level: 'advanced', cues: 'Grip anchor behind head, body rigid, lower under control keeping one straight line.' },
  { id: 'plpush', name: 'Planche Lean Push-Up', pattern: 'horizontal-push', equipment: 'bodyweight', level: 'advanced', cues: 'Planche lean angle, protracted scapulae, elbows tight, full lockout at top.' },
];
