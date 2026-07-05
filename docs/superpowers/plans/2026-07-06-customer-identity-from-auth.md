# Customer Identity from Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render each auth account as one stable customer named from `auth.users` (via `public.profiles`), and confine the per-survey `full_name` (the **Nama Invoice**) to invoice/payment surfaces while keeping it searchable.

**Architecture:** A SECURITY DEFINER RPC (`get_profile_names`) returns `{id, full_name}` from the pre-existing `public.profiles` table, admin-gated on email. The client fetches these names and passes a `Map<auth_user_id, name>` into the pure `aggregateCustomers` (and into the submissions list + survey-card fetches). Customer/researcher name = auth name; the invoice name (`full_name`) becomes a search-only aggregate field (`Customer.invoiceNames`) and is displayed only on transaction/invoice surfaces. The `profiles` public-read RLS policy is tightened to owner-or-admin.

**Tech Stack:** React + TypeScript (Vite), Supabase JS (anon key, client-side admin gate), Postgres/RLS, standalone esbuild test harness (no test framework).

## Global Constraints

- **Terminology:** the per-survey `full_name` value is the **"Nama Invoice"** (invoice name). Never call it "Nama Tim" / "team name" in code, comments, copy, or docs.
- **Strict display rule:** the Nama Invoice (`full_name`) is *displayed* only in WalletView, transaction detail, and the generated invoice document. The **only** accepted exception is an orphan (unlinked) customer, which has no auth name and falls back to its invoice name.
- **Admin identity (server-side):** admin = `auth.jwt() ->> 'email' = 'product@jakpat.net'` (no admin table; mirrors existing `form_submissions` policies).
- **`public.profiles` is pre-existing — reuse READ-ONLY.** PK is `id` (= auth user id). Join key: `form_submissions.auth_user_id = profiles.id`. Do not add/drop columns.
- **`aggregateCustomers` must stay pure** (no Supabase import) so it bundles for the node test harness. Auth names arrive as a `Map` argument.
- **styles.css cascade:** legacy `styles.css` loads after Tailwind and resets `.flex`, `text-transform` on buttons, etc. Never pair `flex` with responsive display classes (`hidden md:flex`); use `hidden md:block` wrappers. Re-apply `uppercase` on header buttons explicitly.
- **Test harness command:** `node_modules/.bin/esbuild <file>.test.ts --bundle --platform=node --format=esm | node --input-type=module` (run from `multi-step-form/`).
- **Frequent commits:** one commit per task.

---

## File Structure

- `multi-step-form/sql/27_customer_identity_profiles.sql` — **create**: track existing `profiles` table + `handle_new_user` trigger (idempotent), backfill pre-trigger accounts, create admin RPC `get_profile_names`.
- `multi-step-form/sql/28_tighten_profiles_read.sql` — **create**: replace the world-readable profiles SELECT policy with owner-or-admin. **Gated** on external-consumer confirmation (Task 2).
- `multi-step-form/src/utils/profileNames.ts` — **create**: `fetchProfileNames(ids)` shared RPC helper (the one Supabase-touching unit; reused by all three surfaces).
- `multi-step-form/src/components/customers/types.ts` — **modify**: `Customer.invoiceNames`, `InvoiceName`, `emailLocalPart`, new `aggregateCustomers(submissions, authNames)` signature.
- `multi-step-form/src/components/customers/types.test.ts` — **create**: standalone unit test for `aggregateCustomers`.
- `multi-step-form/src/components/CustomersPage.tsx` — **modify**: fetch names via RPC, pass Map, extend search to `invoiceNames`, update placeholder copy.
- `multi-step-form/src/components/InternalDashboard.tsx` — **modify**: `researcherName` from auth names (submissions list).
- `multi-step-form/src/components/PublishPageManagement.tsx` — **modify**: survey-card owner name from auth names.
- (verify only) `multi-step-form/src/components/transactions/TransactionDetailSheet.tsx`, `src/pages/InvoicePage.tsx` — invoice-name display unchanged.

---

