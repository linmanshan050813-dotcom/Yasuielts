import { CRITERION_LABELS, getCriterionLabel, LEVEL_LABELS, SEVERITY_LABELS } from "../../core/constants.js";
import type { Locale } from "../../core/schema.js";
import type { Annotation, IeltsScores, OverallFeedback } from "../../core/schema.js";
import { getLocale, t } from "../i18n/index.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function criterionLabel(criterion: Annotation["criterion"], locale: Locale): string {
  return getCriterionLabel(criterion, locale);
}

export function renderBandPanel(scores: IeltsScores, locale: Locale): string {
  const criteria = Object.entries(scores.criteria) as [
    keyof IeltsScores["criteria"],
    { band: number },
  ][];

  const bars = criteria
    .map(([key, value]) => {
      const name = getCriterionLabel(key, locale);
      const pct = Math.round((value.band / 9) * 100);
      return `
        <div class="band-row">
          <div class="band-row__head">
            <span class="band-row__name">${escapeHtml(name)}</span>
            <span class="band-row__score">${value.band.toFixed(1)}</span>
          </div>
          <div class="band-row__track"><div class="band-row__fill" style="width:${pct}%"></div></div>
        </div>`;
    })
    .join("");

  return `
    <div class="band-panel">
      <div class="band-panel__overall">
        <span class="band-panel__label">${escapeHtml(t("overallBand"))}</span>
        <span class="band-panel__value">${scores.overall_band.toFixed(1)}</span>
      </div>
      ${bars}
    </div>`;
}

export function renderSidebarCards(annotations: Annotation[]): string {
  const locale = getLocale();
  if (annotations.length === 0) {
    return `<div class="feedback-card feedback-card--empty"><div class="feedback-card__text">${escapeHtml(t("noAnnotations"))}</div></div>`;
  }

  return annotations
    .map((item) => {
      const critLabel = criterionLabel(item.criterion, locale);
      const levelLabel = LEVEL_LABELS[locale][item.level] ?? item.level;
      const severityLabel = SEVERITY_LABELS[locale][item.severity] ?? item.severity;

      return `
<article class="feedback-card feedback-card--severity-${item.severity}" data-id="${item.id}" data-criterion="${item.criterion}" data-level="${item.level}">
  <header class="feedback-card__header">
    <span class="feedback-card__pin pin-${item.severity}">${item.id}</span>
    <span class="feedback-card__tag tag-criterion tag-${item.criterion}">${escapeHtml(critLabel)}</span>
    <span class="feedback-card__tag tag-level">${escapeHtml(levelLabel)}</span>
    <span class="feedback-card__tag tag-severity">${escapeHtml(severityLabel)}</span>
  </header>
  <div class="feedback-card__issue">${escapeHtml(item.issue_type)}</div>
  ${
    item.evidence?.quote
      ? `<blockquote class="feedback-card__quote">${escapeHtml(item.evidence.quote)}</blockquote>`
      : ""
  }
  ${
    item.evidence?.reason
      ? `<p class="feedback-card__reason">${escapeHtml(item.evidence.reason)}</p>`
      : ""
  }
  <p class="feedback-card__text">${escapeHtml(item.feedback)}</p>
  <p class="feedback-card__guidance">${escapeHtml(item.revision_guidance)}</p>
</article>`;
    })
    .join("");
}

function renderList(title: string, items: string[]): string {
  if (items.length === 0) return "";
  const lis = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  return `<section class="summary-section"><h4>${escapeHtml(title)}</h4><ul>${lis}</ul></section>`;
}

export function renderSummary(overall: OverallFeedback): string {
  const summary = overall.summary
    ? `<section class="summary-section"><h4>${escapeHtml(t("summaryOverall"))}</h4><p>${escapeHtml(overall.summary)}</p></section>`
    : "";

  return `
    <div class="summary-card">
      ${summary}
      ${renderList(t("priorityIssues"), overall.priority_issues)}
      ${renderList(t("nextSteps"), overall.next_steps)}
      ${renderList(t("reflectionQuestions"), overall.reflection_questions)}
    </div>
  `;
}

export function getLowestCriteriaTips(
  scores: IeltsScores,
  locale: Locale,
): { criterion: string; band: number; tip: string }[] {
  const tips: Record<string, { zh: string; en: string }> = {
    task_response: {
      zh: "确保回应题目所有部分，立场清晰，并用具体例子展开论点。",
      en: "Address all parts of the question with a clear position and developed support.",
    },
    coherence_cohesion: {
      zh: "加强段落主题句与逻辑衔接，避免堆砌连接词。",
      en: "Strengthen paragraph topics and logical links; avoid mechanical connectors.",
    },
    lexical_resource: {
      zh: "在准确前提下尝试更精准、多样的词汇与搭配。",
      en: "Use more precise and varied vocabulary with accurate collocation.",
    },
    grammar: {
      zh: "增加复杂句型练习，并校对主谓一致、时态与冠词。",
      en: "Practise complex sentences and proofread agreement, tense, and articles.",
    },
  };

  const ranked = Object.entries(scores.criteria)
    .map(([key, value]) => ({
      key,
      band: value.band,
      tip: tips[key]?.[locale] ?? "",
    }))
    .sort((a, b) => a.band - b.band);

  return ranked.slice(0, 2).map((item) => ({
    criterion: getCriterionLabel(item.key as keyof typeof CRITERION_LABELS, locale),
    band: item.band,
    tip: item.tip,
  }));
}
