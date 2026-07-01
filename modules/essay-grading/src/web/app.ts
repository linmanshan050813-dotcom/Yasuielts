import { extractTextFromFile, submitEssay } from "./api.js";
import { STORAGE_KEYS, CRITERION_LABELS } from "../core/constants.js";
import {
  acceptAttributeFor,
  allowedExtensionsFor,
  formatExtensionList,
  isAllowedFilename,
  type UploadPurpose,
} from "../core/upload-types.js";
import {
  emitLocaleChange,
  getLocale,
  onLocaleChange,
  setLocale,
  t,
} from "./i18n/index.js";
import type { Locale } from "../core/schema.js";
import {
  createSession,
  getActiveTasks,
  getCombinedOverall,
  getTaskType,
  type GradingSession,
  type Screen,
  type TaskUploadData,
} from "./state.js";
import { getLowestCriteriaTips, renderBandPanel } from "./lib/sidebarRenderer.js";

const SAMPLE_QUESTION =
  "Some people believe that technology has made our lives more complicated. Others think it has made life easier. Discuss both views and give your own opinion.";

const SAMPLE_ESSAY = `Technology has transformed modern life in ways that are both helpful and overwhelming. On one hand, smartphones and online services allow people to communicate instantly and complete daily tasks more efficiently. For example, mobile banking saves time that would otherwise be spent visiting physical branches.

However, many argue that constant connectivity creates stress and reduces face-to-face interaction. Social media notifications and endless software updates can make people feel pressured to stay online. This may lead to poorer concentration and less meaningful relationships.

In my view, technology itself is not the main problem. The difficulty arises when people fail to manage how they use it. If individuals set clear boundaries, digital tools can simplify life rather than complicate it.

Overall, while technology brings undeniable convenience, its benefits depend on mindful usage. Governments and schools should therefore promote digital literacy so citizens can enjoy innovation without being controlled by it.`;

let session: GradingSession = createSession();
let screen: Screen = "select";
let isGrading = false;
let isRegradingLocale = false;
let viewerUnmount: (() => void) | null = null;

type StepperStep = "select" | "upload" | "grading" | "result";

const STEPPER_STEPS: { id: StepperStep; labelKey: "stepSelect" | "stepUpload" | "stepGrading" | "stepResult" }[] = [
  { id: "select", labelKey: "stepSelect" },
  { id: "upload", labelKey: "stepUpload" },
  { id: "grading", labelKey: "stepGrading" },
  { id: "result", labelKey: "stepResult" },
];

function getStepperStep(current: Screen): StepperStep {
  return current === "viewer" ? "result" : current;
}

function hasResults(session: GradingSession): boolean {
  return Boolean(session.results.task1 || session.results.task2);
}

function canNavigateToStep(
  target: StepperStep,
  current: StepperStep,
  session: GradingSession,
): boolean {
  if (isGrading) return false;
  if (target === current && screen !== "viewer") return false;
  if (target === "select") return true;
  if (target === "upload") return session.task1Selected || session.task2Selected;
  if (target === "grading") return false;
  if (target === "result") return hasResults(session);
  return false;
}

function navigateToStep(target: StepperStep): void {
  if (target === "result") {
    session.currentViewerTask = session.currentResultTask;
    screen = "viewer";
  } else {
    screen = target;
  }
  renderShell();
}

function logoSvg(size: "large" | "small"): string {
  const dim = size === "large" ? 48 : 36;
  const fontSize = size === "large" ? 14 : 11;
  return `<svg class="logo-mark" width="${dim}" height="${dim}" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect width="120" height="120" rx="26" fill="#C8102E"/>
    <text x="60" y="54" font-family="'Noto Sans SC',sans-serif" font-weight="900" font-size="34" fill="#fff" text-anchor="middle" dominant-baseline="central">雅</text>
    <text x="60" y="96" font-family="sans-serif" font-weight="800" font-size="${fontSize + 2}" letter-spacing="2" fill="#fff" text-anchor="middle">YASU</text>
  </svg>`;
}

