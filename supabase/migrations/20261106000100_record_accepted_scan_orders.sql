alter table public.transactions
  drop constraint if exists transactions_order_type_check,
  add constraint transactions_order_type_check
    check (order_type in ('dine_in', 'takeaway', 'delivery'));

alter table public.transactions
  add column if not exists scan_order_id uuid
    references public.scan_orders(scan_order_id),
  add column if not exists scan_payment_preference text
    check (scan_payment_preference in ('cash', 'qris', 'card'));

create unique index if not exists transactions_scan_order_id_idx
  on public.transactions (scan_order_id)
  where scan_order_id is not null;

drop function if exists public.update_scan_order_status(uuid, text);

create function public.update_scan_order_status(
  p_scan_order_id uuid,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.scan_orders%rowtype;
  v_transaction_id uuid;
  v_rpc record;
  v_rpc_sql text;
  v_kitchen_notes text;
  v_item jsonb;
  v_order_note text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_status not in ('accepted', 'cancelled') then
    raise exception 'Unsupported scan order status';
  end if;

  select *
  into v_order
  from public.scan_orders
  where scan_order_id = p_scan_order_id
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Incoming order not found or already handled';
  end if;

  if p_status = 'accepted' then
    if exists (
      select 1
      from public.transactions
      where scan_order_id = v_order.scan_order_id
    ) then
      raise exception 'A transaction already exists for this scan order';
    end if;

    select
      proc.proargtypes[0] as payment_type,
      proc.proargtypes[1] as items_type,
      proc.proargtypes[2] as discounts_type,
      proc.proargtypes[3] as cash_type,
      proc.proargtypes[4] as status_type,
      proc.proargtypes[5] as notes_type
    into v_rpc
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_namespace as ns on ns.oid = proc.pronamespace
    where ns.nspname = 'public'
      and proc.proname = 'create_pos_transaction'
      and proc.pronargs = 6
      and proc.proargnames[1:6] = array[
        'p_payment_method',
        'p_items',
        'p_discount_ids',
        'p_cash_received',
        'p_status',
        'p_notes'
      ];

    if not found then
      raise exception 'Could not find the expected create_pos_transaction function';
    end if;

    v_rpc_sql := pg_catalog.format(
      'select public.create_pos_transaction(%L::%s, $1::%s, array[]::%s, 0::%s, %L::%s, %L::%s)',
      'open_bill',
      pg_catalog.format_type(v_rpc.payment_type, null),
      pg_catalog.format_type(v_rpc.items_type, null),
      pg_catalog.format_type(v_rpc.discounts_type, null),
      pg_catalog.format_type(v_rpc.cash_type, null),
      'pending',
      pg_catalog.format_type(v_rpc.status_type, null),
      pg_catalog.concat(
        'Scan order ',
        v_order.order_number,
        ' · ',
        case v_order.order_type
          when 'dine_in' then 'Dine in'
          when 'takeaway' then 'Takeaway / pickup'
          else 'Delivery'
        end,
        case
          when v_order.payment_method is null then ' · Payment: arrange with customer'
          else ' · Payment preference: ' || pg_catalog.upper(v_order.payment_method) || ' (not paid)'
        end,
        case when v_order.notes = '' then '' else ' · ' || v_order.notes end
      ),
      pg_catalog.format_type(v_rpc.notes_type, null)
    );

    execute v_rpc_sql into v_transaction_id using v_order.items;

    for v_item in
      select value
      from pg_catalog.jsonb_array_elements(v_order.items)
    loop
      v_order_note := coalesce(v_item->>'order_note', '');
      update public.transaction_items
      set price = (v_item->>'price')::numeric,
          order_note = v_order_note
      where transaction_id = v_transaction_id
        and product_id::text = v_item->>'product_id'
        and coalesce(order_note, '') = v_order_note;
    end loop;

    update public.transactions
    set subtotal = v_order.total,
        discount_total = 0,
        total = v_order.total,
        customer_name = v_order.customer_name,
        customer_contact = v_order.customer_contact,
        order_type = v_order.order_type,
        scan_order_id = v_order.scan_order_id,
        scan_payment_preference = v_order.payment_method
    where transaction_id = v_transaction_id;

    v_kitchen_notes := pg_catalog.concat_ws(E'\n',
      'Scan order · ' || case v_order.order_type
        when 'dine_in' then 'Dine in'
        when 'takeaway' then 'Takeaway / pickup'
        else 'Delivery'
      end,
      'Customer: ' || v_order.customer_name,
      'WhatsApp: ' || v_order.customer_contact,
      case when v_order.payment_method is null then 'Payment: contact customer via WhatsApp'
        else 'Payment preference: ' || pg_catalog.upper(v_order.payment_method) || ' (not yet paid)' end,
      nullif(v_order.notes, '')
    );

    insert into public.kitchen_orders (order_number, items, notes)
    values (v_order.order_number, v_order.items, v_kitchen_notes);
  end if;

  update public.scan_orders
  set status = p_status,
      accepted_at = case when p_status = 'accepted' then now() else null end
  where scan_order_id = v_order.scan_order_id;

  return v_transaction_id;
end;
$$;

revoke all on function public.update_scan_order_status(uuid, text) from public, anon;
grant execute on function public.update_scan_order_status(uuid, text) to authenticated;
