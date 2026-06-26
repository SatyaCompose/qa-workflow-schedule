import { AsanaTask } from "./asana";
import { supabase } from "./db";
import { capacityOf, loadStatuses, TargetStatus } from "./target-status";

export type Target = {
  gid: string;
  name: string;
  asana_gid: string | null;
};

export type Assignment = {
  task: AsanaTask;
  target: Target;
  isNew: boolean;
};

/**
 * Assignment rules in priority order:
 *
 *   1. Manual override — keep whatever the user set on the dashboard.
 *   2. Asana-account lock — task assigned in Asana to a target's mapped
 *      account locks to that target … unless the target is on `leave`,
 *      in which case the lock is bypassed and the ticket flows into the pool.
 *   3. Stability — if the ticket already has an assignment, keep it
 *      … unless its current target is on `leave`, in which case redistribute.
 *   4. Load balance — for genuinely new tickets, assign to the target with
 *      the most remaining capacity (hours minus current count). Targets on
 *      `leave` are skipped. Ties broken by `TARGET_USERS` order.
 *
 * Capacity is derived from `target_status.hours` divided by
 * MINUTES_PER_TICKET (45 min). E.g. 8 hours → 10 tickets, 4 hours → 5.
 */
export async function splitWithStability(
  tasks: AsanaTask[],
  targets: Target[],
): Promise<Assignment[]> {
  if (targets.length === 0) throw new Error("No target users configured");

  const db = supabase();

  const statuses = await loadStatuses(targets.map((t) => t.name));
  const capByName = new Map<string, number>();
  for (const t of targets) {
    capByName.set(t.name, capacityOf(statuses.get(t.name) ?? statuses.get(targets[0].name)!));
  }

  const isOnLeave = (name: string) =>
    statuses.get(name)?.status === "leave";

  const taskGids = tasks.map((t) => t.gid);
  const existing = taskGids.length
    ? (
        await db
          .from("tickets")
          .select("task_gid, assigned_to_gid, manual_override")
          .in("task_gid", taskGids)
      ).data ?? []
    : [];
  const existingMap = new Map(existing.map((r) => [r.task_gid, r]));

  // In-memory counts of assignments produced by this sync (so multiple
  // unassigned new tickets in one run spread out instead of piling onto one).
  const counts = new Map<string, number>();
  for (const t of targets) counts.set(t.gid, 0);

  const stickyByAsanaGid = new Map<string, Target>();
  for (const t of targets) {
    if (t.asana_gid) stickyByAsanaGid.set(t.asana_gid, t);
  }

  const assignments: Assignment[] = [];
  const newTasks: AsanaTask[] = [];

  // Pass 1: deterministic placements (manual / lock / stability).
  for (const task of tasks) {
    const prior = existingMap.get(task.gid);
    const stickyTarget =
      task.assignee ? stickyByAsanaGid.get(task.assignee.gid) ?? null : null;

    let target: Target | null = null;

    if (prior?.manual_override) {
      target = targets.find((t) => t.gid === prior.assigned_to_gid) ?? targets[0];
    } else if (stickyTarget && !isOnLeave(stickyTarget.name)) {
      target = stickyTarget;
    } else if (prior && !isOnLeave(targetNameByGid(targets, prior.assigned_to_gid))) {
      target = targets.find((t) => t.gid === prior.assigned_to_gid) ?? targets[0];
    } else {
      newTasks.push(task);
      continue;
    }

    counts.set(target.gid, (counts.get(target.gid) ?? 0) + 1);
    assignments.push({ task, target, isNew: !prior });
  }

  // Pass 2: load-balance the remaining new (or leave-orphaned) tickets.
  newTasks.sort((a, b) => a.gid.localeCompare(b.gid));
  for (const task of newTasks) {
    const target = pickByRemainingCapacity(targets, counts, capByName, isOnLeave);
    counts.set(target.gid, (counts.get(target.gid) ?? 0) + 1);
    // isNew is true unless this task was in the DB (a leave-orphan)
    const wasPrior = existingMap.has(task.gid);
    assignments.push({ task, target, isNew: !wasPrior });
  }

  return assignments;
}

function targetNameByGid(targets: Target[], gid: string): string {
  return targets.find((t) => t.gid === gid)?.name ?? "";
}

// Pick the target with the most remaining capacity (capacity - count). Skip
// targets on leave. If everyone is at or over capacity, pick the one with the
// highest absolute capacity so workload stays proportional to hours.
function pickByRemainingCapacity(
  targets: Target[],
  counts: Map<string, number>,
  caps: Map<string, number>,
  isOnLeave: (name: string) => boolean,
): Target {
  const eligible = targets.filter((t) => !isOnLeave(t.name));
  // If all targets are on leave, fall back to all targets (avoid crash; the
  // sync still runs, the dashboard surfaces the situation).
  const pool = eligible.length > 0 ? eligible : targets;

  let best = pool[0];
  let bestSlack = (caps.get(best.name) ?? 0) - (counts.get(best.gid) ?? 0);
  let bestCap = caps.get(best.name) ?? 0;

  for (let i = 1; i < pool.length; i++) {
    const t = pool[i];
    const slack = (caps.get(t.name) ?? 0) - (counts.get(t.gid) ?? 0);
    const cap = caps.get(t.name) ?? 0;
    if (slack > bestSlack || (slack === bestSlack && cap > bestCap)) {
      best = t;
      bestSlack = slack;
      bestCap = cap;
    }
  }
  return best;
}

// Re-export so other modules don't need to import target-status directly.
export type { TargetStatus };
