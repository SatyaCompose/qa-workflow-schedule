# QA Work Allotment

Reads tasks from **specific sprint sections** in an Asana project that are
assigned to **2 source users**, splits them across **3 target users**
(round-robin with stability), persists every ticket ever seen in Supabase,
and exposes a website + downloadable Excel sheet. A Vercel Cron job re-runs
the sync every hour. **Asana is never written to** — this app only reads.

## How it works

```
Vercel Cron (hourly) ──▶ /api/cron/sync ──▶ runSync()
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

Browser ──▶ /              dashboard (active + archived counts)
        ──▶ /api/download  generates xlsx from current DB state
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
ASANA_SPRINT_GIDS=<section_gid_1>,<section_gid_2>
ASANA_SOURCE_USER_GIDS=<gid1>,<gid2>
ASANA_TARGET_USER_GIDS=<gid3>,<gid4>,<gid5>
```

To track an additional sprint later, just append its section GID to
`ASANA_SPRINT_GIDS`.

### 3. Install + run locally
```bash
npm install
npm run sync:local      # one-shot sync against your DB
npm run dev             # http://localhost:3000
```

### 4. Deploy to Vercel
```bash
npx vercel
# In the Vercel dashboard, add every var from .env.example as env vars.
# Generate a random string for CRON_SECRET.
# Vercel will read vercel.json and register the hourly cron automatically.
```

The cron endpoint at `/api/cron/sync` is protected by `CRON_SECRET` — only
Vercel Cron can hit it in production.

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
| `app/api/cron/sync/route.ts`      | Hourly cron entrypoint                   |
| `app/api/download/route.ts`       | xlsx download                            |
| `app/api/tickets/route.ts`        | JSON for the dashboard                   |
| `app/page.tsx`                    | Dashboard UI                             |
| `supabase/schema.sql`             | DB schema                                |
| `vercel.json`                     | Cron schedule (`0 * * * *`)              |
| `scripts/run-sync.ts`             | CLI: `npm run sync:local`                |