## Task 1: DB — track profiles/trigger, backfill, admin RPC

**Files:**
- Create: `multi-step-form/sql/27_customer_identity_profiles.sql`

**Interfaces:**
- Produces: RPC `public.get_profile_names(p_ids uuid[] default null) returns table(id uuid, full_name text)` — admin-gated; non-admin gets zero rows. Client calls `supabase.rpc('get_profile_names', { p_ids })`.

> No test framework applies to SQL. This task's "test" is running the verification SELECTs against the DB and confirming output.

- [ ] **Step 1: Write the migration file**

Create `multi-step-form/sql/27_customer_identity_profiles.sql`:

```sql
-- 27_customer_identity_profiles.sql
-- Recovered from live DB 2026-07-06 (profiles + handle_new_user already exist).
-- Idempotent / re-runnable. Tracks the existing objects in-repo, backfills
-- pre-trigger accounts, and adds an admin-only name-lookup RPC.

-- 1. Trigger fn (already live; captured here for repo history). Reuse as-is.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Backfill accounts created before the trigger existed (gaps only).
insert into public.profiles (id, email, full_name)
select u.id, u.email, u.raw_user_meta_data->>'full_name'
from   auth.users u
where  u.email is not null
on conflict (id) do nothing;

-- 3. Admin-only name lookup. SECURITY DEFINER so it works regardless of the
--    (about-to-be-tightened) profiles SELECT policy. Non-admin callers get
--    zero rows because the WHERE gate fails for them.
create or replace function public.get_profile_names(p_ids uuid[] default null)
returns table(id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name
  from   public.profiles p
  where  (auth.jwt() ->> 'email') = 'product@jakpat.net'
    and  (p_ids is null or p.id = any(p_ids));
$$;

grant execute on function public.get_profile_names(uuid[]) to authenticated;
```

- [ ] **Step 2: Apply the migration**

Run the file in the Supabase SQL editor (or via `psql`). Expected: no errors; `handle_new_user` + trigger recreated, backfill inserts 0+ rows, `get_profile_names` created.

- [ ] **Step 3: Verify the RPC as admin**

While authenticated as `product@jakpat.net` (or in the SQL editor which runs as `postgres`, force the check by passing a known id), run:

```sql
select * from public.get_profile_names(null) limit 5;
```

Expected (SQL editor / admin): rows of `{id, full_name}`. Confirm at least the incident account resolves to a real name:

```sql
select id, full_name from public.profiles
where id = 'dff33dd0-...';  -- Diajeng's auth id (dreztrianti@gmail.com)
```

Expected: `full_name` is a real researcher name (not null). If null, note it — the app will fall back to email local-part.

- [ ] **Step 4: Verify non-admin gets nothing**

In an anon/non-admin context (e.g. `set local role authenticated; set local request.jwt.claims = '{"email":"someone@else.com"}';` then call the RPC) confirm zero rows returned.

- [ ] **Step 5: Commit**

```bash
git add multi-step-form/sql/27_customer_identity_profiles.sql
git commit -m "feat(db): track profiles/handle_new_user, backfill, add admin get_profile_names RPC"
```

---

## Task 2: DB — tighten profiles read policy (gated)

**Files:**
- Create: `multi-step-form/sql/28_tighten_profiles_read.sql`

> ⚠️ **Prerequisite gate:** `public.profiles` is currently world-readable (`"Public profiles are viewable by everyone"`, `qual=true`). No code in THIS repo reads `profiles`, and the only DB object referencing it is `handle_new_user` (write-only) — verified 2026-07-06. But the influencer-style columns (`instagram_handle`, `followers_*`, `total_earnings`) strongly imply an **external app** consumes it. **Do not apply this migration until you confirm no external consumer reads other users' profiles with the anon/authenticated key.** The feature works without this step (Task 4's RPC is SECURITY DEFINER); this step only closes the pre-existing PII leak.

**Interfaces:**
- Produces: nothing consumed by app code. `get_profile_names` (Task 1) keeps working after this because it is SECURITY DEFINER.

- [ ] **Step 1: Write the migration file**

