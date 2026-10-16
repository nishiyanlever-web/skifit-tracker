-- Run once in Supabase SQL Editor. Do not disable RLS.
create table if not exists public.records (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  kind text not null check (kind in ('daily','workout')),
  payload jsonb not null,
  updated_at timestamptz not null,
  deleted boolean not null default false,
  primary key (user_id,id)
);
create index if not exists records_user_updated_idx on public.records(user_id,updated_at desc);
alter table public.records enable row level security;
drop policy if exists records_select_own on public.records;
create policy records_select_own on public.records for select to authenticated using (auth.uid()=user_id);
drop policy if exists records_insert_own on public.records;
create policy records_insert_own on public.records for insert to authenticated with check (auth.uid()=user_id);
drop policy if exists records_update_own on public.records;
create policy records_update_own on public.records for update to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
drop policy if exists records_delete_own on public.records;
create policy records_delete_own on public.records for delete to authenticated using (auth.uid()=user_id);
