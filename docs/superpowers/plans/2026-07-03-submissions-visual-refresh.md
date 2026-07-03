# Submissions Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Outlook-style visual refresh of the admin Submissions page — inline reading pane, one unified list surface with tabs/filter/sort icons, tidier sidebar — plus a fix for stale "Live" lifecycle chips.

**Architecture:** The existing 4-tab detail content in `SubmissionDetailSheet` gains a `variant` prop so it can render inside either the existing modal `DetailSheet` (narrow screens) or a new non-modal inline `DetailPane` (≥1280px) that sits inside the same card as the list. The desktop list is restructured into one card (toolbar → tab strip → sticky column header → flat divided rows → pagination footer). The sidebar is rewritten as a single markup tree for both collapsed/expanded modes. `deriveLifecycle` gains an `end_date` gate on the legacy live/scheduled path.

**Tech Stack:** React 18 + Vite + Tailwind, Radix primitives already installed (`dialog`, `dropdown-menu`, `tooltip`, `checkbox`), `cva` chips, `lucide-react` icons. No test runner exists in this repo.

**Spec:** `docs/superpowers/specs/2026-07-03-submissions-visual-refresh-design.md`

## Global Constraints

- **Zero new dependencies.** Everything needed (Radix dropdown-menu, tooltip, cva, tailwind-merge) is already installed.
- **Mobile UI stays unchanged** (the `md:hidden` card view and mobile sidebar slide-in). Desktop-only refresh.
- `npm run typecheck` has ~90 **pre-existing** errors elsewhere in the repo; your changes must add **none** in touched files. `npm run build` must pass.
- New UI files use lowercase names with exact-case imports (`ui/Dialog.tsx` legacy casing only resolves on macOS — never import `./ui/dialog` for that one; import paths must match file case exactly).
- Copy style: English labels ("Refresh data", "Regular Ads"), Indonesian helper text (existing convention).
- Commit after every task with the messages given. All commits end with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Working directory for all commands: `/Users/jakpat/GarCode/jakpatforuniv/multi-step-form` (git commands run fine from repo root too; paths below are repo-relative).
- Scratch/verification files go to the session scratchpad (`$SCRATCH` below), **never** committed.

---

### Task 1: Lifecycle "Live" fix (`lifecycle.ts`)

**Files:**
- Modify: `multi-step-form/src/components/submissions/lifecycle.ts` (lines 50–58 and 84–95)
- Test (scratch, not committed): `$SCRATCH/verify-lifecycle.mjs`

**Interfaces:**
- Consumes: existing `deriveLifecycle(submission, paymentData, existingPage, isScheduled, now)` — signature unchanged.
- Produces: same signature; behavior change only: legacy `submission_status` `'live'`/`'scheduled'`/`'completed'` rows whose `end_date` has passed (end-of-day local) now derive stage `'completed'` instead of `'live'`/`'reserved'`, and `hasValidSchedule`/`isPending` go false for them.

Background (verified in prod data): 105/187 submissions Mar–Jun 2026 sit at `submission_status='live'`, 46 at `'scheduled'`; nothing ever transitions them to `'completed'`, so the list shows stale "Live" chips forever.

- [ ] **Step 1: Write the failing verification script**

Set the scratch variable once per shell (used by all steps):

```bash
SCRATCH=/private/tmp/claude-501/-Users-jakpat-GarCode-jakpatforuniv/c95515c7-c30d-4504-83b1-91ba1b79baa3/scratchpad
```

Write `$SCRATCH/verify-lifecycle.mjs` (imports the esbuild bundle produced in Step 2; test objects are intentionally partial — esbuild strips types so runtime never checks them):

```js
import { deriveLifecycle } from './lifecycle.bundle.mjs';

const NOW = new Date(2026, 6, 3, 12, 0, 0).getTime(); // 3 Jul 2026, local noon
const paid = { hasInvoices: true, latestStatus: 'paid', invoiceCount: 1, latestPaymentUrl: null, latestAmount: 100, hasEverPaid: true };
const none = { hasInvoices: false, latestStatus: null, invoiceCount: 0, latestPaymentUrl: null, latestAmount: 0, hasEverPaid: false };
const base = { id: 'x', formId: 'abc12345', formTitle: 'T', formUrl: '', researcherName: '', researcherEmail: '', submittedAt: '2026-06-01', questionCount: 1, responseCount: 0 };

// [name, submission overrides, paymentData, isScheduled, expected stage]
const cases = [
  ['stale live (end_date passed) -> completed',
    { status: 'live', submission_status: 'live', payment_status: 'paid', end_date: '2026-05-19' }, paid, true, 'completed'],
  ['stale scheduled (end_date passed) -> completed',
    { status: 'scheduled', submission_status: 'scheduled', payment_status: 'paid', end_date: '2026-05-01' }, paid, true, 'completed'],
  ['live ending today stays live',
    { status: 'live', submission_status: 'live', payment_status: 'paid', end_date: '2026-07-03' }, paid, true, 'live'],
  ['live without end_date stays live',
    { status: 'live', submission_status: 'live', payment_status: 'paid' }, paid, true, 'live'],
  ['kilat stays capped at paid even when stale',
    { status: 'live', submission_status: 'live', payment_status: 'paid', distribution_type: 'kilat', end_date: '2026-05-19' }, paid, true, 'paid'],
  ['in_review untouched',
    { status: 'in_review', submission_status: 'in_review' }, none, false, 'in_review'],
];

let failed = 0;
for (const [name, over, pay, isScheduled, expected] of cases) {
  const { stage } = deriveLifecycle({ ...base, ...over }, pay, undefined, isScheduled, NOW);
  const ok = stage === expected;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got '${stage}', expected '${expected}'`);
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Bundle current code and run — verify it fails**

