# Dokumentasi Implementasi: Fitur Extend Durasi Iklan

## 1. Overview & Tujuan

Fitur **Extend Durasi** memungkinkan customer untuk memperpanjang masa tayang iklan survey mereka setelah submission awal selesai (status `paid`, `live`, atau `completed`). Setiap extend dianggap sebagai **"mini-order baru"** yang memiliki lifecycle pembayaran dan slot reservasi sendiri, namun masih terkait dengan submission parent melalui tabel `form_submissions_extend`.

### Karakteristik Utama
- Extend bisa dilakukan **berkali-kali tanpa batas**.
- Extend **tidak harus menyambung** (contiguous) dari periode parent — **gap diperbolehkan**.
- Setiap extend memiliki **slot reservasi**, **pembayaran (Doku)**, dan **status**nya sendiri.
- Insentif/responden di-extend **per batch bulanan** (pool terpisah per bulan).
- Page publik (`survey_pages`) akan **reuse** yang sudah ada, **tidak membuat page baru**.
- Admin perlu mengupdate banner jika extend masuk batch baru atau ada perubahan insentif.

---

## 2. Database Schema

### 2.1 Tabel Baru: `form_submissions_extend`

Tabel ini menyimpan data setiap extend order.

```sql
CREATE TABLE IF NOT EXISTS public.form_submissions_extend (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.form_submissions(id) ON DELETE CASCADE,

  -- Durasi & Slot
  duration INT NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,

  -- Incentive
  -- Bulan sama: opsional (additional_prize_per_winner bisa 0)
  -- Bulan baru: wajib baru (winner_count harus diisi, prize_per_winner baru)
  additional_prize_per_winner NUMERIC DEFAULT 0,
  winner_count INT DEFAULT 0,

  -- Pembayaran & Status
  total_cost NUMERIC NOT NULL,
  payment_status TEXT DEFAULT 'pending',         -- pending | paid | expired
  submission_status TEXT DEFAULT 'waiting_payment', -- waiting_payment | scheduled | live | completed | cancelled

  -- Slot Tracking
  slot_booked_by TEXT,
  slot_reserved_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  voucher_code TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_extend_submission_id
  ON public.form_submissions_extend(submission_id);
CREATE INDEX IF NOT EXISTS idx_extend_status
  ON public.form_submissions_extend(submission_status);
CREATE INDEX IF NOT EXISTS idx_extend_dates
  ON public.form_submissions_extend(start_date, end_date);
```

### 2.2 Update Tabel: `survey_pages`

Tambahkan kolom untuk tracking kebutuhan update banner.

```sql
ALTER TABLE public.survey_pages
ADD COLUMN IF NOT EXISTS requires_banner_update BOOLEAN DEFAULT false;
```

### 2.3 Update Tabel: `page_respondents`

Tambahkan kolom untuk tracking batch periode (format: `"YYYY-MM"`, diambil dari **end_date** periode aktif saat respondents submit).

```sql
ALTER TABLE public.page_respondents
ADD COLUMN IF NOT EXISTS period_batch TEXT;

CREATE INDEX IF NOT EXISTS idx_page_respondents_period_batch
  ON public.page_respondents(period_batch);
```

**Catatan:** Unique constraint `(page_id, jakpat_id)` tetap dipertahankan. Respondents **tidak boleh** mengisi ulang survey untuk `page_id` yang sama meski diperiode/bulan berbeda.

---

## 3. Supabase RPC

### 3.1 `get_page_active_period(slug)`

Function ini mengecek apakah sebuah page sedang aktif (live) berdasarkan periode parent atau salah satu extend-nya. Menggantikan pemeriksaan static `publish_start_date` / `publish_end_date` di `SurveyPage.tsx`.

