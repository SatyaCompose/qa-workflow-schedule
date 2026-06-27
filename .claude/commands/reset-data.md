---
description: Wipe all tracked data (tickets, snapshots, completions, penalties, target_status) so the next sync starts from a clean slate
---

**Destructive.** Confirm with the user before running.

This is for cases like "I changed source users / sprint prefixes / target names and the old data is now junk."

Quote the SQL block from README "Common operations → Reset all data" and ask the user to run it in Supabase SQL editor. Don't run it via the API — there's no admin endpoint for this on purpose.

```sql
delete from penalties;
delete from completions;
delete from daily_snapshots;
delete from tickets;
update rotation_state set next_index = 0;
delete from target_status;  -- optional, only if you want to drop status overrides
```

After they confirm running it, suggest `npm run sync:local` to repopulate from current Asana state.
