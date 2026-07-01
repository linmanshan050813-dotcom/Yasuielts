import { randomUUID } from "node:crypto";
import type { FeedbackRequestOptions, FeedbackResponse } from "../core/schema.js";
import {
  GRADING_CRITERION_STEPS,
  GRADING_STEPS,
  attachPipelineScores,
  createEmptyPipelineState,
  mergePipelineFeedback,
  nextStepAfter,
  preparePipelineContext,
  repairPipelineFeedback,
  runPipelineStep,
  type GradingStep,
  type PipelineState,
  validatePipelineFeedback,
} from "./grading-pipeline.js";
import { getSessionStore } from "../api/kv-store.js";

export { GRADING_STEPS, type GradingStep } from "./grading-pipeline.js";

export interface GradingSessionMeta {
  session_id: string;
  steps: GradingStep[];
}

export async function createGradingSession(
  essayText: string,
  options: FeedbackRequestOptions,
): Promise<GradingSessionMeta> {
  const sessionId = randomUUID();
  let state = createEmptyPipelineState(essayText, options);
  state = await preparePipelineContext(state);

  const store = getSessionStore();
  await store.set(sessionId, { ...state, completedSteps: [] as GradingStep[] });

  return { session_id: sessionId, steps: GRADING_STEPS };
}

type StoredSession = PipelineState & { completedSteps: GradingStep[] };

async function loadSession(sessionId: string): Promise<StoredSession> {
  const store = getSessionStore();
  const session = await store.get<StoredSession>(sessionId);
  if (!session) {
    throw new Error("Grading session not found or expired.");
  }
  return session;
}

async function saveSession(sessionId: string, session: StoredSession): Promise<void> {
  const store = getSessionStore();
  await store.set(sessionId, session);
}

export interface StepResult {
  step: GradingStep;
  done: true;
  next_step: GradingStep | null;
  ui_step: number;
}

export async function runGradingSessionStep(
  sessionId: string,
  step: GradingStep,
): Promise<StepResult> {
  const session = await loadSession(sessionId);

  if (session.messages.length === 0) {
    const prepared = await preparePipelineContext(session);
    Object.assign(session, prepared);
  }

  const expected = nextStepAfter(session.completedSteps);
  if (expected !== step) {
    throw new Error(`Expected step "${expected ?? "finalize"}", got "${step}".`);
  }

  const updated = await runPipelineStep(session, step);
  Object.assign(session, updated);
  session.completedSteps = [...session.completedSteps, step];

  await saveSession(sessionId, session);

  return {
    step,
    done: true,
    next_step: nextStepAfter(session.completedSteps),
    ui_step: step === "score" ? 3 : GRADING_CRITERION_STEPS.indexOf(step),
  };
}

export async function finalizeGradingSession(
  sessionId: string,
): Promise<FeedbackResponse> {
  const session = await loadSession(sessionId);

  const pending = nextStepAfter(session.completedSteps);
  if (pending !== null) {
    throw new Error(`Cannot finalize: pending step "${pending}".`);
  }

  let state: PipelineState = session;
  state = mergePipelineFeedback(state);
  state = validatePipelineFeedback(state);

  if (state.validationError) {
    state = await repairPipelineFeedback(state);
    state = validatePipelineFeedback(state);
  }

  state = attachPipelineScores(state);

  if (!state.feedback) {
    throw new Error("Failed to produce feedback.");
  }

  await getSessionStore().delete(sessionId);
  return state.feedback;
}