```sql
CREATE OR REPLACE FUNCTION public.get_page_active_period(p_slug TEXT)
RETURNS TABLE (
  is_active BOOLEAN,
  active_source TEXT,            -- 'parent', 'extend', 'none'
  active_end_date TIMESTAMP WITH TIME ZONE,
  requires_banner_update BOOLEAN
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  page_rec RECORD;
  parent_rec RECORD;
  extend_rec RECORD;
  now_ts TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
  -- Get page data
  SELECT id, submission_id, requires_banner_update
    INTO page_rec
    FROM public.survey_pages
   WHERE slug = p_slug;

  IF page_rec IS NULL THEN
    RETURN QUERY SELECT FALSE, 'none'::TEXT, NULL::TIMESTAMP WITH TIME ZONE, FALSE;
    RETURN;
  END IF;

  -- Check parent form_submissions
  SELECT start_date, end_date, submission_status
    INTO parent_rec
    FROM public.form_submissions
   WHERE id = page_rec.submission_id;

  IF parent_rec IS NOT NULL
     AND parent_rec.start_date IS NOT NULL
     AND parent_rec.end_date IS NOT NULL
     AND parent_rec.start_date <= now_ts
     AND parent_rec.end_date >= now_ts
     AND parent_rec.submission_status IN ('live', 'scheduled', 'paid') THEN
    RETURN QUERY SELECT TRUE, 'parent'::TEXT, parent_rec.end_date, page_rec.requires_banner_update;
    RETURN;
  END IF;

  -- Check extends (cari extend yang paling baru dan sedang live)
  SELECT e.end_date
    INTO extend_rec
    FROM public.form_submissions_extend e
   WHERE e.submission_id = page_rec.submission_id
     AND e.start_date IS NOT NULL
     AND e.end_date IS NOT NULL
     AND e.start_date <= now_ts
     AND e.end_date >= now_ts
     AND e.submission_status = 'live'
   ORDER BY e.start_date DESC
   LIMIT 1;

  IF extend_rec IS NOT NULL THEN
    RETURN QUERY SELECT TRUE, 'extend'::TEXT, extend_rec.end_date, page_rec.requires_banner_update;
    RETURN;
  END IF;

  -- Not active
  RETURN QUERY SELECT FALSE, 'none'::TEXT, NULL::TIMESTAMP WITH TIME ZONE, page_rec.requires_banner_update;
END;
$$;
```

---

## 4. TypeScript Types

### 4.1 `ExtendFormData` (Frontend State)

```typescript
export interface ExtendFormData {
  submissionId: string;              // Parent submission ID

  // Step 1: Input Extend
  duration: number;                    // Jumlah hari extend
  additionalPrizePerWinner: number;    // Tambahan insentif per pemenang (0 jika tidak nambah)
  winnerCount: number;                 // Jumlah pemenang untuk periode extend ini (jika bulan baru)
  isNewMonth: boolean;                 // True jika extend.end_date masuk bulan baru

  // Step 3: Slot Reservation
  startDate: string;                   // YYYY-MM-DD
  startTime: string;                   // HH:MM (default 15:00)
  endDate: string;                     // YYYY-MM-DD (auto calculate)

  // Step 4: Review & Payment
  voucherCode?: string;
  totalCost: number;
}
```

### 4.2 `FormSubmissionExtend` (Supabase Row)

```typescript
export interface FormSubmissionExtend {
  id?: string;
  submission_id: string;
  duration: number;
  start_date?: string | null;
  end_date?: string | null;
  additional_prize_per_winner: number;
  winner_count: number;
  total_cost: number;
  payment_status?: 'pending' | 'paid' | 'expired';
  submission_status?: 'waiting_payment' | 'scheduled' | 'live' | 'completed' | 'cancelled';
  slot_booked_by?: string;
  slot_reserved_at?: string;
  voucher_code?: string;
  created_at?: string;
  updated_at?: string;
}
```

---

## 5. Flow Extend (User)

