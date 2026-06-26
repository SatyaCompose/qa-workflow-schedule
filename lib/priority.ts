import { AsanaTask } from "./asana";

export type Priority = "P1" | "P2" | "P3" | "P4";

// QA priority is derived from Asana's "Development Status" custom field.
// See memory/feedback_qa_priority_mapping.md.
const QA_STATUS_TO_PRIORITY: Array<[string, Priority]> = [
  ["deployed in staging - qa to verify",       "P1"],
  ["deployed to uat - qa to verify",           "P2"],
  ["deployed in preview - qa verification",    "P3"],
];

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Returns the QA priority for a task. Tickets not yet in a QA-verifiable
// state get P4 (still shown, sorted to the bottom).
export function computePriority(task: AsanaTask): Priority {
  const devStatus = devStatusOf(task);
  const n = norm(devStatus);
  for (const [needle, p] of QA_STATUS_TO_PRIORITY) {
    if (n === needle) return p;
  }
  return "P4";
}

// Extracts the "Development Status" display string from a task's custom_fields.
export function devStatusOf(task: AsanaTask): string | null {
  for (const cf of task.custom_fields ?? []) {
    if (norm(cf.name) === "development status") {
      return cf.enum_value?.name ?? cf.display_value ?? null;
    }
  }
  return null;
}

// Extracts the "Sprint Allocation" display string.
export function sprintOf(task: AsanaTask): string | null {
  for (const cf of task.custom_fields ?? []) {
    if (norm(cf.name) === "sprint allocation") {
      return cf.enum_value?.name ?? cf.display_value ?? null;
    }
  }
  return null;
}

// Tests whether a task belongs to any of the configured sprints.
export function isInSprints(task: AsanaTask, sprints: string[]): boolean {
  const s = norm(sprintOf(task));
  if (!s) return false;
  return sprints.some((wanted) => norm(wanted) === s);
}
