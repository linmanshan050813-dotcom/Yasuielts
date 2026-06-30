import type { IeltsCriterion, Locale } from "./schema.js";

export const STORAGE_KEYS = {
  submittedEssayText: "yasuSubmittedEssayText",
  latestFeedback: "yasuLatestFeedback",
  locale: "yasu-locale",
  session: "yasuGradingSession",
} as const;

export const CRITERION_LABELS: Record<IeltsCriterion, { en: string; zh: string; abbr: string }> = {
  task_response: {
    en: "Task Response",
    zh: "写作任务回应",
    abbr: "TR",
  },
  coherence_cohesion: {
    en: "Coherence & Cohesion",
    zh: "连贯与衔接",
    abbr: "CC",
  },
  lexical_resource: {
    en: "Lexical Resource",
    zh: "词汇丰富程度",
    abbr: "LR",
  },
  grammar: {
    en: "Grammatical Range & Accuracy",
    zh: "语法多样性及准确性",
    abbr: "GRA",
  },
};

export function getCriterionLabel(criterion: IeltsCriterion, locale: Locale): string {
  const labels = CRITERION_LABELS[criterion];
  return locale === "zh" ? labels.zh : labels.en;
}

export const LEVEL_LABELS: Record<Locale, Record<string, string>> = {
  zh: {
    text: "全文层面",
    section: "段落层面",
    clause_word: "句子与词汇层面",
    all: "全部",
  },
  en: {
    text: "Text Level",
    section: "Section Level",
    clause_word: "Clause & Word Level",
    all: "All",
  },
};

export const SEVERITY_LABELS: Record<Locale, Record<string, string>> = {
  zh: {
    low: "低优先级",
    medium: "中优先级",
    high: "高优先级",
  },
  en: {
    low: "Low Priority",
    medium: "Medium Priority",
    high: "High Priority",
  },
};

export const IELTS_CRITERIA: IeltsCriterion[] = [
  "task_response",
  "coherence_cohesion",
  "lexical_resource",
  "grammar",
];

export function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

export function computeDualTaskOverall(task1Band: number, task2Band: number): number {
  return roundToHalf((task1Band + task2Band * 2) / 3);
}
