import type { PromptMessage } from "./prompt-builder.js";
import { callLlmForJson } from "./llm-client.js";

type JsonSchema = Record<string, unknown>;

export const citationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["type", "label", "url"],
  properties: {
    type: { enum: ["rubric"] },
    label: { type: "string" },
    url: { type: ["string", "null"] },
  },
} as const;

export const evidenceJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["quote", "reason"],
  properties: {
    quote: { type: "string" },
    reason: { type: "string" },
  },
} as const;

export const annotationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "paragraph_id",
    "char_start",
    "char_end",
    "criterion",
    "level",
    "issue_type",
    "severity",
    "evidence",
    "feedback",
    "revision_guidance",
    "citations",
  ],
  properties: {
    id: { type: "integer" },
    paragraph_id: { type: "string" },
    char_start: { type: "integer", minimum: 0 },
    char_end: { type: "integer", minimum: 0 },
    criterion: {
      enum: ["task_response", "coherence_cohesion", "lexical_resource", "grammar"],
    },
    level: { enum: ["text", "section", "clause_word"] },
    issue_type: { type: "string" },
    severity: { enum: ["low", "medium", "high"] },
    evidence: evidenceJsonSchema,
    feedback: { type: "string" },
    revision_guidance: { type: "string" },
    citations: { type: "array", items: citationJsonSchema },
  },
} as const;

export const overallFeedbackJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "priority_issues", "next_steps", "reflection_questions"],
  properties: {
    summary: { type: "string" },
    priority_issues: { type: "array", items: { type: "string" } },
    next_steps: { type: "array", items: { type: "string" } },
    reflection_questions: { type: "array", items: { type: "string" } },
  },
} as const;

export const criterionScoreJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["band", "evidence", "limiting_factor"],
  properties: {
    band: { type: "number" },
    evidence: { type: "array", items: { type: "string" } },
    limiting_factor: { type: ["string", "null"] },
  },
} as const;

export const ieltsScoresJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["criteria", "overall_band", "mechanical_caps"],
  properties: {
    criteria: {
      type: "object",
      additionalProperties: false,
      required: ["task_response", "coherence_cohesion", "lexical_resource", "grammar"],
      properties: {
        task_response: criterionScoreJsonSchema,
        coherence_cohesion: criterionScoreJsonSchema,
        lexical_resource: criterionScoreJsonSchema,
        grammar: criterionScoreJsonSchema,
      },
    },
    overall_band: { type: "number" },
    mechanical_caps: { type: "array", items: { type: "string" } },
  },
} as const;

export const paragraphJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "text"],
  properties: {
    id: { type: "string" },
    text: { type: "string" },
  },
} as const;

export const feedbackJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "submission_id",
    "created_at",
    "task_type",
    "question",
    "locale",
    "essay",
    "annotations",
    "overall_feedback",
    "scores",
  ],
  properties: {
    submission_id: { type: ["string", "null"] },
    created_at: { type: ["string", "null"] },
    task_type: { type: "string" },
    question: { type: "string" },
    locale: { type: "string", enum: ["zh", "en"] },
    essay: {
      type: "object",
      additionalProperties: false,
      required: ["paragraphs"],
      properties: {
        paragraphs: { type: "array", items: paragraphJsonSchema },
      },
    },
    annotations: { type: "array", items: annotationJsonSchema },
    overall_feedback: overallFeedbackJsonSchema,
    scores: ieltsScoresJsonSchema,
  },
} as const;

export async function callOpenAiForJson(
  messages: PromptMessage[],
  schemaName: string,
  schema: JsonSchema,
): Promise<unknown> {
  return callLlmForJson(messages, schemaName, schema);
}

export async function callOpenAiForFeedback(messages: PromptMessage[]): Promise<unknown> {
  return callOpenAiForJson(messages, "feedback", feedbackJsonSchema);
}
