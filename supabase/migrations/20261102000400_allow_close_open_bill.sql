-- Additive migration: allows the owner of a pending Open Bill to close it.
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
    and status = 'paid'
  );
