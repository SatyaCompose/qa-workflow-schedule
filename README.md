# QA Work Allotment

A small Next.js app that reads tickets from **specific Asana sprint projects**
assigned to the **2 source users**, splits them across **3 QA targets**
(load-balanced with stability + Asana-account lock), and tracks each QA's
work output as a **credit ledger** (completions = +1, end-of-day unfinished
P1s = −1). Sync runs every 15 minutes during IST working hours. Asana is
strictly read-only — assignments and credits live only in Supabase + Excel.

## Architecture

```
GH Actions (every 15 min, 06:00–22:00 IST)
       │
       └─▶ GET /api/cron/sync (Bearer CRON_SECRET)
                │
                ├─ Discover sprint projects (workspace-wide, prefix-match)
                ├─ Fetch incomplete tasks from each, filter to source users
                ├─ Sort tasks (sprint age → QA priority → gid)
                ├─ Splitter:
                │     1. manual override (sticky)
                │     2. Asana-account lock (e.g. Anand's tickets → Anand)
                │     3. existing assignment (stability)
                │     4. load balance by remaining capacity
                ├─ Upsert into `tickets`, mark missing rows archived
                ├─ Snapshot today's rows into `daily_snapshots`
                ├─ Detect QA-priority transitions  → +1 row in `completions`
                └─ If IST ≥ 22 on a weekday, any active P1 → −1 row in `penalties`

Browser ──▶ /              Dashboard: team status + active tickets (sprint→priority)
        ──▶ /ledger        Live spreadsheet: all tickets + filters + auto-refresh
        ──▶ /help          Plain-English documentation of every concept
        ──▶ /api/download  Single-sheet xlsx of every ticket (current state)
        ──▶ POST /api/admin/reassign        Manual override (Basic Auth)
        ──▶ POST /api/admin/target-status   Set leave/regression (Basic Auth)
```

## Setup

### 1. Supabase

1. Create a project at https://supabase.com (free tier is enough).
2. SQL Editor → paste `supabase/schema.sql` → Run.
3. Settings → API → copy:
   - **Project URL** (no `/rest/v1/` suffix) → `SUPABASE_URL`
   - **`service_role` secret** (NOT the anon key) → `SUPABASE_SERVICE_ROLE_KEY`

### 2. Asana setup

You need:
- **Workspace GID** — from your Asana URL: `app.asana.com/1/<WORKSPACE_GID>/...`
- **Source user GIDs** (the 2 people whose tickets we pull) — from the profile URL: `/profile/<USER_GID>`
- **Sprint project name prefixes** — e.g. `Sprint 12` to match `"Sprint 12 - 2026 - Website Development"`
- **Target user names** — your QA team. They do NOT need Asana accounts. Optionally, attach an Asana GID for "self-locking" behavior (e.g. tickets assigned to Anand in Asana stay with target Anand).

### 3. Environment variables

```bash
# Asana (read-only)
ASANA_TOKEN=2/...                                # Personal access token
ASANA_WORKSPACE_GID=194367843040

# The 2 source users (have Asana accounts)
ASANA_SOURCE_USER_GIDS=<gid1>,<gid2>

# Sprint project name prefixes. Order = age: first listed is oldest = highest priority.
# Case-insensitive "starts with" against project names.
ASANA_SPRINTS=Sprint 12,Sprint 13

# Targets. Each entry is either:
#   "Name"              — no Asana account (e.g. Vardhan)
#   "Name:asana_gid"    — Asana-account lock (their Asana tickets always stay with them)
TARGET_USERS=Nrushimha:<gid>,Vardhan,Anand:<gid>

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Auth secrets
CRON_SECRET=...                                  # openssl rand -hex 32
ADMIN_PASSWORD=...                               # for /api/admin/* Basic Auth
```

### 4. Run locally

```bash
npm install
npm run sync:local      # one-shot sync; prints JSON result
npm run dev             # http://localhost:3000
```

### 5. Deploy to Vercel

Import the GitHub repo at https://vercel.com/new → Add every env var above
(Production scope) → Deploy.

### 6. GitHub Actions schedule

Vercel Hobby plan caps cron at daily intervals, so we drive sync from GitHub
Actions. The workflow at `.github/workflows/sync.yml` fires every 15 minutes
during IST 06:00–22:00 (65 runs/day).

**Public repo:** GH Actions minutes are unlimited.
**Private repo:** ~1,950 min/month — right at the 2,000 free cap.

Add two repo secrets in **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `DEPLOY_URL` | Your Vercel URL (no trailing slash) |
| `CRON_SECRET` | Same value as in Vercel env |

## Pages

| Path | What it does |
|---|---|
| `/` | Dashboard — team status cards + active tickets grouped by sprint |
| `/ledger` | Live spreadsheet (all tickets active+archived, filters, auto-refresh) |
| `/help` | User-facing reference for every concept (priority, credits, etc.) |

## Priority + sort order

QA priority comes from Asana's **"Development Status"** custom field:

| Dev Status string | Priority |
|---|---|
| `Deployed in Staging - QA to verify` | **P1** |
| `Deployed to UAT - QA to verify` | **P2** |
| `Deployed in preview - QA verification` | **P3** |
| anything else | **P4** |

Sort order (dashboard + Excel + load balancer input):

1. **Sprint age** (older first, per `ASANA_SPRINTS` order). A P4 in Sprint 12 sits above a P1 in Sprint 13.
2. **QA priority** (P1 → P4) within each sprint.
3. Due date (nearest first), then first-seen time.

## Splitter rules

For each ticket, the splitter picks an assignee using these rules in order:

