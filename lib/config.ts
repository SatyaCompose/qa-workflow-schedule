function gids(env: string | undefined): string[] {
  if (!env) return [];
  return env.split(",").map((s) => s.trim()).filter(Boolean);
}

export function config() {
  const sprints = gids(process.env.ASANA_SPRINT_GIDS);
  const source = gids(process.env.ASANA_SOURCE_USER_GIDS);
  const targets = gids(process.env.ASANA_TARGET_USER_GIDS);

  if (sprints.length === 0) throw new Error("ASANA_SPRINT_GIDS not set");
  if (source.length === 0) throw new Error("ASANA_SOURCE_USER_GIDS not set");
  if (targets.length === 0) throw new Error("ASANA_TARGET_USER_GIDS not set");

  return { sprints, source, targets };
}
