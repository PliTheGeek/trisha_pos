create table if not exists public.menu_categories (
  category_name text primary key check (category_name = btrim(category_name) and category_name <> ''),
  created_at timestamptz not null default now()
);

alter table public.menu_categories enable row level security;

drop policy if exists "Authenticated users read menu categories" on public.menu_categories;
create policy "Authenticated users read menu categories"
  on public.menu_categories
  for select
  to authenticated
  using (true);

grant select on public.menu_categories to authenticated;

update public.menu_items
set category = case
  when lower(btrim(category)) in ('non-coffee', 'non_coffee') then 'Non-Coffee'
  when lower(btrim(category)) in ('snack', 'snacks') then 'Snacks'
  else btrim(category)
end
where category is not null;

create unique index if not exists menu_categories_name_lower_idx
  on public.menu_categories (lower(category_name));

insert into public.menu_categories (category_name)
values ('Coffee'), ('Non-Coffee'), ('Snacks'), ('Retail')
on conflict do nothing;

insert into public.menu_categories (category_name)
select distinct btrim(category)
from public.menu_items
where nullif(btrim(category), '') is not null
on conflict do nothing;

create or replace function public.manage_menu_category(
  p_action text,
  p_category_name text,
  p_new_name text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_category_name text := btrim(coalesce(p_category_name, ''));
  v_new_name text := btrim(coalesce(p_new_name, ''));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select role::text into v_role
  from public.profiles
  where id = auth.uid();

  if v_role is distinct from 'admin' then
    raise exception 'Admin role required';
  end if;

  if v_category_name = '' then
    raise exception 'Category name is required';
  end if;

  if p_action = 'create' then
    if exists (
      select 1 from public.menu_categories
      where lower(category_name) = lower(v_category_name)
    ) then
      raise exception 'A category with this name already exists';
    end if;

    insert into public.menu_categories (category_name) values (v_category_name);
  elsif p_action = 'rename' then
    if v_new_name = '' then
      raise exception 'New category name is required';
    end if;
    if not exists (
      select 1 from public.menu_categories
      where category_name = v_category_name
    ) then
      raise exception 'Category not found';
    end if;
    if exists (
      select 1 from public.menu_categories
      where lower(category_name) = lower(v_new_name)
        and category_name <> v_category_name
    ) then
      raise exception 'A category with this name already exists';
    end if;

    update public.menu_items
    set category = v_new_name
    where category = v_category_name;

    update public.menu_categories
    set category_name = v_new_name
    where category_name = v_category_name;
  elsif p_action = 'delete' then
    if exists (
      select 1 from public.menu_items
      where category = v_category_name
    ) then
      raise exception 'Move or delete menu items in this category before deleting it';
    end if;

    delete from public.menu_categories
    where category_name = v_category_name;

    if not found then
      raise exception 'Category not found';
    end if;
  else
    raise exception 'Unsupported category operation';
  end if;
end;
$$;

revoke all on function public.manage_menu_category(text, text, text) from public, anon;
grant execute on function public.manage_menu_category(text, text, text) to authenticated;
