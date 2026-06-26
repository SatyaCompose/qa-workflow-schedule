import { AsanaTask } from "./asana";
import { supabase } from "./db";

export type Target = { gid: string; name: string };

export type Assignment = {
  task: AsanaTask;
  target: Target;
  isNew: boolean;
};

// Round-robin with stability:
// - If a ticket already exists in the DB, keep its existing assignment.
// - Otherwise, assign in order starting from the persisted rotation index.
// New tickets are processed in a deterministic order (sorted by gid) so the
// rotation is reproducible regardless of API page order.
export async function splitWithStability(
  tasks: AsanaTask[],
  targets: Target[],
): Promise<Assignment[]> {
  if (targets.length === 0) throw new Error("No target users configured");

  const db = supabase();
  const gids = tasks.map((t) => t.gid);

  const existing = gids.length
    ? (
        await db
          .from("tickets")
          .select("task_gid, assigned_to_gid, assigned_to")
          .in("task_gid", gids)
      ).data ?? []
    : [];
  const existingMap = new Map(existing.map((r) => [r.task_gid, r]));

  const { data: stateRow } = await db
    .from("rotation_state")
    .select("next_index")
    .eq("id", 1)
    .single();
  let cursor = stateRow?.next_index ?? 0;

  const newTasks = tasks
    .filter((t) => !existingMap.has(t.gid))
    .sort((a, b) => a.gid.localeCompare(b.gid));

  const assignments: Assignment[] = [];

  for (const task of tasks) {
    const prior = existingMap.get(task.gid);
    if (prior) {
      const target =
        targets.find((t) => t.gid === prior.assigned_to_gid) ?? targets[0];
      assignments.push({ task, target, isNew: false });
    }
  }

  for (const task of newTasks) {
    const target = targets[cursor % targets.length];
    cursor = (cursor + 1) % targets.length;
    assignments.push({ task, target, isNew: true });
  }

  await db
    .from("rotation_state")
    .update({ next_index: cursor, updated_at: new Date().toISOString() })
    .eq("id", 1);

  return assignments;
}
