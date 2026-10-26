-- Apply this file in the Supabase SQL Editor after schema.sql.
-- It creates the tables and Realtime publication used by voice calls.
-- جدول تخزين إشارات المكالمات الفورية عبر Supabase Realtime
create table if not exists public.calls (
  id uuid default gen_random_uuid() primary key,
  caller_id uuid references public.users(id) on delete cascade not null,
  receiver_id uuid references public.users(id) on delete cascade not null,
  caller_name text not null,
  status text default 'calling' check (status in ('calling', 'accepted', 'rejected', 'ended')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.calls enable row level security;
drop policy if exists "Allow all on calls" on public.calls;
create policy "Allow all on calls" on public.calls for all using (true);

create table if not exists public.call_rooms (
  id uuid default gen_random_uuid() primary key,
  created_by uuid references public.users(id) on delete cascade not null,
  status text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.call_participants (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references public.call_rooms(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  invited_by uuid references public.users(id) on delete cascade not null,
  status text not null default 'invited' check (status in ('invited', 'active', 'declined', 'left')),
  noise_suppression_enabled boolean not null default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  joined_at timestamp with time zone default null,
  unique (room_id, user_id)
);

create index if not exists call_participants_user_status_idx
  on public.call_participants (user_id, status);
create index if not exists call_participants_room_status_idx
  on public.call_participants (room_id, status);

alter table public.call_rooms enable row level security;
alter table public.call_participants enable row level security;
drop policy if exists "Allow all on call rooms" on public.call_rooms;
create policy "Allow all on call rooms" on public.call_rooms for all using (true);
drop policy if exists "Allow all on call participants" on public.call_participants;
create policy "Allow all on call participants" on public.call_participants for all using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'calls'
  ) then
    alter publication supabase_realtime add table public.calls;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'call_rooms'
  ) then
    alter publication supabase_realtime add table public.call_rooms;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'call_participants'
  ) then
    alter publication supabase_realtime add table public.call_participants;
  end if;
end
$$;
