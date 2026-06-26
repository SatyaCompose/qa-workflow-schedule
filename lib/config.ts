function csv(env: string | undefined): string[] {
  if (!env) return [];
  return env.split(",").map((s) => s.trim()).filter(Boolean);
}

export type TargetUser = { gid: string; name: string };

export function config() {
  const workspaceGid = process.env.ASANA_WORKSPACE_GID;
  const source = csv(process.env.ASANA_SOURCE_USER_GIDS);
  const sprintPrefixes = csv(process.env.ASANA_SPRINTS);
  const targetNames = csv(process.env.TARGET_USERS);

  if (!workspaceGid) throw new Error("ASANA_WORKSPACE_GID not set");
  if (source.length === 0) throw new Error("ASANA_SOURCE_USER_GIDS not set");
  if (sprintPrefixes.length === 0) throw new Error("ASANA_SPRINTS not set");
  if (targetNames.length === 0) throw new Error("TARGET_USERS not set");

  // Target users only exist in this app, not in Asana. Use the name itself as
  // the stable identifier (kept in `assigned_to_gid` columns).
  const targets: TargetUser[] = targetNames.map((name) => ({ gid: name, name }));

  return { workspaceGid, source, sprintPrefixes, targets };
}