function renderShell(): void {
  const app = document.getElementById("app");
  if (!app) return;

  const locale = getLocale();
  const currentStep = getStepperStep(screen);
  const stepIndex = STEPPER_STEPS.findIndex((s) => s.id === currentStep);

  app.innerHTML = `
    <header class="topbar">
      <div class="topbar__brand">
        ${logoSvg("small")}
        <div>
          <div class="topbar__title">${t("brand")}</div>
          <div class="topbar__sub">${t("brandSub")}</div>
        </div>
      </div>
      <nav class="stepper" aria-label="Progress">
        ${STEPPER_STEPS.map((step, i) => {
          const clickable = canNavigateToStep(step.id, currentStep, session);
          const classes = [
            "stepper__item",
            i <= stepIndex ? "is-active" : "",
            i === stepIndex ? "is-current" : "",
            clickable ? "is-clickable" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const ariaCurrent = i === stepIndex ? ' aria-current="step"' : "";
          const disabled = clickable ? "" : " disabled";
          return `<button type="button" class="${classes}" data-step="${step.id}"${ariaCurrent}${disabled}>${t(step.labelKey)}</button>`;
        }).join('<span class="stepper__sep" aria-hidden="true">›</span>')}
      </nav>
      <div class="lang-switch">
        <button type="button" class="lang-btn${locale === "zh" ? " is-active" : ""}" data-lang="zh"${isGrading ? " disabled" : ""}>${t("langZh")}</button>
        <button type="button" class="lang-btn${locale === "en" ? " is-active" : ""}" data-lang="en"${isGrading ? " disabled" : ""}>${t("langEn")}</button>
      </div>
    </header>
    <main class="shell${screen === "viewer" ? " shell--viewer" : ""}">
      <div id="screenRoot" class="card${screen === "viewer" ? " card--viewer" : ""}"></div>
    </main>`;

  app.querySelectorAll<HTMLButtonElement>(".stepper__item.is-clickable").forEach((btn) => {
    btn.addEventListener("click", () => {
      const step = btn.dataset.step as StepperStep | undefined;
      if (!step || !canNavigateToStep(step, getStepperStep(screen), session)) return;
      navigateToStep(step);
    });
  });

  app.querySelectorAll<HTMLButtonElement>(".lang-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (isGrading) return;
      const lang = btn.dataset.lang;
      if (lang === "zh" || lang === "en") {
        if (lang === getLocale()) return;
        setLocale(lang);
        emitLocaleChange(lang);
      }
    });
  });

  renderScreen();
}

function renderScreen(): void {
  const root = document.getElementById("screenRoot");
  if (!root) return;

  if (viewerUnmount) {
    viewerUnmount();
    viewerUnmount = null;
  }

  switch (screen) {
    case "select":
      renderSelectScreen(root);
      break;
    case "upload":
      renderUploadScreen(root);
      break;
    case "grading":
      renderGradingScreen(root);
      break;
    case "result":
      session.currentViewerTask = session.currentResultTask;
      void renderViewerScreen(root);
      break;
    case "viewer":
      void renderViewerScreen(root);
      break;
  }
}

function renderSelectScreen(root: HTMLElement): void {
  root.innerHTML = `
    <div class="screen-select">
      ${logoSvg("large")}
      <h1>${t("selectTitle")}</h1>
      <p class="muted">${t("selectSubtitle")}</p>
      <div class="task-cards">
        <label class="task-card${session.task1Selected ? " is-selected" : ""}">
          <input type="checkbox" id="chkTask1" ${session.task1Selected ? "checked" : ""} />
          <span class="task-card__title">${t("task1")}</span>
        </label>
        <label class="task-card${session.task2Selected ? " is-selected" : ""}">
          <input type="checkbox" id="chkTask2" ${session.task2Selected ? "checked" : ""} />
          <span class="task-card__title">${t("task2")}</span>
        </label>
      </div>
      <button class="btn btn-primary" id="btnContinue" type="button">${t("continue")}</button>
    </div>`;

  const chk1 = root.querySelector<HTMLInputElement>("#chkTask1");
  const chk2 = root.querySelector<HTMLInputElement>("#chkTask2");
  chk1?.addEventListener("change", () => {
    session.task1Selected = chk1.checked;
    renderScreen();
  });
  chk2?.addEventListener("change", () => {
    session.task2Selected = chk2.checked;
    renderScreen();
  });
  root.querySelector("#btnContinue")?.addEventListener("click", () => {
    if (!session.task1Selected && !session.task2Selected) {
      alert(t("errorNoTask"));
      return;
    }
    screen = "upload";
    renderShell();
  });
}

function dropzoneHtml(id: string, label: string, purpose: UploadPurpose): string {
  const formatsKey = purpose === "question" ? "dropFormatsQuestion" : "dropFormatsEssay";
  const placeholderKey =
    purpose === "question" ? "textPlaceholderQuestion" : "textPlaceholderEssay";
  return `
    <div class="field">
      <div class="field__label">${label}</div>
      <div class="dropzone" id="${id}" tabindex="0" role="button">
        <input class="dropzone__input" id="${id}File" type="file" accept="${acceptAttributeFor(purpose)}" />
        <div class="dropzone__title">${t("dropHint")}</div>
        <div class="dropzone__hint">${t(formatsKey)}</div>
        <div class="dropzone__filename is-hidden" id="${id}Name"></div>
        <div class="dropzone__error is-hidden" id="${id}Error"></div>
      </div>
      <textarea class="text-input" id="${id}Text" rows="3" placeholder="${t(placeholderKey)}"></textarea>
    </div>`;
}

