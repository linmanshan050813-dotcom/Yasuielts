export type IeltsCriterion =
  | "task_response"
  | "coherence_cohesion"
  | "lexical_resource"
  | "grammar";

export type LinguisticLevel = "text" | "section" | "clause_word";
export type Severity = "low" | "medium" | "high";
export type TaskType = "Task 2" | "Task 1 Academic" | "Task 1 General";
export type Locale = "zh" | "en";

export interface Paragraph {
  id: string;
  text: string;
}

export interface Citation {
  type: "rubric";
  label: string;
  url: string | null;
}

export interface Evidence {
  quote: string;
  reason: string;
}

export interface Annotation {
  id: number;
  paragraph_id: string;
  char_start: number;
  char_end: number;
  criterion: IeltsCriterion;
  level: LinguisticLevel;
  issue_type: string;
  severity: Severity;
  evidence: Evidence;
  feedback: string;
  revision_guidance: string;
  citations: Citation[];
  priority_rank?: number;
}

export interface IeltsCriterionScore {
  band: number;
  evidence?: string[];
  limiting_factor?: string;
}

export interface IeltsScores {
  criteria: Record<IeltsCriterion, IeltsCriterionScore>;
  overall_band: number;
  mechanical_caps?: string[];
}

export interface OverallFeedback {
  summary: string;
  priority_issues: string[];
  next_steps: string[];
  reflection_questions: string[];
}

export interface FeedbackRequestOptions {
  taskType: TaskType;
  question: string;
  locale?: Locale;
}

export interface FeedbackResponse {
  submission_id: string | null;
  created_at: string | null;
  task_type: TaskType;
  question: string;
  locale: Locale;
  essay: { paragraphs: Paragraph[] };
  annotations: Annotation[];
  overall_feedback: OverallFeedback;
  scores: IeltsScores;
}
