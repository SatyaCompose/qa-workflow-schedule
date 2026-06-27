---
description: When the dashboard shows zeros or empty tables and you don't know why
---

Use `sync-diagnostician` agent to do a top-down trace:

1. **Is the dev server actually fresh?** Hit `/api/tickets` directly and check:
   - `sprints` field — non-empty means `config()` succeeded
   - `targets` order — Nrushimha,Vardhan,Anand (TARGET_USERS order) means config worked; alphabetical means it fell back to deriving from data
   - `lastRun.started_at` — when did the sync table get updated?

2. **Does the DB have data?** Use `db-inspector` to count `tickets`, `completions`, `penalties` rows.

3. **Reconcile**:
   - DB empty + API empty → no sync has succeeded yet → `npm run sync:local`, fix errors
   - DB has rows + API empty → dev server is stale (restart) OR Supabase URL mismatch (compare `lastRun.started_at` against `select max(started_at) from sync_runs`)
   - Both have data + UI empty → hard-refresh browser; check React component renders the field names

4. Report findings as a short bullet list. Recommend exactly one next action.