function renderUploadScreen(root: HTMLElement): void {
  const tasks = getActiveTasks(session);
  const blocks = tasks
    .map((task) => {
      const label = task === "task1" ? t("task1") : t("task2");
      return `<section class="upload-block"><h3>${label}</h3>${dropzoneHtml(task + "Q", t("uploadQuestion"), "question")}${dropzoneHtml(task + "E", t("uploadEssay"), "essay")}</section>`;
    })
    .join("");

  root.innerHTML = `
    <div class="screen-upload">
      <h1>${t("uploadTitle")}</h1>
      ${blocks}
      <div class="actions">
        <button class="btn btn-secondary" id="btnBack" type="button">${t("back")}</button>
        <button class="btn btn-secondary" id="btnSample" type="button">${t("useSample")}</button>
        <button class="btn btn-primary" id="btnGrade" type="button">${t("startGrade")}</button>
      </div>
      <p class="status" id="uploadStatus"></p>
    </div>`;

  for (const task of tasks) {
    setupDropzone(root, `${task}Q`, "question", async (text, filename) => {
      const data = session.uploads[task] ?? { question: "", essay: "" };
      data.question = text;
      data.questionFilename = filename;
      session.uploads[task] = data;
    });
    setupDropzone(root, `${task}E`, "essay", async (text, filename) => {
      const data = session.uploads[task] ?? { question: "", essay: "" };
      data.essay = text;
      data.essayFilename = filename;
      session.uploads[task] = data;
    });
  }

  root.querySelector("#btnBack")?.addEventListener("click", () => {
    screen = "select";
    renderShell();
  });

  root.querySelector("#btnSample")?.addEventListener("click", () => {
    for (const task of tasks) {
      session.uploads[task] = {
        question: SAMPLE_QUESTION,
        essay: SAMPLE_ESSAY,
        questionFilename: "sample-question.txt",
        essayFilename: "sample-essay.txt",
      };
    }
    const status = root.querySelector("#uploadStatus");
    if (status) status.textContent = t("sampleLoaded");
    renderScreen();
  });

  root.querySelector("#btnGrade")?.addEventListener("click", () => {
    for (const task of tasks) {
      const qText = root.querySelector<HTMLTextAreaElement>(`#${task}QText`)?.value.trim();
      const eText = root.querySelector<HTMLTextAreaElement>(`#${task}EText`)?.value.trim();
      const data = session.uploads[task] ?? { question: "", essay: "" };
      if (qText) data.question = qText;
      if (eText) data.essay = eText;
      session.uploads[task] = data;
      if (!data.question.trim()) {
        alert(t("errorNoQuestion"));
        return;
      }
      if (!data.essay.trim()) {
        alert(t("errorNoEssay"));
        return;
      }
    }
    isGrading = true;
    screen = "grading";
    renderShell();
    void runGrading();
  });

  for (const task of tasks) {
    const data = session.uploads[task];
    if (data?.question) {
      const el = root.querySelector<HTMLTextAreaElement>(`#${task}QText`);
      if (el) el.value = data.question;
    }
    if (data?.essay) {
      const el = root.querySelector<HTMLTextAreaElement>(`#${task}EText`);
      if (el) el.value = data.essay;
    }
  }
}

function unsupportedUploadMessage(purpose: UploadPurpose): string {
  const allowed = formatExtensionList(allowedExtensionsFor(purpose));
  const template =
    purpose === "essay" ? t("errorUnsupportedEssay") : t("errorUnsupportedQuestion");
  return template.replace("{formats}", allowed);
}

