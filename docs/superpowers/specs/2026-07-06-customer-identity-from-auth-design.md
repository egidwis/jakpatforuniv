# Customer Identity from Auth, Team Name for Invoicing Only — Design

**Status:** Approved (design review 2026-07-06) · **Date:** 2026-07-06 · **Branch (origin of discussion):** feat/customers-page-revamp

---

## 1. Background — the Tri = NISMA incident

On 2026-07-05 an admin reported that a live survey, *"Kesiapan Green Finance, Praktik Koperasi Berkelanjutan, dan Kontribusi terhadap Ketahanan Pangan"*, previously **atas nama Tri Rusilawati**, had suddenly become **atas nama NISMA — Universitas Serelo Lahat**. The survey itself was untouched (still LIVE, 173 respondents); only the *researcher/owner name* had changed.

Investigation found the survey card derives its owner via a direct FK join `survey_pages.submission_id → form_submissions`, rendered as `full_name - university`. The displayed "NISMA" was therefore the `full_name` of whichever `form_submissions` row the page pointed to — and that row (`ecbc3919-…`) had been **overwritten in place**.

Root cause: the reschedule flow persists `submissionIdToReplace`/`isReschedule` inside the long-lived `survey_form_draft` (localStorage). An abandoned reschedule left that intent behind; a later **new** submission inherited it and ran `updateFormSubmissionById()` (UPDATE) instead of INSERT, clobbering the earlier survey. Because deletes/updates here are hard (no soft-delete, no audit), Tri's original values were lost from the row and recovered only via a Supabase PITR restore.

The trigger was a **single account** (`dreztrianti@gmail.com`, auth `dff33dd0-…`) submitting multiple surveys under **different researcher names** — Tri Rusilawati, NISMA, Diajeng Reztrianti. That is a legitimate pattern: the account owner (Diajeng) runs several research teams and enters a **per-survey team name** for invoicing.

**Immediate fix (already shipped, commit `2f46f00`):** `resolveSubmissionMode()` guard — only reschedule when `isReschedule` is explicitly true, the target row exists, and the submitted `survey_url` matches the target's; otherwise INSERT. This prevents a new submission from overwriting a different survey. This spec covers the **follow-up display/model improvement**, not the bug fix.

## 2. Problem statement

