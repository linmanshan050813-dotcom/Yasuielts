import type { FeedbackResponse, Locale, TaskType } from "../core/schema.js";
import type { UploadPurpose } from "../core/upload-types.js";

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

export async function submitEssay(
  text: string,
  options: SubmitEssayOptions,
): Promise<FeedbackResponse> {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mock") === "1") {
    const res = await fetch("/mock/sampleFeedback.json");
    if (!res.ok) {
      throw new Error("Failed to load mock feedback data.");
    }
    return (await res.json()) as FeedbackResponse;
  }

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
