---
description: Add a new sprint to the tracked list (e.g. when Sprint 14 starts)
---

Walk the user through these:

1. **Find the new sprint's full project name in Asana** — typically `"Sprint 14 - 2026 - Website Development"` or similar. Optionally use `asana-explorer` to list workspace projects.

2. **Append to `.env`**:
   ```
   ASANA_SPRINTS=Sprint 12,Sprint 13,Sprint 14
   ```
   Order matters: the leftmost is the oldest (highest sort priority). New sprint goes on the right.

3. **If deploying:** add the same change to Vercel env (Production), then redeploy.

4. **No DB migration needed.** Existing data isn't affected — the next sync will start picking up tickets from the new sprint project automatically.

5. **Optional cleanup:** once an old sprint is fully done, you can remove its prefix from `ASANA_SPRINTS`. Tickets that were in that sprint will get archived on the next sync but stay in `tickets` and `daily_snapshots` history. See `feedback_credit_system` for completion behaviour.

Restart `npm run dev` after editing `.env` so the new sprint shows in the dashboard.
