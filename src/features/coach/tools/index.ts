import { estimateNutrition } from './estimate-nutrition.tool.js';
import { estimateTrainingLoad } from './estimate-training-load.tool.js';
import {
  createExerciseLibraryTool,
  type ExerciseLibrary,
} from './exercise-library.tool.js';

export interface ToolDeps {
  exerciseLibrary: ExerciseLibrary;
}

/** The agent's toolset, assembled from injected dependencies. */
export function createCoachTools(deps: ToolDeps) {
  return {
    searchExerciseLibrary: createExerciseLibraryTool(deps.exerciseLibrary),
    estimateTrainingLoad,
    estimateNutrition,
  } as const;
}
