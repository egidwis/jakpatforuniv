# Jadwal Iklan Redesign: Bug Fix + Admin Tab Restructure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the `requires_banner_update` bug that causes extends in new periods to get stuck, restructure the admin SubmissionDetailSheet from 5 tabs (Info / Review / Reservasi / Payment / Page) to 4 tabs (Info / Review / **Jadwal Iklan** / Page), and align terminology between admin and user dashboards.

**Background:** The user dashboard already models each ad schedule (original + extends) as equal-weight "ScheduleCards" via `buildScheduleCards()` in `airingPeriods.ts`. The admin dashboard currently buries extends in a tiny toggle inside the Page tab, and the Reservasi + Payment tabs only handle the original schedule. This redesign brings parity.

**Architecture:**

```
BEFORE (5 tabs):
├── Info
├── Review
├── Reservasi  ← only original schedule
├── Payment    ← only original schedule payment
└── Page
    ├── PageAction
    └── ExtendAction (toggle) ← extends buried here

AFTER (4 tabs):
├── Info
├── Review
├── Jadwal Iklan ← NEW: merged Reservasi + Payment + Extends
│   ├── Original schedule card (info + booking + payment)
│   ├── Extend #1 card (info + booking + payment)
│   ├── [+ Buat Jadwal Baru] button
│   └── Mark as Paid action
└── Page ← PageAction only, no ExtendAction
```

**Tech Stack:** React 18 + Vite + Tailwind, Radix primitives, `lucide-react` icons, `sonner` toasts. No test runner in this repo.

**Depends on:** No external dependencies. All files modified are within `multi-step-form/src/`.

## Global Constraints

- **Zero new dependencies.** Everything needed is already installed.
- `npm run build` must pass after each task.
- Copy style: English labels for technical items, Indonesian for user-facing text (existing convention).
- Working directory for all commands: `/Users/jakpat/GarCode/jakpatforuniv/multi-step-form`

---

## Phase 1: Bug Fix — Banner Gate

### Context

When an extend is created for a **new month** (`is_new_month = true`), the ad page's banner may need updating (e.g., new prize info). The cron function `cron_activate_extends()` in `sql/20_extend_rpcs.sql` checks:

```sql
AND (sp.requires_banner_update IS NULL OR sp.requires_banner_update = false);
```

But **no code ever sets `requires_banner_update = true`** when a new-month extend is created. This means either:
- The extend activates without a banner update (incorrect content shown to respondents)
- Or if `requires_banner_update` is already `true` from a previous operation, the extend gets **permanently stuck** at `scheduled` status

### Task 1: Set `requires_banner_update` on new-month extend creation

**Files:**
- Modify: `src/components/ExtendSection.tsx` (lines 261–269, inside `handleCreate()`)

**Change:**

After the successful insert into `form_submissions_extend` (line 265), add a conditional update to `survey_pages`:

```typescript
// After: if (error) throw error;

// When the extend enters a new reward batch (different month), the page's
// banner likely shows stale prize info. Gate the cron from auto-activating
// until admin updates the banner via PageBuilder (preserveSubmissionDates mode).
if (isNewMonth) {
  const { error: bannerError } = await supabase
    .from('survey_pages')
    .update({ requires_banner_update: true })
    .eq('submission_id', submissionId);

  if (bannerError) {
    console.warn('Failed to set requires_banner_update:', bannerError.message);
    // Non-fatal: extend is created, admin can still manually clear the flag
  }
}
```

- [ ] **Step 1:** Add the `requires_banner_update` setter in `handleCreate()` after the extend insert succeeds
- [ ] **Step 2:** Verify `npm run build` passes

### Task 2: Add banner-update indicator in ExtendSection list

**Files:**
- Modify: `src/components/ExtendSection.tsx` (lines 549–715, the extends list rendering)

**Change:**

The component needs to know whether the page has `requires_banner_update = true`. Currently `ExtendSection` does not fetch `survey_pages` data.

- [ ] **Step 1:** Add state + fetch for banner update status

Add to the component state (after line 117):

```typescript
const [requiresBannerUpdate, setRequiresBannerUpdate] = useState(false);
```

Add to `fetchExtends()` (after the extends fetch, ~line 185):

```typescript
// Check if page needs banner update (for visual indicator)
const { data: pageData } = await supabase
  .from('survey_pages')
  .select('requires_banner_update')
  .eq('submission_id', submissionId)
  .maybeSingle();

setRequiresBannerUpdate(pageData?.requires_banner_update === true);
```

- [ ] **Step 2:** Add visual indicator per extend card

Inside the extend card rendering (after Row 3: Reward info, ~line 595), add a banner warning for new-month extends when `requiresBannerUpdate` is true:

