# QA Work Allotment

Reads tasks from **specific sprint sections** in an Asana project that are
assigned to **2 source users**, splits them across **3 target users**
(round-robin with stability), persists every ticket ever seen in Supabase,
and exposes a website + downloadable monthly Excel files (one tab per day).
A GitHub Actions workflow re-runs the sync every hour between
**6:00 AM and 10:00 PM IST**. The dashboard also lets an admin **manually
reassign** a ticket. **Asana is never written to** — this app only reads.

## How it works

```
GH Actions (hourly) ──▶ /api/cron/sync ──▶ runSync()
                                              │
                                              ├─ Asana API (read-only): for each
                                              │  sprint section GID, fetch incomplete
                                              │  tasks assigned to the 2 source users
                                              ├─ splitWithStability(): existing
                                              │  rows keep their target; new
                                              │  rows are round-robin assigned
                                              ├─ upsert into `tickets`
                                              └─ archive rows no longer in Asana
                                                 (kept in DB, flagged archived)

Each sync also rewrites today's row in `daily_snapshots` (a frozen daily
history table). Past days never change.

Browser ──▶ /                          dashboard (counts + reassign UI)
        ──▶ /api/download?month=YYYY-MM xlsx for that IST month
                                       (one worksheet per day, grouped
                                        by assignee within each sheet)
        ──▶ POST /api/admin/reassign   manual override (Basic Auth)
```

Archived rows are **never deleted** — they keep `first_seen` / `last_seen` and
show up in the dashboard and Excel under "Archived."

## Setup

### 1. Supabase
1. Create a project at https://supabase.com (free tier is fine).
2. Open the SQL editor and run `supabase/schema.sql`.
3. Project Settings → API. Copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (server-only!)

### 2. Asana GIDs
You need: sprint section GIDs + 2 source user GIDs + 3 target user GIDs.

Sprint section GIDs are visible in the Asana web URL when you click into a
section/list. The URL looks like:

```
https://app.asana.com/0/project/<PROJECT_GID>/list/<SECTION_GID>
```

The `<SECTION_GID>` after `/list/` is what goes into `ASANA_SPRINT_GIDS`.
You can also list sections via the API:

```bash
curl -H "Authorization: Bearer $ASANA_TOKEN" \
  "https://app.asana.com/api/1.0/projects/<PROJECT_GID>/sections"
```

User GIDs:
```bash
curl -H "Authorization: Bearer $ASANA_TOKEN" \
  "https://app.asana.com/api/1.0/users?workspace=<WORKSPACE_GID>"
```

Set in `.env`:
```
ASANA_WORKSPACE_GID=<workspace_gid>     # from the Asana URL: app.asana.com/1/<workspace>/...
ASANA_SOURCE_USER_GIDS=<gid1>,<gid2>
ASANA_SPRINTS=Sprint 12,Sprint 13       # comma-separated project-name prefixes
                                        # (case-insensitive "starts with" against project names)
TARGET_USERS=Person 1,Person 2,Person 3 # names only — target users do not
                                        # need Asana accounts; they live only in this app
```

**How sprint matching works:** Each entry in `ASANA_SPRINTS` is matched as a
case-insensitive prefix against your Asana project names. So `Sprint 12`
matches a project called `"Sprint 12 - 2026 - Website Development"`. Tickets
are fetched from each matching project.

**Order matters:** the first sprint listed is treated as the oldest (highest
priority). To track an additional sprint later, append its prefix to the list.

### 3. Install + run locally
```bash
npm install
npm run sync:local      # one-shot sync against your DB
npm run dev             # http://localhost:3000
```

### 4. Deploy to Vercel
Import the GitHub repo at https://vercel.com/new, then in **Project Settings
→ Environment Variables** add every var from `.env.example` for the
**Production** environment. Generate a random string for `CRON_SECRET`
(e.g., `openssl rand -hex 32`).

### 5. Configure GitHub Actions (hourly trigger)
Vercel Hobby plan only allows daily cron jobs, so we trigger the sync from
GitHub Actions instead. The workflow lives at `.github/workflows/sync.yml`
and runs hourly between 06:00 and 22:00 IST (17 runs/day). The schedule
in the workflow file is in UTC (`30 0-16 * * *`).

