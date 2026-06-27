-- Run this in the Supabase SQL editor once during setup.

create table if not exists tickets (
  task_gid              text primary key,
  task_name             text not null,
  task_url              text,
  original_assignee_gid text,
  original_assignee     text,
  assigned_to_gid       text not null,
  assigned_to           text not null,
  asana_status          text,             -- 'open' | 'completed'
  archived              boolean not null default false,
  due_on                date,
  first_seen            timestamptz not null default now(),
  last_seen             timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists tickets_assigned_to_idx on tickets (assigned_to_gid);
create index if not exists tickets_archived_idx    on tickets (archived);

create table if not exists rotation_state (
  id          int primary key default 1,
  next_index  int not null default 0,
  updated_at  timestamptz not null default now(),
  constraint single_row check (id = 1)
);

insert into rotation_state (id, next_index) values (1, 0)
on conflict (id) do nothing;

create table if not exists sync_runs (
  id          bigserial primary key,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  error       text,
  new_count   int,
  seen_count  int,
  archived_count int
);

-- Daily snapshot of the currently-assigned tickets. Today's rows are
-- rewritten on each sync; past days are immutable history. The Excel
-- download builds one worksheet per snapshot_date.
create table if not exists daily_snapshots (
  snapshot_date         date    not null,   -- IST date
  task_gid              text    not null,
  task_name             text    not null,
  task_url              text,
  original_assignee     text,
  assigned_to_gid       text    not null,
  assigned_to           text    not null,
  asana_status          text,
  due_on                date,
  primary key (snapshot_date, task_gid)
);

create index if not exists daily_snapshots_date_idx
  on daily_snapshots (snapshot_date);

-- Track manual overrides so the UI can show them and so future syncs
-- never reshuffle a manually-set ticket. (The stability rule in
-- splitter.ts already preserves prior assignments — this flag just
-- makes the override visible.)
alter table tickets add column if not exists manual_override boolean not null default false;
alter table tickets add column if not exists override_at     timestamptz;

-- Full Asana task object stored as-is so the dashboard / external scripts can
-- derive priority signals (custom fields, tags, age, due_at, etc.) without
-- requiring further schema changes when the team adopts a new field.
alter table tickets add column if not exists raw_task jsonb;

-- QA priority + supporting fields derived from custom_fields on each sync.
-- See lib/priority.ts and memory/feedback_qa_priority_mapping.md.
alter table tickets add column if not exists priority    text;  -- 'P1' | 'P2' | 'P3' | 'P4'
alter table tickets add column if not exists dev_status  text;  -- Development Status display value
alter table tickets add column if not exists sprint      text;  -- Sprint Allocation display value
create index if not exists tickets_priority_idx on tickets (priority);

alter table daily_snapshots add column if not exists priority    text;
alter table daily_snapshots add column if not exists dev_status  text;
alter table daily_snapshots add column if not exists sprint      text;

-- Per-target-user availability. Drives the splitter's load-balancing.
-- A row exists only when status diverges from the default ("available", 8 hours).
-- name matches a value in TARGET_USERS.
create table if not exists target_status (
  name       text    primary key,
  status     text    not null default 'available',  -- 'available' | 'regression' | 'leave'
  hours      int     not null default 8,            -- 0..8
  notes      text,
  updated_at timestamptz not null default now(),
  constraint target_status_status_chk check (status in ('available','regression','leave')),
  constraint target_status_hours_chk  check (hours between 0 and 8)
);

-- Per-ticket completion events. Written when a ticket transitions OUT of a
-- QA-verify priority (P1/P2/P3) into something else (Ready for Staging,
-- Deployed in PROD, etc.). Credit goes to whoever was assigned at that moment.
create table if not exists completions (
  id              bigserial primary key,
  task_gid        text        not null,
  task_name       text        not null,
  task_url        text,
  completed_at    timestamptz not null default now(),  -- when our sync detected it
  completed_date  date        not null,                -- IST date for grouping
  completed_by    text        not null,                -- target name credited
  completed_by_gid text       not null,
  from_priority   text,                                -- 'P1' | 'P2' | 'P3'
  to_priority     text,                                -- typically 'P4' (or null if archived)
  from_dev_status text,
  to_dev_status   text,
  sprint          text
);

create index if not exists completions_by_idx          on completions (completed_by);
create index if not exists completions_date_idx        on completions (completed_date);
create index if not exists completions_completed_at_idx on completions (completed_at);

-- Prevent double-credit on archive: a "left scope" credit (to_priority IS NULL)
-- can only fire once per (task_gid, completed_date). Priority-transition credits
-- (to_priority IS NOT NULL) are NOT covered — a single ticket can transition
-- Preview→UAT→Staging in one day and earn 3 credits.
-- Dedupe any pre-existing archive duplicates before adding the unique index,
-- otherwise the create fails on tables that already accumulated rows.
delete from completions c
using completions d
where c.to_priority is null
  and d.to_priority is null
  and c.task_gid       = d.task_gid
  and c.completed_date = d.completed_date
  and c.id             > d.id;

create unique index if not exists completions_archive_unique_idx
  on completions (task_gid, completed_date)
  where to_priority is null;

-- Per-day P1 penalty: if a ticket is still in P1 (Deployed in Staging - QA to verify)
-- when the IST working day ends (~22:00 IST), the assignee gets a -1 credit row.
-- Unique on (task_gid, penalized_date) so we don't double-penalize within the day.
create table if not exists penalties (
  id               bigserial primary key,
  task_gid         text        not null,
  task_name        text,
  task_url         text,
  penalized_at     timestamptz not null default now(),
  penalized_date   date        not null,
  penalized_to     text        not null,
  penalized_to_gid text        not null,
  priority         text        not null,    -- usually 'P1'
  reason           text        not null default 'unfinished_p1_eod',
  unique (task_gid, penalized_date)
);
create index if not exists penalties_by_idx   on penalties (penalized_to);
create index if not exists penalties_date_idx on penalties (penalized_date);