```tsx
{/* Row 3.5: Banner update warning */}
{ext.is_new_month && requiresBannerUpdate && !isCancelled && (
  <div className="flex items-center gap-1 text-amber-600">
    <AlertCircle className="w-3 h-3" />
    <span className="text-[9px] font-semibold">Banner perlu update</span>
  </div>
)}
```

- [ ] **Step 3:** Verify `npm run build` passes

### Task 3: Also surface the banner indicator in PublishPageManagement

**Files:**
- Verify: `src/components/PublishPageManagement.tsx` (lines 772, 866)

**Change:** This file already shows `requires_banner_update` badges. Verify the existing logic works correctly — no code changes expected, just a manual review to confirm the badges appear for pages with the flag set.

- [ ] **Step 1:** Review `PublishPageManagement.tsx` lines 772 and 866 — confirm the badge logic covers the new-month extend scenario
- [ ] **Step 2:** If the existing "dismiss" button (line 874: `update({ requires_banner_update: false })`) works without requiring PageBuilder, consider whether that's desirable or if it should only be clearable through PageBuilder save. Document the decision.

---

## Phase 2: Admin Tab Restructure — "Jadwal Iklan" Tab

### Context

Currently the admin `SubmissionDetailSheet` has 5 tabs. The Reservasi tab only shows the **original** schedule, Payment tab only shows the **original** payment, and extends are hidden in the Page tab's `ExtendAction` toggle.

The restructure merges Reservasi + Payment + Extends into a single **"Jadwal Iklan"** tab that mirrors the user dashboard's `SchedulePhase` — each schedule period (original + extends) rendered as an equal-weight card with its own status, dates, and payment info.

### Task 4: Create `ScheduleTab` component

**Files:**
- New: `src/components/submissions/ScheduleTab.tsx`

**Purpose:** Replace `ReservationTab` + `PaymentTab` + `ExtendAction` with a unified tab that renders all schedule periods as cards.

**Data source:** Reuse `buildScheduleCards()` from `src/components/status/airingPeriods.ts` — this is the same function the user dashboard uses, ensuring data consistency.

**Interface:**

```typescript
interface ScheduleTabProps {
  submission: SurveySubmission;
  paymentData: PaymentState;
  existingPage?: ExistingPage;
  isScheduled: boolean;
  lifecycle: ReturnType<typeof deriveLifecycle>;
  onOpenSchedule: (submission: SurveySubmission) => void;
  onOpenPayment: (submission: SurveySubmission) => void;
  onPaymentStatusChange: (submissionId: string, newStatus: string) => void;
  onEditFormDetails: (submission: SurveySubmission) => void;
  onExtendCreated: () => void;
}
```

**Internal data fetching:**

The tab needs to fetch extends + extend payments (currently done inside ExtendSection). On mount:

1. Fetch `form_submissions_extend` for this `submission.id`
2. Fetch `transactions` with `entity_type='extend'` for extend payment info
3. Build `ScheduleCard[]` using `buildScheduleCards()`

**Card rendering per schedule:**

Each card renders 3 blocks (mirroring the user dashboard `SchedulePhase`):

1. **Header**: "Jadwal 1" / "Jadwal 2" + status chip + Booking ID
2. **Info block**: dates, duration, incentive info, period batch
3. **Booking & Payment block**: payment status, amount, payment link (copy/open), actions

**Actions per card:**

| Card type | State | Available actions |
|---|---|---|
| Original | No schedule | [Reserve Slot] → opens SchedulePaymentView |
| Original | Reserved, no payment | [Create Payment] → opens SchedulePaymentView |
| Original | Waiting payment | [Copy Link] [Open Link] |
| Original | Paid | Status: Paid ✅ |
| Extend | Waiting payment, no link | [Buat Payment Link] → opens ExtendSection payment dialog |
| Extend | Waiting payment, has link | [Copy Link] [Open Link] |
| Extend | `is_new_month` + banner needed | ⚠️ "Banner perlu update" indicator |
| Extend | Paid | Status: Paid ✅ |
| Any | Cancelled | Greyed out, no actions |

**Footer actions (below all cards):**

- `[+ Buat Jadwal Baru]` → opens the ExtendSection create dialog (only if `existingPage` exists and `lifecycle.canBuildPage`)
- "Mark as Paid" section for the overall submission (migrated from current PaymentTab)

**Implementation steps:**

