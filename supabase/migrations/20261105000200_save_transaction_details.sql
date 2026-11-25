alter table public.transactions
  add column if not exists customer_name text,
  add column if not exists customer_contact text;

create table if not exists public.transaction_payments (
  transaction_payment_id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(transaction_id) on delete cascade,
  method text not null check (method in ('cash', 'qris', 'card')),
  amount numeric(12, 2) not null check (amount > 0),
  cash_received numeric(12, 2) not null default 0 check (cash_received >= 0),
  created_at timestamptz not null default now(),
  check (method = 'cash' or cash_received = 0),
  check (method <> 'cash' or cash_received >= amount)
);

create index if not exists transaction_payments_transaction_id_idx
  on public.transaction_payments (transaction_id);

alter table public.transaction_payments enable row level security;

drop policy if exists "Cashiers read own transaction payments" on public.transaction_payments;
create policy "Cashiers read own transaction payments"
  on public.transaction_payments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.transactions
      where transactions.transaction_id = transaction_payments.transaction_id
        and transactions.cashier_id = (select auth.uid())
    )
  );

grant select on public.transaction_payments to authenticated;

create or replace function public.record_pos_transaction_details(
  p_transaction_id uuid,
  p_customer_name text,
  p_customer_contact text,
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

  if jsonb_typeof(v_payments) <> 'array' then
    raise exception 'Payments must be an array';
  end if;

  update public.transactions
  set customer_name = nullif(btrim(p_customer_name), ''),
      customer_contact = nullif(btrim(p_customer_contact), '')
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

revoke all on function public.record_pos_transaction_details(uuid, text, text, jsonb) from public, anon;
grant execute on function public.record_pos_transaction_details(uuid, text, text, jsonb) to authenticated;
