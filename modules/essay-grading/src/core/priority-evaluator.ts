import type { Annotation, IeltsScores, Severity } from "./schema.js";

const SEVERITY_RANK: Record<Severity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function assignAnnotationPriority(
  annotations: Annotation[],
  scores: IeltsScores,
): Annotation[] {
  const bandByCriterion = scores.criteria;
  return [...annotations]
    .map((item) => {
      const band = bandByCriterion[item.criterion]?.band ?? 6;
      const priority_rank = band * 10 + SEVERITY_RANK[item.severity];
      return { ...item, priority_rank };
    })
    .sort((a, b) => (a.priority_rank ?? 99) - (b.priority_rank ?? 99));
}

export function sortAnnotationsByPriority(annotations: Annotation[]): Annotation[] {
  return [...annotations].sort(
    (a, b) => (a.priority_rank ?? 99) - (b.priority_rank ?? 99),
  );
}
