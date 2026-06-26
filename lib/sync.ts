import {
  fetchProjectTasks,
  fetchWorkspaceProjects,
  resolveSprintProjects,
  AsanaTask,
} from "./asana";
import { config } from "./config";
import { supabase } from "./db";
import { istDateString } from "./ist";
import { computePriority, devStatusOf } from "./priority";
import { splitWithStability } from "./splitter";

export type SyncResult = {
  ok: boolean;
  newCount: number;
  seenCount: number;
  archivedCount: number;
  completionCount?: number;
  error?: string;
};

const QA_PRIORITIES = new Set(["P1", "P2", "P3"]);

export async function runSync(): Promise<SyncResult> {
  const db = supabase();
  const { data: runRow } = await db
    .from("sync_runs")
    .insert({})
    .select("id")
    .single();
  const runId = runRow?.id;

  try {
    const { workspaceGid, source, sprintPrefixes, targets } = config();

    const allProjects = await fetchWorkspaceProjects(workspaceGid);
    const resolved = resolveSprintProjects(sprintPrefixes, allProjects);
    if (resolved.length === 0) {
      throw new Error(
        `No Asana projects matched ASANA_SPRINTS=[${sprintPrefixes.join(", ")}]. ` +
          `Checked ${allProjects.length} workspace project(s).`,
      );
    }

    type Tagged = { task: AsanaTask; sprintLabel: string };
    const tagged: Tagged[] = [];
    const seenGidSet = new Set<string>();
    for (const { prefix, project } of resolved) {
      const tasks = await fetchProjectTasks(project.gid);
      for (const t of tasks) {
        if (!t.assignee || !source.includes(t.assignee.gid)) continue;
        if (seenGidSet.has(t.gid)) continue;
        seenGidSet.add(t.gid);
        tagged.push({ task: t, sprintLabel: prefix });
      }
    }

    const tasks = tagged.map((tg) => tg.task);
    const sprintByGid = new Map(tagged.map((tg) => [tg.task.gid, tg.sprintLabel]));

    // Snapshot of existing rows (priority + dev_status) so we can detect
    // completions caused by transitions out of P1/P2/P3.
    const taskGids = tasks.map((t) => t.gid);
    const priorById = new Map<
      string,
      { priority: string | null; dev_status: string | null; assigned_to: string; assigned_to_gid: string }
    >();
    if (taskGids.length) {
      const { data: priorRows } = await db
        .from("tickets")
        .select("task_gid, priority, dev_status, assigned_to, assigned_to_gid")
        .in("task_gid", taskGids);
      for (const r of priorRows ?? []) {
        priorById.set(r.task_gid, {
          priority: r.priority,
          dev_status: r.dev_status,
          assigned_to: r.assigned_to,
          assigned_to_gid: r.assigned_to_gid,
        });
      }
    }

    const assignments = await splitWithStability(tasks, targets);
    const now = new Date().toISOString();
    const today = istDateString();

    const completions: any[] = [];
    const upserts = assignments.map((a) => {
      const priority = computePriority(a.task);
      const dev_status = devStatusOf(a.task);
      const sprint = sprintByGid.get(a.task.gid) ?? null;

      // Credit the prior assignee whenever a ticket's priority CHANGES away
      // from a QA-verify state (P1/P2/P3). Catching ANY change (not just
      // exits to P4) means a single ticket tested in Preview → UAT → Staging
      // on the same day counts 3 separate completions, even if syncs miss
      // the brief intermediate "Ready for ..." (P4) state between phases.
      const prev = priorById.get(a.task.gid);
      if (
        prev &&
        prev.priority &&
        QA_PRIORITIES.has(prev.priority) &&
        prev.priority !== priority
      ) {
        completions.push({
          task_gid: a.task.gid,
          task_name: a.task.name,
          task_url: a.task.permalink_url,
          completed_at: now,
          completed_date: today,
          completed_by: prev.assigned_to,
          completed_by_gid: prev.assigned_to_gid,
          from_priority: prev.priority,
          to_priority: priority,
          from_dev_status: prev.dev_status,
          to_dev_status: dev_status,
          sprint,
        });
      }

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

    if (completions.length) {
      const { error } = await db.from("completions").insert(completions);
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

    // Rewrite today's snapshot.
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

    return { ok: true, newCount, seenCount, archivedCount, completionCount: completions.length };
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