In the GitHub repo, **Settings → Secrets and variables → Actions → New
repository secret**, add:

| Name | Value |
|---|---|
| `DEPLOY_URL` | `https://your-app.vercel.app` (no trailing slash) |
| `CRON_SECRET` | the same value you put in Vercel's env vars |

You can manually trigger the workflow at any time from the **Actions** tab
→ "Hourly Asana Sync" → "Run workflow" to verify it works.

The cron endpoint at `/api/cron/sync` is protected by `CRON_SECRET` — only
requests bearing the matching token (i.e., your GitHub Action) succeed.

## Manual reassignment

On the dashboard, each active ticket has a dropdown to reassign it to a
different target. The first reassign per browser session prompts for HTTP
Basic Auth — leave the username blank (or any value) and enter
`ADMIN_PASSWORD`. The browser caches it for the session.

Reassignments are **sticky**: the splitter's stability rule means future
syncs preserve the manual choice. Reassigned tickets display a small
"manual" badge in the table. The change is also written into today's
snapshot row so the daily Excel sheet stays consistent.

## Excel structure

- One file per month: `qa-allotment-2026-06.xlsx`
- One worksheet per day inside that file, named `2026-06-26`
- Within each sheet, rows are grouped by assignee with a highlighted
  subheader showing the count per person.
- The current day's worksheet is live — it reflects whatever the latest
  sync wrote. Past days are frozen.

## Priority + sort order

Priority is derived from Asana's **"Development Status"** custom field:

| Development Status value (exact)            | Priority |
|---------------------------------------------|----------|
| `Deployed in Staging - QA to verify`        | **P1**   |
| `Deployed to UAT - QA to verify`            | **P2**   |
| `Deployed in preview - QA verification`     | **P3**   |
| anything else                               | **P4**   |

Tickets in the dashboard and Excel are sorted by:
1. **Sprint age** — older sprints come first, regardless of QA priority.
   A P4 from an old sprint sits above a P1 in a newer sprint.
   Age is determined by the order of names in `ASANA_SPRINTS`: first listed
   is the oldest.
2. **QA priority** (P1 → P4) — applies within a single sprint.
3. Due date (nearest first), then first-seen time.

## Split behavior (round-robin with stability)

- New tickets are sorted by `task_gid` and handed out in order to the 3
  targets, starting from a cursor persisted in `rotation_state`.
- Tickets already in the DB keep their existing `assigned_to`, so a ticket
  doesn't shuffle between owners on every sync.
- If a target user is removed from `ASANA_TARGET_USER_GIDS`, existing rows
  assigned to them fall back to the first target. This is intentional — adjust
  if you want different behavior.

## Files

| Path                              | Purpose                                  |
|-----------------------------------|------------------------------------------|
| `lib/asana.ts`                    | Asana REST client                        |
| `lib/db.ts`                       | Supabase client + ticket row type        |
| `lib/splitter.ts`                 | Round-robin with stability               |
| `lib/excel.ts`                    | Workbook builder                         |
| `lib/sync.ts`                     | Orchestration: fetch → split → upsert    |
| `lib/config.ts`                   | Env parsing                              |
| `app/api/cron/sync/route.ts`      | Cron entrypoint (called by GH Actions)   |
| `app/api/admin/reassign/route.ts` | Manual override endpoint (Basic Auth)    |
| `middleware.ts`                   | Basic Auth gate for `/api/admin/*`       |
| `lib/ist.ts`                      | IST date / month helpers                 |
| `.github/workflows/sync.yml`      | Hourly GitHub Actions schedule           |
| `app/api/download/route.ts`       | xlsx download                            |
| `app/api/tickets/route.ts`        | JSON for the dashboard                   |
| `app/page.tsx`                    | Dashboard UI                             |
| `supabase/schema.sql`             | DB schema                                |
| `vercel.json`                     | Vercel build config (no cron — see workflow) |
| `scripts/run-sync.ts`             | CLI: `npm run sync:local`                |
