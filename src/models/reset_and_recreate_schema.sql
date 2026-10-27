-- DESTRUCTIVE: This script deletes all data in the application tables listed below.
-- Back up the database before running it. It does not drop Supabase system tables.

begin;

create extension if not exists "pgcrypto";

drop table if exists
  public.calls,
  public.call_participants,
  public.call_rooms,
  public.channel_messages,
  public.direct_messages,
  public.friends,
  public.channels,
  public.server_members,
  public.servers,
  public.users
cascade;

create table public.users (
  id uuid default gen_random_uuid() primary key,
  email text unique not null,
  password_hash text not null,
  username text unique not null,
  display_name text not null,
  avatar_url text default null,
  custom_status text default null,
  status text default 'online' check (status in ('online', 'idle', 'dnd', 'offline')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.servers (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  icon_url text default null,
  owner_id uuid references public.users(id) on delete cascade not null,
  invite_code text unique default substring(md5(random()::text) from 1 for 8),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.server_members (
  id uuid default gen_random_uuid() primary key,
  server_id uuid references public.servers(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  role text default 'member' check (role in ('owner', 'admin', 'moderator', 'member')),
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (server_id, user_id)
);

create table public.channels (
  id uuid default gen_random_uuid() primary key,
  server_id uuid references public.servers(id) on delete cascade not null,
  name text not null,
  type text default 'text' check (type in ('text', 'voice')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.channel_messages (
  id uuid default gen_random_uuid() primary key,
  channel_id uuid references public.channels(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  content text not null,
  file_url text default null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.direct_messages (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid references public.users(id) on delete cascade not null,
  receiver_id uuid references public.users(id) on delete cascade not null,
  content text not null,
  file_url text default null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.friends (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  friend_id uuid references public.users(id) on delete cascade not null,
  status text default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (user_id, friend_id)
);

create table public.calls (
  id uuid default gen_random_uuid() primary key,
  caller_id uuid references public.users(id) on delete cascade not null,
  receiver_id uuid references public.users(id) on delete cascade not null,
  caller_name text not null,
  status text default 'calling' check (status in ('calling', 'accepted', 'rejected', 'ended')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.call_rooms (
  id uuid default gen_random_uuid() primary key,
  created_by uuid references public.users(id) on delete cascade not null,
  status text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.call_participants (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references public.call_rooms(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  peer_id text,
  invited_by uuid references public.users(id) on delete cascade not null,
  status text not null default 'invited' check (status in ('invited', 'active', 'declined', 'left')),
  noise_suppression_enabled boolean not null default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  joined_at timestamp with time zone default null,
  unique (room_id, user_id)
);

create unique index call_participants_peer_id_idx
  on public.call_participants (peer_id)
  where peer_id is not null;
create index call_participants_user_status_idx
  on public.call_participants (user_id, status);
create index call_participants_room_status_idx
  on public.call_participants (room_id, status);

alter table public.users enable row level security;
alter table public.servers enable row level security;
alter table public.server_members enable row level security;
alter table public.channels enable row level security;
alter table public.channel_messages enable row level security;
alter table public.direct_messages enable row level security;
alter table public.friends enable row level security;
alter table public.calls enable row level security;
alter table public.call_rooms enable row level security;
alter table public.call_participants enable row level security;

create policy "Allow all operations for backend service role" on public.users for all using (true);
create policy "Allow all operations for servers" on public.servers for all using (true);
create policy "Allow all operations for members" on public.server_members for all using (true);
create policy "Allow all operations for channels" on public.channels for all using (true);
create policy "Allow all operations for channel_messages" on public.channel_messages for all using (true);
create policy "Allow all operations for direct_messages" on public.direct_messages for all using (true);
create policy "Allow all operations for friends" on public.friends for all using (true);
create policy "Allow all on calls" on public.calls for all using (true);
create policy "Allow all on call rooms" on public.call_rooms for all using (true);
create policy "Allow all on call participants" on public.call_participants for all using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'channel_messages'
  ) then
    alter publication supabase_realtime add table public.channel_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_messages'
  ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'users'
  ) then
    alter publication supabase_realtime add table public.users;
  end if;
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

commit;
