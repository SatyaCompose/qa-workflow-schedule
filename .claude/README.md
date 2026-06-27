# .claude

Project-local configuration for Claude Code: scoped agents and slash commands tailored to the QA Work Allotment app.

## Agents (`./agents/`)

Spawned with the Agent tool. Each one has a narrow read-only scope.

| Agent | When to use |
|---|---|
| `db-inspector` | Counts, recent rows, joining `tickets` ↔ `completions` to verify state. Use when DB and UI disagree. |
| `asana-explorer` | Discovers project GIDs, user GIDs, custom-field option strings. Strictly GET. Use when verifying env-var values. |
| `sync-diagnostician` | End-to-end pipeline walkthrough. Use when a sync result doesn't match expectations. |

## Commands (`./commands/`)

Surface as `/<name>` slash commands.

| Command | Purpose |
|---|---|
| `/sync` | Run `npm run sync:local`, interpret the JSON result |
| `/check-credits` | Compare DB completion/penalty counts vs `/api/tickets` numbers |
| `/diagnose-empty-ui` | Top-down trace when dashboard shows zeros |
| `/reset-data` | Destructive: wipe ticket/snapshot/completion/penalty/status data |
| `/redeploy` | Pre-deploy checklist (env vars, secrets, build, push approval) |
| `/add-sprint` | Append a new sprint to the tracked list |
| `/change-target` | Add / remove / replace a target QA safely |

## Design notes

- Every agent and command respects the project's hard rules: **Asana is read-only** ([[feedback-asana-read-only]]) and **no auto-commits** ([[feedback-no-auto-commit]]).
- Agents reach Supabase via PostgREST + curl using the `SUPABASE_SERVICE_ROLE_KEY` from `.env` — no separate connection pool.
- Commands prefer narrative guidance over scripted automation. The user does each step; Claude reports + recommends.