function setupDropzone(
  root: HTMLElement,
  prefix: string,
  purpose: UploadPurpose,
  onLoad: (text: string, filename: string) => Promise<void> | void,
): void {
  const dropzone = root.querySelector<HTMLElement>(`#${prefix}`);
  const fileInput = root.querySelector<HTMLInputElement>(`#${prefix}File`);
  const nameEl = root.querySelector<HTMLElement>(`#${prefix}Name`);
  const errorEl = root.querySelector<HTMLElement>(`#${prefix}Error`);
  const textEl = root.querySelector<HTMLTextAreaElement>(`#${prefix}Text`);

  function showError(message: string): void {
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.remove("is-hidden");
    }
    if (nameEl) {
      nameEl.classList.add("is-hidden");
    }
    if (fileInput) {
      fileInput.value = "";
    }
  }

  function clearError(): void {
    errorEl?.classList.add("is-hidden");
    if (errorEl) errorEl.textContent = "";
  }

  async function loadFile(file: File): Promise<void> {
    if (!isAllowedFilename(file.name, purpose)) {
      showError(unsupportedUploadMessage(purpose));
      return;
    }

    clearError();
    if (nameEl) {
      nameEl.textContent = `${t("loading")}: ${file.name}`;
      nameEl.classList.remove("is-hidden");
    }

    try {
      let text = "";
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".txt") || lower.endsWith(".md")) {
        text = (await file.text()).trim();
      } else {
        const result = await extractTextFromFile(file, purpose);
        text = result.essay_text;
      }
      if (textEl) textEl.value = text;
      if (nameEl) {
        nameEl.textContent = `${t("loaded")}: ${file.name}`;
        nameEl.classList.remove("is-hidden");
      }
      await onLoad(text, file.name);
    } catch (error) {
      showError(error instanceof Error ? error.message : t("errorRequest"));
    }
  }

  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) void loadFile(file);
  });

  dropzone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("is-dragover");
  });
  dropzone?.addEventListener("dragleave", () => dropzone.classList.remove("is-dragover"));
  dropzone?.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("is-dragover");
    const file = e.dataTransfer?.files?.[0];
    if (file) void loadFile(file);
  });
  dropzone?.addEventListener("click", () => fileInput?.click());
}

function renderGradingScreen(root: HTMLElement): void {
  const steps = [t("gradingStep1"), t("gradingStep2"), t("gradingStep3"), t("gradingStep4")];
  root.innerHTML = `
    <div class="screen-grading">
      <div class="grading-spinner-wrap" role="status" aria-live="polite">
        <div class="grading-spinner" aria-hidden="true"></div>
        ${
          isRegradingLocale
            ? `<p class="grading-patience grading-patience--regrade">${t("gradingRegradeNote")}</p>
               <p class="grading-patience">${t("gradingPatience")}</p>`
            : `<p class="grading-patience">${t("gradingPatience")}</p>`
        }
      </div>
      <h1>${t("gradingTitle")}</h1>
      <ul class="grading-steps">
        ${steps
          .map(
            (label, i) =>
              `<li class="grading-step${i < session.gradeStep ? " is-done" : ""}${i === session.gradeStep ? " is-current" : ""}">${label}</li>`,
          )
          .join("")}
      </ul>
      <div class="grading-bar"><div class="grading-bar__fill" style="width:${(session.gradeStep / steps.length) * 100}%"></div></div>
    </div>`;
}

function resultsNeedLocale(locale: Locale): boolean {
  return getActiveTasks(session).some((task) => {
    const result = session.results[task];
    return result && result.locale !== locale;
  });
}

async function gradeTasks(
  locale: Locale,
  tasks: ("task1" | "task2")[],
): Promise<void> {
  for (const task of tasks) {
    const data = session.uploads[task] as TaskUploadData;
    session.gradeStep = 0;
    renderScreen();

    const result = await submitEssay(
      data.essay,
      {
        taskType: getTaskType(session, task),
        question: data.question,
        locale,
      },
      (uiStep) => {
        session.gradeStep = uiStep;
        renderScreen();
      },
    );
    session.results[task] = result;
    session.currentResultTask = task;
    session.gradeStep = 4;
    renderScreen();
  }
}

async function regradeForLocale(locale: Locale): Promise<void> {
  const tasks = getActiveTasks(session).filter((task) => {
    const result = session.results[task];
    return result && result.locale !== locale;
  });
  if (tasks.length === 0) return;
  await gradeTasks(locale, tasks);
}

async function handleLocaleChange(locale: Locale): Promise<void> {
  if (isGrading) return;

  if (hasResults(session) && resultsNeedLocale(locale)) {
    const returnScreen: Screen =
      screen === "select" || screen === "upload" || screen === "grading" ? screen : "viewer";
    isGrading = true;
    isRegradingLocale = true;
    screen = "grading";
    session.gradeStep = 3;
    renderShell();

    try {
      await regradeForLocale(locale);
      session.gradeStep = 4;
      localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
      screen = returnScreen === "grading" ? "viewer" : returnScreen;
      renderShell();
    } catch (error) {
      alert(error instanceof Error ? error.message : t("errorRequest"));
      renderShell();
    } finally {
      isGrading = false;
      isRegradingLocale = false;
    }
    return;
  }

  renderShell();
}