- [ ] **Step 1:** Create `src/components/submissions/ScheduleTab.tsx` with the interface above
- [ ] **Step 2:** Implement extends + payment data fetching (extract from `ExtendSection.tsx`)
- [ ] **Step 3:** Implement card rendering using `buildScheduleCards()` output — adapt the admin-specific actions (Reserve Slot, Create Payment Link) that don't exist in the user dashboard version
- [ ] **Step 4:** Implement the "Buat Jadwal Baru" dialog (extract create dialog from `ExtendSection.tsx`)
- [ ] **Step 5:** Implement the extend payment link creation dialog (extract payment dialog from `ExtendSection.tsx`)
- [ ] **Step 6:** Migrate "Mark as Paid" from `PaymentTab` into footer of `ScheduleTab`
- [ ] **Step 7:** Verify `npm run build` passes

### Task 5: Wire `ScheduleTab` into `SubmissionDetailSheet`

**Files:**
- Modify: `src/components/submissions/SubmissionDetailSheet.tsx`

**Changes:**

1. **Update tab definition** (line 46–54): Remove `'reservation'` and `'payment'` tabs, add `'schedule'` tab:

```typescript
type DetailTab = 'info' | 'review' | 'schedule' | 'page';

const TABS: { id: DetailTab; label: string; icon: typeof FileText }[] = [
  { id: 'info', label: 'Info', icon: Info },
  { id: 'review', label: 'Review', icon: FileText },
  { id: 'schedule', label: 'Jadwal Iklan', icon: Calendar },
  { id: 'page', label: 'Page', icon: Globe },
];
```

2. **Update body rendering** (lines 197–231): Replace `ReservationTab` and `PaymentTab` entries with `ScheduleTab`:

```tsx
{activeTab === 'schedule' && (
  <ScheduleTab
    submission={submission}
    paymentData={paymentData}
    existingPage={existingPage}
    isScheduled={isScheduled}
    lifecycle={lifecycle}
    onOpenSchedule={onOpenSchedule}
    onOpenPayment={onOpenPayment}
    onPaymentStatusChange={onPaymentStatusChange}
    onEditFormDetails={onEditFormDetails}
    onExtendCreated={onExtendCreated}
  />
)}
```

3. **Update PageTab** (lines 1073–1143): Remove `ExtendAction` from the Page tab — it now lives in ScheduleTab:

```tsx
// Remove:
<ExtendAction
  submission={submission}
  existingPage={existingPage}
  lifecycle={lifecycle}
  onExtendCreated={onExtendCreated}
/>
```

4. **Update default tab logic** (if any): Ensure the default `activeTab` initializer accounts for the new tab ID.

5. **Clean up unused imports**: Remove `ReservationTab` and `PaymentTab` function definitions (~lines 821–1071) and the `ExtendAction` import if no longer used.

- [ ] **Step 1:** Update tab type and TABS constant
- [ ] **Step 2:** Add `ScheduleTab` import and render in body
- [ ] **Step 3:** Remove `ExtendAction` from `PageTab`
- [ ] **Step 4:** Remove dead code: `ReservationTab` and `PaymentTab` function definitions
- [ ] **Step 5:** Clean up unused imports
- [ ] **Step 6:** Verify `npm run build` passes

### Task 6: Update mobile card (if applicable)

**Files:**
- Review: `src/components/SubmissionsTableRow.tsx`

**Change:** The mobile card (`SubmissionsMobileCard`) currently renders `ReserveSlotAction` and `PaymentAction` inline. These should still work since the actions themselves are not being deleted — only the tab wrappers are changing. But verify that the mobile card doesn't reference the old tab IDs.

- [ ] **Step 1:** Review `SubmissionsTableRow.tsx` — confirm no references to `'reservation'` or `'payment'` tab IDs
- [ ] **Step 2:** Verify mobile card still renders correctly (manual check)

---

## Phase 3: Terminology Alignment

### Task 7: Rename "Extend" to "Jadwal Baru" in admin UI

**Files:**
- Modify: `src/components/submissions/ScheduleTab.tsx` (from Task 4)
- Modify: `src/components/ExtendSection.tsx` (if still used as extracted dialog)

**Changes:**

Replace admin-facing text:
| Before | After |
|---|---|
| "Buat Extend Baru" | "Buat Jadwal Baru" |
| "Extend berhasil dibuat" | "Jadwal baru berhasil dibuat" |
| "Buat Extend" (dialog title) | "Buat Jadwal Baru" |
| "Extend Iklan" (invoice item) | "Perpanjangan Iklan" |
| "Batalkan extend" | "Batalkan jadwal" |
| "Yakin ingin membatalkan extend ini?" | "Yakin ingin membatalkan jadwal ini?" |

- [ ] **Step 1:** Update all user-facing strings in ScheduleTab / ExtendSection dialogs
- [ ] **Step 2:** Verify `npm run build` passes