### 5.1 Trigger Extend
1. User berada di `StatusPage` (`/dashboard/status`).
2. Submission parent berstatus `paid`, `live`, atau `completed`.
3. User klik tombol **"Extend Iklan"**.
4. Sistem redirect ke `/dashboard/extend/:submissionId`.

### 5.2 Step 1 — Input Durasi & Insentif
- Input: `duration` (jumlah hari).
- Input: `additionalPrizePerWinner` (tambahan nominal per pemenang, default 0).
- Input: `winnerCount` (jumlah pemenang, wajib diisi jika **bulan baru**).
- **Validasi Bulan Baru:**
  ```
  isNewMonth = getMonthYear(extendStartDate) !== getMonthYear(lastPeriodEndDate)
  ```
  `lastPeriodEndDate` = end_date dari extend terakhir yang sudah `paid/live`, atau `parent.end_date` jika belum pernah extend.
- Jika `isNewMonth === true`:
  - `winnerCount` **wajib** > 0.
  - `additionalPrizePerWinner` bisa 0 (jika user tidak menambah nominal), tapi winner_count harus tetap diisi.
- **Validasi Overlap:**
  - `extend.start_date` harus >= `parent.end_date` (atau `lastExtend.end_date` jika sudah pernah extend).
  - Tidak boleh overlap dengan periode parent atau extends lain yang sudah `paid/live`.

### 5.3 Step 2 — Review Metadata (Read-Only)
- Menampilkan data dari parent: `title`, `survey_url`, `description`, `question_count`, `criteria_responden`.
- Tidak bisa diedit. Hanya konfirmasi bahwa extend menggunakan survey yang sama.

### 5.4 Step 3 — Slot Reservation
- **Reuse** komponen `StepThreeSlotReservation.tsx` dengan modifikasi:
  - Disable tanggal yang overlap dengan periode parent atau extends lain yang sudah `paid/live`.
  - Cek `MAX_REGULAR_ADS_PER_DAY` (sudah include data dari `form_submissions_extend`).
- User pilih start_date. Sistem auto-calculate `end_date = start_date + duration`.
- Sistem cek kapasitas slot untuk rentang tanggal extend.

### 5.5 Step 4 — Review & Payment
- Hitung cost:
  ```
  adCost = adCostPerDay × duration
  incentiveCost = additionalPrizePerWinner × winnerCount   (jika bulan baru)
  totalCost = adCost + incentiveCost
  ```
- Tampilkan summary:
  - Survey: `[title]`
  - Periode: `[startDate]` — `[endDate]`
  - Durasi: `[duration]` hari
  - Tambahan Insentif: `Rp [additionalPrizePerWinner]` (jika ada)
  - Jumlah Pemenang: `[winnerCount]` (jika bulan baru)
  - Total: `Rp [totalCost]`
- Save ke `form_submissions_extend` dengan status `waiting_payment`.
- Redirect ke halaman payment: `/dashboard/payment/extend/:extendId`.

### 5.6 Step 5 — Payment (Doku)
- **Reuse** flow payment Doku yang sudah ada.
- Timer 1 jam (3,600 detik) untuk menyelesaikan pembayaran.
- Jika expired: slot di-release, `payment_status = 'expired'`, `submission_status = 'cancelled'`.
- Jika berhasil: `payment_status = 'paid'`, `submission_status = 'scheduled'`.
- **Trigger Banner Update:**
  - Jika `isNewMonth === true` ATAU `additionalPrizePerWinner > 0`:
    - Update `survey_pages.requires_banner_update = true`.

### 5.7 Page Activation
- Saat extend masuk status `live` (start_date tiba):
  - RPC `get_page_active_period()` akan otomatis return `active_source: 'extend'`.
  - `SurveyPage.tsx` akan tetap accessible.
- Saat extend `completed`:
  - Jika tidak ada extend lain yang `live`, page mati (respondents lihat "Survey sudah berakhir").
  - Jika ada extend lain yang masih `live`, page tetap aktif.

