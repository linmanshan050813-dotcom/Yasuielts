import compression from "compression";
import dotenv from "dotenv";
import express, { type Express, type Request, type Response } from "express";
import multer from "multer";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  handleEssayFeedback,
  handleGradeFinalize,
  handleGradeSession,
  handleGradeStep,
  type ApiHandler,
} from "./handlers.js";
import { logLlmStartup } from "../grading/llm-client.js";

dotenv.config();

const gradingMount = "/grading";

function wrapHandler(handler: ApiHandler) {
  return async (req: Request, res: Response): Promise<void> => {
    await handler(req, res);
  };
}

export function createApp(): Express {
  const isProd = process.env.NODE_ENV === "production";
  const publicDir = resolve(process.cwd(), "dist/public");
  const devWebDir = resolve(process.cwd(), "src/web");
  const webDir = isProd && existsSync(publicDir) ? publicDir : devWebDir;
  const portalDir = resolve(process.cwd(), "../../apps/website/public");
  const hasPortal = existsSync(resolve(portalDir, "index.html"));
  const mockDir = resolve(process.cwd(), "mock");

  const app = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 4 * 1024 * 1024 },
  });

  app.use(compression());
  app.use(express.json({ limit: "2mb" }));

  app.use("/mock", express.static(mockDir));

  app.use(
    gradingMount,
    express.static(webDir, {
      maxAge: isProd ? "1y" : 0,
      immutable: isProd,
      index: false,
    }),
  );

  app.get([gradingMount, `${gradingMount}/`], (_req, res) => {
    res.sendFile(resolve(webDir, "index.html"));
  });

  if (hasPortal) {
    app.use(express.static(portalDir, { maxAge: isProd ? "1y" : 0, immutable: isProd }));
  }

  app.post("/api/extract-text", upload.single("file"), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded." });
      return;
    }
    const { extractTextFromBuffer } = await import("./file-extractor.js");
    const purposeRaw = String((req.body as { purpose?: string })?.purpose ?? "essay");
    const purpose = purposeRaw === "question" ? "question" : "essay";
    try {
      const text = await extractTextFromBuffer(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname,
        purpose,
      );
      if (!text) {
        throw new Error("File parsed but no text was extracted.");
      }
      res.status(200).json({ essay_text: text, filename: req.file.originalname, purpose });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to extract text.";
      res.status(400).json({ error: message });
    }
  });

  app.post("/api/essay-feedback", wrapHandler(handleEssayFeedback));
  app.post("/api/grade/session", wrapHandler(handleGradeSession));
  app.post("/api/grade/step", wrapHandler(handleGradeStep));
  app.post("/api/grade/finalize", wrapHandler(handleGradeFinalize));

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

  return app;
}

const port = Number(process.env.PORT ?? 3101);
const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const app = createApp();
  app.listen(port, "0.0.0.0", () => {
    logLlmStartup();
    const hasPortal = existsSync(resolve(process.cwd(), "../../apps/website/public/index.html"));
    const mode = process.env.NODE_ENV === "production" ? "production" : "development";
    const entry = hasPortal ? `http://localhost:${port}/` : `http://localhost:${port}${gradingMount}`;
    console.log(`YASU IELTS server running on port ${port} (${mode})`);
    console.log(`Portal: ${hasPortal ? entry : "(not found — run node scripts/prepare-portal.mjs)"}`);
    console.log(`Grading: http://localhost:${port}${gradingMount}`);
  });
}
