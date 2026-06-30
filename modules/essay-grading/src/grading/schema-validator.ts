import { z } from "zod";
import { normalizeAnnotationOffsets } from "../core/annotation-normalizer.js";
import type { FeedbackResponse, Paragraph } from "../core/schema.js";

const citationSchema = z.object({
  type: z.enum(["rubric"]),
  label: z.string(),
  url: z.string().nullable(),
});

const evidenceSchema = z.object({
  quote: z.string(),
  reason: z.string(),
});

const annotationSchema = z.object({
  id: z.number().int(),
  paragraph_id: z.string(),
  char_start: z.number().int().nonnegative(),
  char_end: z.number().int().nonnegative(),
  criterion: z.enum([
    "task_response",
    "coherence_cohesion",
    "lexical_resource",
    "grammar",
  ]),
  level: z.enum(["text", "section", "clause_word"]),
  issue_type: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  evidence: evidenceSchema,
  feedback: z.string(),
  revision_guidance: z.string(),
  citations: z.array(citationSchema),
  priority_rank: z.number().int().optional(),
});

const criterionScoreSchema = z.object({
  band: z.number(),
  evidence: z.array(z.string()).optional(),
  limiting_factor: z.string().optional(),
});

const scoresSchema = z.object({
  criteria: z.object({
    task_response: criterionScoreSchema,
    coherence_cohesion: criterionScoreSchema,
    lexical_resource: criterionScoreSchema,
    grammar: criterionScoreSchema,
  }),
  overall_band: z.number(),
  mechanical_caps: z.array(z.string()).optional(),
});

const overallFeedbackSchema = z.object({
  summary: z.string(),
  priority_issues: z.array(z.string()),
  next_steps: z.array(z.string()),
  reflection_questions: z.array(z.string()),
});

const feedbackSchema = z.object({
  submission_id: z.string().nullable(),
  created_at: z.string().nullable(),
  task_type: z.string(),
  question: z.string(),
  locale: z.enum(["zh", "en"]),
  essay: z.object({
    paragraphs: z.array(
      z.object({
        id: z.string(),
        text: z.string(),
      }),
    ),
  }),
  annotations: z.array(annotationSchema),
  overall_feedback: overallFeedbackSchema,
  scores: scoresSchema,
});

function normalizeFeedback(feedback: FeedbackResponse, paragraphs: Paragraph[]): FeedbackResponse {
  const paragraphById = new Map(
    paragraphs.map((item) => [item.id.toLowerCase(), item.text] as const),
  );

  const safeAnnotations = normalizeAnnotationOffsets(
    feedback.annotations.map((item) => ({
      ...item,
      paragraph_id: item.paragraph_id.toLowerCase(),
    })),
    paragraphById,
  );

  return {
    ...feedback,
    submission_id: null,
    created_at: feedback.created_at ?? new Date().toISOString(),
    essay: { paragraphs },
    annotations: safeAnnotations,
  };
}

export function validateFeedbackResponse(raw: unknown, paragraphs: Paragraph[]): FeedbackResponse {
  const parsed = feedbackSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Feedback schema validation failed: ${parsed.error.message}`);
  }
  return normalizeFeedback(parsed.data as FeedbackResponse, paragraphs);
}