1. **Manual override** wins forever (dashboard reassign sets `manual_override = true`).
2. **Asana-account lock** — if a target has an Asana GID and matches the task's Asana assignee, lock to that target. Bypassed if that target is on leave.
3. **Stability** — existing tickets keep their previous target. Bypassed if that target is on leave.
4. **Load balance** — assign to the target with the most remaining capacity (`hours×60/45 − current_count`). Targets on leave are skipped. Ties break by `TARGET_USERS` order.

Distribution order for new tickets: Sprint 12 P1 → Sprint 12 P2 → Sprint 12 P3 → Sprint 12 P4 → Sprint 13 P1 → … so the most-urgent work is spread first.

## Status & capacity

Each target has a row in `target_status`:

| Status | Hours (default) | Capacity (at 45 min/ticket) |
|---|---|---|
| `available` | 8 | 10 |
| `regression` | 0–8 (you set it) | hours × 4/3 |
| `leave` | 0 | 0 (gets no tickets) |

Edit via the dashboard's **Edit** button on each team card (Basic Auth).

## Credit ledger

**Completions = +1 credit**
- Recorded when a ticket's QA priority changes away from P1/P2/P3 between syncs.
- Each phase counts separately: Preview → UAT → Staging = 3 credits.
- Fires any day of the week, including weekends.
- Credited to the assignee at the moment of transition.

**Penalties = −1 credit**
- Fires when sync runs at IST ≥ 22 on a **weekday**.
- One penalty per active **P1** ticket per day, credited to the current assignee.
- `unique (task_gid, penalized_date)` prevents double-counting.
- Weekends (Sat/Sun IST) are excluded.
- P2 and P3 never trigger penalties.

Dashboard team cards show **Today / Month / Total** as net credit (color-coded) with `+plus −minus` breakdown.

## Manual reassignment

Dropdown next to each ticket on the dashboard. First reassign in a session
prompts for HTTP Basic Auth:

- **Username**: any value (or blank)
- **Password**: `ADMIN_PASSWORD`

Reassigned tickets get a `manual` badge and stay sticky across future syncs.

## Excel download

`⤓ Download xlsx` returns a single sheet (`qa-allotment-YYYY-MM-DD.xlsx`) with every ticket ever seen:

- Header has Excel's built-in filter buttons (sortable / searchable)
- Sorted: active first (sprint → priority), then archived (greyed out)
- Columns: Priority, Status, Assigned, Task ID, Task Name, Dev Status, Sprint, Original Assignee, Due, First/Last seen, Manual flag, Asana link

## Archived

A ticket becomes **archived** when it leaves the source-user + sprint filter:

- Reassigned in Asana to someone outside `ASANA_SOURCE_USER_GIDS`
- Moved to a sprint not in `ASANA_SPRINTS`
- Marked completed in Asana
- Deleted from Asana

Archived = "can't be tested right now." Rows are **never deleted** — they're kept in `tickets` (and historical `daily_snapshots`) forever. Visible in `/ledger` and the Excel download, hidden from the dashboard.

## Files

| Path | Purpose |
|---|---|
| `lib/asana.ts` | Asana REST client (read-only) |
| `lib/config.ts` | Env parsing (workspace, sprints, targets) |
| `lib/db.ts` | Supabase client + row types |
| `lib/ist.ts` | IST date/hour/weekend helpers |
| `lib/priority.ts` | Dev-status → P1/P2/P3/P4 |
| `lib/splitter.ts` | 4-tier assignment + capacity-aware load balance |
| `lib/target-status.ts` | Status/hours/capacity helpers |
| `lib/sync.ts` | Orchestrator: fetch → split → upsert → completions → penalties |
| `lib/excel.ts` | xlsx builder |
| `app/page.tsx` | Dashboard UI |
| `app/ledger/page.tsx` | Live spreadsheet UI |
| `app/help/page.tsx` | In-app documentation |
| `app/api/cron/sync/route.ts` | Cron entrypoint (GH Actions hits this) |
| `app/api/tickets/route.ts` | JSON for dashboard + ledger |
| `app/api/qa/[name]/route.ts` | Per-person ticket history |
| `app/api/admin/reassign/route.ts` | Manual override |
| `app/api/admin/target-status/route.ts` | Status edit |
| `app/api/download/route.ts` | xlsx download |
| `middleware.ts` | Basic Auth gate for `/api/admin/*` |
| `supabase/schema.sql` | DB schema (tickets, daily_snapshots, completions, penalties, target_status, sync_runs, rotation_state) |
| `.github/workflows/sync.yml` | 15-min cron schedule |
| `scripts/run-sync.ts` | CLI: `npm run sync:local` |
| `vercel.json` | Vercel build config (cron is GH Actions, not Vercel) |

## Common operations

**Reset all data and start fresh:**
```sql
delete from penalties;
delete from completions;
delete from daily_snapshots;
delete from tickets;
update rotation_state set next_index = 0;
delete from target_status;  -- optional, removes status overrides
```

**Manually trigger a sync without waiting for cron:**
- Production: `curl -H "Authorization: Bearer $CRON_SECRET" "$DEPLOY_URL/api/cron/sync"`
- Local: `npm run sync:local`
- Or in GitHub: **Actions → Hourly Asana Sync → Run workflow**

**Find a sprint's project GID:** open the sprint in Asana, copy the URL — `app.asana.com/0/<PROJECT_GID>/list/...`. The app discovers projects by name prefix though, so you usually don't need the GID directly.

**See what Asana custom fields look like:**
```bash
curl -H "Authorization: Bearer $ASANA_TOKEN" \
  "https://app.asana.com/api/1.0/tasks?project=<PROJECT_GID>&limit=1&opt_fields=custom_fields.name,custom_fields.display_value"
```
