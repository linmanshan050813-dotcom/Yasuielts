import type { FeedbackResponse, Locale, TaskType } from "../core/schema.js";
import type { UploadPurpose } from "../core/upload-types.js";

const GRADING_STEPS = [
  "task_response",
  "coherence_cohesion",
  "lexical_resource",
  "grammar",
  "score",
] as const;

export interface ExtractTextResult {
  essay_text: string;
  filename: string;
  purpose?: UploadPurpose;
}

export interface SubmitEssayOptions {
  taskType: TaskType;
  question: string;
  locale?: Locale;
}

export type GradingProgressCallback = (uiStep: number) => void;

async function safeErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.error === "string") {
      return data.error;
    }
  } catch {
    // ignore
  }
  return res.statusText || `Request failed (${res.status}).`;
}

function isMockMode(): boolean {
  return new URLSearchParams(window.location.search).get("mock") === "1";
}

function getGradingMode(): "stepwise" | "monolithic" {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  if (mode === "monolithic") return "monolithic";
  return "stepwise";
}

export async function extractTextFromFile(
  file: File,
  purpose: UploadPurpose = "essay",
): Promise<ExtractTextResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("purpose", purpose);
  const res = await fetch("/api/extract-text", { method: "POST", body: form });
  if (!res.ok) {
    throw new Error(await safeErrorMessage(res));
  }
  return (await res.json()) as ExtractTextResult;
}

async function submitEssayMonolithic(
  text: string,
  options: SubmitEssayOptions,
): Promise<FeedbackResponse> {
  const res = await fetch("/api/essay-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      essay_text: text,
      task_type: options.taskType,
      question: options.question,
      locale: options.locale ?? "zh",
    }),
  });
  if (!res.ok) {
    throw new Error(await safeErrorMessage(res));
  }
  return (await res.json()) as FeedbackResponse;
}

async function submitEssayStepwise(
  text: string,
  options: SubmitEssayOptions,
  onProgress?: GradingProgressCallback,
): Promise<FeedbackResponse> {
  const sessionRes = await fetch("/api/grade/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      essay_text: text,
      task_type: options.taskType,
      question: options.question,
      locale: options.locale ?? "zh",
    }),
  });
  if (!sessionRes.ok) {
    throw new Error(await safeErrorMessage(sessionRes));
  }
  const { session_id: sessionId } = (await sessionRes.json()) as { session_id: string };

  for (let i = 0; i < GRADING_STEPS.length; i += 1) {
    const step = GRADING_STEPS[i];
    onProgress?.(Math.min(i, 3));

    const stepRes = await fetch("/api/grade/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, step }),
    });
    if (!stepRes.ok) {
      throw new Error(await safeErrorMessage(stepRes));
    }
  }

  onProgress?.(3);

  const finalizeRes = await fetch("/api/grade/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!finalizeRes.ok) {
    throw new Error(await safeErrorMessage(finalizeRes));
  }
  return (await finalizeRes.json()) as FeedbackResponse;
}

export async function submitEssay(
  text: string,
  options: SubmitEssayOptions,
  onProgress?: GradingProgressCallback,
): Promise<FeedbackResponse> {
  if (isMockMode()) {
    const res = await fetch("/mock/sampleFeedback.json");
    if (!res.ok) {
      throw new Error("Failed to load mock feedback data.");
    }
    return (await res.json()) as FeedbackResponse;
  }

  if (getGradingMode() === "monolithic") {
    onProgress?.(3);
    return submitEssayMonolithic(text, options);
  }

  return submitEssayStepwise(text, options, onProgress);
}
