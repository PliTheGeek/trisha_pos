


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'cashier'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."cashflow_type" AS ENUM (
    'income',
    'expense'
);


ALTER TYPE "public"."cashflow_type" OWNER TO "postgres";


CREATE TYPE "public"."discount_type" AS ENUM (
    'percentage',
    'flat'
);


ALTER TYPE "public"."discount_type" OWNER TO "postgres";


CREATE TYPE "public"."kitchen_order_status" AS ENUM (
    'queued',
    'finished'
);


ALTER TYPE "public"."kitchen_order_status" OWNER TO "postgres";


CREATE TYPE "public"."payment_method" AS ENUM (
    'cash',
    'qris',
    'card',
    'open_bill',
    'split'
);


ALTER TYPE "public"."payment_method" OWNER TO "postgres";


CREATE TYPE "public"."purchase_order_status" AS ENUM (
    'awaiting_payment',
    'paid',
    'rejected'
);


ALTER TYPE "public"."purchase_order_status" OWNER TO "postgres";


CREATE TYPE "public"."purchase_request_status" AS ENUM (
    'pending',
    'ordered',
    'rejected',
    'aborted'
);


ALTER TYPE "public"."purchase_request_status" OWNER TO "postgres";


CREATE TYPE "public"."status" AS ENUM (
    'active',
    'inactive',
    'archived'
);


ALTER TYPE "public"."status" OWNER TO "postgres";


CREATE TYPE "public"."transaction_status" AS ENUM (
    'pending',
    'paid',
    'voided'
);


ALTER TYPE "public"."transaction_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_pos_transaction"("p_payment_method" "public"."payment_method", "p_items" "jsonb", "p_discount_ids" "text"[], "p_cash_received" numeric, "p_status" "public"."transaction_status", "p_notes" "text", "p_contact_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_transaction_id uuid;
  v_item jsonb;
  v_menu menu_items%rowtype;
  v_discount discounts%rowtype;
  v_subtotal numeric(14,2) := 0;
  v_discount_total numeric(14,2) := 0;
  v_discount_amount numeric(14,2);
  v_total numeric(14,2);
  v_quantity integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one transaction item is required';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_menu from public.menu_items
    where product_id = v_item ->> 'product_id' and is_active;
    if not found then raise exception 'Menu item is unavailable'; end if;
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity is null or v_quantity <= 0 then raise exception 'Invalid item quantity'; end if;
    v_subtotal := v_subtotal + (v_menu.price * v_quantity);
  end loop;

  for v_discount in select * from public.discounts
    where discount_id = any(p_discount_ids) and is_active
      and minimum_subtotal <= v_subtotal
  loop
    v_discount_amount := case when v_discount.discount_type = 'percentage'
      then round(v_subtotal * v_discount.discount_value / 100, 2)
      else least(v_discount.discount_value, v_subtotal) end;
    v_discount_total := least(v_subtotal, v_discount_total + v_discount_amount);
  end loop;

  v_total := greatest(0, v_subtotal - v_discount_total);
  if p_payment_method = 'cash' and p_cash_received < v_total then
    raise exception 'Insufficient cash received';
  end if;

  insert into public.transactions (
    cashier_id, status, payment_method, subtotal, discount_total, total,
    cash_received, change_due, notes, contact_id
  ) values (
    auth.uid(), p_status, p_payment_method, v_subtotal, v_discount_total, v_total,
    case when p_payment_method = 'cash' then p_cash_received else 0 end,
    case when p_payment_method = 'cash' then p_cash_received - v_total else 0 end,
    coalesce(p_notes, ''),
    p_contact_id
  ) returning transaction_id into v_transaction_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_menu from public.menu_items
    where product_id = v_item ->> 'product_id';
    insert into public.transaction_items (
      transaction_id, product_id, product_name, category, price, cogs, description,
      quantity, order_note
    ) values (
      v_transaction_id, v_menu.product_id, v_menu.product_name, v_menu.category,
      v_menu.price, v_menu.cogs, v_menu.description, (v_item ->> 'quantity')::integer,
      coalesce(v_item ->> 'order_note', '')
    );
  end loop;

  insert into public.transaction_discounts
    (transaction_id, discount_id, discount_name, discount_value)
  select v_transaction_id, d.discount_id, d.discount_name,
    case when d.discount_type = 'percentage'
      then round(v_subtotal * d.discount_value / 100, 2)
      else least(d.discount_value, v_subtotal) end
  from public.discounts d
  where d.discount_id = any(p_discount_ids) and d.is_active;

  return v_transaction_id;
end;
$$;


ALTER FUNCTION "public"."create_pos_transaction"("p_payment_method" "public"."payment_method", "p_items" "jsonb", "p_discount_ids" "text"[], "p_cash_received" numeric, "p_status" "public"."transaction_status", "p_notes" "text", "p_contact_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_scan_menu"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
          'options', coalesce(to_jsonb(menu)->'options', '[]'::jsonb)
        )
        order by menu.product_name
      )
      from public.menu_items as menu
      where menu.is_active = true
    ), '[]'::jsonb)
  );
