---
description: Run a one-shot Asana sync against the local DB and explain the result
---

Run `npm run sync:local` from the project root. Wait for the JSON output, then interpret it:

- `ok: false` → quote the `error` field and diagnose (env var, Asana auth, Supabase auth, table missing)
- `seenCount: 0` → likely the env-var values don't match real Asana state. Delegate to `asana-explorer`
- `seenCount > 0, newCount > 0` → fresh tickets were added; mention them
- `archivedCount > 0` → some tickets dropped out of scope. Check if `completionCount` rose by the same amount (credit was given for QA-verify states)
- `penaltyCount > 0` → end-of-day P1 penalties fired (only happens if IST hour ≥ 22 on a weekday)

After reporting, suggest a single concrete next step. Don't restart the dev server unless the user asks.
