import type { Paragraph } from "./schema.js";

export function parseEssay(essayText: string): Paragraph[] {
  const normalized = essayText.trim();
  if (!normalized) {
    throw new Error("essay_text 不能为空。");
  }

  return normalized
    .split(/\n\s*\n/g)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((text, index) => ({
      id: `p${index + 1}`,
      text,
    }));
}

export function formatParagraphsForPrompt(paragraphs: Paragraph[]): string {
  return paragraphs
    .map(
      (item, index) =>
        `${item.id} (char range 0-${item.text.length}): ${item.text}`,
    )
    .join("\n\n");
}
