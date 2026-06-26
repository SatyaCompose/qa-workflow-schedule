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
