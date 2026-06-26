import { fetchSourceTasks } from "./asana";
import { config } from "./config";
import { supabase } from "./db";
import { splitWithStability, Target } from "./splitter";

export type SyncResult = {
  ok: boolean;
  newCount: number;
  seenCount: number;
  archivedCount: number;
  error?: string;
};

// Resolve a target GID to a display name via Asana's /users endpoint.
async function resolveTargetNames(gids: string[]): Promise<Target[]> {
  const token = process.env.ASANA_TOKEN!;
  const out: Target[] = [];
  for (const gid of gids) {
    const res = await fetch(`https://app.asana.com/api/1.0/users/${gid}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Failed to resolve target user ${gid}`);
    const body = await res.json();
    out.push({ gid, name: body.data.name });
  }
  return out;
}

export async function runSync(): Promise<SyncResult> {
  const db = supabase();
  const { data: runRow } = await db
    .from("sync_runs")
    .insert({})
    .select("id")
    .single();
  const runId = runRow?.id;

  try {
    const { sprints, source, targets: targetGids } = config();
    const targets = await resolveTargetNames(targetGids);

    const tasks = await fetchSourceTasks(sprints, source);
    const assignments = await splitWithStability(tasks, targets);

    const now = new Date().toISOString();
    const upserts = assignments.map((a) => ({
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
      last_seen: now,
      updated_at: now,
    }));

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
        .update({ archived: true, asana_status: "missing", updated_at: now })
        .eq("archived", false)
        .not("task_gid", "in", `(${seenGids.map((g) => `"${g}"`).join(",")})`)
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      archivedCount = count ?? 0;
    } else {
      const { count, error } = await db
        .from("tickets")
        .update({ archived: true, asana_status: "missing", updated_at: now })
        .eq("archived", false)
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      archivedCount = count ?? 0;
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
