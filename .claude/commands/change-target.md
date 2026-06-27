---
description: Add / remove / replace a target QA in TARGET_USERS
---

Help the user safely change the target list.

**Removing a target** (e.g. Vardhan leaves):
1. Set Vardhan's status to `leave` first via the dashboard's Edit button — this stops new tickets from being assigned. Existing Vardhan tickets get re-assigned by the next sync.
2. After confirming the dashboard shows 0 active tickets for Vardhan, remove `Vardhan` from `TARGET_USERS` in `.env` and Vercel.
3. Don't delete historical rows in `tickets` / `completions` — keep the audit trail.

**Adding a target** (e.g. someone new joins):
1. Add their name to `TARGET_USERS`. If they have an Asana account whose tickets should stick with them, use `Name:asana_gid` syntax — e.g. `Ravi:1234567890`.
2. Restart dev / redeploy on Vercel.
3. The splitter starts including them in the load-balance pool immediately. No DB migration needed.

**Replacing a target** (Vardhan → Ravi):
1. Set Vardhan to `leave`.
2. Wait one sync — Vardhan's tickets will redistribute to Nrushimha/Anand/Ravi.
3. Remove Vardhan from `TARGET_USERS`, add Ravi.
4. Restart.

**Important — never just delete a target from `TARGET_USERS`** without setting them to leave first. The splitter will fall back to `targets[0]` for their existing tickets, which dumps everything on Nrushimha at once.