Create `multi-step-form/sql/28_tighten_profiles_read.sql`:

```sql
-- 28_tighten_profiles_read.sql
-- Closes a pre-existing PII leak: profiles was SELECT-able by everyone (incl anon).
-- APPLY ONLY after confirming no external consumer relies on public profiles read.
-- get_profile_names (SECURITY DEFINER) is unaffected by this change.

drop policy if exists "Public profiles are viewable by everyone" on public.profiles;

create policy "Profiles readable by owner or admin"
  on public.profiles
  for select
  to authenticated
  using (
    auth.uid() = id
    or (auth.jwt() ->> 'email') = 'product@jakpat.net'
  );
```

- [ ] **Step 2: (Gate) Confirm no external consumer**

Ask the product owner / check the influencer app: does anything read `public.profiles` rows it doesn't own, using the anon or a non-admin authenticated key? If **yes**, STOP — do not apply; revisit design. If **no**, proceed.

- [ ] **Step 3: Apply the migration**

Run the file in the Supabase SQL editor. Verify the old policy is gone and the new one exists:

```sql
select policyname, cmd, roles, qual
from pg_policies where schemaname='public' and tablename='profiles' and cmd='SELECT';
```

Expected: only `"Profiles readable by owner or admin"` remains for SELECT.

- [ ] **Step 4: Verify admin RPC still returns names**

Re-run Step 3 of Task 1 (`select * from public.get_profile_names(null) limit 5;` as admin). Expected: still returns rows (SECURITY DEFINER bypasses the tightened policy).

- [ ] **Step 5: Commit**

```bash
git add multi-step-form/sql/28_tighten_profiles_read.sql
git commit -m "feat(db): tighten profiles SELECT policy to owner-or-admin"
```

---

## Task 3: `aggregateCustomers` — auth names + invoiceNames (pure + tested)

**Files:**
- Modify: `multi-step-form/src/components/customers/types.ts`
- Test: `multi-step-form/src/components/customers/types.test.ts`

**Interfaces:**
- Consumes: nothing (pure). Auth names supplied by caller as `Map<string, string>` (auth_user_id → name).
- Produces:
  - `interface InvoiceName { name: string; count: number; lastUsed: string }`
  - `Customer.invoiceNames: InvoiceName[]` (search-only; never rendered)
  - `emailLocalPart(email: string | null): string`
  - `aggregateCustomers(submissions: RawSubmission[], authNames?: Map<string, string>): Customer[]`

- [ ] **Step 1: Write the failing test**

Create `multi-step-form/src/components/customers/types.test.ts`:

```ts
// Standalone test (no framework in this project).
// Run: node_modules/.bin/esbuild src/components/customers/types.test.ts --bundle --platform=node --format=esm | node --input-type=module
import { aggregateCustomers, emailLocalPart, type RawSubmission } from './types';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`  ok  - ${name}`);
  else { failures++; console.log(`FAIL  - ${name}\n        expected ${e}\n        actual   ${a}`); }
}

function sub(over: Partial<RawSubmission>): RawSubmission {
  return {
    id: 'x', auth_user_id: null, full_name: null, email: null, phone_number: null,
    university: null, department: null, status: null, total_cost: 0,
    payment_status: null, submission_status: null, title: null,
    created_at: '2026-01-01T00:00:00Z', actual_paid: 0, ...over,
  };
}

// Multi-invoice-name account → one customer named from auth, invoiceNames listed.
const authNames = new Map([['acc-1', 'Diajeng Reztrianti']]);
const multi = aggregateCustomers([
  sub({ id: 's1', auth_user_id: 'acc-1', full_name: 'Tri Rusilawati', email: 'd@x.com', created_at: '2026-02-01T00:00:00Z' }),
  sub({ id: 's2', auth_user_id: 'acc-1', full_name: 'NISMA', email: 'd@x.com', created_at: '2026-03-01T00:00:00Z' }),
  sub({ id: 's3', auth_user_id: 'acc-1', full_name: 'NISMA', email: 'd@x.com', created_at: '2026-04-01T00:00:00Z' }),
], authNames);

check('multi-name account collapses to ONE customer', multi.length, 1);
check('customer name = auth name (not latest full_name)', multi[0].name, 'Diajeng Reztrianti');
check('invoiceNames distinct + counted, most-recent first',
  multi[0].invoiceNames,
  [{ name: 'NISMA', count: 2, lastUsed: '2026-04-01T00:00:00Z' },
   { name: 'Tri Rusilawati', count: 1, lastUsed: '2026-02-01T00:00:00Z' }]);

// Linked account with NO profiles name → fallback to email local-part (NOT full_name).
const noName = aggregateCustomers([
  sub({ id: 's4', auth_user_id: 'acc-2', full_name: 'SomeTeam', email: 'legacy@mail.com' }),
], new Map());
check('linked + no auth name → email local-part', noName[0].name, 'legacy');

// Orphan (no auth_user_id) → accepted exception: name = its invoice name.
const orphan = aggregateCustomers([
  sub({ id: 's5', auth_user_id: null, full_name: 'Orphan Team', email: 'o@mail.com', phone_number: '0811111111' }),
], new Map());
check('orphan customer is unlinked', orphan[0].isLinked, false);
check('orphan name falls back to invoice name', orphan[0].name, 'Orphan Team');

check('emailLocalPart splits at @', emailLocalPart('foo@bar.com'), 'foo');
check('emailLocalPart null → empty', emailLocalPart(null), '');

if (failures > 0) throw new Error(`${failures} test failure(s)`);
console.log('\nALL PASS');
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `multi-step-form/`):
```bash
node_modules/.bin/esbuild src/components/customers/types.test.ts --bundle --platform=node --format=esm | node --input-type=module
```
Expected: FAIL — `aggregateCustomers` currently takes one arg and names from `latest.full_name`; `emailLocalPart` / `invoiceNames` undefined.

- [ ] **Step 3: Add types + helpers to `types.ts`**

In `multi-step-form/src/components/customers/types.ts`, add the `invoiceNames` field to the `Customer` interface (after `submissions: RawSubmission[];`):

```ts
  submissions: RawSubmission[];
  invoiceNames: InvoiceName[];
  isLinked: boolean;
```

Add near the top (after the `Customer` interface):

```ts
/** A distinct per-survey Nama Invoice used by this account (search-only). */
export interface InvoiceName {
  name: string;
  count: number;
  lastUsed: string;
}
```

Add these pure helpers (near `normalizePhone`):

```ts
/** Local-part of an email, used as the researcher-name fallback for accounts
 * with no profiles name. Never returns the Nama Invoice. */
export function emailLocalPart(email: string | null): string {
  if (!email) return '';
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email;
}

/** Distinct Nama Invoice values across an account's submissions, most-recent
 * first. Search-only — never rendered on Customers surfaces. */
function computeInvoiceNames(subs: RawSubmission[]): InvoiceName[] {
  const map = new Map<string, { count: number; lastUsed: string }>();
  subs.forEach((s) => {
    const nm = (s.full_name || '').trim();
    if (!nm) return;
    const prev = map.get(nm);
    if (!prev) map.set(nm, { count: 1, lastUsed: s.created_at });
    else {
      prev.count += 1;
      if (new Date(s.created_at).getTime() > new Date(prev.lastUsed).getTime()) prev.lastUsed = s.created_at;
    }
  });
  return Array.from(map.entries())
    .map(([name, v]) => ({ name, count: v.count, lastUsed: v.lastUsed }))
    .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime());
}
```

- [ ] **Step 4: Update the two `customerMap.set(...)` initializers**

Both object literals that create a `Customer` (the linked one in Pass 1 and the orphan one in Pass 2) must include `invoiceNames: []`. Add it right before `isLinked:` in each:

```ts
        totalOrders: 0, paidCount: 0, totalSpent: 0, firstOrder: sub.created_at, lastOrder: sub.created_at, submissions: [], invoiceNames: [], isLinked: true,
