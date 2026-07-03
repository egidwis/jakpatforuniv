# Submissions Page Revamp — Design Spec

Date: 2026-07-03
Status: Implemented

## Problem

The admin dashboard Submissions page rendered ~15+ elements per row (form
details, costs, voucher, criteria, incentive, full researcher profile, and 4
stateful campaign-action buttons), making the list overwhelming. Review
information — the primary admin task before reservation/payment — was buried.

## Goals

1. Compact list focused on review-first info; details & actions move to a drawer.
2. Gmail-style multi-select as the foundation for a future **bulk payment** feature.
3. A reusable design-system layer for other admin pages (Transactions next) and
   the user dashboard.
4. Move the DOKU Wallet button from Submissions to the Transactions page.
5. Collapsible left sidebar (icon rail) on desktop, so the right drawer gets room.

## Confirmed product decisions

- Row shows only: checkbox · submitted date/time · Submission ID · survey title
  (+ ⚡KILAT chip / ShieldAlert only when relevant) · researcher + university ·
  **one combined lifecycle chip** · chevron. No inline approve/reject.
- All detail & actions live in a **right drawer with 4 tabs**:
  1. **Review** (default): embedded survey preview (iframe with graceful
     fallback note + open-in-new-tab; Copy Link always available), review
     actions (Approve / Reject / Spam — Reject routes through the existing
     rejection-note dialog), form details + cost/voucher breakdown (edit →
     EditFormDetailsModal), criteria & incentive (edit → EditCriteriaModal),
     researcher profile with WA (`0→62` rewrite) / mailto / lead.
  2. **Reservasi**: slot status (dates, type, booked-by, `<1h` countdown chip,
     expired state), Reserve/Edit Schedule → SchedulePaymentView fullscreen.
  3. **Payment**: latest status, amount, invoice count, copy payment link,
     Create/View Payment → SchedulePaymentView (payment step), explicit
     **Mark as Paid** button (moved out of the old status dropdown).
  4. **Page**: page status (or KILAT info card), Page Builder → PageBuilderModal,
     ExtendSection when applicable.
- Tabs are **entry points**: they show status + summary + action buttons; heavy
  actions still launch the existing proven flows. Flows were not rewritten.
- Bulk: selection foundation only (checkbox, select-all per page, floating
  toolbar with a disabled "Create Bulk Payment — Soon" placeholder).
- Desktop first; `SubmissionsMobileCard` kept as-is (only rewired to the shared
  lifecycle derivation, which also fixed a pre-existing bug: mobile
  `onPaymentStatusChange` was never destructured, so "Mark as Paid" crashed).
- Custom primitives, **zero new dependencies** (rows are list-shaped;
  pagination/search already server-side; radix dialog/checkbox/tooltip + cva
  already installed). TanStack Table rejected as over-tooling.

## Architecture

### Design-system layer (reusable)

- `components/ui/sheet.tsx` — shadcn-style Sheet on `@radix-ui/react-dialog`.
  Keyframe animations live in `src/index.css` (`sheetSlideInFromRight/Out`)
  because Radix only waits for CSS *animations* (not transitions) on close, and
  `tailwindcss-animate` is not installed.
- `components/ui/chip.tsx` — cva Chip: `variant` (blue/amber/green/red/orange/
  indigo/purple/slate/outline), `size` (sm/md), `dot`, `pulse`.
- `lib/status-tokens.ts` — canonical `STATUS_TOKENS: Record<LifecycleStage,
  StatusToken>` + `KILAT_TOKEN`. Color semantics: blue=review/reserved,
  amber=waiting/expiring, green=paid/approved/live, red=rejected/expired,
  orange=spam, indigo=page, purple=voucher/education, slate=neutral/done.
- `components/data-list/useRowSelection.ts` — Set<string> selection:
  toggle/toggleAll(pageIds)/clear/allSelected/someSelected/count.
- `components/data-list/BulkActionsToolbar.tsx` — floating pill,
  `fixed bottom-6 z-40` (deliberately under z-50 modals).
- `components/data-list/DetailSheet.tsx` — drawer shell: sticky header (title,
  subtitle, chips), optional pinned `nav` strip (tab bar), scrollable body,
  `DetailSheetSection`.

### Submissions feature layer

- `components/submissions/types.ts` — `SurveySubmission`, `PaymentState`,
  `ExistingPage` (re-exported from `SubmissionsTableRow.tsx` for compat).
