# Migration Plan: Customer Table & Email Mismatch Fix

> **Created:** 2026-04-27 | **Status:** Draft — Awaiting Approval
> **Context:** Email mismatch analysis from Antigravity conversation `6352c8ad`

---

## Background

The current system stores customer data (name, email, phone, university) directly in `form_submissions`. This causes:

1. **Email mismatch bug** — Login email ≠ form email breaks StatusPage queries, RLS policies, payment flow, and auto-fill
2. **No customer identity** — Repeat customers appear as separate entries
3. **Data duplication** — Same person's info copied across multiple submissions

> **⚠️ CAUTION — Critical Discovery:**
> The RLS policy in `10_allow_users_update_submissions.sql` uses `(auth.jwt() ->> 'email') = email`. When a user changes their email in Step 2, they **cannot update their own submission** (reschedule, etc.) because the JWT email no longer matches the stored email. This is a silent data access failure.

---

## Phase 1: Fix Email Mismatch (Critical)

> **Goal:** Ensure all internal queries and RLS work regardless of what email the user types in Step 2.
> **Effort:** ~1-2 days | **Risk:** Low | **Independently deployable:** ✅

### 1.1 SQL Migration: `11_add_auth_user_id.sql`

```sql
-- Phase 1: Add auth_user_id to form_submissions
-- This links submissions to Supabase Auth users, fixing email mismatch

-- 1. Add column
ALTER TABLE form_submissions
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id);

-- 2. Backfill existing data (match by email → auth.users)
UPDATE form_submissions fs
SET auth_user_id = au.id
FROM auth.users au
WHERE LOWER(fs.email) = LOWER(au.email)
  AND fs.auth_user_id IS NULL;

-- 3. Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_form_submissions_auth_user_id
  ON form_submissions(auth_user_id);

-- 4. Fix RLS: Use auth_user_id instead of email matching
DROP POLICY IF EXISTS "Users can view own submissions" ON form_submissions;
CREATE POLICY "Users can view own submissions" ON form_submissions
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR email = (auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "Users Update Own Submissions" ON form_submissions;
CREATE POLICY "Users Update Own Submissions" ON form_submissions
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid() OR email = (auth.jwt() ->> 'email'))
  WITH CHECK (auth_user_id = auth.uid() OR email = (auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "Users can insert submissions" ON form_submissions;
CREATE POLICY "Users can insert submissions" ON form_submissions
  FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());
```

> **NOTE:** RLS policies use `OR email = (auth.jwt() ->> 'email')` for backward compatibility with submissions created before this migration (where `auth_user_id` is NULL).

### 1.2 Code Changes

**supabase.ts:**
- `FormSubmission` interface → Add `auth_user_id?: string`
- `saveFormSubmission()` → Auto-set `auth_user_id` from `supabase.auth.getUser()`
- `getFormSubmissionsByEmail()` → Rename to `getFormSubmissionsByUser()`, query by `auth_user_id` with email fallback

**MultiStepForm.tsx:**
- Change `getFormSubmissionsByEmail(user.email)` → `getFormSubmissionsByUser(user.id, user.email)`

**StepFour.tsx:**
- Add `auth_user_id` to `submissionData` object

**StatusPage.tsx:**
- Change `getFormSubmissionsByEmail(user.email)` → `getFormSubmissionsByUser(user.id, user.email)`

**StepTwo.tsx:**
- Add info banner when email differs from login

### 1.3 Verification

- [ ] User logs in with Google (email A), changes email to B in Step 2
- [ ] Submission appears on StatusPage ✅
- [ ] Payment link works on PaymentCheckoutPage ✅
- [ ] Reschedule (update) works despite email mismatch ✅
- [ ] Auto-fill from previous submissions works ✅
- [ ] Existing submissions (without auth_user_id) still accessible ✅

---

## Phase 2: Create Customers Table

> **Goal:** Centralized customer identity for analytics and admin management.
> **Effort:** ~2-3 days | **Risk:** Medium | **Prerequisite:** Phase 1 complete
> **Independently deployable:** ✅

### 2.1 SQL Migration: `12_create_customers_table.sql`

