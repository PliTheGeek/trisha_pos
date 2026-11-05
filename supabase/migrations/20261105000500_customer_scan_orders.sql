create table if not exists public.scan_orders (
  scan_order_id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_name text not null check (char_length(customer_name) between 1 and 80),
  customer_contact text not null check (customer_contact ~ '^[0-9]{9,15}$'),
  order_type text not null check (order_type in ('dine_in', 'takeaway', 'delivery')),
  payment_method text check (payment_method in ('cash', 'qris', 'card')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid')),
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  notes text not null default '' check (char_length(notes) <= 500),
  total numeric(12, 2) not null check (total >= 0),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'cancelled')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create index if not exists scan_orders_pending_created_idx
  on public.scan_orders (status, created_at);

alter table public.scan_orders enable row level security;

drop policy if exists "Authenticated users read scan orders" on public.scan_orders;
create policy "Authenticated users read scan orders"
  on public.scan_orders
  for select
  to authenticated
  using (true);

grant select on public.scan_orders to authenticated;

create or replace function public.get_public_scan_menu()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'categories',
    coalesce((
      select jsonb_agg(category.category_name order by category.category_name)
      from public.menu_categories as category
    ), '[]'::jsonb),
    'items',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'product_id', menu.product_id,
          'product_name', menu.product_name,
          'category', menu.category,
          'price', menu.price,
          'description', menu.description,
          'options', coalesce(menu.options, '[]'::jsonb)
        )
        order by menu.product_name
      )
      from public.menu_items as menu
      where menu.is_active = true
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_public_scan_menu() from public;
grant execute on function public.get_public_scan_menu() to anon, authenticated;

create or replace function public.submit_scan_order(
  p_customer_name text,
  p_customer_contact text,
  p_order_type text,
  p_payment_method text,
  p_notes text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_name text := btrim(coalesce(p_customer_name, ''));
  v_customer_contact text := btrim(coalesce(p_customer_contact, ''));
  v_notes text := btrim(coalesce(p_notes, ''));
  v_order_items jsonb := '[]'::jsonb;
  v_order_item record;
  v_menu_item record;
  v_selection record;
  v_option_group jsonb;
  v_option_choice jsonb;
  v_selected_options jsonb;
  v_option_notes text;
  v_unit_price numeric;
  v_total numeric := 0;
  v_item_count integer;
  v_order_id uuid;
  v_order_number text;
begin
  if char_length(v_customer_name) not between 1 and 80 then
    raise exception 'Enter your name (up to 80 characters)';
  end if;

  if v_customer_contact !~ '^[0-9]{9,15}$' then
    raise exception 'Enter a valid WhatsApp number including country code';
  end if;

  if p_order_type is null or p_order_type not in ('dine_in', 'takeaway', 'delivery') then
    raise exception 'Select a valid order type';
  end if;

  if p_order_type = 'delivery' then
    if p_payment_method is not null then
      raise exception 'Delivery payment will be arranged by the store';
    end if;
  elsif p_payment_method is null or p_payment_method not in ('cash', 'qris', 'card') then
    raise exception 'Select a payment preference';
  end if;

  if char_length(v_notes) > 500 then
    raise exception 'Order notes must be 500 characters or fewer';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Order items must be an array';
  end if;

  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 50 then
    raise exception 'An order must have between 1 and 50 items';
  end if;

  for v_order_item in
    select *
    from jsonb_to_recordset(p_items) as input(product_id text, quantity integer, selections jsonb)
  loop
    if v_order_item.product_id is null
      or v_order_item.quantity is null
      or v_order_item.quantity not between 1 and 50 then
      raise exception 'Invalid product or quantity';
    end if;

    if jsonb_typeof(coalesce(v_order_item.selections, '{}'::jsonb)) <> 'object' then
      raise exception 'Product options must be an object';
    end if;

    select
      menu.product_id,
      menu.product_name,
      menu.price,
      coalesce(menu.options, '[]'::jsonb) as options
    into v_menu_item
    from public.menu_items as menu
    where menu.product_id::text = v_order_item.product_id
      and menu.is_active = true;

    if not found then
      raise exception 'A selected menu item is unavailable';
    end if;

    v_unit_price := v_menu_item.price;
    v_selected_options := '[]'::jsonb;
    v_option_notes := '';

    for v_selection in
      select key, value
      from jsonb_each(coalesce(v_order_item.selections, '{}'::jsonb))
    loop
      if jsonb_typeof(v_selection.value) <> 'string' then
        raise exception 'Invalid product option';
      end if;

      select option_group.value
      into v_option_group
      from jsonb_array_elements(v_menu_item.options) as option_group(value)
      where option_group.value->>'group' = v_selection.key
      limit 1;

      if not found then
        raise exception 'A selected product option is unavailable';
      end if;

      select option_choice.value
      into v_option_choice
      from jsonb_array_elements(coalesce(v_option_group->'choices', '[]'::jsonb)) as option_choice(value)
      where option_choice.value->>'name' = v_selection.value #>> '{}'
      limit 1;

      if not found then
        raise exception 'A selected product option is unavailable';
      end if;

      v_unit_price := v_unit_price + coalesce((v_option_choice->>'addPrice')::numeric, 0);
      v_selected_options := v_selected_options || jsonb_build_array(jsonb_build_object(
        'group', v_selection.key,
        'name', v_selection.value #>> '{}'
      ));
      v_option_notes := concat_ws(', ', nullif(v_option_notes, ''), v_selection.key || ': ' || (v_selection.value #>> '{}'));
    end loop;

    v_total := v_total + v_unit_price * v_order_item.quantity;
    v_order_items := v_order_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_menu_item.product_id,
      'product_name', v_menu_item.product_name,
      'quantity', v_order_item.quantity,
      'price', v_unit_price,
      'order_note', v_option_notes,
      'options', v_selected_options
    ));
  end loop;

  v_order_id := gen_random_uuid();
  v_order_number := 'QR-' || upper(substr(replace(v_order_id::text, '-', ''), 1, 8));

  insert into public.scan_orders (
    scan_order_id,
    order_number,
    customer_name,
    customer_contact,
    order_type,
    payment_method,
    items,
    notes,
    total
  ) values (
    v_order_id,
    v_order_number,
    v_customer_name,
    v_customer_contact,
    p_order_type,
    p_payment_method,
    v_order_items,
    v_notes,
    v_total
  );

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total', v_total
  );
