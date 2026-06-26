function csv(env: string | undefined): string[] {
  if (!env) return [];
  return env.split(",").map((s) => s.trim()).filter(Boolean);
}

export type TargetUser = {
  gid: string;              // local stable identifier (the name)
  name: string;             // display name
  asana_gid: string | null; // Asana user GID if this target also has an Asana account
};

// Parse "Name" or "Name:asana_gid" entries from TARGET_USERS.
function parseTarget(entry: string): TargetUser {
  const idx = entry.indexOf(":");
  if (idx === -1) return { gid: entry, name: entry, asana_gid: null };
  const name = entry.slice(0, idx).trim();
  const asana_gid = entry.slice(idx + 1).trim() || null;
  return { gid: name, name, asana_gid };
}

export function config() {
  const workspaceGid = process.env.ASANA_WORKSPACE_GID;
  const source = csv(process.env.ASANA_SOURCE_USER_GIDS);
  const sprintPrefixes = csv(process.env.ASANA_SPRINTS);
  const targetEntries = csv(process.env.TARGET_USERS);

  if (!workspaceGid) throw new Error("ASANA_WORKSPACE_GID not set");
  if (source.length === 0) throw new Error("ASANA_SOURCE_USER_GIDS not set");
  if (sprintPrefixes.length === 0) throw new Error("ASANA_SPRINTS not set");
  if (targetEntries.length === 0) throw new Error("TARGET_USERS not set");

  const targets: TargetUser[] = targetEntries.map(parseTarget);

  return { workspaceGid, source, sprintPrefixes, targets };
}
