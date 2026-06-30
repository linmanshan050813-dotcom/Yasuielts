import { callLlmForVisionText } from "./llm-client.js";

const QUESTION_VISION_PROMPT = `You analyze IELTS writing task prompts and visual materials (charts, graphs, tables, maps, diagrams).

Describe everything an examiner needs to grade Task Response:
1. Restate the full written question/prompt if visible.
2. Identify the visual type (line chart, bar chart, pie chart, table, map, process diagram, mixed, etc.).
3. Summarize key data, trends, comparisons, time ranges, units, and categories.
4. Note any instructions such as "summarise the information", "select and report the main features", or "make comparisons where relevant".

Write in clear English suitable for an IELTS grading system. Use paragraphs, not JSON.
If text is unreadable, say what is uncertain instead of inventing numbers.`;

function toDataUrl(buffer: Buffer, mimetype: string): string {
  const base64 = buffer.toString("base64");
  return `data:${mimetype};base64,${base64}`;
}

export async function extractQuestionFromImage(
  buffer: Buffer,
  mimetype: string,
): Promise<string> {
  return callLlmForVisionText([
    {
      role: "user",
      content: [
        { type: "text", text: QUESTION_VISION_PROMPT },
        {
          type: "image_url",
          image_url: { url: toDataUrl(buffer, mimetype), detail: "high" },
        },
      ],
    },
  ]);
}
