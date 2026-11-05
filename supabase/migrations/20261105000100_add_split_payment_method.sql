-- Add the payment method used when one transaction is paid with multiple tenders.
    alter type public.payment_method add value if not exists 'split';