```bash
cd multi-step-form
npx esbuild src/components/submissions/lifecycle.ts --bundle --format=esm --outfile="$SCRATCH/lifecycle.bundle.mjs"
node "$SCRATCH/verify-lifecycle.mjs"
```

Expected: exit code 1 — `FAIL stale live ... got 'live'` and `FAIL stale scheduled ... got 'paid'`; the other four PASS. (esbuild is already available through vite; the file's only imports are type-only, so it bundles standalone.)

- [ ] **Step 3: Implement the fix**

In `lifecycle.ts`, insert after the `const reservedAtTime = ...` line (line 51):

```ts
  // Legacy campaign end: submission_status 'live'/'scheduled' is never
  // transitioned to 'completed' in the DB, so derive it from end_date.
  // End-of-day local — a campaign ending today still counts as running.
  const parsedEnd = submission.end_date ? new Date(submission.end_date) : null;
  const legacyEndMs = parsedEnd && !Number.isNaN(parsedEnd.getTime())
    ? new Date(parsedEnd.getFullYear(), parsedEnd.getMonth(), parsedEnd.getDate(), 23, 59, 59, 999).getTime()
    : null;
  const legacyEnded = legacyEndMs !== null && legacyEndMs < now;
```

Replace the `hasValidSchedule` line (line 58):

```ts
  const hasValidSchedule = (isScheduled || (isLegacyActive && !legacyEnded)) && !isActuallyExpired;
```

Wait — careful: `isScheduled` is also true for stale rows (container sets it from `start_date`). That is fine for `hasValidSchedule` because the **stage** for those rows is decided by the earlier `completed` branch below; the guard here only stops the `isLegacyActive` leg from resurrecting rows the container already excluded.

Replace the stage branches for live/page_scheduled/completed (lines 87–89):

```ts
  else if (pageStatus === 'live' || (!isKilat && submission.status === 'live' && !legacyEnded)) stage = 'live';
  else if (pageStatus === 'scheduled') stage = 'page_scheduled';
  else if (
    pageStatus === 'completed' ||
    (!isKilat && submission.status === 'completed') ||
    (!isKilat && isLegacyActive && legacyEnded)
  ) stage = 'completed';
```

Also update the precedence comment above the branches (lines 81–83) to:

```ts
  // Combined stage — precedence: rejected > spam > live > page_scheduled >
  // completed > paid > awaiting_payment > reserved_expired > reserved(<1h) >
  // approved > in_review. KILAT never passes 'paid' via legacy status.
  // Legacy live/scheduled whose end_date passed derive 'completed'.
```

- [ ] **Step 4: Re-bundle and verify all cases pass**

```bash
npx esbuild src/components/submissions/lifecycle.ts --bundle --format=esm --outfile="$SCRATCH/lifecycle.bundle.mjs"
node "$SCRATCH/verify-lifecycle.mjs"
```

Expected: exit 0, six PASS lines.

- [ ] **Step 5: Build passes**

```bash
npm run build
```

Expected: vite build succeeds (warnings about chunk size are pre-existing and fine).

- [ ] **Step 6: Commit**

```bash
git add multi-step-form/src/components/submissions/lifecycle.ts
git commit -m "fix(submissions): stop stale legacy live/scheduled statuses from showing Live forever

submission_status live/scheduled is never transitioned to completed in
the DB (105 live + 46 scheduled vs 3 completed, Mar-Jun 2026), so gate
the legacy path on end_date (end-of-day local) and derive 'completed'
once the campaign window has passed.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Unified list surface (one card: toolbar + header + flat rows + pagination)

**Files:**
- Modify: `multi-step-form/src/components/submissions/SubmissionListRow.tsx`
- Modify: `multi-step-form/src/components/InternalDashboard.tsx` (desktop branch, currently lines ~637–927)

**Interfaces:**
- Consumes: `SubmissionListRow` props (`submission, lifecycle, selected, onSelectToggle, onOpen`) — unchanged in this task.
- Produces: desktop DOM structure that Task 3 (toolbar row 2) and Task 4 (pane wrapper) modify further:
  - Outer desktop card: `div.hidden.md:flex` → inner `flex flex-col` column containing, in order: **toolbar row 1**, **toolbar row 2** (this task: the old status-chip row, replaced in Task 3), **scroll region** (sticky column header + rows), **pagination footer**.
  - Rows are flat (`divide-y`), no per-row cards.
  - Row shows a source chip: `G-Form` (orange) / `Manual` (indigo); per-row KILAT chip removed.

Mobile note: the old filter card + mobile card list remain, wrapped `md:hidden` — the mobile UI must be pixel-identical to today. Desktop gets its own toolbar (deliberate, small duplication so mobile stays untouched).

- [ ] **Step 1: Flatten `SubmissionListRow` + source badge**

In `SubmissionListRow.tsx`:

1. Replace the container `className` (the `cn(...)` at lines 45–49) with:

```tsx
      className={cn(
        'group flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors',
        'hover:bg-gray-50',
        selected && 'bg-blue-50/50'
      )}
```

2. Delete the KILAT chip block (lines 89–93):

```tsx
        {submission.distribution_type === 'kilat' && (
          <Chip variant="amber" size="sm" className="shrink-0">
            <Zap className="w-3 h-3" /> KILAT
          </Chip>
        )}
```

3. In its place (same spot, after the title `</TooltipProvider>`), add the source badge:

```tsx
        <Chip
          variant={submission.submission_method === 'google_import' ? 'orange' : 'indigo'}
          size="sm"
          className="shrink-0"
        >
          {submission.submission_method === 'google_import' ? 'G-Form' : 'Manual'}
        </Chip>
```

4. Update the lucide import (Zap no longer used):

```tsx
import { ChevronRight, ShieldAlert } from 'lucide-react';
```

- [ ] **Step 2: Restructure the desktop branch of `InternalDashboard.tsx`**

This is one large mechanical edit. Current structure (lines ~637–927): shared filter card → big `loading ? … : empty ? … : (desktop list + mobile cards)` conditional. New structure:

1. Change the content wrapper (line 637) to:

```tsx
      <div className={hideAuth ? 'p-4 md:p-6 flex-1 min-h-0 flex flex-col gap-4' : 'max-w-[1400px] mx-auto w-full px-4 sm:px-6 py-6 flex-1 min-h-0 flex flex-col gap-4'}>
```

2. Wrap the **existing filter card** (the `bg-white p-4 rounded-xl …` div, lines ~639–755) in a mobile-only wrapper — change its outermost div class from
   `"bg-white p-4 rounded-xl border border-gray-100 flex flex-col gap-4 shrink-0 relative z-30 shadow-[0_4px_20px_rgb(0,0,0,0.05)]"` to:

```tsx
          <div className="md:hidden bg-white p-4 rounded-xl border border-gray-100 flex flex-col gap-4 shrink-0 relative z-30 shadow-[0_4px_20px_rgb(0,0,0,0.05)]">
```

   (Content inside unchanged — mobile keeps Periode box, search, chip filters.)

3. **Delete** the old desktop pieces from the big conditional: the desktop skeleton block (`hidden md:flex flex-col gap-2 …` lines ~760–774), the desktop list block (`hidden md:block …` lines ~834–896 including sticky pill header, row `gap-2` list, and pagination), and the two shared empty-state `<Card p-12>` blocks (they move inside the desktop card; mobile gets its own, Step 4).

4. **Add** the new desktop card directly after the (now `md:hidden`) filter card:

```tsx
        {/* Desktop: unified list surface — toolbar, column header, rows, pagination in one card */}
        <div className="hidden md:flex flex-1 min-h-0 flex-col bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Toolbar row 1: Periode · search · refresh */}
          <div className="shrink-0 flex items-center gap-4 px-4 py-3">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  const newDate = new Date(currentDate);
                  newDate.setMonth(newDate.getMonth() - 1);
                  setCurrentDate(newDate);
                  setCurrentPage(1);
                }}
              >
                <ChevronLeft className="h-4 w-4 text-gray-600" />
              </Button>
              <h2 className="text-sm font-semibold min-w-[120px] text-center text-gray-700 select-none">
                {currentDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  const newDate = new Date(currentDate);
                  newDate.setMonth(newDate.getMonth() + 1);
                  setCurrentDate(newDate);
                  setCurrentPage(1);
                }}
              >
                <ChevronRight className="h-4 w-4 text-gray-600" />
              </Button>
            </div>
            <div className="flex-1 max-w-md relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search..."
                className="w-full pl-9 bg-gray-50/50 border-gray-200 focus:bg-white focus:border-blue-500 transition-all h-9 text-sm"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </div>
            {searchQuery && (
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {filteredSubmissions.length} result{filteredSubmissions.length !== 1 ? 's' : ''}
              </span>
            )}
            <Button
              onClick={loadSubmissions}
              variant="ghost"
              size="icon"
              disabled={loading}
              className="ml-auto h-8 w-8 text-gray-500 hover:text-blue-600 hover:bg-blue-50"
              title="Refresh data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {/* Toolbar row 2: status filters (replaced by tabs + icons in the next task) */}
          <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 pb-3 border-b border-gray-200">
            {[
              { id: 'all', label: 'All', count: statusCounts.all, color: 'bg-gray-100 text-gray-700' },
              { id: 'in_review', label: 'Need Review', count: statusCounts.in_review, color: 'bg-blue-50 text-blue-700' },
              { id: 'rejected', label: 'Rejected', count: statusCounts.rejected, color: 'bg-red-50 text-red-700' },
              { id: 'approved', label: 'Approved', count: statusCounts.approved, color: 'bg-green-50 text-green-700' },
              { id: 'paid', label: 'Paid', count: statusCounts.paid, color: 'bg-emerald-50 text-emerald-700' },
              { id: 'spam', label: 'Revision / Spam', count: statusCounts.spam, color: 'bg-orange-50 text-orange-700' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`
                  flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap h-8
                  ${statusFilter === tab.id
                    ? 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-200'
                    : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 hover:text-gray-900'}
                `}
              >
                {tab.label}
                {['in_review', 'rejected'].includes(tab.id) && (
                  <span className={`
                    px-1.5 py-0.5 rounded-md text-[10px] font-bold min-w-[18px] text-center
                    ${statusFilter === tab.id ? 'bg-white/20 text-white' : tab.color}
                  `}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Scrollable rows region with sticky column header */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 px-4 h-10 flex items-center gap-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              <div className="shrink-0 flex items-center">
                <Checkbox
                  checked={pageAllSelected ? true : pageSomeSelected ? 'indeterminate' : false}
                  onCheckedChange={() => rowSelection.toggleAll(pageIds)}
                  aria-label="Select all on this page"
                />
              </div>
              <span className="w-[76px] shrink-0">Submitted</span>
              <span className="w-[84px] shrink-0">ID</span>
              <span className="flex-1">Survey</span>
              <span className="hidden lg:block w-[220px] shrink-0">Researcher</span>
              <span className="shrink-0 pr-7">Status</span>
            </div>

            {loading ? (
              <div className="divide-y divide-gray-100">
                {Array(8).fill(0).map((_, i) => (
                  <div key={`skeleton-desktop-${i}`} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-4 h-4 rounded bg-gray-100 animate-pulse shrink-0" />
                    <div className="w-[76px] shrink-0 space-y-1">
                      <div className="h-3 w-14 bg-gray-200 animate-pulse rounded" />
                      <div className="h-2.5 w-10 bg-gray-100 animate-pulse rounded" />
                    </div>
                    <div className="h-4 w-[84px] bg-gray-100 animate-pulse rounded shrink-0" />
                    <div className="h-4 flex-1 bg-gray-200 animate-pulse rounded" />
                    <div className="hidden lg:block h-4 w-[220px] bg-gray-100 animate-pulse rounded shrink-0" />
                    <div className="h-5 w-20 bg-gray-100 animate-pulse rounded-full shrink-0" />
                  </div>
                ))}
              </div>
            ) : filteredSubmissions.length === 0 ? (
              <div className="py-16 text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-muted rounded-full mb-3">
                  {submissions.length === 0
                    ? <Eye className="w-7 h-7 text-muted-foreground" />
                    : <Search className="w-7 h-7 text-muted-foreground" />}
                </div>
                <h3 className="text-lg font-semibold mb-1 text-foreground">
                  {submissions.length === 0 ? 'No Submissions Yet' : 'No Results Found'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {submissions.length === 0
                    ? 'Survey submissions will appear here once researchers start submitting their forms.'
                    : searchQuery
                      ? `No submissions match your search query "${searchQuery}".`
                      : 'No submissions match the current filter.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredSubmissions.map((submission) => (
                  <SubmissionListRow
                    key={submission.id}
                    submission={submission}
                    lifecycle={deriveLifecycle(
                      submission,
                      paymentStates[submission.id] || EMPTY_PAYMENT_STATE,
                      existingPages[submission.id],
                      scheduledSubmissionIds.has(submission.id)
                    )}
                    selected={rowSelection.isSelected(submission.id)}
                    onSelectToggle={rowSelection.toggle}
                    onOpen={setOpenSubmissionId}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Pagination footer */}
          <div className="shrink-0 flex items-center justify-between border-t border-gray-200 px-4 py-3">
            <div className="text-sm text-gray-500">
              Showing {totalSubmissions === 0 ? 0 : ((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalSubmissions)} of {totalSubmissions} results
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1 || loading}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <div className="text-sm font-medium">Page {currentPage}</div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => prev + 1)}
                disabled={currentPage * pageSize >= totalSubmissions || loading}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
```

5. Rebuild the **mobile** section as its own `md:hidden` conditional after the desktop card (reusing the existing mobile skeleton / empty cards / `SubmissionsMobileCard` list verbatim):

```tsx
        {/* Mobile: unchanged card view */}
        <div className="md:hidden">
          {loading ? (
            <div className="space-y-4">
              {/* … existing mobile skeleton Cards, verbatim from the old `loading` branch … */}
            </div>
          ) : submissions.length === 0 ? (
            <Card className="p-12 text-center">
              {/* … existing "No Submissions Yet" card content, verbatim … */}
            </Card>
          ) : filteredSubmissions.length === 0 ? (
            <Card className="p-12 text-center">
              {/* … existing "No Results Found" card content, verbatim … */}
            </Card>
          ) : (
            <div className="space-y-4">
              {/* … existing filteredSubmissions.map(<SubmissionsMobileCard …/>) block, verbatim … */}
            </div>
          )}
        </div>
```

   ("verbatim" = cut-paste the exact existing JSX from the deleted conditional; do not restyle it.)

- [ ] **Step 3: Build + typecheck**

```bash
npm run build
npx tsc -b 2>&1 | grep -E "InternalDashboard|SubmissionListRow" || echo "no new errors in touched files"
```

Expected: build passes; grep prints the fallback message (no errors in touched files).

- [ ] **Step 4: Manual verification in dev**

```bash
npm run dev
```

Check at desktop width: one card containing Periode/search/refresh, chip row, sticky column header (scroll the list — header pins under the toolbar), flat rows with dividers + hover, G-Form/Manual badge per row, no KILAT chip in rows, pagination pinned at card bottom. At mobile width: identical to production today (old filter card + cards).

- [ ] **Step 5: Commit**

```bash
git add multi-step-form/src/components/InternalDashboard.tsx multi-step-form/src/components/submissions/SubmissionListRow.tsx
git commit -m "feat(admin): unify submissions toolbar + list into one surface with flat rows

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Outlook toolbar controls — Regular/Kilat tabs, funnel filter, sort icon

**Files:**
- Modify: `multi-step-form/src/utils/supabase.ts` (`getFormSubmissionsPaginated`, lines 584–599)
- Modify: `multi-step-form/src/components/InternalDashboard.tsx`

**Interfaces:**
- Consumes: Task 2's desktop card ("Toolbar row 2" placeholder).
- Produces:
  - `getFormSubmissionsPaginated(page, limit, searchQuery = '', startDate?, endDate?, ascending = false)` — new optional 6th param, default preserves current behavior for all other callers.
  - `InternalDashboard` state: `distTab: 'regular' | 'kilat'` (default `'regular'`), `sortDir: 'desc' | 'asc'` (default `'desc'`).
  - Module const `STATUS_FILTER_OPTIONS` (id/label pairs matching `statusCounts` keys).

- [ ] **Step 1: Add sort param to the query helper**

In `utils/supabase.ts`, change the signature and order call:

```ts
export const getFormSubmissionsPaginated = async (
  page: number,
  limit: number,
  searchQuery: string = '',
  startDate?: string,
  endDate?: string,
  ascending: boolean = false
) => {
```

and

```ts
      .order('created_at', { ascending })
```

- [ ] **Step 2: State + filtering in `InternalDashboard.tsx`**

1. Module-level const (below `EMPTY_PAYMENT_STATE`):

```ts
const STATUS_FILTER_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'in_review', label: 'Need Review' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'approved', label: 'Approved' },
  { id: 'paid', label: 'Paid' },
  { id: 'spam', label: 'Revision / Spam' },
] as const;
```

2. New state next to `statusFilter` (line ~39):

```ts
  const [distTab, setDistTab] = useState<'regular' | 'kilat'>('regular');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
```

3. In the filter effect (lines 96–112), add the distribution filter **before** the status filter and extend deps:

```ts
    // Split Regular Ads vs Kilat (desktop tab strip)
    result = result.filter(sub => distTab === 'kilat'
      ? sub.distribution_type === 'kilat'
      : sub.distribution_type !== 'kilat');
```

   deps: `[submissions, statusFilter, distTab]`.

4. `loadSubmissions` passes the sort flag:

```ts
      const { data, count } = await getFormSubmissionsPaginated(
        currentPage,
        pageSize,
        searchQuery,
        startOfMonth.toISOString(),
        endOfMonth.toISOString(),
        sortDir === 'asc'
      );
```

5. Extend the load effect deps (line ~335): `[isAdmin, currentPage, searchQuery, currentDate, sortDir]`.

6. Extend the clear-selection effect deps (line ~349): `[clearSelection, currentPage, currentDate, statusFilter, searchQuery, distTab, sortDir]`.

7. Imports: add `X`, `ListFilter`, `ArrowDownWideNarrow`, `ArrowUpNarrowWide` to the lucide import; add:

```ts
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { cn } from '@/lib/utils';
```

   (Check first: if `cn` is already imported, skip that line.)

- [ ] **Step 3: Replace desktop toolbar row 2**

Replace the whole "Toolbar row 2" chip block from Task 2 with:

```tsx
          {/* Toolbar row 2: Regular/Kilat tabs + filter & sort icons (Outlook-style) */}
          <div className="shrink-0 flex items-center justify-between px-4 border-b border-gray-200">
            <div className="flex">
              {([['regular', 'Regular Ads'], ['kilat', 'Kilat']] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setDistTab(id)}
                  className={cn(
                    'px-3 py-2 -mb-px text-sm font-medium border-b-2 transition-colors',
                    distTab === id
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-gray-500 hover:text-gray-800'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 pb-1">
              {statusFilter !== 'all' && (
                <button
                  onClick={() => setStatusFilter('all')}
                  className="flex items-center gap-1 rounded-full bg-slate-800 text-white text-xs font-medium pl-2.5 pr-1.5 py-1"
                  title="Clear status filter"
                >
                  {STATUS_FILTER_OPTIONS.find(o => o.id === statusFilter)?.label}
                  <X className="w-3 h-3" />
                </button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-gray-900" title="Filter status">
                    <ListFilter className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {STATUS_FILTER_OPTIONS.map((opt) => (
                    <DropdownMenuItem
                      key={opt.id}
                      onClick={() => setStatusFilter(opt.id)}
                      className={cn('flex items-center justify-between text-sm cursor-pointer', statusFilter === opt.id && 'font-semibold text-blue-700')}
                    >
                      {opt.label}
                      <span className="text-xs text-gray-400">{statusCounts[opt.id]}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-500 hover:text-gray-900"
                onClick={() => { setSortDir(d => (d === 'desc' ? 'asc' : 'desc')); setCurrentPage(1); }}
                title={sortDir === 'desc' ? 'Terbaru dulu — klik untuk terlama' : 'Terlama dulu — klik untuk terbaru'}
              >
                {sortDir === 'desc' ? <ArrowDownWideNarrow className="w-4 h-4" /> : <ArrowUpNarrowWide className="w-4 h-4" />}
              </Button>
            </div>
          </div>
```

Note: `statusCounts[opt.id]` — `opt.id` is a literal union matching `statusCounts` keys because `STATUS_FILTER_OPTIONS` is `as const`. If tsc complains, type the lookup as `statusCounts[opt.id as keyof typeof statusCounts]`.

The mobile (`md:hidden`) filter card keeps its old chip row — do not touch it.

- [ ] **Step 4: Build + typecheck + manual verification**

```bash
npm run build
npx tsc -b 2>&1 | grep -E "InternalDashboard|utils/supabase" || echo "no new errors in touched files"
npm run dev
```

Check: default tab Regular Ads hides kilat rows; Kilat tab shows only kilat rows; funnel dropdown filters and shows counts; active filter chip appears/clears; sort icon flips order (watch the network request re-fire) and resets to page 1; mobile untouched.

- [ ] **Step 5: Commit**

```bash
git add multi-step-form/src/utils/supabase.ts multi-step-form/src/components/InternalDashboard.tsx
git commit -m "feat(admin): Outlook-style toolbar — Regular/Kilat tabs, status filter dropdown, sort toggle

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Inline reading pane (Outlook split view)

**Files:**
- Create: `multi-step-form/src/components/data-list/DetailPane.tsx`
- Modify: `multi-step-form/src/components/submissions/SubmissionDetailSheet.tsx`
- Modify: `multi-step-form/src/components/submissions/SubmissionListRow.tsx`
- Modify: `multi-step-form/src/components/data-list/BulkActionsToolbar.tsx`
- Modify: `multi-step-form/src/components/InternalDashboard.tsx`

**Interfaces:**
- Consumes: Task 2's desktop card; `useMediaQuery` from `@/lib/utils`; `DetailSheet` (unchanged).
- Produces:
  - `DetailPane` props: `{ title, subtitle?, chips?, nav?, children, footer?, onClose: () => void, className?: string }` — inline, fixed `w-[520px]`.
  - `SubmissionDetailSheet` new prop `variant?: 'sheet' | 'pane'` (default `'sheet'`); `'pane'` renders `DetailPane` with `onClose={() => onOpenChange(false)}`.
  - `SubmissionListRow` new props `active?: boolean`, `hideResearcher?: boolean`.
  - `BulkActionsToolbar` new prop `shiftLeftPx?: number` (shifts the pill's center left, to keep it centered over the list column when the pane is open).

- [ ] **Step 1: Create `DetailPane.tsx`**

```tsx
import * as React from "react"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

interface DetailPaneProps {
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Row of status chips rendered under the title/subtitle */
  chips?: React.ReactNode
  /** Pinned strip between header and scrollable body (e.g. a tab bar) */
  nav?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  onClose: () => void
  className?: string
}

/**
 * Inline (non-modal) right-side detail pane — the Outlook-reading-pane
 * counterpart to DetailSheet. No portal, no overlay, no focus trap: the
 * list beside it stays interactive. Esc closes (unless a Radix layer
 * already handled it).
 */
export function DetailPane({
  title,
  subtitle,
  chips,
  nav,
  children,
  footer,
  onClose,
  className,
}: DetailPaneProps) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <aside
      className={cn(
        "flex w-[520px] shrink-0 flex-col border-l border-gray-200 bg-white",
        className
      )}
    >
      <div className="relative shrink-0 border-b px-5 py-4 pr-12">
        <h2 className="truncate text-base font-semibold text-foreground">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>
        ) : null}
        {chips ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">{chips}</div>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
      </div>
      {nav ? <div className="shrink-0 border-b bg-white px-5">{nav}</div> : null}
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">{children}</div>
      {footer ? <div className="shrink-0 border-t px-5 py-3">{footer}</div> : null}
    </aside>
  )
}
```

(Spec said `clamp(420px, 45%, 560px)`; we use fixed 520px — inside that range — so the bulk-toolbar offset below stays simple static CSS.)

- [ ] **Step 2: Add `variant` to `SubmissionDetailSheet`**

1. Import: `import { DetailPane } from '../data-list/DetailPane';`
2. Add to props interface and destructuring: `variant?: 'sheet' | 'pane'` / `variant = 'sheet'`.
3. Restructure the return: build the shared pieces once, then pick the shell. Replace everything from `return (` to the end of the component (keep `tabBar` as-is above):

```tsx
  const subtitle = (
    <>
      <span className="font-mono">#{submission.formId}</span>
      {' · '}
      {new Date(submission.submittedAt).toLocaleDateString('id-ID')}{' '}
      {new Date(submission.submittedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
      {' · '}
      {submission.researcherName}
    </>
  );

  const chips = (
    <>
      <LifecycleChip submission={submission} lifecycle={lifecycle} size="sm" />
      {isKilat && (
        <Chip variant="amber" size="sm">
          <Zap className="w-3 h-3" /> KILAT
        </Chip>
      )}
      <Chip variant={submission.submission_method === 'google_import' ? 'orange' : 'indigo'} size="sm">
        {submission.submission_method === 'google_import' ? 'G-Form' : 'Manual'}
      </Chip>
    </>
  );

  const body = (
    <>
      {activeTab === 'review' && (
        <ReviewTab
          submission={submission}
          lifecycle={lifecycle}
          onStatusChange={onStatusChange}
          onEditFormDetails={onEditFormDetails}
          onEditCriteria={onEditCriteria}
        />
      )}
      {activeTab === 'reservation' && (
        <ReservationTab
          submission={submission}
          paymentData={paymentData}
          existingPage={existingPage}
          isScheduled={isScheduled}
          lifecycle={lifecycle}
          onOpenSchedule={onOpenSchedule}
        />
      )}
      {activeTab === 'payment' && (
        <PaymentTab
          submission={submission}
          paymentData={paymentData}
          lifecycle={lifecycle}
          onOpenPayment={onOpenPayment}
          onPaymentStatusChange={onPaymentStatusChange}
        />
      )}
      {activeTab === 'page' && (
        <PageTab
          submission={submission}
          existingPage={existingPage}
          lifecycle={lifecycle}
          onOpenPageBuilder={onOpenPageBuilder}
          onExtendCreated={onExtendCreated}
        />
      )}
    </>
  );

  if (variant === 'pane') {
    return (
      <DetailPane
        title={submission.formTitle}
        subtitle={subtitle}
        chips={chips}
        nav={tabBar}
        onClose={() => onOpenChange(false)}
      >
        {body}
      </DetailPane>
    );
  }

  return (
    <DetailSheet
      open={!!submission}
      onOpenChange={onOpenChange}
      title={submission.formTitle}
      subtitle={subtitle}
      chips={chips}
      nav={tabBar}
    >
      {body}
    </DetailSheet>
  );
```

- [ ] **Step 3: `SubmissionListRow` — `active` + `hideResearcher`**

1. Extend the props interface + destructuring:

```tsx
  /** Row currently open in the detail pane */
  active?: boolean;
  /** Hide the researcher column (list is narrow while the pane is open) */
  hideResearcher?: boolean;
```

2. Container: add `relative` and the active styles; final `className`:

```tsx
      className={cn(
        'group relative flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors',
        'hover:bg-gray-50',
        selected && 'bg-blue-50/50',
        active && 'bg-blue-50'
      )}
```

3. First child inside the container (accent bar):

```tsx
      {active && <span aria-hidden="true" className="absolute left-0 top-0 h-full w-0.5 bg-blue-600" />}
```

4. Researcher block class becomes:

```tsx
      <div className={cn('w-[220px] shrink-0 flex-col leading-tight min-w-0', hideResearcher ? 'hidden' : 'hidden lg:flex')}>
```

- [ ] **Step 4: `BulkActionsToolbar` — `shiftLeftPx`**

Add prop `shiftLeftPx?: number` (interface + destructure, default `0`) and set an inline style on the root div (keep all classes):

```tsx
    <div
      style={shiftLeftPx ? { left: `calc(50% - ${shiftLeftPx}px)` } : undefined}
      className={cn(
        "fixed bottom-6 left-1/2 z-40 -translate-x-1/2",
        ...
```

- [ ] **Step 5: Wire up in `InternalDashboard.tsx`**

1. Imports: add `useMediaQuery` to the `@/lib/utils` import (`import { cn, useMediaQuery } from '@/lib/utils';`).
2. Near the other hooks (after `rowSelection`):

```ts
  // Inline reading pane needs ≥1280px; below that the modal Sheet is used
  const isXl = useMediaQuery('(min-width: 1280px)');
```

3. Build one shared props object above the `return` (after `pageSomeSelected`):

```tsx
  const detailProps = {
    submission: openSubmission,
    paymentData: openSubmission ? (paymentStates[openSubmission.id] || EMPTY_PAYMENT_STATE) : EMPTY_PAYMENT_STATE,
    existingPage: openSubmission ? existingPages[openSubmission.id] : undefined,
    isScheduled: openSubmission ? scheduledSubmissionIds.has(openSubmission.id) : false,
    onOpenChange: (open: boolean) => { if (!open) setOpenSubmissionId(null); },
    onStatusChange: handleStatusChange,
    onPaymentStatusChange: handlePaymentStatusChange,
    onEditFormDetails: handleOpenEditFormDetailsModal,
    onEditCriteria: handleOpenEditCriteriaModal,
    onOpenPageBuilder: handleOpenPageBuilder,
    onOpenSchedule: (sub: SurveySubmission) => { setActiveScheduleSubmission(sub); setScheduleInitialStep('schedule'); },
    onOpenPayment: (sub: SurveySubmission) => { setActiveScheduleSubmission(sub); setScheduleInitialStep('payment'); },
    onExtendCreated: loadSubmissions,
  };
```

4. Turn the desktop card into a two-column split. Change the card's outer div (from Task 2) to `flex-row` and wrap the existing column content:

```tsx
        <div className="hidden md:flex flex-1 min-h-0 bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col">
            {/* …toolbar row 1, toolbar row 2, scroll region, pagination footer — unchanged from Tasks 2–3… */}
          </div>

          {/* Inline reading pane (Outlook split view) */}
          {isXl && openSubmission && (
            <SubmissionDetailSheet variant="pane" {...detailProps} />
          )}
        </div>
```

5. Pass the new row props inside the map:

```tsx
                    active={isXl && submission.id === openSubmissionId}
                    hideResearcher={isXl && !!openSubmission}
```

   and the column-header Researcher label class becomes:

```tsx
              <span className={cn('w-[220px] shrink-0', isXl && openSubmission ? 'hidden' : 'hidden lg:block')}>Researcher</span>
```

6. The existing root-level drawer render (`<SubmissionDetailSheet …/>` near the bottom, comment "Detail Drawer — id-based…") becomes narrow-screens-only and uses the shared props:

```tsx
      {/* Detail drawer (narrow screens) — ≥1280px uses the inline pane instead */}
      {!isXl && <SubmissionDetailSheet {...detailProps} />}
```

7. Bulk toolbar keeps centered over the list while the pane is open:

```tsx
      <BulkActionsToolbar count={rowSelection.count} onClear={rowSelection.clear} shiftLeftPx={isXl && openSubmission ? 260 : 0}>
```

- [ ] **Step 6: Build + typecheck + manual verification**

```bash
npm run build
npx tsc -b 2>&1 | grep -E "InternalDashboard|SubmissionDetailSheet|SubmissionListRow|DetailPane|BulkActionsToolbar" || echo "no new errors in touched files"
npm run dev
```

Check at ≥1280px: click row → pane pushes the list inside the same card, no dark backdrop; click another row → content swaps and the accent bar moves; Esc and ✕ close; Researcher column hides while open; select rows → floating pill centers over the list, not under the pane; Reject from pane opens the dialog **above** it; Reserve Slot → fullscreen → back reopens the pane. Shrink below 1280px with a row open: pane disappears, reopening a row uses the modal Sheet exactly as before.

- [ ] **Step 7: Commit**

```bash
git add multi-step-form/src/components/data-list/DetailPane.tsx multi-step-form/src/components/data-list/BulkActionsToolbar.tsx multi-step-form/src/components/submissions/SubmissionDetailSheet.tsx multi-step-form/src/components/submissions/SubmissionListRow.tsx multi-step-form/src/components/InternalDashboard.tsx
git commit -m "feat(admin): Outlook-style inline reading pane for submissions on wide screens

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Sidebar cleanup (single markup, calm active state, smooth collapse)

**Files:**
- Modify: `multi-step-form/src/components/InternalDashboardWithLayout.tsx` (aside content, lines ~244–447)

**Interfaces:**
- Consumes: existing `collapsed`, `isDesktop`, `toggleCollapsed`, `menuItems`, `unreadConversations`, `storageStats`, `user`, `handleLogout`, `handlePageChange` — all unchanged.
- Produces: no API changes; pure markup/styling rework. `localStorage('admin-sidebar-collapsed')` behavior unchanged.

Rules applied: one markup tree for both modes (labels collapse via `w-0 opacity-0`, icons keep the same x-position → no jump), padding normalized to the p-2/p-3 scale, active item `bg-blue-50 text-blue-700` instead of solid blue, storage meter condensed to one line with details in a tooltip. Mobile always renders expanded (`collapsed = isDesktop && isCollapsed` already guarantees this).

- [ ] **Step 1: Replace the aside header (lines ~245–290)**

```tsx
        {/* Header */}
        <div className={cn('flex items-center border-b border-gray-200 px-3', collapsed ? 'flex-col gap-2 py-3' : 'h-14 gap-2')}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                J
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">Jakpat for Universities</TooltipContent>
          </Tooltip>
          <span
            className={cn(
              'font-semibold text-sm text-gray-900 whitespace-nowrap overflow-hidden transition-all duration-200',
              collapsed ? 'w-0 opacity-0' : 'flex-1 opacity-100'
            )}
          >
            Internal Dashboard
          </span>
          <button
            onClick={toggleCollapsed}
            className="hidden md:flex items-center justify-center p-1.5 rounded-md hover:bg-gray-100 shrink-0"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed
              ? <PanelLeftOpen className="h-4 w-4 text-gray-600" />
              : <PanelLeftClose className="h-4 w-4 text-gray-600" />}
          </button>
          {!isDesktop && (
            <button onClick={() => setIsSidebarOpen(false)} className="p-2 rounded-md hover:bg-gray-100">
              <X className="h-5 w-5 text-gray-600" />
            </button>
          )}
        </div>
```

- [ ] **Step 2: Replace the nav (lines ~293–352) with a single item tree**

```tsx
        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            const showUnread = item.id === 'conversations' && unreadConversations > 0;
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handlePageChange(item.id)}
                    className={cn(
                      'w-full flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    )}
                  >
                    <span className="relative shrink-0">
                      <Icon className="h-4 w-4" />
                      {showUnread && collapsed && (
                        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-500" />
                      )}
                    </span>
                    <span
                      className={cn(
                        'flex-1 text-left whitespace-nowrap overflow-hidden transition-all duration-200',
                        collapsed ? 'w-0 opacity-0' : 'ml-3 opacity-100'
                      )}
                    >
                      {item.label}
                    </span>
                    {showUnread && !collapsed && (
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0',
                          isActive ? 'bg-blue-600 text-white' : 'bg-red-500 text-white'
                        )}
                      >
                        {unreadConversations > 99 ? '99+' : unreadConversations}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                {collapsed && <TooltipContent side="right">{item.label}</TooltipContent>}
              </Tooltip>
            );
          })}
        </nav>
```

- [ ] **Step 3: Condense the storage meter (lines ~354–401)**

Keep the same IIFE with the same cost math (`proofMB`, `bannerMB`, `contentMB`, `estMB`, `totalFiles`, `pct`, `isCritical`, `isWarning`, `barColor`, `estMBStr` — copy those const lines verbatim), but replace the returned JSX with one line + tooltip:

```tsx
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 cursor-default">
                    <HardDrive className={cn('h-3.5 w-3.5 shrink-0', isCritical ? 'text-red-500' : 'text-gray-400')} />
                    <div className="h-1.5 flex-1 rounded-full bg-gray-200 overflow-hidden">
                      <div className={cn('h-full rounded-full transition-all duration-500', barColor)} style={{ width: `${pct}%` }} />
                    </div>
                    <span className={cn('text-[10px] whitespace-nowrap', isCritical ? 'text-red-500 font-semibold' : 'text-gray-400')}>
                      ~{estMBStr} / 100 GB
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  Supabase Storage — Proof: {storageStats.proofCount.toLocaleString()} · Banner: {storageStats.bannerCount} · Content: ~{storageStats.contentImageCount} ({totalFiles.toLocaleString()} file)
                </TooltipContent>
              </Tooltip>
            );
```

Outer wrapper stays `{!collapsed && (<div className="border-t border-gray-200 px-4 py-2.5"> … </div>)}`. The `AlertTriangle` "Hampir penuh" pill is dropped (critical state still reads through the red icon/bar/text); remove the now-unused `AlertTriangle` import.

- [ ] **Step 4: Replace the footer (lines ~403–446) with a single tree**

```tsx
        {/* Footer */}
        <div className={cn('border-t border-gray-200 bg-gray-50/50 p-3 flex items-center gap-2', collapsed && 'flex-col')}>
          <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
            {user?.email?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div
            className={cn(
              'flex flex-col overflow-hidden transition-all duration-200',
              collapsed ? 'w-0 opacity-0' : 'flex-1 opacity-100'
            )}
          >
            <span className="font-semibold text-xs text-gray-900 truncate">
              {user?.user_metadata?.full_name || 'Admin User'}
            </span>
            <span className="text-[10px] text-gray-500 truncate" title={user?.email}>
              {user?.email}
            </span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleLogout}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            {collapsed && <TooltipContent side="right">Logout</TooltipContent>}
          </Tooltip>
        </div>
```

- [ ] **Step 5: Build + typecheck + manual verification**

```bash
npm run build
npx tsc -b 2>&1 | grep "InternalDashboardWithLayout" || echo "no new errors in touched files"
npm run dev
```

Check: toggle collapse repeatedly — labels fade/shrink smoothly, icons never shift horizontally, no layout jump; active item is soft blue; tooltips (labels, logo subtitle, storage detail, logout) appear only in rail mode except storage (expanded only); storage meter is one calm line; collapse state survives reload; mobile hamburger/slide-in identical to before.

- [ ] **Step 6: Commit**

```bash
git add multi-step-form/src/components/InternalDashboardWithLayout.tsx
git commit -m "refactor(admin): single-markup sidebar with smooth collapse and calmer visual hierarchy

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Final verification pass

**Files:** none (verification only; fix-forward if anything fails).

- [ ] **Step 1: Full build + repo typecheck delta**

```bash
npm run build
npx tsc -b 2>&1 | grep -cE "error TS" || true
```

Expected: build passes; error count ≤ the pre-existing ~90 (our touched files contribute zero — spot-check with the per-file greps from earlier tasks).

- [ ] **Step 2: Run the full manual checklist from the spec**

`npm run dev`, then walk the spec's Testing section (items 1–9): split-pane behaviors, narrow-screen Sheet fallback, tabs/funnel/sort, source badges, sidebar collapse, and — using the month selector — May/June 2026 rows now showing **Completed** instead of stale **Live** while July's genuinely running rows stay **Live**.

- [ ] **Step 3: Report**

Summarize what changed per task, verification evidence (build output, checklist results), and any deviations from the plan.
