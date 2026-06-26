function csv(env: string | undefined): string[] {
  if (!env) return [];
  return env.split(",").map((s) => s.trim()).filter(Boolean);
}

export type TargetUser = { gid: string; name: string };

export function config() {
  const projectGid = process.env.ASANA_PROJECT_GID;
  const source = csv(process.env.ASANA_SOURCE_USER_GIDS);
  const sprints = csv(process.env.ASANA_SPRINTS);
  const targetNames = csv(process.env.TARGET_USERS);

  if (!projectGid) throw new Error("ASANA_PROJECT_GID not set");
  if (source.length === 0) throw new Error("ASANA_SOURCE_USER_GIDS not set");
  if (sprints.length === 0) throw new Error("ASANA_SPRINTS not set");
  if (targetNames.length === 0) throw new Error("TARGET_USERS not set");

  // Target users only exist in this app, not in Asana. Use the name itself as
  // the stable identifier (kept in `assigned_to_gid` columns).
  const targets: TargetUser[] = targetNames.map((name) => ({ gid: name, name }));

  return { projectGid, source, sprints, targets };
}
