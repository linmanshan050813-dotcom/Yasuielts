import type { Annotation } from "./schema.js";

function normalizeQuotes(value: string): string {
  return value
    .replaceAll("\u2018", "'")
    .replaceAll("\u2019", "'")
    .replaceAll("\u201C", '"')
    .replaceAll("\u201D", '"')
    .replaceAll("\u2013", "-")
    .replaceAll("\u2014", "-");
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function findQuoteRange(
  paragraphText: string,
  quote: string,
  hintStart: number,
): { start: number; end: number } | null {
  const trimmedQuote = quote.trim();
  if (!trimmedQuote) {
    return null;
  }

  const text = normalizeQuotes(paragraphText);
  const normalizedQuote = normalizeQuotes(trimmedQuote);

  const matchStarts: number[] = [];
  let searchFrom = 0;
  while (searchFrom <= text.length) {
    const index = text.indexOf(normalizedQuote, searchFrom);
    if (index === -1) {
      break;
    }
    matchStarts.push(index);
    searchFrom = index + 1;
  }

  if (matchStarts.length > 0) {
    const start = matchStarts.reduce((best, current) =>
      Math.abs(current - hintStart) < Math.abs(best - hintStart) ? current : best,
    );
    return { start, end: start + normalizedQuote.length };
  }

  const whitespacePattern = normalizedQuote
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  const regex = new RegExp(whitespacePattern);
  const match = regex.exec(text);
  if (match && match.index !== undefined) {
    return { start: match.index, end: match.index + match[0].length };
  }

  return null;
}


export function normalizeAnnotationOffsets(
  annotations: Annotation[],
  paragraphTextById: Map<string, string>,
): Annotation[] {
  const accepted: Annotation[] = [];

  for (const item of annotations) {
    const paragraphId = item.paragraph_id.toLowerCase();
    const text = paragraphTextById.get(paragraphId);
    if (!text) {
      console.warn(`Drop annotation ${item.id}: paragraph ${paragraphId} not found`);
      continue;
    }

    const quote = item.evidence?.quote?.trim() ?? "";
    const located = quote
      ? findQuoteRange(text, quote, item.char_start)
      : null;

    let start = located?.start ?? item.char_start;
    let end = located?.end ?? item.char_end;

    if (!located && quote) {
      console.warn(
        `Drop annotation ${item.id}: evidence.quote not found in ${paragraphId}`,
      );
      continue;
    }

    start = clamp(start, 0, text.length);
    end = clamp(end, start + 1, text.length);

    const actualQuote = text.slice(start, end);
    accepted.push({
      ...item,
      paragraph_id: paragraphId,
      char_start: start,
      char_end: end,
      evidence: {
        ...item.evidence,
        quote: actualQuote,
      },
    });
  }

  return accepted;
}
