-- 34_add_ppn_columns.sql
--
-- Adds PPN 11% (Indonesian VAT) bookkeeping to the payment pipeline.
--
-- Model: PPN is charged ON TOP of the subtotal (DPP). The existing money
-- columns (`amount`, `total_cost`) keep meaning the GRAND TOTAL — i.e.
-- subtotal + ppn_amount — so the webhook's exact-amount gate (webhook.js) and
-- the create-payment.js cross-check keep working unchanged. The new columns
-- only record the breakdown for reconciliation and invoice rendering.
--
-- All new columns are NULLABLE on purpose: rows created before PPN (legacy
-- invoices/submissions) stay valid and are distinguishable by a NULL
-- ppn_amount, so the UI can render them as total-only without a PPN line.
--
-- ppn_rate is stored per-row (numeric, e.g. 0.11) so historical invoices remain
-- correct if the statutory rate later changes (11% -> 12%).
--
-- Idempotent: safe to re-run (ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE).
-- Run this in the Supabase SQL Editor.

-- ============================================================================
-- 1. New columns
-- ============================================================================
alter table public.invoices
  add column if not exists subtotal   bigint,
  add column if not exists ppn_rate   numeric(5,4),
  add column if not exists ppn_amount bigint;

alter table public.transactions
  add column if not exists subtotal   bigint,
  add column if not exists ppn_rate   numeric(5,4),
  add column if not exists ppn_amount bigint;

-- form_submissions / _extend carry the breakdown too (total_cost stays the grand
-- total). ppn_rate is not stored here — the authoritative tax record is the
-- invoice/transaction row; these two only mirror the client-computed split.
alter table public.form_submissions
  add column if not exists subtotal   bigint,
  add column if not exists ppn_amount bigint;

alter table public.form_submissions_extend
  add column if not exists subtotal   bigint,
  add column if not exists ppn_amount bigint;

-- ============================================================================
-- 2. Freeze the breakdown after payment (extends 33_lock_payment_columns.sql)
--    Same policy as total_cost: editable while unpaid, frozen once paid so a
--    settled invoice's tax split can't be rewritten from the browser.
-- ============================================================================
create or replace function public.guard_payment_columns()
returns trigger
language plpgsql
security definer
as $$
declare
  claims jsonb;
  jwt_role  text;
  jwt_email text;
begin
  -- No claims at all = direct DB connection (SQL editor, migration) → allow.
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  if claims is null then
    return new;
  end if;

  jwt_role  := coalesce(claims ->> 'role', '');
  jwt_email := coalesce(claims ->> 'email', '');

  if jwt_role = 'service_role' or jwt_email = 'product@jakpat.net' then
    return new;
  end if;

  -- ── Non-privileged callers from here on ──

  if tg_op = 'INSERT' then
    -- New submissions always start unpaid (StepCheckout already inserts
    -- 'pending', so no legitimate flow changes).
    new.payment_status := 'pending';
    return new;
  end if;

  -- tg_op = 'UPDATE'
  if new.payment_status is distinct from old.payment_status then
    if old.payment_status in ('paid', 'completed') then
      raise exception 'payment_status of a paid submission can only be changed by an admin';
    end if;
    if new.payment_status not in ('pending', 'expired', 'failed') then
      raise exception 'payment_status can only be set to pending/expired/failed by a user (got %)', new.payment_status;
    end if;
  end if;

  if new.submission_status is distinct from old.submission_status then
    if new.submission_status in ('paid', 'scheduled', 'live', 'completed')
       or old.submission_status in ('paid', 'scheduled', 'live', 'completed') then
      raise exception 'submission_status transition % -> % requires admin', old.submission_status, new.submission_status;
    end if;
    -- Non-privileged transitions between slot_reserved / approved /
    -- waiting_payment / in_review / cancelled remain free.
  end if;

  -- total_cost + its PPN split are all frozen once paid; before payment they may
  -- change (reschedule-edit); the server recomputes the authoritative amount at
  -- payment time (create-payment.js).
  if (new.total_cost is distinct from old.total_cost
      or new.subtotal   is distinct from old.subtotal
      or new.ppn_amount is distinct from old.ppn_amount)
     and old.payment_status in ('paid', 'completed') then
    raise exception 'total_cost / subtotal / ppn_amount are frozen once the submission is paid';
  end if;

  return new;
end;
$$;

create or replace function public.guard_extend_payment_columns()
returns trigger
language plpgsql
security definer
as $$
declare
  claims jsonb;
  jwt_role  text;
  jwt_email text;
begin
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  if claims is null then
    return new;
  end if;

  jwt_role  := coalesce(claims ->> 'role', '');
  jwt_email := coalesce(claims ->> 'email', '');

  if jwt_role = 'service_role' or jwt_email = 'product@jakpat.net' then
    return new;
  end if;

  -- Extend is an admin-only surface; full freeze for non-privileged callers,
  -- now including the PPN split.
  if new.payment_status is distinct from old.payment_status
     or new.total_cost is distinct from old.total_cost
     or new.subtotal   is distinct from old.subtotal
     or new.ppn_amount is distinct from old.ppn_amount then
    raise exception 'payment columns on form_submissions_extend can only be changed by an admin';
  end if;

  return new;
end;
$$;

-- Triggers already point at these functions (33_lock_payment_columns.sql); the
-- CREATE OR REPLACE above is enough. Recreate defensively in case 33 was skipped.
drop trigger if exists trg_guard_payment_columns_upd on public.form_submissions;
create trigger trg_guard_payment_columns_upd
  before update on public.form_submissions
  for each row execute function public.guard_payment_columns();

drop trigger if exists trg_guard_payment_columns_ins on public.form_submissions;
create trigger trg_guard_payment_columns_ins
  before insert on public.form_submissions
  for each row execute function public.guard_payment_columns();

drop trigger if exists trg_guard_extend_payment_columns on public.form_submissions_extend;
create trigger trg_guard_extend_payment_columns
  before update on public.form_submissions_extend
  for each row execute function public.guard_extend_payment_columns();

-- ============================================================================
-- Verification (run after applying)
-- ============================================================================
-- Columns exist:
--   select table_name, column_name, data_type
--   from information_schema.columns
--   where column_name in ('subtotal','ppn_rate','ppn_amount')
--   order by table_name, column_name;
--
-- Legacy rows are NULL (total-only, no PPN line rendered):
--   select count(*) from invoices where ppn_amount is null;
--
-- Invariant on new paid rows (amount must equal subtotal + ppn_amount):
--   select id, amount, subtotal, ppn_amount
--   from invoices
--   where ppn_amount is not null and amount <> subtotal + ppn_amount;
--   -- expect zero rows

-- ============================================================================
-- Rollback
-- ============================================================================
-- alter table public.invoices               drop column if exists subtotal, drop column if exists ppn_rate, drop column if exists ppn_amount;
-- alter table public.transactions           drop column if exists subtotal, drop column if exists ppn_rate, drop column if exists ppn_amount;
-- alter table public.form_submissions        drop column if exists subtotal, drop column if exists ppn_amount;
-- alter table public.form_submissions_extend drop column if exists subtotal, drop column if exists ppn_amount;
-- Then re-apply 33_lock_payment_columns.sql to restore the pre-PPN guard functions.
