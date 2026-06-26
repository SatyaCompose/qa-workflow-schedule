// READ-ONLY: this module must never make non-GET requests against Asana.
// Asana is the source of truth; assignments live only in Supabase + Excel.

const ASANA_BASE = "https://app.asana.com/api/1.0";

export type AsanaTask = {
  gid: string;
  name: string;
  permalink_url: string;
  completed: boolean;
  due_on: string | null;
  assignee: { gid: string; name: string } | null;
};

const FIELDS = "gid,name,permalink_url,completed,due_on,assignee.gid,assignee.name";

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

// Fetch all incomplete top-level tasks across the given sprint sections that
// are assigned to one of the source users. A task appearing in multiple
// sprint sections is returned once.
export async function fetchSourceTasks(
  sprintSectionGids: string[],
  sourceUserGids: string[],
): Promise<AsanaTask[]> {
  const results: AsanaTask[] = [];
  const seen = new Set<string>();

  for (const sectionGid of sprintSectionGids) {
    let offset: string | undefined;
    do {
      const params = new URLSearchParams({
        completed_since: "now", // returns only incomplete tasks
        opt_fields: FIELDS,
        limit: "100",
      });
      if (offset) params.set("offset", offset);

      const page = await asanaFetch(
        `/sections/${sectionGid}/tasks?${params.toString()}`,
      );
      for (const t of page.data as AsanaTask[]) {
        if (!t.assignee) continue;
        if (!sourceUserGids.includes(t.assignee.gid)) continue;
        if (seen.has(t.gid)) continue;
        seen.add(t.gid);
        results.push(t);
      }
      offset = page.next_page?.offset;
    } while (offset);
  }

  return results;
}
