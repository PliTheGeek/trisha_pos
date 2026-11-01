-- Additive migration only. This does not alter or delete existing POS data.
create extension if not exists pgcrypto;

do $$
begin
  create type public.kitchen_order_status as enum ('queued', 'finished');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.kitchen_orders (
  kitchen_order_id uuid primary key default gen_random_uuid(),
  order_number text not null,
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  notes text not null default '',
  status public.kitchen_order_status not null default 'queued',
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists kitchen_orders_queue_idx
  on public.kitchen_orders (status, created_at);

alter table public.kitchen_orders enable row level security;

drop policy if exists "Authenticated users read kitchen queue" on public.kitchen_orders;
create policy "Authenticated users read kitchen queue"
  on public.kitchen_orders for select to authenticated using (true);

drop policy if exists "Authenticated users create kitchen queue" on public.kitchen_orders;
create policy "Authenticated users create kitchen queue"
  on public.kitchen_orders for insert to authenticated with check (true);

drop policy if exists "Authenticated users finish kitchen queue" on public.kitchen_orders;
create policy "Authenticated users finish kitchen queue"
  on public.kitchen_orders for update to authenticated
  using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'kitchen_orders'
  ) then
    alter publication supabase_realtime add table public.kitchen_orders;
  end if;
end
$$;
