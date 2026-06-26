// READ-ONLY: this module must never make non-GET requests against Asana.
// Asana is the source of truth; assignments live only in Supabase + Excel.

const ASANA_BASE = "https://app.asana.com/api/1.0";

export type AsanaCustomField = {
  gid: string;
  name: string;
  type: string;
  enum_value?: { gid: string; name: string; color?: string } | null;
  number_value?: number | null;
  text_value?: string | null;
  display_value?: string | null;
};

export type AsanaTag = { gid: string; name: string; color?: string | null };

export type AsanaTask = {
  gid: string;
  name: string;
  permalink_url: string;
  completed: boolean;
  notes: string;
  due_on: string | null;
  due_at: string | null;
  start_on: string | null;
  created_at: string | null;
  modified_at: string | null;
  num_hearts?: number;
  num_likes?: number;
  assignee: { gid: string; name: string } | null;
  tags: AsanaTag[];
  custom_fields: AsanaCustomField[];
  memberships: { project?: { gid: string; name: string }; section?: { gid: string; name: string } }[];
};

const FIELDS = [
  "gid",
  "name",
  "permalink_url",
  "completed",
  "notes",
  "due_on",
  "due_at",
  "start_on",
  "created_at",
  "modified_at",
  "num_hearts",
  "num_likes",
  "assignee.gid",
  "assignee.name",
  "tags.gid",
  "tags.name",
  "tags.color",
  "custom_fields.gid",
  "custom_fields.name",
  "custom_fields.type",
  "custom_fields.display_value",
  "custom_fields.number_value",
  "custom_fields.text_value",
  "custom_fields.enum_value.gid",
  "custom_fields.enum_value.name",
  "custom_fields.enum_value.color",
  "memberships.project.gid",
  "memberships.project.name",
  "memberships.section.gid",
  "memberships.section.name",
].join(",");

async function asanaFetch(path: string): Promise<any> {
  const token = process.env.ASANA_TOKEN;
  if (!token) throw new Error("ASANA_TOKEN not set");

  const res = await fetch(`${ASANA_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Asana ${res.status}: ${body}`);
  }
  return res.json();
}

// Fetch all incomplete tasks in the given project. Caller filters by
// sprint custom field + assignee. We do the filter client-side because
// Asana's REST API has no first-class filter for custom-field values.
export async function fetchProjectTasks(projectGid: string): Promise<AsanaTask[]> {
  const results: AsanaTask[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams({
      project: projectGid,
      completed_since: "now", // returns only incomplete tasks
      opt_fields: FIELDS,
      limit: "100",
    });
    if (offset) params.set("offset", offset);

    const page = await asanaFetch(`/tasks?${params.toString()}`);
    for (const t of page.data as AsanaTask[]) results.push(t);
    offset = page.next_page?.offset;
  } while (offset);

  return results;
}
