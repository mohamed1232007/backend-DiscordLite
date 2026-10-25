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
create policy "Allow all on calls" on public.calls for all using (true);
alter publication supabase_realtime add table public.calls;

