# Back per-step + Cancel order — Implementation Plan

> ## ✅ SELESAI — commit `3663bed`, dideploy 2026-08-18 (uji manual belum dijalankan)
> Disimpan sebagai catatan sejarah. Jangan dieksekusi ulang. Kotak centang di
> bawah sengaja dibiarkan kosong — status yang berlaku adalah banner ini.
> Indeks seluruh rencana ada di [`README.md`](README.md).
>
> **Koreksi pasca-eksekusi 2026-08-18 (baca sebelum apa pun di bawah):**
>
> 1. **Bar floating tidak lagi ada "di setiap step".** Revamp visual order form
>    2026-08-18 mempersempitnya ke **Step 1 (layar isian) dan Step 2 saja**.
>    Keputusan pemilik produk: begitu user menyeberang ke Step 3, layar jadwal →
>    bayar dibiarkan bersih supaya fokusnya satu. **Konsekuensi yang diterima
>    sadar:** tombol `X` "Batalkan Pesanan" tidak terjangkau dari Step 3/4 — jalan
>    keluarnya lewat tombol "Kembali" per-step (Task 3) ke Step 2, baru batalkan
>    di sana. Skenario 5 & 6 di Task 5 di bawah karena itu dibaca **"di step mana
>    pun bar-nya tampil"**, bukan "di setiap step".
> 2. **Angka baseline `63` di Global Constraints sudah basi.** Diukur ulang
>    2026-08-18 di puncak branch: **60**. Aturannya tidak berubah — nol error baru
>    di berkas yang disentuh rencana ini.
> 3. **Kepemilikan `isHeaderVisible` diperbaiki 2026-08-18.** Sempat ada dua
>    penulis untuk satu state (`MultiStepForm` bergantung `currentStep`,
>    `StepSurveyDetails` bergantung `flowState`), sehingga bar muncul atau hilang
>    tergantung arah user tiba di layar yang sama — dan saat ia muncul di Step 1,
>    ia menutupi baris tombol Kembali/Lanjut yang lahir dari Task 1. Sekarang
>    `isHeaderVisible` adalah **nilai turunan**, anak hanya melapor lewat
>    `setIsStep1HeaderAllowed`, dan padding `pb-*` ikut nilai yang sama.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a contextual "Back" button next to each step's primary CTA in the order form, and turn the floating bar's back arrow into a "Cancel order" action with a confirmation dialog that discards the draft and returns to the dashboard.