### Task 8: Verify user dashboard translations are consistent

**Files:**
- Review: `src/i18n/translations.ts`

**Change:** The user dashboard already uses "Jadwalkan Iklan Lagi" (line 1141) and "Perpanjang jadwal" (line 1142). Verify the admin strings from Task 7 don't conflict or create confusion.

- [ ] **Step 1:** Review translation keys in `translations.ts` for extend-related entries
- [ ] **Step 2:** Document any inconsistencies between admin hardcoded strings and translation keys

---

## Phase 4 (Future): Enable "Jadwalkan Iklan Lagi" in User Dashboard

> **Not in scope for this plan.** Listed here for context and dependency tracking.

This phase would replace the Coming Soon button in `SchedulePhase.tsx` (line 567) with a working modal that:
1. Shows a slot calendar (reuse `fetchSlotAvailability`)
2. Lets user pick duration + confirm incentive info
3. Inserts into `form_submissions_extend` with `slot_booked_by: 'user'`
4. Redirects to payment

**Depends on:** Phase 1 (banner gate fix) and Phase 2 (admin tab restructure) being complete and stable.

**Blocked by:** Decision on whether user-created extends need admin approval or can auto-proceed to payment.

---

## File Map

### Modified files

| File | Phase | Change |
|---|---|---|
| [ExtendSection.tsx](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/src/components/ExtendSection.tsx) | 1, 3 | Banner gate setter + terminology |
| [SubmissionDetailSheet.tsx](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/src/components/submissions/SubmissionDetailSheet.tsx) | 2 | Tab restructure, remove old tabs |
| [PublishPageManagement.tsx](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/src/components/PublishPageManagement.tsx) | 1 | Review banner indicator (verify only) |

### New files

| File | Phase | Purpose |
|---|---|---|
| `src/components/submissions/ScheduleTab.tsx` | 2 | Unified "Jadwal Iklan" tab for admin |

### Unchanged (reference only)

| File | Relevance |
|---|---|
| [airingPeriods.ts](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/src/components/status/airingPeriods.ts) | `buildScheduleCards()` reused by ScheduleTab |
| [SchedulePhase.tsx](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/src/components/status/SchedulePhase.tsx) | User dashboard reference for card design |
| [20_extend_rpcs.sql](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/sql/20_extend_rpcs.sql) | Cron logic (no changes needed — SQL is correct, the bug is in the app layer) |
| [CampaignActions.tsx](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/src/components/submissions/CampaignActions.tsx) | `ExtendAction` wrapper — may be deprecated after Phase 2 |
| [extend-ui.ts](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/src/utils/extend-ui.ts) | Shared status palette — reused by ScheduleTab |

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| ExtendSection dialogs tightly coupled to component state | Medium | Extract dialog logic into standalone components or hooks before wiring into ScheduleTab |
| `buildScheduleCards()` depends on `OrderUiState` (user-side) — admin may not have this context | Medium | Admin can construct a minimal `OrderUiState` from existing `deriveLifecycle()` output, or ScheduleTab can call `buildScheduleCards()` with simplified inputs |
| Removing PaymentTab loses "Mark as Paid" for the overall submission | Low | Migrate "Mark as Paid" into ScheduleTab footer — it applies to the submission level, not per-schedule |
| Mobile card regression | Low | Mobile card uses `CampaignActions` directly, not tabs — verify it's unaffected |

---

## Verification Checklist (per phase)

### Phase 1 (Bug Fix)
- [ ] Create a new-month extend via admin → verify `survey_pages.requires_banner_update` is `true`
- [ ] Verify cron does NOT activate the extend until banner is updated
- [ ] Open PageBuilder in extend mode → save → verify `requires_banner_update` is cleared
- [ ] Verify cron NOW activates the extend

### Phase 2 (Tab Restructure)
- [ ] Open SubmissionDetailSheet → see 4 tabs (Info, Review, Jadwal Iklan, Page)
- [ ] "Jadwal Iklan" tab shows original schedule + all extends as cards
- [ ] Each card shows: status chip, dates, duration, payment status, action buttons
- [ ] "Buat Jadwal Baru" button opens create dialog → extend is created successfully
- [ ] Payment link creation from extend card works correctly
- [ ] "Mark as Paid" works from the Jadwal Iklan tab
- [ ] Page tab no longer shows ExtendAction toggle
- [ ] Mobile card view is unaffected
- [ ] `npm run build` passes

### Phase 3 (Terminology)
- [ ] No occurrence of "Extend" in admin-facing UI text (developer-facing code comments are fine)
- [ ] Translations file has no conflicts
