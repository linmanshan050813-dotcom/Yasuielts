import { z } from "zod";
import type {
  Annotation,
  FeedbackRequestOptions,
  FeedbackResponse,
  IeltsCriterion,
  IeltsScores,
  Paragraph,
  Severity,
} from "../core/schema.js";
import { formatParagraphsForPrompt, parseEssay } from "../core/essay-parser.js";
import {
  callOpenAiForFeedback,
  callOpenAiForJson,
  annotationJsonSchema,
  ieltsScoresJsonSchema,
} from "./openai-client.js";
import { buildPromptMessages, buildScoringMessages, type PromptMessage } from "./prompt-builder.js";
import { assignAnnotationPriority, sortAnnotationsByPriority } from "../core/priority-evaluator.js";
import { validateFeedbackResponse } from "./schema-validator.js";

const CRITERION_PROMPTS: Record<IeltsCriterion, string> = {
  task_response:
    "Focus only on Task Response. Evaluate whether all parts of the question are addressed, position clarity, and idea development. Every annotation MUST have criterion set to task_response.",
  coherence_cohesion:
    "Focus only on Coherence & Cohesion. Evaluate logical progression, paragraphing, and cohesive devices. Every annotation MUST have criterion set to coherence_cohesion.",
  lexical_resource:
    "Focus only on Lexical Resource. Evaluate vocabulary range, precision, collocation, and spelling. Every annotation MUST have criterion set to lexical_resource.",
  grammar:
    "Focus only on Grammatical Range & Accuracy. Evaluate sentence variety and error impact on communication. Every annotation MUST have criterion set to grammar.",
};

const LOCALE_OVERRIDE = `
STUDENT-FACING LANGUAGE:
- Follow the LOCALE in the user message (zh = Simplified Chinese, en = English).
- issue_type MUST start with Strength/Good, Weak/Issue, or Adequate/Improve.
- feedback is 1-2 short sentences; strengths use revision_guidance: Keep this pattern in your revision.
- citations MUST be empty array [].

ANNOTATION ANCHORING (MANDATORY):
- evidence.quote MUST be copied verbatim from the paragraph text.
- char_start and char_end MUST match that exact quote (0-based, end exclusive).
- Return exactly 1-2 annotations for this criterion.
`;

const DEFAULT_ANNOTATION_COUNT = 5;
const MIN_ANNOTATION_COUNT = 4;
const ANNOTATIONS_PER_CRITERION = 2;

const SEVERITY_RANK: Record<Severity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export const GRADING_CRITERION_STEPS: IeltsCriterion[] = [
  "task_response",
  "coherence_cohesion",
  "lexical_resource",
  "grammar",
];

export type GradingStep = IeltsCriterion | "score";

export const GRADING_STEPS: GradingStep[] = [...GRADING_CRITERION_STEPS, "score"];

const dimensionFeedbackJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "annotations",
    "summary",
    "priority_issues",
    "next_steps",
    "reflection_questions",
  ],
  properties: {
    annotations: { type: "array", items: annotationJsonSchema },
    summary: { type: "string" },
    priority_issues: { type: "array", items: { type: "string" } },
    next_steps: { type: "array", items: { type: "string" } },
    reflection_questions: { type: "array", items: { type: "string" } },
  },
} as const;

const citationSchema = z.object({
  type: z.enum(["rubric"]),
  label: z.string(),
  url: z.string().nullable(),
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
  evidence: z.object({
    quote: z.string(),
    reason: z.string(),
  }),
  feedback: z.string(),
  revision_guidance: z.string(),
  citations: z.array(citationSchema),
});

const dimensionFeedbackSchema = z.object({
  annotations: z.array(annotationSchema),
  summary: z.string(),
  priority_issues: z.array(z.string()),
  next_steps: z.array(z.string()),
  reflection_questions: z.array(z.string()),
});

export type DimensionFeedback = z.infer<typeof dimensionFeedbackSchema>;

const scoresSchema = z.object({
  criteria: z.object({
    task_response: z.object({ band: z.number() }),
    coherence_cohesion: z.object({ band: z.number() }),
    lexical_resource: z.object({ band: z.number() }),
    grammar: z.object({ band: z.number() }),
  }),
  overall_band: z.number(),
  mechanical_caps: z.array(z.string()).optional(),
});

export interface PipelineState {
  essayText: string;
  taskType: string;
  question: string;
  locale: string;
  paragraphs: Paragraph[];
  messages: PromptMessage[];
  taskResponseFeedback: DimensionFeedback | null;
  coherenceFeedback: DimensionFeedback | null;
  lexicalFeedback: DimensionFeedback | null;
  grammarFeedback: DimensionFeedback | null;
  scores: IeltsScores | null;
  feedback: FeedbackResponse | null;
  validationError: string | null;
  repairAttempts: number;
}