**Architecture:** Reuse the back-navigation handlers that already exist in `MultiStepForm.tsx` (`prevStep`, `handleKilatBack`, and step 1's local `handleBackToMethodSelection`) — thread each one down to the step component that owns the matching "Lanjutkan" button, instead of only wiring them to the floating header's arrow. Replace that arrow with an `X` icon that opens a confirmation dialog (reusing the exact `modal-overlay` CSS pattern already used elsewhere in this codebase), which on confirm clears the two localStorage draft keys and navigates to `/dashboard`.

**Tech Stack:** React + TypeScript, Tailwind CSS, `lucide-react` icons, `react-router-dom`. No component test framework exists in this repo (confirmed: no vitest/jest/testing-library in `package.json`, no `.test.tsx` files) — verification is `tsc -b` (baseline gate) plus manual browser click-through, matching this repo's established convention for UI changes.

## Global Constraints

- Baseline typecheck gate: `npx tsc -b` from `multi-step-form/` currently reports **63 errors** (re-measured this session via `git stash` diff — the `75` figure recorded in old memory is stale). After every task, this count must stay at 63, with zero new errors in any file this plan touches.
- No new i18n keys for the cancel dialog — reuse the existing hardcoded-Indonesian pattern from `StepSurveyDetails.tsx:247-275` (that dialog doesn't use `t()` either; it's Indonesian-only by precedent). The "Kembali" button DOES use `t('backButton')` since it sits in files that already call `t()` throughout.
- Do not touch `PaymentCheckoutPage` or anything under step 1's method-selection/Google-import sub-screens — out of scope per the approved spec (`docs/superpowers/specs/2026-08-10-order-form-back-cancel-design.md`).
- Do not `git commit` any task automatically — this repo's established convention (confirmed earlier this session) is to implement + verify, then ask the user before committing. The final task ends with a verification report, not a commit.

---

### Task 1: Step 1 — Back button next to "Lanjut ke Ringkasan"

**Files:**
- Modify: `multi-step-form/src/components/StepOneFormFields.tsx:40-46` (props interface), `:102-107` (destructure), `:3-13` (icon import), `:585-593` (button row)
- Modify: `multi-step-form/src/components/StepSurveyDetails.tsx:234-241`, `:286-292` (pass the prop at both render sites)

**Interfaces:**
- Consumes: `handleBackToMethodSelection` — already defined in `StepSurveyDetails.tsx:137-139`, no signature change (`() => void`).
- Produces: `StepOneFormFieldsProps.onBack: () => void` (required) — later tasks don't depend on this, it's self-contained.

- [ ] **Step 1: Add `ArrowLeft` to the lucide-react import in `StepOneFormFields.tsx`**

Current (`StepOneFormFields.tsx:3-13`):
```tsx
import {
  CalendarDays,
  CheckCircle,
  Gift,
  Hash,
  Info,
  Link2,
  Trophy,
  Type,
  Users,
} from 'lucide-react';
```

New:
```tsx
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle,
  Gift,
  Hash,
  Info,
  Link2,
  Trophy,
  Type,
  Users,
} from 'lucide-react';
```

- [ ] **Step 2: Add `onBack` to `StepOneFormFieldsProps` and the function signature**

Current (`StepOneFormFields.tsx:40-46`):
```tsx
interface StepOneFormFieldsProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  onSubmit: () => void;
  isGoogleImport?: boolean;
  onSwitchToGoogle?: () => void;
}
```

New:
```tsx
interface StepOneFormFieldsProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  onSubmit: () => void;
  onBack: () => void;
  isGoogleImport?: boolean;
  onSwitchToGoogle?: () => void;
}
```

Current (`StepOneFormFields.tsx:102-107`):
```tsx
export function StepOneFormFields({
  formData,
  updateFormData,
  onSubmit,
  isGoogleImport = false,
  onSwitchToGoogle
```

New:
```tsx
export function StepOneFormFields({
  formData,
  updateFormData,
  onSubmit,
  onBack,
  isGoogleImport = false,
  onSwitchToGoogle
```

- [ ] **Step 3: Replace the single full-width submit button with a Back + Continue row**

Current (`StepOneFormFields.tsx:585-593`):
```tsx
      <div className="flex justify-end">
        <button
          type="submit"
          className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-jfu-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-jfu-dark"
        >
          {t('continueToSummary')}
          <span aria-hidden="true">→</span>
        </button>
      </div>
```

New:
```tsx
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:border-gray-400 hover:bg-gray-50"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('backButton')}
        </button>
        <button
          type="submit"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-jfu-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-jfu-dark"
        >
          {t('continueToSummary')}
          <span aria-hidden="true">→</span>
        </button>
      </div>
```

- [ ] **Step 4: Wire `onBack` at both `StepOneFormFields` render sites in `StepSurveyDetails.tsx`**

Current (`StepSurveyDetails.tsx:234-241`, manual flow):
```tsx
          <StepOneFormFields
            formData={formData}
            updateFormData={updateFormData}
            onSubmit={handleSubmit}
            isGoogleImport={false}
            onSwitchToGoogle={handleSwitchToGoogle}
          />
```

New:
```tsx
          <StepOneFormFields
            formData={formData}
            updateFormData={updateFormData}
            onSubmit={handleSubmit}
            onBack={handleBackToMethodSelection}
            isGoogleImport={false}
            onSwitchToGoogle={handleSwitchToGoogle}
          />
```

Current (`StepSurveyDetails.tsx:286-292`, form-fields-after-Google-import flow):
```tsx
          <StepOneFormFields
            formData={formData}
            updateFormData={updateFormData}
            onSubmit={handleSubmit}
            isGoogleImport={true}
          />
```

New:
```tsx
          <StepOneFormFields
            formData={formData}
            updateFormData={updateFormData}
            onSubmit={handleSubmit}
            onBack={handleBackToMethodSelection}
            isGoogleImport={true}
          />
```

- [ ] **Step 5: Typecheck**

Run: `cd multi-step-form && npx tsc -b 2>&1 | grep -E "StepOneFormFields|StepSurveyDetails"`
Expected: no output (no errors in either file).

Run: `npx tsc -b 2>&1 | grep -c "error TS"`
Expected: `63` (unchanged from baseline).

---

### Task 2: Step 2 (Ringkasan) — Back button next to the primary CTA

**Files:**
- Modify: `multi-step-form/src/components/StepCheckout.tsx:31-40` (props interface), `:49` (destructure), `:13-29` (icon import), `:693-739` (button row)
- Modify: `multi-step-form/src/components/MultiStepForm.tsx:393-402` (StepCheckout render site)

**Interfaces:**
- Consumes: `prevStep` — already defined in `MultiStepForm.tsx:243-246`, signature `() => void`, unchanged.
- Produces: `StepCheckoutProps.onBack: () => void` (required).

- [ ] **Step 1: Add `ArrowLeft` to the lucide-react import in `StepCheckout.tsx`**

Current (`StepCheckout.tsx:13-29`):
```tsx
import {
  Ticket,
  Wallet,
  CheckCircle,
  AlertTriangle,
  FileText,
  Gift,
  Target,
  Info,
  CreditCard,
  Send,
  ArrowRight,
  ExternalLink,
  CalendarCheck,
  Zap,
  Lock
} from 'lucide-react';
```

New:
```tsx
import {
  Ticket,
  Wallet,
  CheckCircle,
  AlertTriangle,
  FileText,
  Gift,
  Target,
  Info,
  CreditCard,
  Send,
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  CalendarCheck,
  Zap,
  Lock
} from 'lucide-react';
```

- [ ] **Step 2: Add `onBack` to `StepCheckoutProps` and the function signature**

Current (`StepCheckout.tsx:31-40`):
```tsx
interface StepCheckoutProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  /** Lanjut ke langkah Jadwal — hanya jalur otomatis yang memakainya. */
  nextStep: () => void;
  /** Menulis order (jalur manual, dan jalur Kilat yang jadwalnya sudah dipilih). */
  onSubmitOrder: () => Promise<boolean>;
  onUpgradeKilat?: () => void;
  onUndoKilat?: () => void;
}
```

New:
```tsx
interface StepCheckoutProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  /** Lanjut ke langkah Jadwal — hanya jalur otomatis yang memakainya. */
  nextStep: () => void;
  /** Menulis order (jalur manual, dan jalur Kilat yang jadwalnya sudah dipilih). */
  onSubmitOrder: () => Promise<boolean>;
  onBack: () => void;
  onUpgradeKilat?: () => void;
  onUndoKilat?: () => void;
}
```

Current (`StepCheckout.tsx:49`):
```tsx
export function StepCheckout({ formData, updateFormData, nextStep, onSubmitOrder, onUpgradeKilat, onUndoKilat }: StepCheckoutProps) {
```

New:
```tsx
export function StepCheckout({ formData, updateFormData, nextStep, onSubmitOrder, onBack, onUpgradeKilat, onUndoKilat }: StepCheckoutProps) {
```

- [ ] **Step 3: Wrap the primary CTA with a Back button**

Current (`StepCheckout.tsx:696-739`, opening of the actions block — only the wrapper and the closing of the button itself change, the button's internal content at lines 713-738 stays untouched):
```tsx
        <div className="pt-1 pb-12 space-y-2.5">
          <button
            type="button"
            onClick={handlePrimaryAction}
            disabled={isSubmitting}
            className={`
            w-full px-8 py-3.5 rounded-xl text-white font-bold text-base shadow-lg transition-all duration-200 flex items-center justify-center gap-2
            ${isSubmitting
                ? 'opacity-60 cursor-not-allowed pointer-events-none'
                : 'hover:shadow-xl hover:-translate-y-0.5'
              }
            ${!isAutoApproval
                ? 'bg-amber-500 hover:bg-amber-600'
                : 'shadow-lg hover:shadow-xl'
              }
          `}
            style={isAutoApproval ? { background: 'linear-gradient(135deg, #0091ff 0%, #0077cc 100%)', boxShadow: '0 4px 12px rgba(0, 145, 255, 0.3)' } : {}}
          >
```

New:
```tsx
        <div className="pt-1 pb-12 space-y-2.5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              disabled={isSubmitting}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-3.5 text-sm font-semibold text-gray-600 transition-colors hover:border-gray-400 hover:bg-gray-50 disabled:opacity-60 disabled:pointer-events-none"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('backButton')}
            </button>
            <button
              type="button"
              onClick={handlePrimaryAction}
              disabled={isSubmitting}
              className={`
            flex-1 px-8 py-3.5 rounded-xl text-white font-bold text-base shadow-lg transition-all duration-200 flex items-center justify-center gap-2
            ${isSubmitting
                  ? 'opacity-60 cursor-not-allowed pointer-events-none'
                  : 'hover:shadow-xl hover:-translate-y-0.5'
                }
            ${!isAutoApproval
                  ? 'bg-amber-500 hover:bg-amber-600'
                  : 'shadow-lg hover:shadow-xl'
                }
          `}
              style={isAutoApproval ? { background: 'linear-gradient(135deg, #0091ff 0%, #0077cc 100%)', boxShadow: '0 4px 12px rgba(0, 145, 255, 0.3)' } : {}}
            >
```

And close the new wrapper `<div>` right after the existing button's closing `</button>` (currently line 739, immediately before the hint `<p>` at line 741):

Current (`StepCheckout.tsx:739-740`):
```tsx
          </button>

          <p className="text-xs text-gray-500 text-center leading-relaxed px-2">
```

New:
```tsx
            </button>
          </div>

          <p className="text-xs text-gray-500 text-center leading-relaxed px-2">
```

- [ ] **Step 4: Pass `onBack={prevStep}` at the `StepCheckout` render site**

Current (`MultiStepForm.tsx:393-402`):
```tsx
        {currentStep === 2 && (
          <StepCheckout
            formData={formData}
            updateFormData={updateFormData}
            nextStep={nextStep}
            onSubmitOrder={submitOrderAndRoute}
            onUpgradeKilat={goToKilatSchedule}
            onUndoKilat={undoKilatUpgrade}
          />
        )}
```

New:
```tsx
        {currentStep === 2 && (
          <StepCheckout
            formData={formData}
            updateFormData={updateFormData}
            nextStep={nextStep}
            onSubmitOrder={submitOrderAndRoute}
            onBack={prevStep}
            onUpgradeKilat={goToKilatSchedule}
            onUndoKilat={undoKilatUpgrade}
          />
        )}
```

- [ ] **Step 5: Typecheck**

Run: `cd multi-step-form && npx tsc -b 2>&1 | grep -E "StepCheckout|MultiStepForm"`
Expected: no output.

Run: `npx tsc -b 2>&1 | grep -c "error TS"`
Expected: `63`.

---

### Task 3: Step 3 & 4 (Jadwal) — Back button next to the lock/confirm CTA

**Files:**
- Modify: `multi-step-form/src/components/StepSchedule.tsx:1-9` (icon import), `:11-21` (props interface), `:32` (destructure), `:104-122` (button row)
- Modify: `multi-step-form/src/components/MultiStepForm.tsx:404-433` (both StepSchedule render sites)

**Interfaces:**
- Consumes: `prevStep` (step 3 site) and `handleKilatBack` (step 4 site, `MultiStepForm.tsx:335-339`) — both `() => void`, unchanged.
- Produces: `StepScheduleProps.onBack: () => void` (required, used by both `mode='regular'` and `mode='kilat'` renders).

- [ ] **Step 1: Add `ArrowLeft` to the lucide-react import in `StepSchedule.tsx`**

Current (`StepSchedule.tsx:4`):
```tsx
import { Loader2, AlertCircle, Lock } from 'lucide-react';
```

New:
```tsx
import { ArrowLeft, Loader2, AlertCircle, Lock } from 'lucide-react';
```

- [ ] **Step 2: Add `onBack` to `StepScheduleProps` and the function signature**

Current (`StepSchedule.tsx:11-21`):
```tsx
interface StepScheduleProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  /**
   * Apa yang terjadi setelah tanggal dikunci. Mode reguler menulis order lalu
   * pindah ke halaman pembayaran; mode kilat kembali ke Ringkasan. Mengembalikan
   * false berarti gagal — tombol dipulihkan supaya user bisa mencoba lagi.
   */
  onConfirm: (ymd: string) => Promise<boolean> | boolean;
  mode?: 'regular' | 'kilat';
}
```

New:
```tsx
interface StepScheduleProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  /**
   * Apa yang terjadi setelah tanggal dikunci. Mode reguler menulis order lalu
   * pindah ke halaman pembayaran; mode kilat kembali ke Ringkasan. Mengembalikan
   * false berarti gagal — tombol dipulihkan supaya user bisa mencoba lagi.
   */
  onConfirm: (ymd: string) => Promise<boolean> | boolean;
  onBack: () => void;
  mode?: 'regular' | 'kilat';
}
```

Current (`StepSchedule.tsx:32`):
```tsx
export function StepSchedule({ formData, updateFormData, onConfirm, mode = 'regular' }: StepScheduleProps) {
```

New:
```tsx
export function StepSchedule({ formData, updateFormData, onConfirm, onBack, mode = 'regular' }: StepScheduleProps) {
```

- [ ] **Step 3: Wrap the confirm CTA with a Back button**

Current (`StepSchedule.tsx:104-122`):
```tsx
      <div className="space-y-2 pb-4">
        <button
          onClick={handleConfirm}
          disabled={!selected || availability.isLoading || isConfirming}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-base font-bold text-white shadow-lg transition-all hover:bg-blue-700 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        >
          {isConfirming ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {t('lockingSlotLoading')}
            </>
          ) : (
            <>
              <Lock size={18} />
              {mode === 'kilat' ? t('scheduleConfirmKilatCta') : t('scheduleLockCta')}
              <span aria-hidden="true">→</span>
            </>
          )}
        </button>
```

New:
```tsx
      <div className="space-y-2 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={isConfirming}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-3.5 text-sm font-semibold text-gray-600 transition-colors hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('backButton')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected || availability.isLoading || isConfirming}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-base font-bold text-white shadow-lg transition-all hover:bg-blue-700 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            {isConfirming ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {t('lockingSlotLoading')}
              </>
            ) : (
              <>
                <Lock size={18} />
                {mode === 'kilat' ? t('scheduleConfirmKilatCta') : t('scheduleLockCta')}
                <span aria-hidden="true">→</span>
              </>
            )}
          </button>
        </div>
```

(The closing `</div>` of the outer `space-y-2 pb-4` container at line 129 already exists after the countdown hint paragraph — no change needed there since we only added one new wrapper `<div>` around the two buttons, closed right after the confirm button.)

- [ ] **Step 4: Pass `onBack` at both `StepSchedule` render sites**

Current (`MultiStepForm.tsx:404-410`, step 3, regular mode):
```tsx
        {currentStep === 3 && (
          <StepSchedule
            formData={formData}
            updateFormData={updateFormData}
            onConfirm={(ymd) => submitOrderAndRoute({ startDate: ymd, startTime: '15:00' })}
          />
        )}
```

New:
```tsx
        {currentStep === 3 && (
          <StepSchedule
            formData={formData}
            updateFormData={updateFormData}
            onConfirm={(ymd) => submitOrderAndRoute({ startDate: ymd, startTime: '15:00' })}
            onBack={prevStep}
          />
        )}
```

Current (`MultiStepForm.tsx:412-433`, step 4, kilat mode):
```tsx
        {currentStep === 4 && (
          <StepSchedule
            formData={formData}
            updateFormData={updateFormData}
            mode="kilat"
            onConfirm={async (ymd) => {
```

New:
```tsx
        {currentStep === 4 && (
          <StepSchedule
            formData={formData}
            updateFormData={updateFormData}
            mode="kilat"
            onBack={handleKilatBack}
            onConfirm={async (ymd) => {
```

(rest of that block, lines 417-432, is unchanged)

- [ ] **Step 5: Typecheck**

Run: `cd multi-step-form && npx tsc -b 2>&1 | grep -E "StepSchedule|MultiStepForm"`
Expected: no output.

Run: `npx tsc -b 2>&1 | grep -c "error TS"`
Expected: `63`.

---

### Task 4: Cancel order — replace the header's back arrow with a confirmed Cancel, and clean up now-dead back-handler plumbing

**Files:**
- Modify: `multi-step-form/src/components/UnifiedHeader.tsx` (full rewrite of the props, left-button block, and a new dialog block)
- Modify: `multi-step-form/src/components/MultiStepForm.tsx:128-140` (remove `step1BackHandler` state + `handleStep1BackHandlerChange`), `:341-344` (remove `unifiedHeaderOnBack`, add `cancelOrder`), `:351-356` (update `UnifiedHeader` render call), `:389` (remove `onBackHandlerChange` prop)
- Modify: `multi-step-form/src/components/StepSurveyDetails.tsx:18-20` (remove `onBackHandlerChange` from interface), `:25` (remove from destructure), `:75-84` (remove the effect that reports it)

**Interfaces:**
- Consumes: `STORAGE_KEY` / `LEGACY_SURVEY_DRAFT_KEY` (already imported in `MultiStepForm.tsx:7,27`), `navigate` (already available via `useNavigate()` in `MultiStepForm.tsx`).
- Produces: `UnifiedHeaderProps.onCancelConfirmed: () => void` (required, replaces the old optional `onBack`).

- [ ] **Step 1: Rewrite `UnifiedHeader.tsx`'s imports and props**

Current (`UnifiedHeader.tsx:1-13`):
```tsx
import type { SurveyFormData } from '../types';
import { calculateTotalCost } from '../utils/cost-calculator';
import { formatRupiah } from '../utils/currency';
import { useIlkomunyBlocked } from '../hooks/useIlkomunyBlocked';
import { useMemo, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from './ui/button';

interface UnifiedHeaderProps {
    formData: SurveyFormData;
    onBack?: () => void;
}
```

New:
```tsx
import type { SurveyFormData } from '../types';
import { calculateTotalCost } from '../utils/cost-calculator';
import { formatRupiah } from '../utils/currency';
import { useIlkomunyBlocked } from '../hooks/useIlkomunyBlocked';
import { useMemo, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { X, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { Button } from './ui/button';

interface UnifiedHeaderProps {
    formData: SurveyFormData;
    onCancelConfirmed: () => void;
}
```

- [ ] **Step 2: Add cancel-dialog state and swap the left button from back-arrow to X**

Current (`UnifiedHeader.tsx:15-17`):
```tsx
export function UnifiedHeader({ formData, onBack }: UnifiedHeaderProps) {
    const { t } = useLanguage();
    const [isExpanded, setIsExpanded] = useState(false);
```

New:
```tsx
export function UnifiedHeader({ formData, onCancelConfirmed }: UnifiedHeaderProps) {
    const { t } = useLanguage();
    const [isExpanded, setIsExpanded] = useState(false);
    const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
```

Current (`UnifiedHeader.tsx:44-53`):
```tsx
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="mr-0 -ml-2 text-gray-500 hover:text-jfu-primary hover:bg-jfu-primary/5"
                                    onClick={() => onBack?.()}
                                    title={t('backButton')}
                                >
                                    <ArrowLeft className="w-5 h-5" />
                                </Button>
```

New:
```tsx
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="mr-0 -ml-2 text-gray-500 hover:text-red-600 hover:bg-red-50"
                                    onClick={() => setIsCancelDialogOpen(true)}
                                    title="Batalkan Pesanan"
                                >
                                    <X className="w-5 h-5" />
                                </Button>
```

- [ ] **Step 3: Add the confirmation dialog, rendered OUTSIDE the floating bar's `pointer-events-none` wrapper**

The floating bar's outer wrapper (`UnifiedHeader.tsx:37`) is `<div className="fixed bottom-0 inset-x-0 z-30 pointer-events-none ...">`. `pointer-events: none` is inherited by descendants unless they set their own value, and the reused `.modal-overlay`/`.modal-button` CSS classes (`styles.css:2527-2617`) don't set `pointer-events` themselves — so the dialog must NOT be nested inside that wrapper, or its buttons will be unclickable. Render it as a sibling instead, same defensive placement `StepSurveyDetails.tsx:245-246` already uses for its own modal and for the same reason.

Current (`UnifiedHeader.tsx:33-37`, start of the return):
```tsx
    return (
        // Kartu floating di bawah layar (desktop & mobile) — wrapper fixed
        // pointer-events-none supaya area di kiri/kanan kartu tetap bisa
        // di-scroll/diklik; safe-area untuk home indicator iOS.
        <div className="fixed bottom-0 inset-x-0 z-30 pointer-events-none pb-[env(safe-area-inset-bottom)]">
```

New:
```tsx
    return (
        <>
        {/* Kartu floating di bawah layar (desktop & mobile) — wrapper fixed
            pointer-events-none supaya area di kiri/kanan kartu tetap bisa
            di-scroll/diklik; safe-area untuk home indicator iOS. */}
        <div className="fixed bottom-0 inset-x-0 z-30 pointer-events-none pb-[env(safe-area-inset-bottom)]">
```

Current (`UnifiedHeader.tsx:152-156`, end of the return):
```tsx
                </div>
            </div>
        </div>
    );
}
```

New:
```tsx
                </div>
            </div>
        </div>

        {/* Dialog konfirmasi Cancel — sengaja DI LUAR wrapper pointer-events-none
            di atas, dengan alasan yang sama seperti StepSurveyDetails.tsx:
            elemen bertumpuk yang mewarisi pointer-events-none jadi tidak bisa
            diklik sama sekali. */}
        {isCancelDialogOpen && (
            <div className="modal-overlay">
                <div className="modal-dialog">
                    <div className="modal-header">
                        <AlertTriangle size={24} className="modal-icon-warning" />
                        <h3 className="modal-title">Batalkan Pesanan?</h3>
                    </div>
                    <div className="modal-body">
                        <p>
                            Semua data yang sudah Anda isi akan hilang dan tidak bisa dikembalikan. Yakin ingin membatalkan pesanan ini dan kembali ke halaman utama?
                        </p>
                    </div>
                    <div className="modal-footer">
                        <button
                            onClick={() => setIsCancelDialogOpen(false)}
                            className="modal-button modal-button-cancel"
                        >
                            Tidak, Lanjutkan Mengisi
                        </button>
                        <button
                            onClick={onCancelConfirmed}
                            className="modal-button modal-button-confirm"
                        >
                            Ya, Batalkan Pesanan
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
```

- [ ] **Step 4: In `MultiStepForm.tsx`, remove the now-dead step1-back-handler plumbing and add `cancelOrder`**

Current (`MultiStepForm.tsx:125-136`):
```tsx
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  // Handler "kembali ke pilih-metode" milik StepSurveyDetails, dinaikkan ke sini
  // supaya UnifiedHeader (floating bar) bisa memicu mundur saat currentStep === 1.
  const [step1BackHandler, setStep1BackHandler] = useState<(() => void) | undefined>(undefined);
  // useCallback supaya identitas stabil antar render — kalau prop ini berubah
  // referensi tiap render, useEffect di StepSurveyDetails yang men-depend
  // padanya akan terus menyala ulang dan memicu setState tanpa henti.
  const handleStep1BackHandlerChange = useCallback((handler: (() => void) | undefined) => {
    // `handler` adalah FUNGSI — setState harus dibungkus lagi, kalau tidak
    // React mengiranya updater function dan langsung memanggilnya.
    setStep1BackHandler(() => handler);
  }, []);
```

New (both the `step1BackHandler` state and `handleStep1BackHandlerChange` callback deleted — nothing else in the file reads them once Task 1 and this task's other steps land):
```tsx
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
```

`useCallback` (`MultiStepForm.tsx:1`) is used ONLY by the deleted `handleStep1BackHandlerChange` — grep confirms no other call site in this file — so it becomes an unused import and must be dropped too, or `tsc -b` picks up a new `TS6133` error and the baseline count moves from 63 to 64.

Current (`MultiStepForm.tsx:1`):
```tsx
import { useState, useEffect, useCallback, useRef } from 'react';
```

New:
```tsx
import { useState, useEffect, useRef } from 'react';
```

Current (`MultiStepForm.tsx:341-344`):
```tsx
  const unifiedHeaderOnBack =
    currentStep === 1 ? step1BackHandler :
    currentStep === 4 ? handleKilatBack :
    prevStep;
```

New:
```tsx
  const cancelOrder = () => {
    isFinalizedRef.current = true;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_SURVEY_DRAFT_KEY);
    navigate('/dashboard', { replace: true });
  };
```

(`isFinalizedRef.current = true` mirrors `submitOrderAndRoute`'s cleanup at `MultiStepForm.tsx:293` — it's the same ref that guards the "warn before leaving with unsaved changes" behavior elsewhere in this file; setting it here tells that guard the draft was intentionally discarded, not abandoned mid-edit.)

Current (`MultiStepForm.tsx:351-355`):
```tsx
        <UnifiedHeader
          formData={formData}
          onBack={unifiedHeaderOnBack}
        />
```

New:
```tsx
        <UnifiedHeader
          formData={formData}
          onCancelConfirmed={cancelOrder}
        />
```

Current (`MultiStepForm.tsx:389`, inside the `StepSurveyDetails` render):
```tsx
            onBackHandlerChange={handleStep1BackHandlerChange}
```

Delete this line entirely.

- [ ] **Step 5: Remove the matching dead plumbing from `StepSurveyDetails.tsx`**

Current (`StepSurveyDetails.tsx:13-21`):
```tsx
interface StepSurveyDetailsProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  nextStep: () => void;
  onHeaderVisibilityChange?: (isVisible: boolean) => void;
  /** Menaikkan fungsi "kembali ke pilih-metode" ke MultiStepForm supaya
   *  UnifiedHeader (floating bar) bisa memicunya lewat tombol ←. */
  onBackHandlerChange?: (handler: (() => void) | undefined) => void;
}
```

New:
```tsx
interface StepSurveyDetailsProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  nextStep: () => void;
  onHeaderVisibilityChange?: (isVisible: boolean) => void;
}
```

Current (`StepSurveyDetails.tsx:25`):
```tsx
export function StepSurveyDetails({ formData, updateFormData, nextStep, onHeaderVisibilityChange, onBackHandlerChange }: StepSurveyDetailsProps) {
```

New:
```tsx
export function StepSurveyDetails({ formData, updateFormData, nextStep, onHeaderVisibilityChange }: StepSurveyDetailsProps) {
```

Current (`StepSurveyDetails.tsx:75-84`):
```tsx
  // Notify parent about the "back to method selection" handler — only
  // meaningful while UnifiedHeader is visible (manual/form-fields above).
  useEffect(() => {
    onBackHandlerChange?.(
      flowState === 'manual' || flowState === 'form-fields'
        ? handleBackToMethodSelection
        : undefined
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowState, onBackHandlerChange]);

```

Delete this whole block (the `useEffect` is no longer needed — `handleBackToMethodSelection` is now passed directly as `onBack` at the two `StepOneFormFields` render sites from Task 1, so nothing needs to be lifted to the parent anymore).

- [ ] **Step 6: Typecheck**

Run: `cd multi-step-form && npx tsc -b 2>&1 | grep -E "UnifiedHeader|MultiStepForm|StepSurveyDetails"`
Expected: no output.

Run: `npx tsc -b 2>&1 | grep -c "error TS"`
Expected: `63`.

---

### Task 5: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck baseline**

Run: `cd multi-step-form && npx tsc -b 2>&1 | grep -c "error TS"`
Expected: `63` (identical to the pre-change baseline measured at the start of this plan).
**Basi — baseline sekarang `60`, lihat koreksi no. 2 di kepala berkas.**

- [ ] **Step 2: Confirm the dev server is serving the changes**

Run: `curl -s http://localhost:5173/src/components/UnifiedHeader.tsx | grep -c "onCancelConfirmed"`
Expected: `1` or more (module server reflects the new prop name).

- [ ] **Step 3: Manual browser click-through at `http://localhost:5173/dashboard/submit-iklan`**

Walk through every scenario from the design spec's Testing section (`docs/superpowers/specs/2026-08-10-order-form-back-cancel-design.md`):

1. Step 1 → click Back → lands on the method-selection screen (not outside the form).
2. Step 1 → Lanjutkan → Step 2 → click Back → back on Step 1, form 1's data intact.
3. Step 2 → Lanjutkan (schedule path) → Step 3 → click Back → back on Step 2.
4. Step 2 → upgrade to Kilat → Step 4 → click Back → back on Step 2, Kilat upgrade undone (same as the old arrow's behavior on step 4).
5. On any step **where the floating bar is shown** (Step 1 form screen, Step 2 — see koreksi no. 1) → click the `X` in the floating bar → dialog appears → click "Tidak, Lanjutkan Mengisi" → dialog closes, step/form unchanged.
6. Same steps → click `X` → "Ya, Batalkan Pesanan" → redirected to `/dashboard`; open a new order → starts clean on Step 1 (old draft does not reappear).
7. **Baru 2026-08-18:** Step 1 pilih metode → bar tersembunyi; pilih "Isi manual" → bar muncul **dan tidak menutupi** baris tombol Kembali/Lanjut; maju ke Step 2 → bar tetap; **Kembali ke Step 1 → bar masih muncul** (dulu hilang); maju ke Step 3/4 → bar hilang, konten tidak menyisakan ruang kosong di bawah.

- [ ] **Step 4: Report results to the user and ask before committing**

Summarize pass/fail for each of the 6 scenarios and the typecheck count. Do NOT run `git commit` — ask the user first, per this repo's established convention.
