-- 33_lock_payment_columns.sql
--
-- Problem: RLS policy "Users Update Own Submissions" (11_add_auth_user_id.sql)
-- is row-level, not column-level — a user can UPDATE any column of their own
-- rows from the browser console, including payment_status = 'paid'.
--
-- Design: TRANSITION ALLOWLIST via triggers, NOT column freezing. Three
-- legitimate user flows write these columns and must keep working:
--   1. Reschedule-edit  (StepCheckout → updateFormSubmissionById):
--      payment_status='pending', submission_status='waiting_payment'|'in_review',
--      and a NEW total_cost (survey parameters legitimately changed).
--   2. Slot expiry      (releaseExpiredSlot):
--      payment_status='expired', submission_status='slot_reserved'.
--   3. Dashboard reschedule (prepareForReschedule):
--      payment_status='pending', submission_status='approved'.
-- What must be IMPOSSIBLE for a normal user: marking themselves paid,
-- un-marking a paid/live survey, or editing total_cost after payment.
--
-- Privileged callers bypass all checks:
--   - service_role  → the DOKU webhook + Pages Functions (service key)
--   - product@jakpat.net → admin, same identity as all RLS policies
--     (24_secure_invoices_rls.sql) and InternalDashboard
--   - direct DB connections (SQL editor / migrations) carry no JWT claims
--     and are treated as privileged.
--
-- Run this in the Supabase SQL Editor. Verification + rollback at the bottom.

-- ============================================================================
-- 1. Guard function (shared by both triggers on form_submissions)
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

  if new.total_cost is distinct from old.total_cost then
    if old.payment_status in ('paid', 'completed') then
      raise exception 'total_cost is frozen once the submission is paid';
    end if;
    -- Before payment, total_cost may change (reschedule-edit); the server
    -- recomputes the authoritative amount at payment time (create-payment.js).
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_payment_columns_upd on public.form_submissions;
create trigger trg_guard_payment_columns_upd
  before update on public.form_submissions
  for each row execute function public.guard_payment_columns();

drop trigger if exists trg_guard_payment_columns_ins on public.form_submissions;
create trigger trg_guard_payment_columns_ins
  before insert on public.form_submissions
  for each row execute function public.guard_payment_columns();

-- ============================================================================
-- 2. form_submissions_extend: FULL freeze for non-privileged callers.
--    ExtendSection is admin-only surface (ExtendSection → CampaignActions →
--    SubmissionDetailSheet, internal dashboard); the webhook writes via
--    service_role. No user flow touches these columns.
-- ============================================================================
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

  if new.payment_status is distinct from old.payment_status
     or new.total_cost is distinct from old.total_cost then
    raise exception 'payment columns on form_submissions_extend can only be changed by an admin';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_extend_payment_columns on public.form_submissions_extend;
create trigger trg_guard_extend_payment_columns
  before update on public.form_submissions_extend
  for each row execute function public.guard_extend_payment_columns();

-- ============================================================================
-- Verification (run as checks after applying)
-- ============================================================================
-- Triggers exist:
--   select tgname, tgrelid::regclass
--   from pg_trigger
--   where tgname like 'trg_guard%' and not tgisinternal;
--
-- From the browser console as a NORMAL user (should FAIL with the trigger error):
--   supabase.from('form_submissions').update({ payment_status: 'paid' }).eq('id', '<own id>')
--
-- Flows that must still SUCCEED as a normal user:
--   - dashboard reschedule  → payment_status 'pending',  submission_status 'approved'
--   - slot expiry           → payment_status 'expired',  submission_status 'slot_reserved'
--   - reschedule-edit       → payment_status 'pending' + new total_cost (while unpaid)
-- And as product@jakpat.net: status changes from InternalDashboard must succeed.

-- ============================================================================
-- Rollback
-- ============================================================================
-- drop trigger if exists trg_guard_payment_columns_upd on public.form_submissions;
-- drop trigger if exists trg_guard_payment_columns_ins on public.form_submissions;
-- drop trigger if exists trg_guard_extend_payment_columns on public.form_submissions_extend;
-- drop function if exists public.guard_payment_columns();
-- drop function if exists public.guard_extend_payment_columns();
