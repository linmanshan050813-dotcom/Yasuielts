import Busboy from "busboy";
import type { IncomingMessage } from "node:http";
import type { FeedbackRequestOptions, Locale, TaskType } from "../core/schema.js";
import { extractTextFromBuffer } from "./file-extractor.js";
import {
  createGradingSession,
  finalizeGradingSession,
  runGradingSessionStep,
  type GradingStep,
} from "../grading/grading-session.js";
import { runFeedbackGraph } from "../grading/feedback-graph.js";
import { GRADING_STEPS } from "../grading/grading-pipeline.js";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  json(data: unknown): void;
  setHeader(name: string, value: string): void;
  end(data?: string): void;
}

export type ApiHandler = (req: ApiRequest, res: ApiResponse) => Promise<void>;

const VALID_TASK_TYPES = new Set<TaskType>([
  "Task 2",
  "Task 1 Academic",
  "Task 1 General",
]);

function parseTaskType(value: unknown): TaskType {
  const taskType = String(value ?? "Task 2");
  if (VALID_TASK_TYPES.has(taskType as TaskType)) {
    return taskType as TaskType;
  }
  return "Task 2";
}

function parseLocale(value: unknown): Locale {
  return value === "en" ? "en" : "zh";
}

function readJsonBody(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  if (typeof body === "string" && body.trim()) {
    return JSON.parse(body) as Record<string, unknown>;
  }
  throw new Error("Invalid JSON body.");
}

function sendError(res: ApiResponse, status: number, message: string): void {
  res.status(status).json({ error: message });
}

export function withCors(handler: ApiHandler): ApiHandler {
  return async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.status(204).end("");
      return;
    }
    await handler(req, res);
  };
}

export async function parseMultipartRequest(
  req: IncomingMessage,
  headers: Record<string, string | string[] | undefined>,
): Promise<{
  fields: Record<string, string>;
  file?: { buffer: Buffer; filename: string; mimetype: string };
}> {
  const contentType = String(headers["content-type"] ?? "");
  if (!contentType.includes("multipart/form-data")) {
    throw new Error("Expected multipart/form-data.");
  }

  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {};
    let file: { buffer: Buffer; filename: string; mimetype: string } | undefined;
    let totalSize = 0;

    const busboy = Busboy({
      headers: { "content-type": contentType },
      limits: { fileSize: MAX_UPLOAD_BYTES },
    });

    busboy.on("file", (name, stream, info) => {
      if (name !== "file") {
        stream.resume();
        return;
      }
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > MAX_UPLOAD_BYTES) {
          reject(new Error("File exceeds 4MB upload limit."));
          stream.resume();
          return;
        }
        chunks.push(chunk);
      });
      stream.on("end", () => {
        file = {
          buffer: Buffer.concat(chunks),
          filename: info.filename,
          mimetype: info.mimeType,
        };
      });
    });

    busboy.on("field", (name, value) => {
      fields[name] = value;
    });

    busboy.on("finish", () => resolve({ fields, file }));
    busboy.on("error", reject);
    req.pipe(busboy);
  });
}

export const handleExtractText: ApiHandler = async (req, res) => {
  if (req.method !== "POST") {
    sendError(res, 405, "Method not allowed.");
    return;
  }

  try {
    const incoming = req as ApiRequest & IncomingMessage;
    const { fields, file } = await parseMultipartRequest(incoming, req.headers);
    if (!file) {
      throw new Error("No file uploaded.");
    }
    const purposeRaw = String(fields.purpose ?? "essay");
    const purpose = purposeRaw === "question" ? "question" : "essay";
    const text = await extractTextFromBuffer(
      file.buffer,
      file.mimetype,
      file.filename,
      purpose,
    );
    if (!text) {
      throw new Error("File parsed but no text was extracted.");
    }
    res.status(200).json({ essay_text: text, filename: file.filename, purpose });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to extract text.";
    sendError(res, 400, message);
  }
};

export const handleEssayFeedback: ApiHandler = async (req, res) => {
  if (req.method !== "POST") {
    sendError(res, 405, "Method not allowed.");
    return;
  }

  try {
    const body = readJsonBody(req.body);
    const essayText = String(body.essay_text ?? "");
    if (!essayText.trim()) {
      throw new Error("Essay text is required.");
    }
    const options: FeedbackRequestOptions = {
      taskType: parseTaskType(body.task_type),
      question: String(body.question ?? ""),
      locale: parseLocale(body.locale),
    };
    res.status(200).json(await runFeedbackGraph(essayText, options));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    sendError(res, 400, message);
  }
};

export const handleGradeSession: ApiHandler = async (req, res) => {
  if (req.method !== "POST") {
    sendError(res, 405, "Method not allowed.");
    return;
  }

  try {
    const body = readJsonBody(req.body);
    const essayText = String(body.essay_text ?? "");
    if (!essayText.trim()) {
      throw new Error("Essay text is required.");
    }
    const options: FeedbackRequestOptions = {
      taskType: parseTaskType(body.task_type),
      question: String(body.question ?? ""),
      locale: parseLocale(body.locale),
    };
    const session = await createGradingSession(essayText, options);
    res.status(200).json(session);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create session.";
    sendError(res, 400, message);
  }
};

export const handleGradeStep: ApiHandler = async (req, res) => {
  if (req.method !== "POST") {
    sendError(res, 405, "Method not allowed.");
    return;
  }

  try {
    const body = readJsonBody(req.body);
    const sessionId = String(body.session_id ?? "");
    const step = String(body.step ?? "") as GradingStep;
    if (!sessionId) {
      throw new Error("session_id is required.");
    }
    if (!GRADING_STEPS.includes(step)) {
      throw new Error(`Invalid step: ${step}`);
    }
    res.status(200).json(await runGradingSessionStep(sessionId, step));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run step.";
    sendError(res, 400, message);
  }
};

export const handleGradeFinalize: ApiHandler = async (req, res) => {
  if (req.method !== "POST") {
    sendError(res, 405, "Method not allowed.");
    return;
  }

  try {
    const body = readJsonBody(req.body);
    const sessionId = String(body.session_id ?? "");
    if (!sessionId) {
      throw new Error("session_id is required.");
    }
    res.status(200).json(await finalizeGradingSession(sessionId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to finalize.";
    sendError(res, 400, message);
  }
};
