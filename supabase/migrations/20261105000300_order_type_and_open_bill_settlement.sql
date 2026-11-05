alter table public.transactions
  add column if not exists order_type text not null default 'dine_in';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_order_type_check'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_order_type_check
      check (order_type in ('dine_in', 'takeaway'));
  end if;
end
$$;

drop function if exists public.record_pos_transaction_details(uuid, text, text, jsonb);

create function public.record_pos_transaction_details(
  p_transaction_id uuid,
  p_customer_name text,
  p_customer_contact text,
  p_order_type text,
  p_payments jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

revoke all on function public.record_pos_transaction_details(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.record_pos_transaction_details(uuid, text, text, text, jsonb) to authenticated;

create or replace function public.settle_pos_open_bill(
  p_transaction_id uuid,
  p_payments jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

revoke all on function public.settle_pos_open_bill(uuid, jsonb) from public, anon;
grant execute on function public.settle_pos_open_bill(uuid, jsonb) to authenticated;

drop policy if exists "Users can close own open bills" on public.transactions;
create policy "Users can close own open bills"
  on public.transactions
  for update
  to authenticated
  using (
    cashier_id = (select auth.uid())
    and payment_method = 'open_bill'
    and status = 'pending'
  )
  with check (
    cashier_id = (select auth.uid())
    and payment_method = 'open_bill'
    and status = 'voided'
  );