export function createEmptyPipelineState(
  essayText: string,
  options: FeedbackRequestOptions,
): PipelineState {
  return {
    essayText,
    taskType: options.taskType,
    question: options.question,
    locale: options.locale ?? "zh",
    paragraphs: [],
    messages: [],
    taskResponseFeedback: null,
    coherenceFeedback: null,
    lexicalFeedback: null,
    grammarFeedback: null,
    scores: null,
    feedback: null,
    validationError: null,
    repairAttempts: 0,
  };
}

export async function preparePipelineContext(state: PipelineState): Promise<PipelineState> {
  const paragraphs = parseEssay(state.essayText);
  const options = {
    taskType: state.taskType as FeedbackRequestOptions["taskType"],
    question: state.question,
    locale: (state.locale === "en" ? "en" : "zh") as FeedbackRequestOptions["locale"],
  };
  const messages = await buildPromptMessages(paragraphs, options);
  return { ...state, paragraphs, messages };
}

function buildCriterionMessages(
  baseMessages: PromptMessage[],
  criterion: IeltsCriterion,
): PromptMessage[] {
  const [systemMessage, userMessage] = baseMessages;
  if (!systemMessage || !userMessage) {
    throw new Error("Feedback pipeline was invoked without prepared prompt messages.");
  }

  return [
    {
      role: "system",
      content: `${systemMessage.content}

LANGGRAPH CRITERION NODE OVERRIDE:
${CRITERION_PROMPTS[criterion]}
${LOCALE_OVERRIDE}
Return ONLY the dimension feedback object:
- annotations, summary, priority_issues, next_steps, reflection_questions
Return exactly 1-2 annotations for criterion ${criterion}.`,
    },
    { role: "user", content: userMessage.content },
  ];
}

export async function generateCriterionFeedbackForPipeline(
  state: PipelineState,
  criterion: IeltsCriterion,
): Promise<DimensionFeedback> {
  const raw = await callOpenAiForJson(
    buildCriterionMessages(state.messages, criterion),
    `${criterion}_feedback`,
    dimensionFeedbackJsonSchema,
  );
  const parsed = dimensionFeedbackSchema.parse(raw);

  return {
    ...parsed,
    annotations: parsed.annotations
      .filter((item) => item.criterion === criterion)
      .slice(0, ANNOTATIONS_PER_CRITERION) as Annotation[],
  };
}

function criterionFeedbackKey(criterion: IeltsCriterion): keyof PipelineState {
  const map: Record<IeltsCriterion, keyof PipelineState> = {
    task_response: "taskResponseFeedback",
    coherence_cohesion: "coherenceFeedback",
    lexical_resource: "lexicalFeedback",
    grammar: "grammarFeedback",
  };
  return map[criterion];
}

export async function runPipelineStep(
  state: PipelineState,
  step: GradingStep,
): Promise<PipelineState> {
  if (step === "score") {
    const options = {
      taskType: state.taskType as FeedbackRequestOptions["taskType"],
      question: state.question,
      locale: (state.locale === "en" ? "en" : "zh") as FeedbackRequestOptions["locale"],
    };
    const messages = await buildScoringMessages(state.essayText, options);
    const raw = await callOpenAiForJson(messages, "ielts_scores", ieltsScoresJsonSchema);
    const parsed = scoresSchema.parse(raw);
    return { ...state, scores: parsed as IeltsScores };
  }

  const feedback = await generateCriterionFeedbackForPipeline(state, step);
  return { ...state, [criterionFeedbackKey(step)]: feedback };
}

function requireDimensionFeedback(
  value: DimensionFeedback | null,
  label: IeltsCriterion,
): DimensionFeedback {
  if (!value) {
    throw new Error(`Missing ${label} feedback.`);
  }
  return value;
}

function takeNonEmpty(items: string[], limit: number): string[] {
  return items.map((item) => item.trim()).filter(Boolean).slice(0, limit);
}

function selectAnnotations(all: Annotation[]): Annotation[] {
  if (all.length <= DEFAULT_ANNOTATION_COUNT) {
    return all;
  }
  const picked: Annotation[] = [];
  const used = new Set<Annotation>();

  for (const criterion of GRADING_CRITERION_STEPS) {
    const candidate = all.find(
      (item) => item.criterion === criterion && !used.has(item),
    );
    if (candidate) {
      picked.push(candidate);
      used.add(candidate);
    }
  }

  const remaining = [...all]
    .filter((item) => !used.has(item))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  for (const item of remaining) {
    if (picked.length >= DEFAULT_ANNOTATION_COUNT) break;
    picked.push(item);
    used.add(item);
  }

  return picked.slice(0, DEFAULT_ANNOTATION_COUNT);
}