```
```ts
          totalOrders: 0, paidCount: 0, totalSpent: 0, firstOrder: sub.created_at, lastOrder: sub.created_at, submissions: [], invoiceNames: [], isLinked: false,
```

- [ ] **Step 5: Change the signature and Pass 3 naming**

Change the function signature:
```ts
export function aggregateCustomers(submissions: RawSubmission[], authNames: Map<string, string> = new Map()): Customer[] {
```

In Pass 3, replace the `c.name = latest.full_name || 'Unknown';` line with auth-name resolution + invoiceNames:
```ts
    const latest = c.submissions[0];
    if (c.isLinked && c.authUserId) {
      // Linked account: name from auth (profiles); never the Nama Invoice.
      c.name = authNames.get(c.authUserId) || emailLocalPart(latest.email) || 'Unknown';
    } else {
      // Orphan (unlinked): no auth name — accepted exception, use its Nama Invoice.
      c.name = latest.full_name || emailLocalPart(latest.email) || 'Unknown';
    }
    c.invoiceNames = computeInvoiceNames(c.submissions);
    c.email = latest.email || '-';
```

- [ ] **Step 6: Run test to verify it passes**

Run:
```bash
node_modules/.bin/esbuild src/components/customers/types.test.ts --bundle --platform=node --format=esm | node --input-type=module
```
Expected: `ALL PASS`.

- [ ] **Step 7: Commit**

```bash
git add multi-step-form/src/components/customers/types.ts multi-step-form/src/components/customers/types.test.ts
git commit -m "feat(customers): name from auth + search-only invoiceNames in aggregateCustomers"
```

---

## Task 4: Shared RPC helper + CustomersPage wiring & search

**Files:**
- Create: `multi-step-form/src/utils/profileNames.ts`
- Modify: `multi-step-form/src/components/CustomersPage.tsx`

**Interfaces:**
- Consumes: `aggregateCustomers(submissions, authNames)` (Task 3); RPC `get_profile_names` (Task 1).
- Produces: `fetchProfileNames(ids: (string | null | undefined)[]): Promise<Map<string, string>>` — reused by Tasks 5 and 6.

- [ ] **Step 1: Create the shared helper**

Create `multi-step-form/src/utils/profileNames.ts`:

```ts
import { supabase } from './supabase';

/**
 * Admin-only: resolve auth researcher names from public.profiles via the
 * SECURITY DEFINER RPC `get_profile_names`. Returns Map<auth_user_id, name>
 * containing only non-empty names. Non-admin callers get an empty map.
 */
export async function fetchProfileNames(
  ids: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((x): x is string => !!x)));
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.rpc('get_profile_names', { p_ids: unique });
  if (error) {
    console.error('fetchProfileNames error:', error);
    return new Map();
  }
  const map = new Map<string, string>();
  (data || []).forEach((row: { id: string; full_name: string | null }) => {
    const nm = (row.full_name || '').trim();
    if (nm) map.set(row.id, nm);
  });
  return map;
}
```

- [ ] **Step 2: Wire names into CustomersPage fetch**

In `multi-step-form/src/components/CustomersPage.tsx`, add the import (after the `./customers/types` import):
```ts
import { fetchProfileNames } from '../utils/profileNames';
```

Add state next to `submissions` (after line 19):
```ts
  const [authNames, setAuthNames] = useState<Map<string, string>>(new Map());
```

In `fetchSubmissions`, after `setSubmissions(merged);`, resolve names:
```ts
      setSubmissions(merged);
      setAuthNames(await fetchProfileNames(merged.map((s) => s.auth_user_id)));
```

Update the memo to pass the map:
```ts
  const customers = useMemo(() => aggregateCustomers(submissions, authNames), [submissions, authNames]);
```

- [ ] **Step 3: Extend the search filter to Nama Invoice**

In the `filtered` memo's search block, add an `invoiceNames` match:
```ts
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.university.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.invoiceNames.some((n) => n.name.toLowerCase().includes(q))
      );