- `components/submissions/lifecycle.ts` — `deriveLifecycle(submission,
  paymentData, existingPage, isScheduled, now)`: the single source of the
  previously duplicated derivation (desktop+mobile), including the 1-hour
  expiry rule for user-booked unpaid slots. Combined stage precedence:
  `rejected > spam > live > page_scheduled > completed > paid >
  awaiting_payment > reserved_expired > reserved(<1h) > approved > in_review`.
  KILAT is capped at `paid` (legacy `status` can't push it to live/completed).
  Note: frontend `status` is mapped from backend `submission_status`
  (`pending→in_review`); backend `status` holds education info — new code must
  only read the mapped fields.
- `components/submissions/LifecycleChip.tsx` — chip + tooltip breaking the
  stage into review/schedule/payment/page axes; shows rejection reason.
- `components/submissions/SubmissionListRow.tsx` — the compact row.
- `components/submissions/SubmissionDetailSheet.tsx` — the 4-tab drawer.
- `components/submissions/CampaignActions.tsx` — `ReserveSlotAction`,
  `PaymentAction`, `PageAction`, `ExtendAction`, extracted verbatim from the
  old desktop row; consumed by drawer tabs.

### Container changes (`InternalDashboard.tsx`)

- Drawer stores `openSubmissionId` (id, not object) → always renders fresh data
  after `loadSubmissions()`; auto-closes if the row leaves the dataset.
- 60s `setInterval` tick in the container re-derives time-based chips
  (Reserved `<1h` → Expired) — no per-row timers.
- Selection clears on page/month/filter/search change; survives data refresh.
- Fullscreen `SchedulePaymentView` early-return unmounts the drawer; on back,
  the retained `openSubmissionId` remounts it open with fresh data (intended).
- Removed: desktop `<Table>` markup, table skeleton (replaced by row skeleton),
  DOKU Wallet button/modal (moved to Transactions), dead `calculateAdCost`.
- Kept identical: loadSubmissions merge logic (transactions+invoices →
  paymentStates), statusCounts semantics (page-scoped; `paid` tab filters
  `payment_status` while others filter `status` — known quirk, deliberately not
  changed), month selector, server-side search, pagination, all modals.

### Other pages

- `TransactionsPage.tsx`: DOKU Wallet button in toolbar (left of Export CSV) +
  `DokuWalletModal` with identical props (`VITE_DOKU_SAC_JFU_ID` fallback).
- `InternalDashboardWithLayout.tsx`: desktop icon-rail collapse (w-64 ⇄ w-16),
  persisted in `localStorage('admin-sidebar-collapsed')`; icon-only nav with
  right-side tooltips; unread badge becomes a red dot; storage meter hidden;
  avatar-only footer with tooltip logout. Mobile slide-in unchanged. Duplicate
  icons fixed: Ads Schedule → `Calendar`, Mimin AI → `Bot`.

## Known gotchas

- New UI files use lowercase names with exact-case imports (`ui/Dialog.tsx`
  legacy casing only resolves on macOS).
- `npm run typecheck` has ~90 pre-existing errors elsewhere in the repo; our
  changes added none and removed 5 (dead code + the mobile destructure bug).
- Z-index: Sheet overlay/content z-50; Radix portals mount modals opened from
  the drawer (PageBuilder, rejection dialog) after the sheet, so they stack on
  top. Bulk toolbar z-40 sits under overlays by design.
- Iframe preview cannot reliably detect X-Frame-Options denial cross-origin;
  UI shows a persistent hint + Copy Link + open-in-new-tab instead of blocking.

## Verification checklist

1. `npm run build` passes (vite); typecheck/lint show no new issues in touched files.
2. Desktop list: chips correct per status combo (in_review, approved, reserved,
   reserved+expired, waiting_payment, paid, live, kilat, rejected w/ tooltip
   notes, spam).
3. Drawer tabs end-to-end: preview/copy/approve/reject(dialog)/spam; Reserve →
   fullscreen and back with drawer reopen; payment copy/create/Mark as Paid;
   Page Builder above drawer; Extend works.
4. Selection: toolbar appears, select-all + indeterminate, clears on
   page/filter change, survives refresh.
5. Transactions: DOKU Wallet button + modal work; gone from Submissions.
6. Sidebar: collapse persists after reload, tooltips in rail mode, dot badge,
   mobile hamburger unchanged.
7. Mobile submissions view unchanged (plus Mark as Paid now works).
