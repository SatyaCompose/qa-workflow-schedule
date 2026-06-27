---
description: Show the credit + penalty totals per QA from the DB, and reconcile against what /api/tickets returns
---

Two-step check.

**Step 1 — DB ground truth.** Use the `db-inspector` agent (or curl PostgREST directly) to run:

```sql
select 'completion' as kind, completed_by as person, count(*) as rows
  from completions group by completed_by
union all
select 'penalty' as kind, penalized_to as person, count(*) as rows
  from penalties group by penalized_to
order by person, kind;
```

**Step 2 — what the API surfaces.** Curl `/api/tickets` and pull `teamStatus[*]` — show each person's `completedTotal`, `penaltyTotal`, `active`.

**Step 3 — compare.** Print a 3-column table: Person | DB completions | API completedTotal. If they match, all good. If they don't, the dashboard is stale or hitting the wrong DB — explain which.