The admin "Customers" surface aggregates `form_submissions` at runtime and shows a customer's name as the **latest** submission's `full_name` (`aggregateCustomers`, `customers/types.ts`). When one account uses several per-survey team names, the customer collapses to whatever name was used last — the exact confusion behind the incident (Diajeng's account reading as "NISMA").

The underlying conflation: `full_name` currently serves **two roles at once** — the customer's identity *and* the per-survey invoice/team name.

## 3. Decisions (agreed)

- **Researcher / customer name = the auth account name** (`auth.users.user_metadata.full_name`). This is the stable identity shown wherever a customer/researcher is named (Customers page, survey cards, submissions list).
- **Team name (the per-survey `full_name` value) is for invoicing only — strict display rule.** It is *displayed* in exactly three places: WalletView, transaction detail, and the generated invoice document. It does **not** appear anywhere else — including CustomerDetailSheet order rows.
- **Team name stays searchable.** The Customers page search matches team names in addition to name/email/university/phone; a match surfaces the customer rendered under their auth name (typing "NISMA" finds Diajeng's account).
- **Customer identity key = `auth_user_id`.** One account = one customer. `customerDisplayId` derives from `auth_user_id` for linked customers; phone/email fallback is reserved for orphan (unlinked) submissions only.

*Accepted trade-off:* to see which team name an invoice was issued under, the admin opens the transaction/invoice detail — the customer detail sheet no longer shows it.

## 4. Goals / Non-goals

**Goals**
- One account renders as one stable customer, named from auth.
- Per-survey team names surface only in invoice/payment contexts.
- Resolve the "derived customer id semantics unconfirmed" ambiguity from the customers-page revamp.

**Non-goals (this iteration)**
- No change to how the guard/reschedule logic works (already fixed).
- No change to *capturing* the per-survey team name at submit time (still entered in biodata; still stored on the submission for the invoice).
- No full customer-relationship normalization / CRM.

## 5. Approach

### 5.1 Source of the auth researcher name (the crux)

`form_submissions` does not carry the account's auth name, and the admin Customers page cannot read `auth.users` with the anon key. Options:

- **A. Public `profiles` table synced from auth.** A `profiles` row per user (`auth_user_id` PK, `full_name`, `email`, `updated_at`), populated by the existing `handle_new_user` trigger (which already exists in the DB but is **not tracked in `sql/` — must be recovered/verified first**). Admin surfaces join `profiles` by `auth_user_id`. Reflects later auth-name changes; single source of truth.
- **B. Denormalized `researcher_name` snapshot column on `form_submissions`.** Set from `user_metadata.full_name` at submit time. No join, but a point-in-time snapshot that won't track later auth-name edits, and needs a backfill.
- **C. Admin edge function using the service role** to read `auth.users` names on demand. No schema change, but adds a network hop and a privileged function to maintain.

**Decision: A** (confirmed in design review 2026-07-06), because the auth name is the intended source of truth and a `profiles` table also gives a natural home for the future customer-level attributes (canonical override, notes, manual tier). Verified: neither `profiles` nor `handle_new_user` is tracked anywhere in the repo's SQL — recovering the trigger definition from the live DB and committing it is the first rollout step. If the trigger already writes a profiles-like table, reuse it.

### 5.2 Aggregation changes (`customers/types.ts`)

- Group by `auth_user_id` (unchanged); join the auth name from `profiles` (§5.1).
- `Customer.name` = auth researcher name (not latest `full_name`).
- Add `Customer.invoiceNames: { name: string; count: number; lastUsed: string }[]` = distinct per-survey team names across the account's submissions. **Search-matching only** — never rendered in the list or detail UI.
- Orphan submissions (no `auth_user_id`): keep phone/email grouping; label "unlinked"; they have no auth name, so fall back to the submission's team name with an explicit "unlinked" marker. *(Accepted exception to the strict display rule — an orphan has no other name to show.)*

### 5.3 Display changes

- **CustomersPage / CustomerListRow / CustomerDetailSheet:** primary name = auth researcher name; email as subtitle. Team names are **not shown anywhere** on these surfaces — not even in the detail sheet's order rows.
- **CustomersPage search:** extend the existing client-side filter (`CustomersPage.tsx` ~L92–97, currently name/email/university/phone) to also match `invoiceNames`; a hit renders the customer under their auth name.
- **Survey cards (PublishPageManagement) & submissions list:** show the auth researcher name for the owner, not the submission's team `full_name`.
- **Invoice / payment surfaces (WalletView, transaction detail, generated invoice document):** the only places the per-survey team name is displayed.

## 6. Components affected

- `sql/` — new/recovered `profiles` (or equivalent) table + `handle_new_user` definition committed to the repo (option A).
- `src/components/customers/types.ts` — `aggregateCustomers`, `Customer` type.
- `src/components/customers/CustomerListRow.tsx`, `CustomerDetailSheet.tsx` (remove any team-name rendering).
- `src/components/CustomersPage.tsx` — extend the search filter to match `invoiceNames`.
- `src/components/PublishPageManagement.tsx` and the submissions list — owner-name source.
- Invoice/payment components — verify they read the team name (likely already do via the submission).

## 7. Testing

- `aggregateCustomers` is pure → extend the standalone esbuild test harness (as `submissionMode.test.ts`): account with multiple team names + an auth name → one customer named from auth, `invoiceNames` list correct; orphan grouping; tier calc unchanged.
- Search filter: query matching a team name (and nothing else) returns the customer, displayed under the auth name.
- Manual QA: a multi-team account (like Diajeng's) renders as one customer across Customers, survey cards, and submissions; no team name visible anywhere on the Customers surfaces; searching "NISMA" finds the account; each invoice/transaction detail still shows its own team name.

## 8. Open questions

- Does `handle_new_user` already populate a `profiles` table? Recover its definition from the DB and commit it before building on it. *(Still open — must be checked against the live DB at rollout step 1.)*

**Resolved (design review 2026-07-06):**
- ~~Auth name for email signups~~ — the email `signUp` flow already requires a name and stores it in `user_metadata.full_name` (`src/utils/supabase.ts` L126–136), so both auth paths populate it. Only legacy accounts may lack it; fallback = email local-part, no user-facing prompt.
- ~~Backfill~~ — one-time `INSERT INTO profiles … SELECT FROM auth.users` in the migration.

## 9. Future extension (out of scope)

If a canonical-name override, per-customer admin notes, manual tier, or orphan-identity merging is needed later, extend the `profiles` table (or a dedicated `customer_profiles`) rather than deriving everything at runtime.

## 10. Rollout

1. Recover/verify + commit `handle_new_user` and the profiles table (option A); backfill from `auth.users` (fallback name = email local-part).
2. Wire the auth-name join into aggregation; add `invoiceNames` (search-only); unit-test.
3. Update Customers (list, detail, search), survey cards, submissions list to the auth name; strip team-name rendering from Customers surfaces; keep team name displayed only in WalletView, transaction detail, and the generated invoice.
4. Manual QA with a multi-team account; then merge.