---

## 6. Flow Extend (Admin)

### 6.1 Internal Dashboard
- Extend ditampilkan di tabel **"Submissions"** dengan badge **"Extension"**.
- Extend digroup/disisipkan di bawah submission parent (Opsi A yang sudah disepakati).
- Admin bisa manage status extend (approve, set live, completed).
- Admin bisa lihat warning **"Perlu Update Banner"** di `PublishPageManagement`.

### 6.2 Publish Page Management
- Jika `survey_pages.requires_banner_update = true`, tampilkan **warning indicator** (badge merah/orange) di list page.
- Admin klik page → buka `PageBuilderModal` → upload banner baru → save.
- Saat save, sistem set `requires_banner_update = false`.

---

## 7. Slot Availability & Validasi

### 7.1 `fetchSlotAvailability()`

Fungsi ini harus di-update untuk meng-include `form_submissions_extend` dalam perhitungan slot harian.

```typescript
// Pseudocode
const fetchSlotAvailability = async (excludeSubmissionId?: string, excludeExtendId?: string) => {
  // 1. Fetch regular submissions yang sudah paid/live/scheduled
  const { data: submissions } = await supabase
    .from('form_submissions')
    .select('start_date, end_date, submission_status')
    .in('submission_status', ['paid', 'scheduled', 'live'])
    .neq('id', excludeSubmissionId || '');

  // 2. Fetch extends yang sudah paid/live/scheduled
  const { data: extends } = await supabase
    .from('form_submissions_extend')
    .select('start_date, end_date, submission_status')
    .in('submission_status', ['paid', 'scheduled', 'live'])
    .neq('id', excludeExtendId || '');

  // 3. Merge & count per date
  const regularCounts = {};
  const details = {};

  // ... logic counting yang sama seperti sekarang, tapi include extends
};
```

### 7.2 Validasi Overlap (Extend Step 3)

```typescript
function isDateAllowed(selectedDate: Date, parentEndDate: Date, lastExtendEndDate?: Date): boolean {
  const minStartDate = lastExtendEndDate
    ? new Date(lastExtendEndDate)
    : new Date(parentEndDate);

  // Extend tidak boleh overlap dengan periode sebelumnya
  return selectedDate >= minStartDate;
}
```

---

## 8. Payment Flow (Doku)

### 8.1 Extend Payment Checkout
- Route: `/dashboard/payment/extend/:extendId`
- Reuse komponen `PaymentCheckoutPage.tsx` dengan mode `isExtend = true`.
- Jika extend sudah dibayar (`payment_status = 'paid'`), redirect ke `/dashboard/status`.
- Jika expired, tampilkan tombol **"Pilih Jadwal Ulang"** (sama seperti flow submission).

### 8.2 Invoice/Transaction
- Saat extend dibayar, sistem membuat invoice/transaction baru di tabel `invoices` atau `transactions` (terpisah dari parent).
- Invoice extend terlink ke `form_submissions_extend.id`.

---

## 9. Banner Update Logic

### 9.1 Kapan `requires_banner_update` Di-Set?

```
IF extend.payment_status === 'paid' AND (isNewMonth === true OR additionalPrizePerWinner > 0):
  UPDATE survey_pages SET requires_banner_update = true WHERE submission_id = [parent_id]
```

### 9.2 Kapan `requires_banner_update` Di-Clear?

```
WHEN admin save/update banner in PageBuilderModal:
  UPDATE survey_pages SET requires_banner_update = false WHERE id = [page_id]
```

### 9.3 Tampilan di Public Page (`SurveyPage.tsx`)

Banner **tidak di-hide** di public page. Jika `requires_banner_update = true` dan periode aktif adalah extend, banner lama tetap ditampilkan (karena page masih perlu tetap menarik respondents). Namun, admin **wajib** mengupdate banner untuk mencerminkan insentif/periode yang benar.

---

