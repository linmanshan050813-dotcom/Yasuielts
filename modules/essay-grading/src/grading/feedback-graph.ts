import type { FeedbackRequestOptions, FeedbackResponse } from "../core/schema.js";
import {
  GRADING_CRITERION_STEPS,
  attachPipelineScores,
  createEmptyPipelineState,
  mergePipelineFeedback,
  preparePipelineContext,
  repairPipelineFeedback,
  runPipelineStep,
  validatePipelineFeedback,
} from "./grading-pipeline.js";

export async function runFeedbackGraph(
  essayText: string,
  options: FeedbackRequestOptions,
): Promise<FeedbackResponse> {
  let state = createEmptyPipelineState(essayText, options);
  state = await preparePipelineContext(state);

  for (const criterion of GRADING_CRITERION_STEPS) {
    state = await runPipelineStep(state, criterion);
  }

  state = mergePipelineFeedback(state);
  state = validatePipelineFeedback(state);

  if (state.validationError) {
    state = await repairPipelineFeedback(state);
    state = validatePipelineFeedback(state);
  }

  state = await runPipelineStep(state, "score");
  state = attachPipelineScores(state);

  if (!state.feedback) {
    throw new Error("Feedback graph did not return feedback.");
  }
  return state.feedback;
}
