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