$$;


ALTER FUNCTION "public"."get_public_scan_menu"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."manage_menu_category"("p_action" "text", "p_category_name" "text", "p_new_name" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."manage_menu_category"("p_action" "text", "p_category_name" "text", "p_new_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_pos_transaction_details"("p_transaction_id" "uuid", "p_customer_name" "text", "p_customer_contact" "text", "p_order_type" "text", "p_payments" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_total numeric;
  v_payment_method text;
  v_payments jsonb := coalesce(p_payments, '[]'::jsonb);
  v_payment_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_order_type not in ('dine_in', 'takeaway') then
    raise exception 'Invalid order type';
  end if;

  if jsonb_typeof(v_payments) <> 'array' then
    raise exception 'Payments must be an array';
  end if;

  update public.transactions
  set customer_name = nullif(btrim(p_customer_name), ''),
      customer_contact = nullif(btrim(p_customer_contact), ''),
      order_type = p_order_type
  where transaction_id = p_transaction_id
    and cashier_id = auth.uid()
  returning total, payment_method::text into v_total, v_payment_method;

  if not found then
    raise exception 'Transaction not found or access denied';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_payments) as payment(method text, amount numeric, cash_received numeric)
    where payment.method is null
      or payment.method not in ('cash', 'qris', 'card')
      or payment.amount is null
      or payment.amount <= 0
      or payment.cash_received is null
      or payment.cash_received < 0
      or (payment.method = 'cash' and payment.cash_received < payment.amount)
      or (payment.method <> 'cash' and payment.cash_received <> 0)
  ) then
    raise exception 'Invalid payment details';
  end if;

  select count(*) into v_payment_count
  from jsonb_to_recordset(v_payments) as payment(method text, amount numeric, cash_received numeric);

  if v_payment_method = 'open_bill' then
    if v_payment_count <> 0 then
      raise exception 'Open bills cannot have payment details before closing';
    end if;
  else
    if v_payment_count = 0 then
      raise exception 'At least one payment is required';
    end if;

    if abs((
      select coalesce(sum(payment.amount), 0)
      from jsonb_to_recordset(v_payments) as payment(method text, amount numeric, cash_received numeric)
    ) - v_total) > 0.01 then
      raise exception 'Payment amounts must equal the transaction total';
    end if;
  end if;

  delete from public.transaction_payments
  where transaction_id = p_transaction_id;

  insert into public.transaction_payments (transaction_id, method, amount, cash_received)
  select
    p_transaction_id,
    payment.method,
    payment.amount,
    payment.cash_received
  from jsonb_to_recordset(v_payments) as payment(method text, amount numeric, cash_received numeric);
end;
$$;


ALTER FUNCTION "public"."record_pos_transaction_details"("p_transaction_id" "uuid", "p_customer_name" "text", "p_customer_contact" "text", "p_order_type" "text", "p_payments" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."settle_pos_open_bill"("p_transaction_id" "uuid", "p_payments" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_total numeric;
  v_cash_received numeric;
  v_payment_count integer;
  v_payment_method public.payment_method;
  v_payments jsonb := coalesce(p_payments, '[]'::jsonb);
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(v_payments) <> 'array' then
    raise exception 'Payments must be an array';
  end if;

  select total into v_total
  from public.transactions
  where transaction_id = p_transaction_id
    and cashier_id = auth.uid()
    and payment_method = 'open_bill'
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Open bill not found or already settled';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_payments) as payment(method text, amount numeric, cash_received numeric)
    where payment.method is null
      or payment.method not in ('cash', 'qris', 'card')
      or payment.amount is null
      or payment.amount <= 0
      or payment.cash_received is null
      or payment.cash_received < 0
      or (payment.method = 'cash' and payment.cash_received < payment.amount)
      or (payment.method <> 'cash' and payment.cash_received <> 0)
  ) then
    raise exception 'Invalid payment details';
  end if;

  select count(*) into v_payment_count
  from jsonb_to_recordset(v_payments) as payment(method text, amount numeric, cash_received numeric);

  if v_payment_count = 0 then
    raise exception 'At least one payment is required';
  end if;

  if abs((
    select coalesce(sum(payment.amount), 0)
    from jsonb_to_recordset(v_payments) as payment(method text, amount numeric, cash_received numeric)
  ) - v_total) > 0.01 then
    raise exception 'Payment amounts must equal the open bill total';
  end if;

  select coalesce(sum(payment.cash_received), 0) into v_cash_received
  from jsonb_to_recordset(v_payments) as payment(method text, amount numeric, cash_received numeric)
  where payment.method = 'cash';

  if v_payment_count > 1 then
    v_payment_method := 'split'::public.payment_method;
  else
    select payment.method::public.payment_method into v_payment_method
    from jsonb_to_recordset(v_payments) as payment(method text, amount numeric, cash_received numeric);
  end if;

  update public.transactions
  set payment_method = v_payment_method,
      status = 'paid',
      cash_received = v_cash_received
  where transaction_id = p_transaction_id;

  insert into public.transaction_payments (transaction_id, method, amount, cash_received)
  select
    p_transaction_id,
    payment.method,
    payment.amount,
    payment.cash_received
  from jsonb_to_recordset(v_payments) as payment(method text, amount numeric, cash_received numeric);
end;
$$;


ALTER FUNCTION "public"."settle_pos_open_bill"("p_transaction_id" "uuid", "p_payments" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_scan_order"("p_customer_name" "text", "p_customer_contact" "text", "p_order_type" "text", "p_payment_method" "text", "p_notes" "text", "p_items" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
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
      coalesce(to_jsonb(menu)->'options', '[]'::jsonb) as options
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
$_$;


ALTER FUNCTION "public"."submit_scan_order"("p_customer_name" "text", "p_customer_contact" "text", "p_order_type" "text", "p_payment_method" "text", "p_notes" "text", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_scan_order_status"("p_scan_order_id" "uuid", "p_status" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
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
      procedure.proargtypes[0] as payment_type,
      procedure.proargtypes[1] as items_type,
      procedure.proargtypes[2] as discounts_type,
      procedure.proargtypes[3] as cash_type,
      procedure.proargtypes[4] as status_type,
      procedure.proargtypes[5] as notes_type
    into v_rpc
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as schema on schema.oid = procedure.pronamespace
    where schema.nspname = 'public'
      and procedure.proname = 'create_pos_transaction'
      and procedure.pronargs = 6
      and procedure.proargnames[1:6] = array[
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
$_$;


ALTER FUNCTION "public"."update_scan_order_status"("p_scan_order_id" "uuid", "p_status" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "contact_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."discounts" (
    "discount_id" "text" NOT NULL,
    "discount_name" "text" NOT NULL,
    "discount_value" numeric(14,2) NOT NULL,
    "discount_type" "public"."discount_type" DEFAULT 'flat'::"public"."discount_type" NOT NULL,
    "minimum_subtotal" numeric(14,2) DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "discounts_discount_value_check" CHECK (("discount_value" > (0)::numeric)),
    CONSTRAINT "discounts_minimum_subtotal_check" CHECK (("minimum_subtotal" >= (0)::numeric))
);


ALTER TABLE "public"."discounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kitchen_orders" (
    "kitchen_order_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_number" "text" NOT NULL,
    "items" "jsonb" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "status" "public"."kitchen_order_status" DEFAULT 'queued'::"public"."kitchen_order_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    CONSTRAINT "kitchen_orders_items_check" CHECK (("jsonb_typeof"("items") = 'array'::"text"))
);


ALTER TABLE "public"."kitchen_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_categories" (
    "category_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "menu_categories_category_name_check" CHECK ((("category_name" = "btrim"("category_name")) AND ("category_name" <> ''::"text")))
);


ALTER TABLE "public"."menu_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_items" (
    "product_id" "text" NOT NULL,
    "product_name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "price" numeric(14,2) NOT NULL,
    "cogs" numeric(14,2) DEFAULT 0 NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "menu_items_cogs_check" CHECK (("cogs" >= (0)::numeric)),
    CONSTRAINT "menu_items_price_check" CHECK (("price" >= (0)::numeric))
);


ALTER TABLE "public"."menu_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text" DEFAULT ''::"text" NOT NULL,
    "role" "public"."app_role" DEFAULT 'cashier'::"public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scan_orders" (
    "scan_order_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_number" "text" NOT NULL,
    "customer_name" "text" NOT NULL,
    "customer_contact" "text" NOT NULL,
    "order_type" "text" NOT NULL,
    "payment_method" "text",
    "payment_status" "text" DEFAULT 'unpaid'::"text" NOT NULL,
    "items" "jsonb" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "total" numeric(12,2) NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_at" timestamp with time zone,
    CONSTRAINT "scan_orders_customer_contact_check" CHECK (("customer_contact" ~ '^[0-9]{9,15}$'::"text")),
    CONSTRAINT "scan_orders_customer_name_check" CHECK ((("char_length"("customer_name") >= 1) AND ("char_length"("customer_name") <= 80))),
    CONSTRAINT "scan_orders_items_check" CHECK (("jsonb_typeof"("items") = 'array'::"text")),
    CONSTRAINT "scan_orders_notes_check" CHECK (("char_length"("notes") <= 500)),
    CONSTRAINT "scan_orders_order_type_check" CHECK (("order_type" = ANY (ARRAY['dine_in'::"text", 'takeaway'::"text", 'delivery'::"text"]))),
    CONSTRAINT "scan_orders_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['cash'::"text", 'qris'::"text", 'card'::"text"]))),
    CONSTRAINT "scan_orders_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['unpaid'::"text", 'paid'::"text"]))),
    CONSTRAINT "scan_orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "scan_orders_total_check" CHECK (("total" >= (0)::numeric))
);


ALTER TABLE "public"."scan_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transaction_discounts" (
    "transaction_id" "uuid" NOT NULL,
    "discount_id" "text" NOT NULL,
    "discount_name" "text" NOT NULL,
    "discount_value" numeric(14,2) NOT NULL,
    CONSTRAINT "transaction_discounts_discount_value_check" CHECK (("discount_value" >= (0)::numeric))
);


ALTER TABLE "public"."transaction_discounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transaction_items" (
    "transaction_item_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transaction_id" "uuid" NOT NULL,
    "product_id" "text" NOT NULL,
    "product_name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "price" numeric(14,2) NOT NULL,
    "cogs" numeric(14,2) DEFAULT 0 NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "quantity" integer NOT NULL,
    "line_total" numeric(14,2) GENERATED ALWAYS AS ((("quantity")::numeric * "price")) STORED,
    "order_note" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "transaction_items_price_check" CHECK (("price" >= (0)::numeric)),
    CONSTRAINT "transaction_items_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."transaction_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transaction_payments" (
    "transaction_payment_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transaction_id" "uuid" NOT NULL,
    "method" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "cash_received" numeric(12,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transaction_payments_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "transaction_payments_cash_received_check" CHECK (("cash_received" >= (0)::numeric)),
    CONSTRAINT "transaction_payments_check" CHECK ((("method" = 'cash'::"text") OR ("cash_received" = (0)::numeric))),
    CONSTRAINT "transaction_payments_check1" CHECK ((("method" <> 'cash'::"text") OR ("cash_received" >= "amount"))),
    CONSTRAINT "transaction_payments_method_check" CHECK (("method" = ANY (ARRAY['cash'::"text", 'qris'::"text", 'card'::"text"])))
);


ALTER TABLE "public"."transaction_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "transaction_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cashier_id" "uuid" NOT NULL,
    "status" "public"."transaction_status" DEFAULT 'paid'::"public"."transaction_status" NOT NULL,
    "payment_method" "public"."payment_method" NOT NULL,
    "subtotal" numeric(14,2) NOT NULL,
    "discount_total" numeric(14,2) DEFAULT 0 NOT NULL,
    "total" numeric(14,2) NOT NULL,
    "cash_received" numeric(14,2) DEFAULT 0 NOT NULL,
    "change_due" numeric(14,2) DEFAULT 0 NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "customer_name" "text",
    "customer_contact" "text",
    "order_type" "text" DEFAULT 'dine_in'::"text" NOT NULL,
    "scan_order_id" "uuid",
    "scan_payment_preference" "text",
    "contact_id" "uuid",
    CONSTRAINT "transactions_cash_received_check" CHECK (("cash_received" >= (0)::numeric)),
    CONSTRAINT "transactions_change_due_check" CHECK (("change_due" >= (0)::numeric)),
    CONSTRAINT "transactions_discount_total_check" CHECK (("discount_total" >= (0)::numeric)),
    CONSTRAINT "transactions_order_type_check" CHECK (("order_type" = ANY (ARRAY['dine_in'::"text", 'takeaway'::"text", 'delivery'::"text"]))),
    CONSTRAINT "transactions_scan_payment_preference_check" CHECK (("scan_payment_preference" = ANY (ARRAY['cash'::"text", 'qris'::"text", 'card'::"text"]))),
    CONSTRAINT "transactions_subtotal_check" CHECK (("subtotal" >= (0)::numeric)),
    CONSTRAINT "transactions_total_check" CHECK (("total" >= (0)::numeric))
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("contact_id");



ALTER TABLE ONLY "public"."discounts"
    ADD CONSTRAINT "discounts_pkey" PRIMARY KEY ("discount_id");



ALTER TABLE ONLY "public"."kitchen_orders"
    ADD CONSTRAINT "kitchen_orders_pkey" PRIMARY KEY ("kitchen_order_id");



ALTER TABLE ONLY "public"."menu_categories"
    ADD CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("category_name");



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_pkey" PRIMARY KEY ("product_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scan_orders"
    ADD CONSTRAINT "scan_orders_order_number_key" UNIQUE ("order_number");



ALTER TABLE ONLY "public"."scan_orders"
    ADD CONSTRAINT "scan_orders_pkey" PRIMARY KEY ("scan_order_id");



ALTER TABLE ONLY "public"."transaction_discounts"
    ADD CONSTRAINT "transaction_discounts_pkey" PRIMARY KEY ("transaction_id", "discount_id");



ALTER TABLE ONLY "public"."transaction_items"
    ADD CONSTRAINT "transaction_items_pkey" PRIMARY KEY ("transaction_item_id");



ALTER TABLE ONLY "public"."transaction_payments"
    ADD CONSTRAINT "transaction_payments_pkey" PRIMARY KEY ("transaction_payment_id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("transaction_id");



CREATE INDEX "kitchen_orders_queue_idx" ON "public"."kitchen_orders" USING "btree" ("status", "created_at");



CREATE UNIQUE INDEX "menu_categories_name_lower_idx" ON "public"."menu_categories" USING "btree" ("lower"("category_name"));



CREATE INDEX "scan_orders_pending_created_idx" ON "public"."scan_orders" USING "btree" ("status", "created_at");



CREATE INDEX "transaction_payments_transaction_id_idx" ON "public"."transaction_payments" USING "btree" ("transaction_id");



CREATE UNIQUE INDEX "transactions_scan_order_id_idx" ON "public"."transactions" USING "btree" ("scan_order_id") WHERE ("scan_order_id" IS NOT NULL);



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transaction_discounts"
    ADD CONSTRAINT "transaction_discounts_discount_id_fkey" FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("discount_id");



ALTER TABLE ONLY "public"."transaction_discounts"
    ADD CONSTRAINT "transaction_discounts_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("transaction_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transaction_items"
    ADD CONSTRAINT "transaction_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."menu_items"("product_id");



ALTER TABLE ONLY "public"."transaction_items"
    ADD CONSTRAINT "transaction_items_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("transaction_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transaction_payments"
    ADD CONSTRAINT "transaction_payments_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("transaction_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("contact_id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_scan_order_id_fkey" FOREIGN KEY ("scan_order_id") REFERENCES "public"."scan_orders"("scan_order_id");



CREATE POLICY "Admins manage discounts" ON "public"."discounts" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins manage menu" ON "public"."menu_items" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Authenticated users can delete contacts" ON "public"."contacts" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can insert contacts" ON "public"."contacts" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can read contacts" ON "public"."contacts" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can update contacts" ON "public"."contacts" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users create kitchen queue" ON "public"."kitchen_orders" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users finish kitchen queue" ON "public"."kitchen_orders" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users read kitchen queue" ON "public"."kitchen_orders" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users read menu categories" ON "public"."menu_categories" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users read scan orders" ON "public"."scan_orders" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Cashiers read own transaction payments" ON "public"."transaction_payments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."transactions"
  WHERE (("transactions"."transaction_id" = "transaction_payments"."transaction_id") AND ("transactions"."cashier_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Profiles readable by owner or admin" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"()));



CREATE POLICY "Users can close own open bills" ON "public"."transactions" FOR UPDATE TO "authenticated" USING (((("cashier_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"()) AND ("payment_method" = 'open_bill'::"public"."payment_method") AND ("status" = 'pending'::"public"."transaction_status"))) WITH CHECK (((("cashier_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"()) AND ("status" = ANY (ARRAY['paid'::"public"."transaction_status", 'voided'::"public"."transaction_status"]))));



CREATE POLICY "Users read active discounts" ON "public"."discounts" FOR SELECT TO "authenticated" USING (("is_active" OR "public"."is_admin"()));



CREATE POLICY "Users read active menu" ON "public"."menu_items" FOR SELECT TO "authenticated" USING (("is_active" OR "public"."is_admin"()));



CREATE POLICY "Users read visible transaction discounts" ON "public"."transaction_discounts" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."transactions" "t"
  WHERE (("t"."transaction_id" = "t"."transaction_id") AND (("t"."cashier_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"())))));



CREATE POLICY "Users read visible transaction items" ON "public"."transaction_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."transactions" "t"
  WHERE (("t"."transaction_id" = "t"."transaction_id") AND (("t"."cashier_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"())))));



CREATE POLICY "Users read visible transactions" ON "public"."transactions" FOR SELECT TO "authenticated" USING ((("cashier_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"()));



ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."discounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kitchen_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."menu_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."menu_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scan_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transaction_discounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transaction_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transaction_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."kitchen_orders";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."scan_orders";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."create_pos_transaction"("p_payment_method" "public"."payment_method", "p_items" "jsonb", "p_discount_ids" "text"[], "p_cash_received" numeric, "p_status" "public"."transaction_status", "p_notes" "text", "p_contact_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_pos_transaction"("p_payment_method" "public"."payment_method", "p_items" "jsonb", "p_discount_ids" "text"[], "p_cash_received" numeric, "p_status" "public"."transaction_status", "p_notes" "text", "p_contact_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_pos_transaction"("p_payment_method" "public"."payment_method", "p_items" "jsonb", "p_discount_ids" "text"[], "p_cash_received" numeric, "p_status" "public"."transaction_status", "p_notes" "text", "p_contact_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_scan_menu"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_scan_menu"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_scan_menu"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_scan_menu"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."manage_menu_category"("p_action" "text", "p_category_name" "text", "p_new_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."manage_menu_category"("p_action" "text", "p_category_name" "text", "p_new_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."manage_menu_category"("p_action" "text", "p_category_name" "text", "p_new_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_pos_transaction_details"("p_transaction_id" "uuid", "p_customer_name" "text", "p_customer_contact" "text", "p_order_type" "text", "p_payments" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_pos_transaction_details"("p_transaction_id" "uuid", "p_customer_name" "text", "p_customer_contact" "text", "p_order_type" "text", "p_payments" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_pos_transaction_details"("p_transaction_id" "uuid", "p_customer_name" "text", "p_customer_contact" "text", "p_order_type" "text", "p_payments" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."settle_pos_open_bill"("p_transaction_id" "uuid", "p_payments" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."settle_pos_open_bill"("p_transaction_id" "uuid", "p_payments" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."settle_pos_open_bill"("p_transaction_id" "uuid", "p_payments" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_scan_order"("p_customer_name" "text", "p_customer_contact" "text", "p_order_type" "text", "p_payment_method" "text", "p_notes" "text", "p_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_scan_order"("p_customer_name" "text", "p_customer_contact" "text", "p_order_type" "text", "p_payment_method" "text", "p_notes" "text", "p_items" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_scan_order"("p_customer_name" "text", "p_customer_contact" "text", "p_order_type" "text", "p_payment_method" "text", "p_notes" "text", "p_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_scan_order"("p_customer_name" "text", "p_customer_contact" "text", "p_order_type" "text", "p_payment_method" "text", "p_notes" "text", "p_items" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_scan_order_status"("p_scan_order_id" "uuid", "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_scan_order_status"("p_scan_order_id" "uuid", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_scan_order_status"("p_scan_order_id" "uuid", "p_status" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."discounts" TO "anon";
GRANT ALL ON TABLE "public"."discounts" TO "authenticated";
GRANT ALL ON TABLE "public"."discounts" TO "service_role";



GRANT ALL ON TABLE "public"."kitchen_orders" TO "anon";
GRANT ALL ON TABLE "public"."kitchen_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."kitchen_orders" TO "service_role";



GRANT ALL ON TABLE "public"."menu_categories" TO "anon";
GRANT ALL ON TABLE "public"."menu_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_categories" TO "service_role";



GRANT ALL ON TABLE "public"."menu_items" TO "anon";
GRANT ALL ON TABLE "public"."menu_items" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_items" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."scan_orders" TO "anon";
GRANT ALL ON TABLE "public"."scan_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."scan_orders" TO "service_role";



GRANT ALL ON TABLE "public"."transaction_discounts" TO "anon";
GRANT ALL ON TABLE "public"."transaction_discounts" TO "authenticated";
GRANT ALL ON TABLE "public"."transaction_discounts" TO "service_role";



GRANT ALL ON TABLE "public"."transaction_items" TO "anon";
GRANT ALL ON TABLE "public"."transaction_items" TO "authenticated";
GRANT ALL ON TABLE "public"."transaction_items" TO "service_role";



GRANT ALL ON TABLE "public"."transaction_payments" TO "anon";
GRANT ALL ON TABLE "public"."transaction_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."transaction_payments" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































