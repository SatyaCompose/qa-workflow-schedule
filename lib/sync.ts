import { fetchProjectTasks } from "./asana";
import { config } from "./config";
import { supabase } from "./db";
import { istDateString } from "./ist";
import { computePriority, devStatusOf, isInSprints, sprintOf } from "./priority";
import { splitWithStability } from "./splitter";

export type SyncResult = {
  ok: boolean;
  newCount: number;
  seenCount: number;
  archivedCount: number;
  error?: string;
};

export async function runSync(): Promise<SyncResult> {
  const db = supabase();
  const { data: runRow } = await db
    .from("sync_runs")
    .insert({})
    .select("id")
    .single();
  const runId = runRow?.id;

  try {
    const { projectGid, source, sprints, targets } = config();

    const allTasks = await fetchProjectTasks(projectGid);

    // Keep tasks that:
    //   1. Belong to one of the configured sprints (via "Sprint Allocation" custom field), and
    //   2. Are assigned to one of the source users.
    const tasks = allTasks.filter((t) => {
      if (!t.assignee || !source.includes(t.assignee.gid)) return false;
      if (!isInSprints(t, sprints)) return false;
      return true;
    });

    const assignments = await splitWithStability(tasks, targets);

    const now = new Date().toISOString();
    const upserts = assignments.map((a) => {
      const priority = computePriority(a.task);
      const dev_status = devStatusOf(a.task);
      const sprint = sprintOf(a.task);
      return {
        task_gid: a.task.gid,
        task_name: a.task.name,
        task_url: a.task.permalink_url,
        original_assignee_gid: a.task.assignee?.gid ?? null,
        original_assignee: a.task.assignee?.name ?? null,
        assigned_to_gid: a.target.gid,
        assigned_to: a.target.name,
        asana_status: a.task.completed ? "completed" : "open",
        archived: false,
        due_on: a.task.due_on,
        priority,
        dev_status,
        sprint,
        raw_task: a.task,
        last_seen: now,
        updated_at: now,
      };
    });

    if (upserts.length) {
      const { error } = await db.from("tickets").upsert(upserts, {
        onConflict: "task_gid",
        ignoreDuplicates: false,
      });
      if (error) throw error;
    }

    const seenGids = upserts.map((u) => u.task_gid);
    let archivedCount = 0;
    if (seenGids.length) {
      const { count, error } = await db
        .from("tickets")
        .update(
          { archived: true, asana_status: "missing", updated_at: now },
          { count: "exact" },
        )
        .eq("archived", false)
        .not("task_gid", "in", `(${seenGids.map((g) => `"${g}"`).join(",")})`);
      if (error) throw error;
      archivedCount = count ?? 0;
    } else {
      const { count, error } = await db
        .from("tickets")
        .update(
          { archived: true, asana_status: "missing", updated_at: now },
          { count: "exact" },
        )
        .eq("archived", false);
      if (error) throw error;
      archivedCount = count ?? 0;
    }

    // Rewrite today's snapshot to reflect the current state. Past days
    // remain untouched and serve as frozen history.
    const today = istDateString();
    {
      const { error } = await db
        .from("daily_snapshots")
        .delete()
        .eq("snapshot_date", today);
      if (error) throw error;
    }
    if (assignments.length) {
      const snapshotRows = upserts.map((u) => ({
        snapshot_date: today,
        task_gid: u.task_gid,
        task_name: u.task_name,
        task_url: u.task_url,
        original_assignee: u.original_assignee,
        assigned_to_gid: u.assigned_to_gid,
        assigned_to: u.assigned_to,
        asana_status: u.asana_status,
        due_on: u.due_on,
        priority: u.priority,
        dev_status: u.dev_status,
        sprint: u.sprint,
      }));
      const { error } = await db.from("daily_snapshots").insert(snapshotRows);
      if (error) throw error;
    }

    const newCount = assignments.filter((a) => a.isNew).length;
    const seenCount = assignments.length;

    if (runId) {
      await db
        .from("sync_runs")
        .update({
          finished_at: now,
          ok: true,
          new_count: newCount,
          seen_count: seenCount,
          archived_count: archivedCount,
        })
        .eq("id", runId);
    }

    return { ok: true, newCount, seenCount, archivedCount };
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    if (runId) {
      await db
        .from("sync_runs")
        .update({ finished_at: new Date().toISOString(), ok: false, error: msg })
        .eq("id", runId);
    }
    return { ok: false, newCount: 0, seenCount: 0, archivedCount: 0, error: msg };
  }
}