export function mergePipelineFeedback(state: PipelineState): PipelineState {
  const tr = requireDimensionFeedback(state.taskResponseFeedback, "task_response");
  const cc = requireDimensionFeedback(state.coherenceFeedback, "coherence_cohesion");
  const lr = requireDimensionFeedback(state.lexicalFeedback, "lexical_resource");
  const gra = requireDimensionFeedback(state.grammarFeedback, "grammar");
  const dimensionFeedback = [tr, cc, lr, gra];

  const candidateAnnotations = dimensionFeedback
    .flatMap((item) => item.annotations)
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  const selected = selectAnnotations(candidateAnnotations);
  const annotations =
    selected.length >= MIN_ANNOTATION_COUNT
      ? selected
      : candidateAnnotations.slice(0, DEFAULT_ANNOTATION_COUNT);

  const normalizedAnnotations = annotations.map((item, index) => ({
    ...item,
    id: index + 1,
    citations: [] as Annotation["citations"],
  }));

  const locale = state.locale === "en" ? "en" : "zh";
  const placeholderScores: IeltsScores = {
    criteria: {
      task_response: { band: 0 },
      coherence_cohesion: { band: 0 },
      lexical_resource: { band: 0 },
      grammar: { band: 0 },
    },
    overall_band: 0,
  };

  const feedback: FeedbackResponse = {
    submission_id: null,
    created_at: null,
    task_type: state.taskType as FeedbackRequestOptions["taskType"],
    question: state.question,
    locale,
    essay: { paragraphs: state.paragraphs },
    annotations: normalizedAnnotations,
    overall_feedback: {
      summary: dimensionFeedback.map((item) => item.summary).join(" "),
      priority_issues: takeNonEmpty(
        dimensionFeedback.flatMap((item) => item.priority_issues),
        4,
      ),
      next_steps: takeNonEmpty(
        dimensionFeedback.flatMap((item) => item.next_steps),
        4,
      ),
      reflection_questions: takeNonEmpty(
        dimensionFeedback.flatMap((item) => item.reflection_questions),
        4,
      ),
    },
    scores: placeholderScores,
  };

  return { ...state, feedback };
}

export function validatePipelineFeedback(state: PipelineState): PipelineState {
  if (!state.feedback) {
    throw new Error("No merged feedback available for validation.");
  }

  try {
    return {
      ...state,
      feedback: validateFeedbackResponse(state.feedback, state.paragraphs),
      validationError: null,
    };
  } catch (error) {
    if (state.repairAttempts > 0) {
      throw error;
    }
    const message =
      error instanceof Error ? error.message : "Feedback validation failed.";
    return { ...state, validationError: message };
  }
}

export async function repairPipelineFeedback(state: PipelineState): Promise<PipelineState> {
  if (!state.feedback || !state.validationError) {
    return { ...state, validationError: null };
  }

  const raw = await callOpenAiForFeedback([
    {
      role: "system",
      content:
        "You repair invalid IELTS feedback JSON. Return only valid JSON matching the required schema.",
    },
    {
      role: "user",
      content: `Validation error:
${state.validationError}

Paragraphs:
${formatParagraphsForPrompt(state.paragraphs)}

Invalid feedback JSON:
${JSON.stringify(state.feedback)}`,
    },
  ]);

  return {
    ...state,
    feedback: raw as FeedbackResponse,
    validationError: null,
    repairAttempts: state.repairAttempts + 1,
  };
}

export function attachPipelineScores(state: PipelineState): PipelineState {
  if (!state.feedback || !state.scores) {
    throw new Error("Missing feedback or scores for final assembly.");
  }

  const evaluated = sortAnnotationsByPriority(
    assignAnnotationPriority(state.feedback.annotations, state.scores),
  ).map((item, index) => ({ ...item, id: index + 1 }));

  return {
    ...state,
    feedback: {
      ...state.feedback,
      scores: state.scores,
      annotations: evaluated,
      created_at: new Date().toISOString(),
    },
  };
}

export function nextStepAfter(completed: GradingStep[]): GradingStep | null {
  for (const step of GRADING_STEPS) {
    if (!completed.includes(step)) {
      return step;
    }
  }
  return null;
}

export function uiStepIndexForGradingStep(step: GradingStep): number {
  if (step === "score") return 3;
  return GRADING_CRITERION_STEPS.indexOf(step);
}
