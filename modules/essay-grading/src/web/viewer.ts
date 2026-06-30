import type { FeedbackResponse } from "../core/schema.js";
import { renderEssayMarkup } from "./lib/essayRenderer.js";
import {
  renderBandPanel,
  renderSidebarCards,
  renderSummary,
} from "./lib/sidebarRenderer.js";
import {
  activate,
  filterAnnotations,
  initialViewerState,
  setCriterionFilter,
  setLevelFilter,
  switchTab,
  type CriterionFilter,
  type LevelFilter,
  type FeedbackTab,
  type ViewerState,
} from "./lib/interactions.js";
import { getLocale, t } from "./i18n/index.js";
import { getCriterionLabel, IELTS_CRITERIA, LEVEL_LABELS } from "../core/constants.js";

export interface ViewerMountOptions {
  root: HTMLElement;
  feedback: FeedbackResponse;
  onBack: () => void;
  onNewSession: () => void;
}

export function mountViewer(options: ViewerMountOptions): () => void {
  const { root, feedback, onBack, onNewSession } = options;
  let state: ViewerState = { ...initialViewerState };

  root.innerHTML = `
    <div class="viewer-layout">
      <section class="pdf-panel">
        <article class="paper">
          <h2 class="essay-title">${t("viewerTitle")}</h2>
          <div class="essay-body" id="essayBody"></div>
        </article>
      </section>
      <aside class="feedback-panel">
        <div class="feedback-header">
          <h2 class="feedback-title">${t("viewerTitle")}</h2>
          <div id="viewerBandPanel"></div>
          <div class="feedback-filter-group">
            <span class="feedback-filter-label">${t("filterCriterion")}</span>
            <div class="feedback-filters" id="criterionFilters">
              <button class="dim-pill is-active" data-filter="all" type="button">${t("all")}</button>
              ${IELTS_CRITERIA.map(
                (c) =>
                  `<button class="dim-pill" data-filter="${c}" type="button">${getCriterionLabel(c, getLocale())}</button>`,
              ).join("")}
            </div>
          </div>
          <div class="feedback-filter-group">
            <span class="feedback-filter-label">${t("filterLevel")}</span>
            <div class="feedback-filters" id="levelFilters">
              <button class="dim-pill is-active" data-level="all" type="button">${t("all")}</button>
              <button class="dim-pill" data-level="text" type="button">${LEVEL_LABELS[getLocale()].text}</button>
              <button class="dim-pill" data-level="section" type="button">${LEVEL_LABELS[getLocale()].section}</button>
              <button class="dim-pill" data-level="clause_word" type="button">${LEVEL_LABELS[getLocale()].clause_word}</button>
            </div>
          </div>
          <div class="feedback-tabs" id="feedbackTabs">
            <button class="fb-tab is-active" data-tab="annotations" type="button">${t("tabAnnotations")}</button>
            <button class="fb-tab" data-tab="summary" type="button">${t("tabSummary")}</button>
          </div>
        </div>
        <div class="feedback-scroll" id="feedbackCards"></div>
        <div class="feedback-footer">
          <button class="btn btn-secondary" type="button" id="viewerBackBtn">${t("back")}</button>
          <button class="btn btn-secondary" type="button" id="viewerNewBtn">${t("newSession")}</button>
        </div>
      </aside>
    </div>`;

  const essayBody = root.querySelector<HTMLElement>("#essayBody");
  const feedbackCards = root.querySelector<HTMLElement>("#feedbackCards");
  const bandPanel = root.querySelector<HTMLElement>("#viewerBandPanel");
  const criterionFilters = root.querySelector<HTMLElement>("#criterionFilters");
  const levelFilters = root.querySelector<HTMLElement>("#levelFilters");
  const tabsRoot = root.querySelector<HTMLElement>("#feedbackTabs");

  function applyActiveState(activeId: number | null): void {
    root.querySelectorAll<HTMLElement>(".hl, .annotation-pin, .feedback-card").forEach((node) => {
      node.classList.remove("is-active");
    });
    if (activeId === null) return;
    root.querySelectorAll<HTMLElement>(`[data-id="${activeId}"]`).forEach((node) => {
      node.classList.add("is-active");
    });
    root.querySelectorAll<HTMLElement>(".hl").forEach((node) => {
      const ids = node.dataset.ids?.split(",").map((v) => Number(v)) ?? [];
      if (ids.includes(activeId)) node.classList.add("is-active");
    });
  }

  function bindCrossHighlight(): void {
    root.querySelectorAll<HTMLElement>(".hl, .annotation-pin, .feedback-card").forEach((node) => {
      node.addEventListener("click", () => {
        const id = Number(node.dataset.id);
        if (!id) return;
        state = activate(state, id);
        applyActiveState(state.activeAnnotationId);
        const card = root.querySelector<HTMLElement>(`.feedback-card[data-id="${id}"]`);
        const highlight = root.querySelector<HTMLElement>(`.hl[data-id="${id}"]`);
        if (node.classList.contains("feedback-card")) {
          highlight?.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      });
    });
  }

  function render(): void {
    const locale = getLocale();
    const filtered = filterAnnotations(feedback.annotations, state);
    if (essayBody) {
      essayBody.innerHTML = renderEssayMarkup(feedback.essay.paragraphs, filtered);
    }
    if (feedbackCards) {
      feedbackCards.innerHTML =
        state.currentTab === "annotations"
          ? renderSidebarCards(filtered)
          : renderSummary(feedback.overall_feedback);
    }
    if (bandPanel) {
      bandPanel.innerHTML = renderBandPanel(feedback.scores, locale);
    }
    tabsRoot?.querySelectorAll<HTMLElement>(".fb-tab").forEach((node) => {
      node.classList.toggle("is-active", node.dataset.tab === state.currentTab);
    });
    criterionFilters?.querySelectorAll<HTMLElement>(".dim-pill").forEach((node) => {
      node.classList.toggle("is-active", node.dataset.filter === state.criterionFilter);
    });
    levelFilters?.querySelectorAll<HTMLElement>(".dim-pill").forEach((node) => {
      node.classList.toggle("is-active", node.dataset.level === state.levelFilter);
    });
    bindCrossHighlight();
    applyActiveState(state.activeAnnotationId);
  }

  criterionFilters?.querySelectorAll<HTMLElement>(".dim-pill").forEach((node) => {
    node.addEventListener("click", () => {
      const value = node.dataset.filter as CriterionFilter | undefined;
      if (!value) return;
      state = setCriterionFilter(state, value);
      render();
    });
  });

  levelFilters?.querySelectorAll<HTMLElement>(".dim-pill").forEach((node) => {
    node.addEventListener("click", () => {
      const value = node.dataset.level as LevelFilter | undefined;
      if (!value) return;
      state = setLevelFilter(state, value);
      render();
    });
  });

  tabsRoot?.querySelectorAll<HTMLElement>(".fb-tab").forEach((node) => {
    node.addEventListener("click", () => {
      const value = node.dataset.tab as FeedbackTab | undefined;
      if (!value) return;
      state = switchTab(state, value);
      render();
    });
  });

  root.querySelector("#viewerBackBtn")?.addEventListener("click", onBack);
  root.querySelector("#viewerNewBtn")?.addEventListener("click", onNewSession);
  render();

  return () => {
    root.innerHTML = "";
  };
}