```sql
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id),
  auth_email TEXT NOT NULL,
  contact_email TEXT,
  full_name TEXT,
  phone_number TEXT,
  university TEXT,
  department TEXT,
  academic_status TEXT,
  referral_source TEXT,
  first_submission_at TIMESTAMPTZ,
  last_submission_at TIMESTAMPTZ,
  total_submissions INT DEFAULT 0,
  total_spent NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customers_auth_user_id ON customers(auth_user_id);
CREATE INDEX idx_customers_auth_email ON customers(auth_email);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own customer record" ON customers
  FOR SELECT TO authenticated USING (auth_user_id = auth.uid());

CREATE POLICY "Users can update own customer record" ON customers
  FOR UPDATE TO authenticated USING (auth_user_id = auth.uid());

CREATE POLICY "Service role full access" ON customers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE form_submissions
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id);

CREATE INDEX idx_form_submissions_customer_id ON form_submissions(customer_id);
```

### 2.2 Code Changes

- `supabase.ts` → Add `Customer` interface, `upsertCustomer()`, `getCustomerByAuthId()`
- `StepFour.tsx` → Upsert customer record after saving submission
- `MultiStepForm.tsx` → Auto-fill from customer record instead of last submission

### 2.3 Data Migration Script: `script-migrate-customers.cjs`

Backfill existing data: group by `auth_user_id`, use latest submission data.

---

## Phase 3: Analytics & Admin Management

> **Goal:** Customer management page in admin dashboard + analytics.
> **Effort:** ~3-5 days | **Risk:** Low | **Prerequisite:** Phase 2 complete

### Code Changes

- **[NEW]** `CustomersPage.tsx` — Admin customer list with search, filter, drill-down
- **[MODIFY]** `InternalDashboardWithLayout.tsx` — Add "Customers" nav tab
- **[MODIFY]** `AnalyticsDashboard.tsx` — Customer-based metrics

---

## Data Model Summary

```
AUTH_USERS  1──1  CUSTOMERS  1──∞  FORM_SUBMISSIONS  1──∞  TRANSACTIONS
                                    1──0..1  SURVEY_PAGES
```

> **Design Decision:** `form_submissions` retains `full_name`, `email`, `phone_number`, `university`, `department` as **snapshots**. These are never deleted.

---

## Migration Checklist

| # | Phase | Migration File | Key Changes | Blocking? |
|---|-------|---------------|-------------|:---------:|
| 1 | Fix Email Mismatch | `11_add_auth_user_id.sql` | Add `auth_user_id`, fix RLS, update queries | ✅ Critical |
| 2 | Create Customers | `12_create_customers_table.sql` + backfill script | New table, upsert logic, auto-fill | ❌ Optional |
| 3 | Analytics & Admin | New component + views | Customer page, metrics | ❌ Optional |

---

## ⏱ Recommended Timeline

### Phase 1 → **Sekarang (ASAP)**

Bug fix — RLS policy broken menyebabkan user tidak bisa reschedule jika email berbeda. Silent failure di production.

### Phase 2 → **~2-4 Minggu Setelah Phase 1**

Trigger signals:
- 🔢 10+ unique customers
- 🔁 Repeat customer rate > 20%
- 📊 Admin butuh laporan customer
- 🐛 Auto-fill data diri sering salah

**Cara cek trigger:**
```sql
SELECT
  COUNT(DISTINCT email) AS unique_customers,
  COUNT(*) AS total_submissions,
  ROUND(
    (COUNT(*) - COUNT(DISTINCT email))::numeric / NULLIF(COUNT(DISTINCT email), 0) * 100, 1
  ) AS repeat_rate_pct
FROM form_submissions
WHERE auth_user_id IS NOT NULL;
```

### Phase 3 → **~1-2 Bulan Setelah Phase 2**

Trigger signals:
- 👥 50+ customers
- ⏰ Admin menghabiskan waktu signifikan untuk manual customer lookup
- 📈 Kebutuhan laporan bisnis (revenue, LTV, cohort)
- 🎯 Marketing campaign perlu segmentasi

### Ringkasan

| Phase | Waktu | Trigger Utama | Bisa di-skip? |
|-------|-------|---------------|:-------------:|
| **Phase 1** | ✅ Sekarang | Bug production | ❌ |
| **Phase 2** | 📅 ~2-4 minggu | 10+ customers / repeat rate >20% | ⚠️ Direkomendasikan |
| **Phase 3** | 📅 ~1-2 bulan | 50+ customers / kebutuhan reporting | ✅ Opsional |

---

## Open Questions

1. **Should the email field in Step 2 show a warning or be locked?**
   - Recommendation: Show warning banner, keep editable

2. **How to handle existing submissions where `auth_user_id` backfill fails?**
   - Leave `auth_user_id` NULL, RLS fallback clause covers these

3. **Should `customers` table be auto-created on first login or first submission?**
   - Recommendation: On first submission