async function runGrading(): Promise<void> {
  const tasks = getActiveTasks(session);
  const locale = getLocale();
  session.gradeStep = 0;
  session.results = {};
  isGrading = true;
  isRegradingLocale = false;

  try {
    await gradeTasks(locale, tasks);
    session.gradeStep = 4;
    localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
    session.currentViewerTask = session.currentResultTask;
    screen = "viewer";
    renderShell();
  } catch (error) {
    alert(error instanceof Error ? error.message : t("errorRequest"));
    screen = "upload";
    renderShell();
  } finally {
    isGrading = false;
    isRegradingLocale = false;
  }
}

function renderResultScreen(root: HTMLElement): void {
  const locale = getLocale();
  const tasks = getActiveTasks(session);
  const current = session.results[session.currentResultTask];
  const combined = getCombinedOverall(session);

  const taskTabs =
    tasks.length > 1
      ? `<div class="result-tabs">${tasks
          .map(
            (task) =>
              `<button type="button" class="result-tab${session.currentResultTask === task ? " is-active" : ""}" data-task="${task}">${task === "task1" ? t("task1") : t("task2")}</button>`,
          )
          .join("")}</div>`
      : "";

  const bandHtml = current ? renderBandPanel(current.scores, locale) : "";
  const tips = current ? getLowestCriteriaTips(current.scores, locale) : [];
  const tipsHtml = tips
    .map(
      (tip) =>
        `<div class="tip-card"><div class="tip-card__head">${escapeHtml(tip.criterion)} · ${tip.band.toFixed(1)}</div><p>${escapeHtml(tip.tip)}</p></div>`,
    )
    .join("");

  const combinedHtml =
    tasks.length > 1 && combined != null
      ? `<div class="combined-band"><span>${t("overallBand")}</span><strong>${combined.toFixed(1)}</strong></div>`
      : "";

  root.innerHTML = `
    <div class="screen-result">
      <h1>${t("resultTitle")}</h1>
      ${combinedHtml}
      ${taskTabs}
      ${bandHtml}
      <section class="tips-section"><h3>${t("improvementTips")}</h3>${tipsHtml}</section>
      <div class="actions">
        <button class="btn btn-primary" id="btnView" type="button">${t("viewAnnotations")}</button>
        <button class="btn btn-secondary" id="btnNew" type="button">${t("newSession")}</button>
      </div>
    </div>`;

  root.querySelectorAll<HTMLButtonElement>(".result-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const task = btn.dataset.task as "task1" | "task2" | undefined;
      if (!task) return;
      session.currentResultTask = task;
      renderScreen();
    });
  });

  root.querySelector("#btnView")?.addEventListener("click", () => {
    session.currentViewerTask = session.currentResultTask;
    screen = "viewer";
    renderShell();
  });

  root.querySelector("#btnNew")?.addEventListener("click", () => {
    session = createSession();
    screen = "select";
    localStorage.removeItem(STORAGE_KEYS.session);
    renderShell();
  });
}

async function renderViewerScreen(root: HTMLElement): Promise<void> {
  const tasks = getActiveTasks(session);
  const feedback = session.results[session.currentViewerTask];
  if (!feedback) {
    screen = "upload";
    renderShell();
    return;
  }

  const tabs =
    tasks.length > 1
      ? `<div class="result-tabs viewer-tabs">${tasks
          .map(
            (task) =>
              `<button type="button" class="result-tab${session.currentViewerTask === task ? " is-active" : ""}" data-task="${task}">${task === "task1" ? t("task1") : t("task2")}</button>`,
          )
          .join("")}</div>`
      : "";

  root.innerHTML = `${tabs}<div id="viewerRoot"></div>`;

  root.querySelectorAll<HTMLButtonElement>(".result-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const task = btn.dataset.task as "task1" | "task2" | undefined;
      if (!task) return;
      session.currentViewerTask = task;
      void renderViewerScreen(root);
    });
  });

  const viewerRoot = root.querySelector<HTMLElement>("#viewerRoot");
  if (!viewerRoot) return;

  const viewerModule = await import("./viewer.js");
  viewerUnmount = viewerModule.mountViewer({
    root: viewerRoot,
    feedback: session.results[session.currentViewerTask]!,
    onBack: () => {
      screen = "upload";
      renderShell();
    },
    onNewSession: () => {
      session = createSession();
      screen = "select";
      localStorage.removeItem(STORAGE_KEYS.session);
      renderShell();
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function bootstrap(): void {
  onLocaleChange((locale) => {
    void handleLocaleChange(locale);
  });
  renderShell();
}

bootstrap();