## 10. Period Batch / Pool Pemenang Terpisah

### 10.1 `period_batch` di `page_respondents`

`period_batch` ditentukan saat respondents submit survey. Format: `"YYYY-MM"`.

```typescript
// Di SurveyPage.tsx saat handleSubmit
const { data: activeInfo } = await supabase.rpc('get_page_active_period', { p_slug: slug });

let periodBatch: string;
if (activeInfo.active_source === 'extend') {
  // Ambil end_date dari extend yang sedang live
  const { data: extend } = await supabase
    .from('form_submissions_extend')
    .select('end_date')
    .eq('submission_id', pageData.submission_id)
    .eq('submission_status', 'live')
    .order('end_date', { ascending: false })
    .limit(1)
    .single();
  periodBatch = formatYYYYMM(extend.end_date);  // e.g., "2026-02"
} else {
  // Parent
  periodBatch = formatYYYYMM(parent.end_date);    // e.g., "2026-01"
}

// Insert respondent
await supabase.from('page_respondents').insert({
  page_id: pageData.id,
  jakpat_id: formData.jakpat_id,
  period_batch: periodBatch,
  // ... other fields
});
```

### 10.2 Reward Per Batch

- **Bulan yang SAMA:** `additional_prize_per_winner` ditambahkan ke reward existing. Winner_count tetap sama. Total reward = `parent.prize_per_winner + SUM(extends.additional_prize_per_winner)`.
- **Bulan yang BERBEDA:** Reward **terpisah total**. Winner_count dan prize_per_winner di-extend adalah reward untuk batch baru. Tidak ada hubungan dengan batch sebelumnya.

### 10.3 Platform Eksternal (API)

Platform eksternal bisa query respondents per batch menggunakan parameter `period_batch`:

```
GET /api/respondents?slug=xxx&period_batch=2026-02
```

Response:
```json
{
  "status": "success",
  "survey": {
    "page_id": "...",
    "title": "...",
    "total_respondents": 50,
    "reward_per_winner": 75000,
    "winner_count": 2,
    "period": {
      "batch": "2026-02",
      "start": "2026-02-10",
      "end": "2026-02-12"
    }
  },
  "respondents": [...]
}
```

---

## 11. Daftar File yang Dimodifikasi / Dibuat

| # | File | Aksi | Keterangan |
|---|------|------|------------|
| 1 | `sql/19_create_form_submissions_extend.sql` | **Baru** | Schema, index, RLS, RPC `get_page_active_period` |
| 2 | `src/types.ts` | **Modifikasi** | Tambah `ExtendFormData` |
| 3 | `src/utils/supabase.ts` | **Modifikasi** | Types + CRUD functions + update `fetchSlotAvailability` |
| 4 | `src/App.tsx` | **Modifikasi** | Tambah route `/dashboard/extend/:submissionId` |
| 5 | `src/components/ExtendForm.tsx` | **Baru** | Form extend multi-step |
| 6 | `src/components/StepThreeSlotReservation.tsx` | **Modifikasi** | Support exclude overlap dates |
| 7 | `src/components/StepFour.tsx` | **Modifikasi** | Reuse untuk extend review |
| 8 | `src/pages/PaymentCheckoutPage.tsx` | **Modifikasi** | Support extend payment mode |
| 9 | `src/pages/dashboard/StatusPage.tsx` | **Modifikasi** | Tampilkan extend cards + tombol Extend |
| 10 | `src/components/InternalDashboard.tsx` | **Modifikasi** | Badge "Extension" + filter |
| 11 | `src/components/PublishPageManagement.tsx` | **Modifikasi** | Warning banner update indicator |
| 12 | `src/components/PageBuilder/PageBuilderModal.tsx` | **Modifikasi** | Set `requires_banner_update = false` saat save |
| 13 | `src/pages/public/SurveyPage.tsx` | **Modifikasi** | RPC active period + period_batch assignment |
| 14 | `functions/api/respondents.js` | **Modifikasi** | Tambah parameter `period_batch` |