```

- [ ] **Step 4: Update the search placeholder copy**

Change the `Input` placeholder:
```ts
                placeholder="Cari nama, email, universitas, telepon, atau nama invoice..."
```

- [ ] **Step 5: Manual verification (dev server)**

Run the app (`npm run dev` in `multi-step-form/`), open Customers as `product@jakpat.net`. Confirm:
- A multi-invoice account (Diajeng) shows once, under its auth name.
- No invoice name appears in the row, the detail pane, or its order rows.
- Typing `NISMA` surfaces Diajeng's row (rendered under the auth name).

- [ ] **Step 6: Commit**

```bash
git add multi-step-form/src/utils/profileNames.ts multi-step-form/src/components/CustomersPage.tsx
git commit -m "feat(customers): resolve auth names via RPC, search Nama Invoice"
```

---

## Task 5: Submissions list — researcher name from auth

**Files:**
- Modify: `multi-step-form/src/components/InternalDashboard.tsx`

**Interfaces:**
- Consumes: `fetchProfileNames` (Task 4), `emailLocalPart` (Task 3).

- [ ] **Step 1: Add imports**

In `multi-step-form/src/components/InternalDashboard.tsx`, add:
```ts
import { fetchProfileNames } from '../utils/profileNames';
import { emailLocalPart } from './customers/types';
```

- [ ] **Step 2: Resolve names before the map**

In `loadSubmissions`, right after `if (data) {`, resolve auth names for the page:
```ts
      if (data) {
        const authNames = await fetchProfileNames(data.map((s: any) => s.auth_user_id));
        const transformed: SurveySubmission[] = data.map((sub: any) => ({
```

- [ ] **Step 3: Source `researcherName` from auth**

Replace the `researcherName` line:
```ts
          researcherName: authNames.get(sub.auth_user_id) || emailLocalPart(sub.email) || 'Unknown',
```

- [ ] **Step 4: Manual verification**

In the dashboard submissions list, confirm the researcher subtitle shows the account's auth name (e.g. all of Diajeng's surveys show "Diajeng …", not per-survey invoice names). Server-side search still matches the Nama Invoice (`full_name.ilike`) — that is intentional (invoice name stays searchable).

- [ ] **Step 5: Commit**

```bash
git add multi-step-form/src/components/InternalDashboard.tsx
git commit -m "feat(submissions): show auth researcher name in submissions list"
```

---

## Task 6: Survey cards — owner name from auth

**Files:**
- Modify: `multi-step-form/src/components/PublishPageManagement.tsx`

**Interfaces:**
- Consumes: `fetchProfileNames` (Task 4).

- [ ] **Step 1: Add import**

In `multi-step-form/src/components/PublishPageManagement.tsx`, add:
```ts
import { fetchProfileNames } from '../utils/profileNames';
```

- [ ] **Step 2: Include `auth_user_id` in the embedded select**

In `fetchPages`, add `auth_user_id` to the embedded `form_submissions` select:
```ts
                    form_submissions (
                        title,
                        full_name,
                        auth_user_id,
                        university,
                        prize_per_winner,
                        winner_count
                    ),
```

- [ ] **Step 3: Resolve names and attach `owner_name` per page**

In `fetchPages`, after `const pagesWithWinners = data || [];`, resolve and attach:
```ts
            const pagesWithWinners = data || [];
            const ownerNames = await fetchProfileNames(
              pagesWithWinners.map((p: any) => p.form_submissions?.auth_user_id)
            );
            pagesWithWinners.forEach((p: any) => {
              const authId = p.form_submissions?.auth_user_id;
              // Auth name for the owner; orphan pages fall back to the Nama Invoice.
              p.owner_name = (authId && ownerNames.get(authId)) || p.form_submissions?.full_name || '';
            });
```

- [ ] **Step 4: Render `owner_name` in both card layouts**

Replace the live-list owner block (around L575-579):
```tsx
                                            {page.submission_id && page.owner_name && (
                                                <div className="text-[11px] text-gray-500 truncate">
                                                    {page.owner_name}{page.form_submissions?.university ? ` - ${page.form_submissions.university}` : ''}
                                                </div>
                                            )}
```

Replace the table owner block (around L674-679):
```tsx
                                            {page.submission_id && page.owner_name && (
                                                <div className="text-xs text-gray-500 font-medium mt-1">
                                                    {page.owner_name}
                                                    {page.form_submissions?.university ? ` - ${page.form_submissions.university}` : ''}
                                                </div>
                                            )}
```

- [ ] **Step 5: Update the survey-card search filter**

The card search currently matches `page.form_submissions?.full_name` (~L344). Add `owner_name` so search works on the displayed name too:
```ts
                page.form_submissions?.full_name?.toLowerCase().includes(searchLower) ||
                page.owner_name?.toLowerCase().includes(searchLower);
```

- [ ] **Step 6: Manual verification**

On the Publish/Pages management screen, confirm survey cards show the account's auth name as owner (not the per-survey invoice name), in both the live drag-list and the table.

- [ ] **Step 7: Commit**

```bash
git add multi-step-form/src/components/PublishPageManagement.tsx
git commit -m "feat(pages): show auth owner name on survey cards"
```

---

## Task 7: Invoice surfaces — verify Nama Invoice display (no regression)

**Files:**
- Verify only: `multi-step-form/src/components/transactions/TransactionDetailSheet.tsx`, `multi-step-form/src/pages/InvoicePage.tsx`

**Interfaces:** none.

- [ ] **Step 1: Confirm invoice name still shown where it should be**

Confirm these two still render `full_name` (the Nama Invoice):
- `TransactionDetailSheet.tsx:53` — subtitle `{transaction.form_submissions?.full_name}`.
- `InvoicePage.tsx:297` — `{data.form_submissions?.full_name || 'N/A'}`.

No change required — these are the intended display sites.

- [ ] **Step 2: Regression grep — invoice name must not leak elsewhere**

Run (from `multi-step-form/`):
```bash
grep -rnE "form_submissions[?.]*\.full_name|\.full_name\b" src/components src/pages | grep -viE "transactions/|InvoicePage|customers/types.ts|InternalDashboard|profileNames"
```
Expected: no *display* of `full_name` on Customers/submissions/survey surfaces beyond the orphan fallback in `customers/types.ts`. Investigate any hit that renders it in JSX.

- [ ] **Step 3: Manual verification**

Open a transaction detail and an invoice for one of Diajeng's surveys. Confirm each shows the **specific Nama Invoice** for that survey (e.g. "NISMA" vs "Tri Rusilawati"), independent of the auth name shown elsewhere.

- [ ] **Step 4: Commit (if any doc/comment tweak was needed; else skip)**

```bash
git add -A
git commit -m "docs(invoice): confirm Nama Invoice display sites unchanged" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage (`docs/superpowers/specs/2026-07-06-customer-identity-from-auth-design.md`):**
- §5.1 auth name via profiles/`handle_new_user` → Task 1 (corrected: PK is `id`, table pre-exists → reuse). ✅
- §5.2 group by auth, name from auth, `invoiceNames` search-only, orphan fallback → Task 3. ✅
- §5.3 Customers list/detail/search → Task 4; survey cards → Task 6; submissions list → Task 5; invoice surfaces → Task 7. ✅
- §7 testing: pure `aggregateCustomers` unit test + search behavior → Task 3 + Task 4 Step 5. ✅
- §10 rollout: recover/track+backfill (T1), tighten policy (T2, gated), wire aggregation (T3-4), update surfaces (T4-6), QA (per-task Step "Manual verification"). ✅

**Placeholder scan:** all steps carry concrete code/commands. No TBD/TODO.

**Type consistency:** `aggregateCustomers(submissions, authNames)`, `Customer.invoiceNames: InvoiceName[]`, `emailLocalPart`, `fetchProfileNames`, `get_profile_names(p_ids uuid[])`, `page.owner_name` — names used consistently across Tasks 3-7.

**Terminology:** "Nama Invoice" everywhere; no "Nama Tim"/"team name".
