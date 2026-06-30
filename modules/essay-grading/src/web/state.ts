import type { FeedbackResponse, TaskType } from "../core/schema.js";
import { computeDualTaskOverall } from "../core/constants.js";

export type Screen = "select" | "upload" | "grading" | "result" | "viewer";

export interface TaskUploadData {
  question: string;
  essay: string;
  questionFilename?: string;
  essayFilename?: string;
}

export interface GradingSession {
  task1Selected: boolean;
  task2Selected: boolean;
  uploads: {
    task1?: TaskUploadData;
    task2?: TaskUploadData;
  };
  results: {
    task1?: FeedbackResponse;
    task2?: FeedbackResponse;
  };
  currentResultTask: "task1" | "task2";
  currentViewerTask: "task1" | "task2";
  gradeStep: number;
}

export function createSession(): GradingSession {
  return {
    task1Selected: false,
    task2Selected: true,
    uploads: {},
    results: {},
    currentResultTask: "task2",
    currentViewerTask: "task2",
    gradeStep: 0,
  };
}

export function getTaskType(_session: GradingSession, task: "task1" | "task2"): TaskType {
  if (task === "task2") return "Task 2";
  return "Task 1 Academic";
}

export function getCombinedOverall(session: GradingSession): number | null {
  const t1 = session.results.task1?.scores.overall_band;
  const t2 = session.results.task2?.scores.overall_band;
  if (t1 != null && t2 != null) {
    return computeDualTaskOverall(t1, t2);
  }
  if (t1 != null) return t1;
  if (t2 != null) return t2;
  return null;
}

export function getActiveTasks(session: GradingSession): ("task1" | "task2")[] {
  const tasks: ("task1" | "task2")[] = [];
  if (session.task1Selected) tasks.push("task1");
  if (session.task2Selected) tasks.push("task2");
  return tasks;
}
