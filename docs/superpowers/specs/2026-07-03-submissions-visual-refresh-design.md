# Submissions Visual Refresh — Design Spec

Date: 2026-07-03
Status: Approved (brainstorm)
Builds on: `2026-07-03-submissions-revamp-design.md` (implemented in 8efd409)

## Problem

Three visual problems remain after the structural revamp, plus one data-display
bug found during this discussion:

1. **Drawer is modal.** The detail drawer is a Radix Dialog overlay (dark
   backdrop, list unclickable behind it). The admin wants an Outlook-style
   reading pane: a dedicated area on the right where clicking another row
   switches the detail without closing anything.
2. **Header does not sit with the table.** The filter area is a floating white
   card (`rounded-xl`, large shadow, `z-30`), the column header is a separate
   floating pill (`bg-gray-50/95 backdrop-blur`), and every row is its own
   rounded card. Three disconnected elevation layers.
3. **Sidebar is untidy.** Two fully separate render branches for
   collapsed/expanded (rough toggle transition, layout jump), mixed padding
   scale (p-6/p-4/p-3/p-2), a heavy solid-blue active state, and a
   detail-dense storage meter competing with the nav.
4. **Most rows show "Live" incorrectly (bug).** Verified in production data:
   of 187 submissions Mar–Jun 2026, 105 sit at `submission_status='live'` and
   46 at `'scheduled'`; only 3 ever became `'completed'`. 148 of those have
   `end_date` already past. Nothing in the codebase transitions
   live→completed. `deriveLifecycle` (lifecycle.ts:87) promotes legacy
   `status==='live'` to the `live` stage with **no date check**, and that
   branch outranks the (correct) page-axis `completed` computation.

## Confirmed product decisions

- **On-demand split pane** (not persistent, not floating): closed by default,
  list full-width; clicking a row opens an inline pane that pushes the list;
  the list stays interactive (clicking another row swaps pane content); ✕ or
  `Esc` closes. Narrow screens keep the existing modal Sheet.
- **One unified list surface**: toolbar + tab strip + column header + flat
  divided rows + pagination footer live in a single white card. No per-row
  cards, no floating column header, no oversized shadow.
