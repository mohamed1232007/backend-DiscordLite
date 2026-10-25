
-- 1. تفعيل الامتدادات المطلوبة لتوليد الـ UUID والتشفير
create extension if not exists "pgcrypto";

-- 2. جدول المستخدمين (Custom Users Table بديل آمن وسهل بعيد عن تعقيدات إيميلات Supabase)
create table if not exists public.users (
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

-- 3. جدول السيرفرات (Servers)
create table if not exists public.servers (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  icon_url text default null,
  owner_id uuid references public.users(id) on delete cascade not null,
  invite_code text unique default substring(md5(random()::text) from 1 for 8),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. جدول أعضاء السيرفرات (Server Members)
create table if not exists public.server_members (
  id uuid default gen_random_uuid() primary key,
  server_id uuid references public.servers(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  role text default 'member' check (role in ('owner', 'admin', 'moderator', 'member')),
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (server_id, user_id)
);

-- 5. جدول القنوات الصوتية والنصية داخل السيرفرات (Channels)
create table if not exists public.channels (
  id uuid default gen_random_uuid() primary key,
  server_id uuid references public.servers(id) on delete cascade not null,
  name text not null,
  type text default 'text' check (type in ('text', 'voice')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. جدول رسائل القنوات (Channel Messages)
create table if not exists public.channel_messages (
  id uuid default gen_random_uuid() primary key,
  channel_id uuid references public.channels(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  content text not null,
  file_url text default null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 7. جدول الرسائل المباشرة الفردية بين شخصين (Direct Messages)
create table if not exists public.direct_messages (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid references public.users(id) on delete cascade not null,
  receiver_id uuid references public.users(id) on delete cascade not null,
  content text not null,
  file_url text default null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 8. جدول الأصدقاء وطلبات الصداقة (Friends)
create table if not exists public.friends (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  friend_id uuid references public.users(id) on delete cascade not null,
  status text default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (user_id, friend_id)
);

-- ==============================================================================
-- إعدادات الأمان (Row Level Security - RLS)
-- ==============================================================================
alter table public.users enable row level security;
alter table public.servers enable row level security;
alter table public.server_members enable row level security;
alter table public.channels enable row level security;
alter table public.channel_messages enable row level security;
alter table public.direct_messages enable row level security;
alter table public.friends enable row level security;

-- السماح للـ Service Role (الباك إند) والعموم بالتعامل مع البيانات وفق الصلاحيات
create policy "Allow all operations for backend service role" on public.users for all using (true);
create policy "Allow all operations for servers" on public.servers for all using (true);
create policy "Allow all operations for members" on public.server_members for all using (true);
create policy "Allow all operations for channels" on public.channels for all using (true);
create policy "Allow all operations for channel_messages" on public.channel_messages for all using (true);
create policy "Allow all operations for direct_messages" on public.direct_messages for all using (true);
create policy "Allow all operations for friends" on public.friends for all using (true);

-- ==============================================================================
-- تفعيل البث اللحظي (Realtime) لرسائل وتحديثات الديسكورد
-- ==============================================================================
alter publication supabase_realtime add table public.channel_messages;
alter publication supabase_realtime add table public.direct_messages;
alter publication supabase_realtime add table public.users;
