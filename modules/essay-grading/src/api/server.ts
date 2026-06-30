import compression from "compression";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { FeedbackRequestOptions, Locale, TaskType } from "../core/schema.js";
import { extractTextFromBuffer } from "./file-extractor.js";
import { runFeedbackGraph } from "../grading/feedback-graph.js";
import { logLlmStartup } from "../grading/llm-client.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 3101);
const isProd = process.env.NODE_ENV === "production";
const publicDir = resolve(process.cwd(), "dist/public");
const devWebDir = resolve(process.cwd(), "src/web");
const webDir = isProd && existsSync(publicDir) ? publicDir : devWebDir;
const portalDir = resolve(process.cwd(), "../../apps/website/public");
const hasPortal = existsSync(resolve(portalDir, "index.html"));
const mockDir = resolve(process.cwd(), "mock");
const gradingMount = "/grading";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

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

app.use(compression());
app.use(express.json({ limit: "2mb" }));

if (!isProd) {
  app.use("/mock", express.static(mockDir));
}

const staticOpts = {
  maxAge: isProd ? "1y" : 0,
  immutable: isProd,
} as const;

app.use(
  gradingMount,
  express.static(webDir, {
    ...staticOpts,
    index: false,
  }),
);

app.get([gradingMount, `${gradingMount}/`], (_req, res) => {
  res.sendFile(resolve(webDir, "index.html"));
});

if (hasPortal) {
  app.use(express.static(portalDir, staticOpts));
}

app.post("/api/extract-text", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      throw new Error("No file uploaded.");
    }
    const purposeRaw = String(req.body?.purpose ?? "essay");
    const purpose = purposeRaw === "question" ? "question" : "essay";
    const text = await extractTextFromBuffer(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname,
      purpose,
    );
    if (!text) {
      throw new Error("File parsed but no text was extracted.");
    }
    res.json({ essay_text: text, filename: req.file.originalname, purpose });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to extract text.";
    res.status(400).json({ error: message });
  }
});

app.post("/api/essay-feedback", async (req, res) => {
  try {
    const essayText = String(req.body?.essay_text ?? "");
    if (!essayText.trim()) {
      throw new Error("Essay text is required.");
    }

    const options: FeedbackRequestOptions = {
      taskType: parseTaskType(req.body?.task_type),
      question: String(req.body?.question ?? ""),
      locale: parseLocale(req.body?.locale),
    };

    res.json(await runFeedbackGraph(essayText, options));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    res.status(400).json({ error: message });
  }
});

app.use((req, res) => {
  if (req.path.startsWith(gradingMount)) {
    res.sendFile(resolve(webDir, "index.html"));
    return;
  }
  if (hasPortal) {
    res.sendFile(resolve(portalDir, "index.html"));
    return;
  }
  res.redirect(gradingMount);
});

app.listen(port, "0.0.0.0", () => {
  logLlmStartup();
  const mode = isProd ? "production" : "development";
  const entry = hasPortal ? `http://localhost:${port}/` : `http://localhost:${port}${gradingMount}`;
  console.log(`YASU IELTS server running on port ${port} (${mode})`);
  console.log(`Portal: ${hasPortal ? entry : "(not found — run node scripts/prepare-portal.mjs)"}`);
  console.log(`Grading: http://localhost:${port}${gradingMount}`);
});
