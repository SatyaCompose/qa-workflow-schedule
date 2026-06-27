import {
  fetchProjectTasks,
  fetchWorkspaceProjects,
  resolveSprintProjects,
  AsanaTask,
} from "./asana";
import { config } from "./config";
import { supabase } from "./db";
import { isWeekendIst, istDateString, istDayOfWeek, istHour, istYesterdayString } from "./ist";
import { computePriority, devStatusOf } from "./priority";
import { splitWithStability } from "./splitter";

export type SyncResult = {
  ok: boolean;
  newCount: number;
  seenCount: number;
  archivedCount: number;
  completionCount?: number;
  penaltyCount?: number;
  skipped?: string;
  error?: string;
};

const QA_PRIORITIES = new Set(["P1", "P2", "P3"]);

// A sync_runs row with finished_at = null older than this is considered stale
// (process crashed / Vercel timeout / GH Actions cancelled mid-run).
const STALE_RUN_MS = 5 * 60 * 1000;

export async function runSync(): Promise<SyncResult> {
  const db = supabase();
  const staleCutoff = new Date(Date.now() - STALE_RUN_MS).toISOString();

  // (a) Sweep stuck runs: anything still unfinished after 5 minutes is dead.
  await db
    .from("sync_runs")
    .update({
      finished_at: new Date().toISOString(),
      ok: false,
      error: "stalled (no completion within 5 minutes)",
    })
    .is("finished_at", null)
    .lt("started_at", staleCutoff);

  // (b) Insert our own row first, then check whether another in-flight row
  // exists. Not fully atomic (no advisory lock available via PostgREST), but
  // closes the most common races: two cron triggers, or local sync racing
  // with a deployed cron.
  const { data: runRow, error: runRowErr } = await db
    .from("sync_runs")
    .insert({})
    .select("id")
    .single();
  if (runRowErr) {
    return { ok: false, newCount: 0, seenCount: 0, archivedCount: 0, error: runRowErr.message };
  }
  const runId = runRow.id;

  const { data: others } = await db
    .from("sync_runs")
    .select("id")
    .is("finished_at", null)
    .gte("started_at", staleCutoff)
    .neq("id", runId)
    .limit(1);

  if (others && others.length > 0) {
    await db
      .from("sync_runs")
      .update({
        finished_at: new Date().toISOString(),
        ok: false,
        error: `skipped: another sync in progress (id=${others[0].id})`,
      })
      .eq("id", runId);
    return {
      ok: true,
      newCount: 0,
      seenCount: 0,
      archivedCount: 0,
      skipped: `another sync in progress (id=${others[0].id})`,
    };
  }

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

    // Order tasks for assignment:
    //   primary:  sprint age (older sprint first per ASANA_SPRINTS order)
    //   secondary: QA priority (P1 before P2 before P3 before P4)
    //   tertiary:  task gid (deterministic tiebreak)
    const PRIORITY_RANK: Record<string, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };
    const sprintRank = (s: string | null) => {
      if (!s) return sprintPrefixes.length + 1;
      const i = sprintPrefixes.findIndex((p) => p.toLowerCase() === s.toLowerCase());
      return i === -1 ? sprintPrefixes.length : i;
    };
    tagged.sort((a, b) => {
      const sa = sprintRank(a.sprintLabel);
      const sb = sprintRank(b.sprintLabel);
      if (sa !== sb) return sa - sb;
      const pa = PRIORITY_RANK[computePriority(a.task)] ?? 5;
      const pb = PRIORITY_RANK[computePriority(b.task)] ?? 5;
      if (pa !== pb) return pa - pb;
      return a.task.gid.localeCompare(b.task.gid);
    });

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
      // from a QA-verify state (P1/P2/P3).
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

    // Pre-archive: credit any ticket leaving scope that was in a QA-verify state.
    const buildToArchiveQuery = () => {
      let q = db
        .from("tickets")
        .select("task_gid, task_name, task_url, priority, dev_status, assigned_to, assigned_to_gid, sprint")
        .eq("archived", false);
      if (seenGids.length) {
        q = q.not("task_gid", "in", `(${seenGids.map((g) => `"${g}"`).join(",")})`);
      }
      return q;
    };
    const { data: toArchive, error: toArchiveErr } = await buildToArchiveQuery();
    if (toArchiveErr) throw toArchiveErr;

    const archiveCompletions = (toArchive ?? [])
      .filter((t) => t.priority && QA_PRIORITIES.has(t.priority))
      .map((t) => ({
        task_gid: t.task_gid,
        task_name: t.task_name,
        task_url: t.task_url,
        completed_at: now,
        completed_date: today,
        completed_by: t.assigned_to,
        completed_by_gid: t.assigned_to_gid,
        from_priority: t.priority,
        to_priority: null,
        from_dev_status: t.dev_status,
        to_dev_status: null,
        sprint: t.sprint,
      }));
    if (archiveCompletions.length) {
      // Dedupe archive credits manually: the unique partial index
      // (task_gid, completed_date) WHERE to_priority IS NULL can't be
      // targeted by PostgREST's `upsert(..., onConflict: ...)` because
      // PostgREST doesn't transmit the WHERE predicate, so Postgres reports
      // "no unique or exclusion constraint matching the ON CONFLICT
      // specification". Read existing archive rows for today + these gids
      // and insert only the missing ones. The partial index still enforces
      // uniqueness at write time as a race-safety net.
      const candidateGids = archiveCompletions.map((c) => c.task_gid);
      const { data: existingArchive, error: existingErr } = await db
        .from("completions")
        .select("task_gid")
        .eq("completed_date", today)
        .is("to_priority", null)
        .in("task_gid", candidateGids);
      if (existingErr) throw existingErr;
      const existingSet = new Set((existingArchive ?? []).map((r) => r.task_gid));
      const toInsertArchive = archiveCompletions.filter(
        (c) => !existingSet.has(c.task_gid),
      );
      if (toInsertArchive.length) {
        const { error } = await db.from("completions").insert(toInsertArchive);
        if (error) throw error;
      }
    }

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

    // Rewrite today's snapshot — upsert current rows first (so they're
    // visible even if delete fails), then delete leftovers from today that
    // we didn't see this sync. Crash-safer than the old delete-then-insert.
    if (upserts.length) {
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
      const { error } = await db.from("daily_snapshots").upsert(snapshotRows, {
        onConflict: "snapshot_date,task_gid",
        ignoreDuplicates: false,
      });
      if (error) throw error;
    }
    {
      let q = db.from("daily_snapshots").delete().eq("snapshot_date", today);
      if (seenGids.length) {
        q = q.not("task_gid", "in", `(${seenGids.map((g) => `"${g}"`).join(",")})`);
      }
      const { error } = await q;
      if (error) throw error;
    }

    // End-of-day penalty for today (weekdays only, IST hour ≥ 22).
    let penaltyCount = 0;
    if (istHour() >= 22 && !isWeekendIst()) {
      const p1Rows = upserts
        .filter((u) => u.priority === "P1")
        .map((u) => ({
          task_gid: u.task_gid,
          task_name: u.task_name,
          task_url: u.task_url,
          penalized_date: today,
          penalized_to: u.assigned_to,
          penalized_to_gid: u.assigned_to_gid,
          priority: u.priority,
          reason: "unfinished_p1_eod",
        }));
      if (p1Rows.length) {
        const { count, error } = await db
          .from("penalties")
          .upsert(p1Rows, {
            onConflict: "task_gid,penalized_date",
            ignoreDuplicates: true,
            count: "exact",
          });
        if (error) throw error;
        penaltyCount = count ?? 0;
      }
    }

    // Recovery: if yesterday was a weekday and we never applied its EOD
    // penalty (e.g. cron missed the 22:00 window), back-fill from yesterday's
    // snapshot. Unique constraint on (task_gid, penalized_date) prevents
    // double counting if the 22:00 sync did fire.
    const yest = istYesterdayString();
    const yestDow = istDayOfWeek(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const yestWasWeekday = yestDow >= 1 && yestDow <= 5;
    let backfilledPenaltyCount = 0;
    if (yestWasWeekday) {
      const { data: yestP1s } = await db
        .from("daily_snapshots")
        .select("task_gid, task_name, task_url, assigned_to, assigned_to_gid")
        .eq("snapshot_date", yest)
        .eq("priority", "P1");
      if (yestP1s && yestP1s.length) {
        const backfill = yestP1s.map((s) => ({
          task_gid: s.task_gid,
          task_name: s.task_name,
          task_url: s.task_url,
          penalized_date: yest,
          penalized_to: s.assigned_to,
          penalized_to_gid: s.assigned_to_gid,
          priority: "P1",
          reason: "unfinished_p1_eod_backfill",
        }));
        const { count, error } = await db
          .from("penalties")
          .upsert(backfill, {
            onConflict: "task_gid,penalized_date",
            ignoreDuplicates: true,
            count: "exact",
          });
        if (error) throw error;
        backfilledPenaltyCount = count ?? 0;
      }
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

    return {
      ok: true,
      newCount,
      seenCount,
      archivedCount,
      completionCount: completions.length + archiveCompletions.length,
      penaltyCount: penaltyCount + backfilledPenaltyCount,
    };
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
