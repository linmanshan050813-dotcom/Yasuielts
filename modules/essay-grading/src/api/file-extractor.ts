import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import WordExtractor from "word-extractor";
import {
  isImageFilename,
  isAllowedFilename,
  unsupportedFileMessage,
  type UploadPurpose,
} from "../core/upload-types.js";
import { extractQuestionFromImage } from "../grading/vision-extractor.js";

export type { UploadPurpose } from "../core/upload-types.js";
export {
  ESSAY_EXTENSIONS,
  QUESTION_EXTENSIONS,
  QUESTION_IMAGE_EXTENSIONS,
  acceptAttributeFor,
  allowedExtensionsFor,
  formatExtensionList,
  isAllowedFilename,
  isEssayFilename,
  isImageFilename,
  isQuestionFilename,
} from "../core/upload-types.js";

export type SupportedMime =
  | "text/plain"
  | "text/markdown"
  | "application/msword"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "application/pdf"
  | "image/jpeg"
  | "image/png"
  | "image/webp";

type FileKind = "txt" | "doc" | "docx" | "pdf" | "image";

function pickKind(mimetype: string, filename: string): FileKind {
  if (isImageFilename(filename)) {
    return "image";
  }
  const lower = filename.toLowerCase();
  if (lower.endsWith(".docx") || mimetype.includes("officedocument.wordprocessingml")) {
    return "docx";
  }
  if (lower.endsWith(".doc") || mimetype === "application/msword") {
    return "doc";
  }
  if (lower.endsWith(".pdf") || mimetype === "application/pdf") {
    return "pdf";
  }
  return "txt";
}

export async function extractTextFromBuffer(
  buffer: Buffer,
  mimetype: string,
  filename: string,
  purpose: UploadPurpose = "essay",
): Promise<string> {
  if (!isAllowedFilename(filename, purpose)) {
    throw new Error(unsupportedFileMessage(purpose));
  }

  const kind = pickKind(mimetype, filename);

  if (kind === "image") {
    if (purpose !== "question") {
      throw new Error(unsupportedFileMessage("essay"));
    }
    return normalizeText(await extractQuestionFromImage(buffer, mimetype));
  }

  if (kind === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return normalizeText(result.value);
  }

  if (kind === "doc") {
    const extractor = new WordExtractor();
    const doc = await extractor.extract(buffer);
    return normalizeText(doc.getBody());
  }

  if (kind === "pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return normalizeText(result.text);
    } finally {
      await parser.destroy();
    }
  }

  return normalizeText(buffer.toString("utf-8"));
}

function normalizeText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