---

## 12. Phase Implementasi

### Phase 1: Database Schema
- Buat `sql/19_create_form_submissions_extend.sql`.
- Jalankan migration: tabel `form_submissions_extend`, update `survey_pages`, update `page_respondents`.
- Buat RPC `get_page_active_period`.
- Update RLS policies untuk `form_submissions_extend`.

### Phase 2: TypeScript Types & Utilities
- Update `src/types.ts` (tambah `ExtendFormData`).
- Update `src/utils/supabase.ts` (tambah interface `FormSubmissionExtend` + CRUD functions).
- Update `fetchSlotAvailability()` untuk include extends.

### Phase 3: Extend Form Flow
- Buat `src/components/ExtendForm.tsx` (atau modifikasi `MultiStepForm.tsx` dengan mode extend).
- Implementasi Step 1 (input durasi + insentif + validasi bulan baru).
- Implementasi Step 2 (review metadata read-only).
- Reuse Step 3 (slot reservation) + validasi overlap.
- Reuse Step 4 (review payment) + simpan ke `form_submissions_extend`.
- Reuse Payment Checkout (Doku) untuk extend.

### Phase 4: User Dashboard (`StatusPage.tsx`)
- Fetch extends untuk setiap submission.
- Tampilkan extends sebagai **card terpisah** dengan garis penghubung ke parent.
- Badge status untuk extend.
- Tombol **"Extend Iklan"** muncul saat submission parent `paid/live/completed`.

### Phase 5: Admin Dashboard
- Update query `InternalDashboard.tsx` untuk include extends (badge "Extension").
- Tampilkan di tabel submissions.
- Admin bisa manage status extend.
- Update `PublishPageManagement.tsx` untuk warning banner update.

### Phase 6: Public Survey Page (`SurveyPage.tsx`)
- Hapus strict filter `is_published` + static date checking.
- Panggil RPC `get_page_active_period(slug)` untuk cek aktif/tidak.
- Banner tetap ditampilkan (tidak di-hide).
- Assignment `period_batch` saat respondents submit.

### Phase 7: PageBuilder
- Update `PageBuilderModal.tsx`: set `requires_banner_update = false` saat admin save banner baru.
- Tampilkan warning badge di modal jika `requires_banner_update = true`.

### Phase 8: API Update
- Update `functions/api/respondents.js`:
  - Tambah parameter `?period_batch=`.
  - Return batch list di response.
  - Backward compatible (tanpa parameter tetap return semua).

---

## 13. Catatan Penting

1. **Slot Availability:** Extend **harus** dicek kapasitasnya menggunakan `MAX_REGULAR_ADS_PER_DAY`. Extend masuk ke perhitungan slot yang sama dengan submission biasa.

2. **Banner Update:** Banner lama **tidak di-hide** di public page, tapi admin **wajib** mengupdate banner jika `requires_banner_update = true`. Tujuannya agar respondents tidak tertipu insentif yang salah.

3. **Respondents Uniqueness:** Respondents **tidak boleh** mengisi ulang untuk `page_id` yang sama, meski di batch/bulan berbeda. Ini adalah peraturan dasar platform.

4. **Payment Expired:** Jika extend payment expired (melebihi 1 jam), slot di-release dan extend bisa di-reschedule ulang oleh user (sama seperti flow submission).

5. **Page Reuse:** Extend selalu menggunakan `survey_pages` yang sudah ada. Tidak ada page baru yang dibuat. Hanya `publish_end_date` dan `is_published` yang perlu di-sync via RPC.

6. **Gap Support:** Extend bisa berjarak beberapa hari dari periode sebelumnya. Page akan mati saat gap, dan hidup kembali saat extend mulai.

---

**Dokumen ini disusun berdasarkan diskusi implementasi fitur Extend Durasi Iklan.**
