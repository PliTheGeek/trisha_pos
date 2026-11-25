-- Migration: Add contacts table and link to transactions
-- Run this in your Supabase SQL Editor

-- 1. Create contacts table
CREATE TABLE IF NOT EXISTS contacts (
  contact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add contact_id column to transactions table
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(contact_id);

-- 3. Enable RLS on contacts
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies for contacts (authenticated users can CRUD)
CREATE POLICY "Authenticated users can read contacts"
  ON contacts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert contacts"
  ON contacts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update contacts"
  ON contacts FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete contacts"
  ON contacts FOR DELETE
  TO authenticated
  USING (true);

-- 5. Update the create_pos_transaction RPC to accept optional contact_id
-- NOTE: If your existing RPC doesn't accept p_contact_id, you need to update it.
-- Below is an example of how to add the parameter. Adjust to match your existing function signature.
--
-- You may need to run this to add contact_id support to your RPC:
--
-- CREATE OR REPLACE FUNCTION create_pos_transaction(
--   p_payment_method TEXT,
--   p_items JSONB,
--   p_discount_ids UUID[],
--   p_cash_received NUMERIC,
--   p_status TEXT,
--   p_notes TEXT,
--   p_contact_id UUID DEFAULT NULL  -- <-- add this parameter
-- )
-- RETURNS UUID AS $$
-- DECLARE
--   ... (keep your existing function body but add:)
--   -- When inserting into transactions, include contact_id:
--   -- INSERT INTO transactions (..., contact_id) VALUES (..., p_contact_id);
-- $$ LANGUAGE plpgsql;
