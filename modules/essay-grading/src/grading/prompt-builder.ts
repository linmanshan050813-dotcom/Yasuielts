import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Locale, Paragraph, TaskType } from "../core/schema.js";
import { formatParagraphsForPrompt } from "../core/essay-parser.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const annotationPromptPath = resolve(moduleDir, "prompts/annotation.md");
const scoringPromptPath = resolve(moduleDir, "prompts/scoring.md");

export interface PromptMessage {
  role: "system" | "user";
  content: string;
}

export interface BuildPromptOptions {
  taskType: TaskType;
  question: string;
  locale?: Locale;
}

function localeInstruction(locale: Locale): string {
  return locale === "zh"
    ? "LOCALE: zh — Write all student-facing feedback in Simplified Chinese."
    : "LOCALE: en — Write all student-facing feedback in English.";
}

export async function buildPromptMessages(
  paragraphs: Paragraph[],
  options: BuildPromptOptions,
): Promise<PromptMessage[]> {
  const systemPrompt = await readFile(annotationPromptPath, "utf-8");
  const locale = options.locale ?? "zh";
  const essayWithParagraphIds = formatParagraphsForPrompt(paragraphs);
  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `TASK_TYPE: ${options.taskType}
QUESTION: ${options.question}
${localeInstruction(locale)}

ESSAY:
${essayWithParagraphIds}`,
    },
  ];
}

export async function buildScoringMessages(
  essayText: string,
  options: BuildPromptOptions,
): Promise<PromptMessage[]> {
  const template = await readFile(scoringPromptPath, "utf-8");
  const content = template
    .replace(/\{TASK_TYPE\}/g, options.taskType)
    .replace(/\{QUESTION\}/g, options.question)
    .replace(/\{ESSAY\}/g, essayText);
  return [{ role: "user", content }];
}