end;
$$;

revoke all on function public.submit_scan_order(text, text, text, text, text, jsonb) from public;
grant execute on function public.submit_scan_order(text, text, text, text, text, jsonb) to anon, authenticated;

create or replace function public.update_scan_order_status(
  p_scan_order_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.scan_orders%rowtype;
  v_kitchen_notes text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_status not in ('accepted', 'cancelled') then
    raise exception 'Unsupported scan order status';
  end if;

  update public.scan_orders
  set status = p_status,
      accepted_at = case when p_status = 'accepted' then now() else null end
  where scan_order_id = p_scan_order_id
    and status = 'pending'
  returning * into v_order;

  if not found then
    raise exception 'Incoming order not found or already handled';
  end if;

  if p_status = 'accepted' then
    v_kitchen_notes := concat_ws(E'\n',
      'Scan order · ' || case v_order.order_type
        when 'dine_in' then 'Dine in'
        when 'takeaway' then 'Takeaway / pickup'
        else 'Delivery'
      end,
      'Customer: ' || v_order.customer_name,
      'WhatsApp: ' || v_order.customer_contact,
      case when v_order.payment_method is null then 'Payment: contact customer via WhatsApp'
        else 'Payment preference: ' || upper(v_order.payment_method) || ' (not yet paid)' end,
      nullif(v_order.notes, '')
    );

    insert into public.kitchen_orders (order_number, items, notes)
    values (v_order.order_number, v_order.items, v_kitchen_notes);
  end if;
end;
$$;

revoke all on function public.update_scan_order_status(uuid, text) from public, anon;
grant execute on function public.update_scan_order_status(uuid, text) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'scan_orders'
  ) then
    alter publication supabase_realtime add table public.scan_orders;
  end if;
end
$$;