- **Outlook-style toolbar**:
  - Row 1: Periode selector (inline chevrons, no nested gray box) · search ·
    refresh icon.
  - Row 2: **tabs `Regular Ads | Kilat`** (from `distribution_type`,
    active-underline style, like Outlook's Focused/Other) on the left; on the
    right a **funnel icon** (status filter dropdown: All / Need Review /
    Rejected / Approved / Paid / Revision-Spam, with counts) and a **sort
    icon** (toggle newest⇄oldest). When a status filter ≠ All is active, a
    small dismissible chip ("Paid ✕") appears next to the funnel so the state
    is never hidden.
- **Row source badge**: small chip after the survey title — `G-Form` (orange)
  when `submission_method === 'google_import'`, else `Manual` (indigo). Same
  mapping the drawer header already uses.
- The per-row ⚡KILAT chip is removed from the list (the Kilat tab conveys
  it); it stays in the detail header.
- **Sidebar**: keep the storage meter (condensed), calmer active state,
  single markup for both modes, unchanged mobile behavior.
- **Live bug**: fix in the frontend derivation only. A DB backfill
  (live→completed) is explicitly out of scope (protect-trigger on
  `form_submissions`; separate task).

## Design

### 1. Split pane (`components/data-list/DetailPane.tsx` + refactor)

- Extract the drawer innards of `SubmissionDetailSheet` (header block, tab
  bar, tab bodies, footer) into `SubmissionDetailContent`, consumed by two
  containers:
  - **`DetailPane`** (new, design-system layer): plain inline `<aside>` —
    `border-l bg-white flex flex-col shrink-0`, width
    `clamp(420px, 45%, 560px)`. No portal, no overlay, no focus trap. Closes
    on `Esc` (window listener while open) and via ✕ button. Reusable by
    Transactions later.
  - **`DetailSheet`** (existing modal Sheet): kept for narrow viewports.
- Breakpoint: `xl` (1280px). ≥xl renders the pane inline in a two-column flex
  (`list flex-1 min-w-0` + pane); <xl renders the existing Sheet. Decided via
  `useMediaQuery('(min-width: 1280px)')` — same helper the layout already
  uses.
- Row interactions while the pane is open: clicking a row calls
  `setOpenSubmissionId(id)` (existing state; content swaps in place). The
  open row gets `bg-blue-50` + a 2px left accent bar; checkbox selection
  highlight stays distinct (`bg-blue-50/50`, no bar).
- When the pane is open the list hides the Researcher column and lets the
  title truncate (driven by the `paneOpen` state, not media queries).
- Unchanged: 4-tab structure and all tab logic, fullscreen
  `SchedulePaymentView` early-return (unmounts pane; back remounts it open),
  modals launched from the pane (they portal to body; with no z-50 sheet in
  inline mode, stacking is trivially correct).
- `BulkActionsToolbar` centers over the **list column** (offset by the pane
  width when open) instead of the viewport, so it never floats under the
  pane.

### 2. Unified list surface (`InternalDashboard.tsx` desktop branch)

One card: `bg-white border border-gray-200 rounded-xl overflow-hidden flex
flex-col` filling the content height.

- **Toolbar row 1** (`px-4 py-3`): Periode `◂ Juli 2026 ▸` as inline ghost
  buttons + label (drop the nested gray pill box); search input (flex-1,
  max-w-md); refresh icon button right-aligned.
- **Toolbar row 2** (`px-4, border-b`): tab strip `Regular Ads · Kilat` —
  buttons with `border-b-2 border-transparent` / active
  `border-blue-600 text-blue-700 font-medium`; right side: funnel dropdown +
  sort toggle icons (ghost icon buttons) + active-filter chip.
  - Tab state `distTab: 'regular' | 'kilat'` filters client-side on the
    loaded page (same page-scoped quirk as the existing status filter —
    documented, accepted; server-side tab filtering can come later without
    visual changes).
  - Status dropdown replaces the 6-chip row; reuses the existing
    `statusCounts`. Plain popover list with counts; selecting sets the
    existing `statusFilter`.
  - Sort: `sortDir: 'desc' | 'asc'` passed to `getFormSubmissionsPaginated`
    (add an `ascending` order param — currently hardcoded desc). Resets to
    page 1 on change.
- **Column header**: `bg-gray-50 border-y px-4 h-10`, sticky `top-0` inside
  the scrolling rows container. No rounded pill, no backdrop-blur, no shadow.
- **Rows**: `divide-y divide-gray-100`; row = full-width flex, `px-4 py-3`,
  hover `bg-gray-50`. Remove per-row `rounded-xl border` cards and `gap-2`.
  Row content: checkbox · submitted · ID · title + source badge · researcher
  (hidden when pane open) · lifecycle chip · chevron.
- **Footer**: pagination inside the card, `border-t px-4 py-3`; stays fixed
  while rows scroll (rows container is the only `overflow-y-auto` region).
- The "Found N results for query" line moves into toolbar row 1 as muted
  text under/next to search (only when searching).
- Loading skeleton updated to the flat-row shape inside the same card.

### 3. Sidebar (`InternalDashboardWithLayout.tsx`)

- **Single markup for both modes.** One nav item structure: fixed-width icon
  slot (so icons keep the same x-position in both modes) + label span that
  collapses via `opacity-0 w-0 overflow-hidden` transition. Width animates
  w-64 ⇄ w-16 as today; no more dual `collapsed ?` render trees for
  header/nav/footer. Tooltips render only in rail mode (as today).
- **Header, one row** (`h-14 px-3 border-b`): logo 8×8 + "Internal
  Dashboard" (label span) + collapse toggle. The "Jakpat for Universities"
  subtitle moves to the logo tooltip. Mobile close button unchanged.
- **Nav** (`p-2, space-y-1`): items `px-3 py-2 rounded-lg text-sm`; active =
  `bg-blue-50 text-blue-700` (icon inherits), inactive =
  `text-gray-600 hover:bg-gray-100`. Unread badge/dot behavior kept.
- **Storage meter, one line**: icon + thin progress bar + `~1.3 / 100 GB`;
  file-count detail moves into its tooltip. Warning/critical colors kept.
  Hidden in rail mode (as today).
- **Footer**: same content, padding normalized to the p-2/p-3 scale.
- Mobile slide-in behavior untouched.

### 4. Lifecycle "Live" fix (`components/submissions/lifecycle.ts`)

- Compute `legacyEnded`: `submission.end_date` exists and its end-of-day
  (local) `< now`.
- Stage branches change to:
  - `live`: `pageStatus === 'live' || (!isKilat && submission.status === 'live' && !legacyEnded)`
  - `completed`: additionally reached when
    `!isKilat && isLegacyActive && legacyEnded` (covers stale
    `live`/`scheduled`/`completed` legacy rows whose window passed).
- `hasValidSchedule` also gains the `!legacyEnded` guard on its
  `isLegacyActive` leg so stale `scheduled` rows stop reading as `reserved`.
- No behavior change for: kilat cap, paid/awaiting/expired branches, rows
  without `end_date`, or genuinely running campaigns (`end_date` today
  counts as still live until end-of-day).
- Out of scope: DB backfill of stale `submission_status` values.

## Error handling

- Pane with a submission id that disappears after refresh: existing
  auto-close behavior kept (openSubmission becomes null → pane unmounts).
- `end_date` parse failures (`new Date` → NaN): treat as no end date (never
  "ended") — same leniency the page axis already has.
- Sort param is additive; existing callers of `getFormSubmissionsPaginated`
  default to `desc` (no behavior change elsewhere).

## Testing

Manual checklist (no runtime test infra for these components):

1. ≥1280px: click row → pane pushes list (no backdrop); click other rows →
   content swaps; Esc/✕ closes; active-row accent tracks the open row.
2. <1280px: modal Sheet behavior identical to today.
3. Pane open: Researcher column hides; reopening after
   Reserve→fullscreen→back still works; PageBuilder/rejection dialogs stack
   above.
4. Tabs: Regular Ads default, Kilat shows only `distribution_type='kilat'`
   rows; per-row KILAT chip gone; drawer header still shows it.
5. Funnel dropdown filters + count badges match old chips; active filter chip
   shows and clears; sort toggle flips order and resets to page 1.
6. Row badges: G-Form (orange) for `google_import`, Manual (indigo)
   otherwise.
7. Sidebar: collapse/expand animates without layout jump; icons stay put;
   active item calm blue; storage meter one line with tooltip detail; mobile
   drawer unchanged.
8. Lifecycle: May/June months no longer show stale "Live" (expect
   Completed); July rows with `end_date >= today` still Live; kilat rows
   unaffected.
9. `npm run build` passes; no new typecheck errors in touched files.
