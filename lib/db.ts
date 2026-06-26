import { createClient } from "@supabase/supabase-js";

export type TicketRow = {
  task_gid: string;
  task_name: string;
  task_url: string | null;
  original_assignee_gid: string | null;
  original_assignee: string | null;
  assigned_to_gid: string;
  assigned_to: string;
  asana_status: string | null;
  archived: boolean;
  due_on: string | null;
  first_seen: string;
  last_seen: string;
  updated_at: string;
  manual_override: boolean;
  override_at: string | null;
  raw_task: Record<string, unknown> | null;
  priority: "P1" | "P2" | "P3" | "P4" | null;
  dev_status: string | null;
  sprint: string | null;
};

export type SnapshotRow = {
  snapshot_date: string;
  task_gid: string;
  task_name: string;
  task_url: string | null;
  original_assignee: string | null;
  assigned_to_gid: string;
  assigned_to: string;
  asana_status: string | null;
  due_on: string | null;
  priority: "P1" | "P2" | "P3" | "P4" | null;
  dev_status: string | null;
  sprint: string | null;
};

export function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(url, key, { auth: { persistSession: false } });
}
