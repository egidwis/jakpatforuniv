# Batasan Jadwal Swalayan — Rilis A+D+E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tutup tiga lubang yang membuat peneliti melihat tombol "Jadwalkan Iklan Lagi" pada order yang server-nya pasti menolak, dan membuat admin tidak diberi tanda saat reservasi menahan kuota sementara tagihannya sudah mati.

**Architecture:** Tiga perubahan yang tidak saling bergantung dan **nol menyentuh kode uang yang sedang berjalan**. A menambah satu penjaga di RPC `create_ad_schedule` lewat migrasi `sql/88`. D menambah satu helper murni `canScheduleAgain()` yang dipanggil `SchedulePhase` untuk menyembunyikan tombol. E menambah satu parameter **opsional** pada `deriveLifecycle()` supaya `getSubmissionActionDot` akhirnya bisa melihat `ad_schedules`. Tidak ada endpoint baru, tidak ada tabel baru, tidak ada pemanggilan DOKU.

**Tech Stack:** PostgreSQL (plpgsql, SECURITY DEFINER RPC), TypeScript, React 18, Vitest, Supabase JS client.

**Spec:** [`docs/superpowers/specs/2026-09-12-batasan-jadwal-swalayan-design.md`](../specs/2026-09-12-batasan-jadwal-swalayan-design.md)

## Global Constraints

- **Bahasa dokumen & komentar kode: Indonesia.** Pesan `RAISE EXCEPTION` yang akan dibaca peneliti wajib kalimat Indonesia yang layak dibaca, bukan jargon kolom — `ScheduleAgainDialog.tsx:196` meneruskan `e?.message` apa adanya ke toast.
- **String UI wajib dua bahasa.** Setiap kunci baru ditambahkan di blok EN (~baris 653) **dan** blok ID (~baris 1628) `src/i18n/translations.ts`.
- **Nomor migrasi berikutnya: `88`.** Dikonfirmasi ke `sql/README.md:15` dan `git fetch` (tertinggi di `origin/main` = `87`). `86` sudah terpakai `create_ad_schedule` self-serve.
- **Gerbang mesin (baseline terukur 2026-09-12):** `npx vitest run` → **667 tes / 49 berkas** hijau; `npx tsc -p tsconfig.app.json` → **77** error (pra-ada, jangan bertambah). ⚠️ `tsc --noEmit` polos melaporkan 0 dan menipu — selalu pakai `-p tsconfig.app.json`.
- **TDD wajib:** tes ditulis lebih dulu dan **terbukti MERAH untuk alasan yang benar** sebelum implementasi.
- **Jangan commit lalu push.** Push dilakukan manusia. Commit saja.
- **`payment_status` bukan bukti pembayaran** — sebagian order dibayar di luar sistem. Jangan jadikan ia satu-satunya dasar logika uang.
- **Aturan hold slot punya SATU rumah**, `src/utils/slotHold.ts`. Jangan menyalin ambang 1 jam ke tempat baru; impor `isSlotHoldReleased`.
- Attribution commit: akhiri pesan commit dengan `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## Struktur berkas

| Berkas | Tugas | Tugas ke- |
|---|---|---|
| `multi-step-form/sql/88_guard_inactive_order_self_serve.sql` | **Create.** Migrasi: satu penjaga baru di `create_ad_schedule`. | 1 |
| `multi-step-form/src/utils/canScheduleAgain.ts` | **Create.** Helper murni: boleh menawarkan tombol? | 2 |
| `multi-step-form/src/utils/canScheduleAgain.spec.ts` | **Create.** Tes helper. | 2 |
| `multi-step-form/src/components/status/SchedulePhase.tsx` | **Modify** (~baris 1034, 1126). Pakai helper + callout alasan. | 3 |
| `multi-step-form/src/i18n/translations.ts` | **Modify** (~653 EN, ~1628 ID). Dua kunci callout baru. | 3 |
| `multi-step-form/src/components/submissions/lifecycle.ts` | **Modify.** Param opsional `scheduleSignals` + cabang dot. | 4 |
| `multi-step-form/src/components/submissions/actionDot.spec.ts` | **Modify.** Empat kasus dot baru. | 4 |
| `multi-step-form/src/components/InternalDashboard.tsx` | **Modify** (~baris 494, 1538). Rakit sinyal, oper ke dot. | 5 |

**Kenapa `canScheduleAgain` di `src/utils/` dan bukan di `components/status/`:** ia murni (masuk data, keluar keputusan), tidak mengimpor React, dan diuji tanpa merender apa pun — pola yang sama dengan `slotHold.ts` dan `bookedBy.ts`.

---

### Task 1: `sql/88` — penjaga order tidak aktif

**Files:**
- Create: `multi-step-form/sql/88_guard_inactive_order_self_serve.sql`

**Interfaces:**
- Consumes: fungsi `create_ad_schedule` versi 16-parameter dari `sql/86` (belum tentu sudah diterapkan ke produksi — migrasi ini `CREATE OR REPLACE` badan penuh, jadi ia **wajib memuat seluruh badan sql/86 plus penjaga baru**).
- Produces: pesan galat `'create_ad_schedule: order ini tidak aktif, jadwal baru tidak bisa dibuat'` yang dibaca Task 3 (tidak diimpor — hanya kontrak teks).

⚠️ **Konteks yang menentukan bentuk migrasi ini.** `create_ad_schedule` sekarang punya **16 parameter** (`sql/86`). Postgres tidak punya "tambah satu IF ke fungsi yang ada" — `CREATE OR REPLACE FUNCTION` mengganti seluruh badan. Jadi langkah pertama adalah **membaca badan yang sedang berlaku**, bukan menulis dari ingatan.

⚠️ **Memori proyek `sync-ad-schedule-body-copy-trap`:** menyalin badan fungsi dari berkas `sql/` yang salah pernah menghidupkan kembali cabang yang sudah dibuang. Sumber kebenarannya adalah **produksi**, lewat `pg_get_functiondef`, bukan berkas.

- [ ] **Step 1: Ambil badan fungsi yang SEDANG BERLAKU di produksi**

Jalankan lewat MCP Supabase (`project_id: zewuzezbmrmpttysjvpg`):

```sql
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'create_ad_schedule';
```

Simpan hasilnya. **Kalau yang kembali versi 15-parameter**, artinya `sql/86` belum diterapkan: hentikan dan laporkan ke manusia — `sql/88` mengandaikan `86` sudah mendarat, dan menerapkannya lebih dulu akan menghapus `p_slot_reserved_at`.

- [ ] **Step 2: Tulis berkas migrasi**

Create `multi-step-form/sql/88_guard_inactive_order_self_serve.sql`. Salin badan dari Step 1 **apa adanya**, lalu sisipkan penjaga baru **tepat sesudah penjaga review** (yang berbunyi `IF v_review_status IS DISTINCT FROM 'approved'`), di dalam blok `IF NOT v_is_admin THEN`.

Kepala berkas:

```sql
-- ============================================================================
-- 88 — "order ini masih aktif?" berhenti ditanyakan ke sumbu yang salah
-- ============================================================================
-- `create_ad_schedule` sudah menolak order yang belum lolos review lewat
-- `review_status_of()`. Tapi "boleh menambah jadwal?" adalah pertanyaan sumbu
-- TAYANG, bukan sumbu review — dan sql/62 sengaja memetakan `slot_cancelled`
-- ke `approved` supaya membatalkan slot tidak menghapus riwayat persetujuan.
--
-- Akibatnya 9 order `slot_cancelled` LOLOS penjaga review (terukur 2026-09-12)
-- dan peneliti bisa menjadwalkan ulang order yang slotnya sudah dibatalkan tim.
--
-- ⚠️ CAKUPANNYA 9 ORDER, BUKAN 147. Diukur 2026-09-12, yang lolos
-- `review_status_of()` hanya `slot_cancelled` (9 dari 9). `cancelled` (11),
-- `rejected` (17), `spam` (110), `in_review` (397) sudah ditolak penjaga lama
-- — nol dari mereka sampai ke sini. Penjaga ini tetap ditulis karena
-- berlapis di jalur uang itu murah, tapi jangan menaksir bobotnya lebih besar.
--
-- ⚠️ `review_status_of()` TIDAK DISENTUH. Mengubahnya merusak desain dua-sumbu
--    sql/46+62 dan menghapus riwayat persetujuan 13 order. Lihat sql/62.
--
-- ⚠️ HANYA jalur NON-ADMIN. Admin tetap boleh menjadwalkan order
--    `slot_cancelled` — itu justru caranya memperbaiki slot yang ia batalkan.
--
-- Nomor 88 diambil sesudah `git fetch` (tertinggi di origin/main: 87).
-- ============================================================================
```

Penjaga yang disisipkan (letakkan sesudah penjaga review, sebelum penjaga cutoff 13.00):

```sql
    -- 2b. Order yang sudah tidak aktif di sumbu TAYANG.
    --
    --     Dibaca dari `submission_status` MENTAH, bukan lewat
    --     `review_status_of()`: fungsi itu menjawab pertanyaan lain, dan
    --     jawabannya untuk `slot_cancelled` memang 'approved' (sql/62 §2).
    IF v_submission_status IN ('slot_cancelled','cancelled','rejected','spam') THEN
      RAISE EXCEPTION 'create_ad_schedule: order ini tidak aktif, jadwal baru tidak bisa dibuat';
    END IF;
```

⚠️ `v_submission_status` **sudah** dideklarasikan dan sudah diisi oleh `SELECT ... INTO` yang ada (`sql/86` baris ~309). Jangan menambah deklarasi atau query baru.

- [ ] **Step 3: Verifikasi parse tanpa menerapkan**

Bungkus badan fungsi dalam blok `DO` sementara, atau jalankan migrasi di dalam transaksi yang di-rollback:

```sql
BEGIN;
\i sql/88_guard_inactive_order_self_serve.sql
ROLLBACK;
```

Kalau dijalankan lewat MCP (yang auto-commit), pakai gantinya: jalankan `CREATE OR REPLACE`-nya, lalu segera uji Step 4 dan 5. Fungsi ini **tidak dipakai jalur produksi mana pun hari ini** (dialog peneliti belum pernah berhasil memanggilnya), jadi risiko penerapannya rendah — tapi tetap laporkan ke manusia sebelum menerapkan ke produksi.

- [ ] **Step 4: Uji relasional — peneliti + `slot_cancelled` ditolak**

Ini tes yang harus **MERAH sebelum migrasi, HIJAU sesudah**. Jalankan sebelum menerapkan untuk membuktikan ia merah:

```sql
-- Ambil satu order slot_cancelled yang punya pemilik
SELECT fs.id, fs.email, fs.submission_status, review_status_of(fs.submission_status) AS sumbu_review
FROM form_submissions fs
WHERE fs.submission_status = 'slot_cancelled' AND fs.auth_user_id IS NOT NULL
LIMIT 1;
```

Harapan: `sumbu_review = 'approved'` — inilah buktinya penjaga lama meloloskannya.

Lalu simulasikan pemanggil non-admin:

```sql
BEGIN;
SET LOCAL request.jwt.claims = '{"role":"authenticated","email":"bukan-admin@contoh.test"}';
-- ganti <ID> dengan hasil query di atas
SELECT create_ad_schedule(
  p_submission_id := '<ID>'::uuid,
  p_start_date    := (now() + interval '10 days'),
  p_end_date      := (now() + interval '17 days'),
  p_duration      := 7
);
ROLLBACK;
```

Expected SEBELUM migrasi: gagal dengan `'hanya admin atau pemilik order yang boleh membuat jadwal'` (karena email tidak cocok) — itu penjaga kepemilikan, bukan yang kita uji. Gunakan email pemilik asli dari query pertama supaya penjaga kepemilikan lewat dan penjaga berikutnya yang bicara.
Expected SESUDAH migrasi: `ERROR: create_ad_schedule: order ini tidak aktif, jadwal baru tidak bisa dibuat`.

- [ ] **Step 5: Uji relasional — ADMIN + `slot_cancelled` tetap DIIZINKAN**

Tes ini **mulai hijau** dan harus tetap hijau; ia merah hanya kalau penjaga bocor ke jalur admin.

```sql
BEGIN;
SET LOCAL request.jwt.claims = '{"role":"authenticated","email":"product@jakpat.net"}';
SELECT create_ad_schedule(
  p_submission_id := '<ID>'::uuid,
  p_start_date    := (now() + interval '10 days'),
  p_end_date      := (now() + interval '17 days'),
  p_duration      := 7
);
ROLLBACK;   -- ⚠️ WAJIB. Tanpa ini jadwal uji betulan lahir di produksi.
```

Expected: mengembalikan UUID, tidak melempar.

⚠️ **`ROLLBACK` bukan formalitas.** Langkah ini menulis baris `ad_schedules` yang memakan kuota harian nyata kalau di-commit.

- [ ] **Step 6: Periksa ACL — `anon` tidak boleh dapat EXECUTE**

Memori proyek `anon-default-acl-on-new-functions`: `pg_default_acl` memberi `anon=X` ke setiap fungsi baru di `public`, dan `REVOKE ... FROM PUBLIC` **tidak** mencabutnya.

```sql
SELECT proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='create_ad_schedule';
```

Kalau hasilnya memuat `anon=X`, tambahkan ke berkas migrasi:

```sql
REVOKE EXECUTE ON FUNCTION create_ad_schedule(uuid,timestamptz,timestamptz,integer,text,text,integer,integer,integer,boolean,integer,text,text,text,timestamptz,text) FROM anon;
```

(Tanda tangan persisnya ambil dari `pg_get_functiondef` Step 1 — 16 parameter.)

- [ ] **Step 7: Commit**

```bash
git add multi-step-form/sql/88_guard_inactive_order_self_serve.sql
git commit -m "$(cat <<'EOF'
feat(sql/88): order tidak aktif berhenti lolos ke create_ad_schedule

"Boleh menambah jadwal?" adalah pertanyaan sumbu TAYANG, tapi penjaga di
sql/86 menanyakannya lewat review_status_of() — yang sengaja memetakan
slot_cancelled ke 'approved' (sql/62) supaya riwayat persetujuan tidak
terhapus. Akibatnya 9 order slot_cancelled lolos.

Penjaga baru membaca submission_status mentah, hanya untuk pemanggil
non-admin. Admin tetap boleh menjadwalkan order slot_cancelled — itu
caranya memperbaiki slot yang ia batalkan sendiri.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Helper `canScheduleAgain()` + tesnya

**Files:**
- Create: `multi-step-form/src/utils/canScheduleAgain.ts`
- Create: `multi-step-form/src/utils/canScheduleAgain.spec.ts`

**Interfaces:**
- Consumes: `AdScheduleEntry` (`@/utils/supabase`), `occupiesSlot` (`@/pages/dashboard/schedule/scheduleModel`), `FormSubmission` (`@/utils/supabase`).
- Produces:
  ```ts
  export type ScheduleAgainBlock = 'kilat' | 'order_inactive' | 'quota_held' | null;
  export function scheduleAgainBlock(
    submission: Pick<FormSubmission, 'distribution_type' | 'submission_status'>,
    entries: AdScheduleEntry[],
    now?: number,
  ): ScheduleAgainBlock;
  export function canScheduleAgain(
    submission: Pick<FormSubmission, 'distribution_type' | 'submission_status'>,
    entries: AdScheduleEntry[],
    now?: number,
  ): boolean;
  ```
  Task 3 mengimpor **keduanya**: `canScheduleAgain` menentukan tombol muncul, `scheduleAgainBlock` menentukan kalimat alasannya.

**Kenapa dua fungsi, bukan satu boolean:** kontrak `scheduleCardActions.ts` adalah "aksi DIHILANGKAN, bukan `disabled`" — dan alasannya dititipkan ke kalimat di kartu. Boolean saja tidak bisa memberi tahu kalimat mana.

**Kenapa `entries: AdScheduleEntry[]` dan bukan `cards: ScheduleCard[]`:** `ScheduleCard.info` tidak membawa `status`, `slotBookedBy`, maupun `slotReservedAt`, jadi `occupiesSlot()` tidak bisa dihitung darinya. `StatusPage` sudah memegang entri mentahnya di `ui.first` + `ui.later` (keduanya `AdScheduleEntry`), jadi tidak ada prop baru yang perlu diseret melewati banyak lapis.

- [ ] **Step 1: Tulis tes yang gagal**

Create `multi-step-form/src/utils/canScheduleAgain.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { canScheduleAgain, scheduleAgainBlock } from './canScheduleAgain';
import type { AdScheduleEntry } from './supabase';

/*
  Gerbang tombol "Jadwalkan Iklan Lagi".

  ⚠️ DIUKUR DARI KUOTA, BUKAN DARI TAGIHAN. Jadwal `waiting_payment` yang
  belum dibayar TETAP memakan kuota harian (assert_daily_ad_quota_free kaki 2
  menghitung status, bukan pembayaran). Kalau gerbang ini memakai "ada tagihan
  hidup", peneliti bisa menumpuk jadwal waiting_payment tanpa tagihan di
  tanggal-tanggal berbeda dan menghabiskan kapasitas peneliti lain.
*/

const HOUR = 3_600_000;
const NOW = Date.parse('2026-09-12T10:00:00+07:00');

const entryOf = (over: Partial<AdScheduleEntry> = {}): AdScheduleEntry => ({
  id: 'sch-1',
  submissionId: 'sub-1',
  ordinal: 1,
  isExtension: false,
  bookingId: 'K3M9PQ7T',
  sourceId: 'src-1',
  startDate: '2026-09-20T08:00:00Z',
  endDate: '2026-09-27T08:00:00Z',
  duration: 7,
  status: 'waiting_payment',
  reviewStatus: 'approved',
  paymentStatus: null,
  distributionType: 'ads',
  kilatSlotHour: null,
  totalCost: 100000,
  subtotal: null,
  ppnAmount: null,
  voucherCode: null,
  prizePerWinner: 0,
  winnerCount: 0,
  additionalPrizePerWinner: 0,
  isNewPeriod: false,
  periodBatch: null,
  slotBookedBy: null,
  slotReservedAt: null,
  title: 'Uji',
  researcherName: 'Uji',
  university: null,
  submissionCreatedAt: '2026-09-01T00:00:00Z',
  ...over,
} as AdScheduleEntry);

const orderOf = (over: Partial<{ distribution_type: string; submission_status: string }> = {}) => ({
  distribution_type: 'ads',
  submission_status: 'approved',
  ...over,
}) as any;

describe('canScheduleAgain', () => {
  it('order approved tanpa jadwal yang menahan kuota → boleh', () => {
    const selesai = entryOf({ status: 'completed', paymentStatus: 'paid' });
    expect(canScheduleAgain(orderOf(), [selesai], NOW)).toBe(true);
    expect(scheduleAgainBlock(orderOf(), [selesai], NOW)).toBeNull();
  });

  it('order Kilat → tidak pernah boleh', () => {
    expect(canScheduleAgain(orderOf({ distribution_type: 'kilat' }), [], NOW)).toBe(false);
    expect(scheduleAgainBlock(orderOf({ distribution_type: 'kilat' }), [], NOW)).toBe('kilat');
  });

  it('order in_review → tidak boleh (kasus pemicu spec ini)', () => {
    expect(canScheduleAgain(orderOf({ submission_status: 'in_review' }), [], NOW)).toBe(false);
    expect(scheduleAgainBlock(orderOf({ submission_status: 'in_review' }), [], NOW)).toBe('order_inactive');
  });

  it('order slot_cancelled → tidak boleh, meski sumbu review-nya approved', () => {
    expect(canScheduleAgain(orderOf({ submission_status: 'slot_cancelled' }), [], NOW)).toBe(false);
    expect(scheduleAgainBlock(orderOf({ submission_status: 'slot_cancelled' }), [], NOW)).toBe('order_inactive');
  });

  /*
    ⚠️ TES YANG MEMBEDAKAN GERBANG KUOTA DARI GERBANG TAGIHAN.
    Jadwal ini TIDAK punya tagihan sama sekali. Gerbang berbasis "tagihan
    hidup" akan meloloskannya; gerbang kuota harus menolak.
  */
  it('jadwal waiting_payment TANPA tagihan apa pun → tetap menahan kuota, tidak boleh', () => {
    const menahan = entryOf({ status: 'waiting_payment', paymentStatus: null });
    expect(canScheduleAgain(orderOf(), [menahan], NOW)).toBe(false);
    expect(scheduleAgainBlock(orderOf(), [menahan], NOW)).toBe('quota_held');
  });

  it('jadwal dibatalkan tidak menahan kuota → boleh lagi', () => {
    const batal = entryOf({ status: 'cancelled' });
    expect(canScheduleAgain(orderOf(), [batal], NOW)).toBe(true);
  });

  it('hold peneliti yang sudah basi (>1 jam) tidak lagi menahan kuota', () => {
    const basi = entryOf({
      status: 'waiting_payment',
      slotBookedBy: 'user',
      slotReservedAt: new Date(NOW - 2 * HOUR).toISOString(),
    });
    expect(canScheduleAgain(orderOf(), [basi], NOW)).toBe(true);
  });

  it('hold ADMIN tidak pernah basi — tetap menahan kuota selamanya', () => {
    const adminHold = entryOf({
      status: 'waiting_payment',
      slotBookedBy: 'admin',
      slotReservedAt: new Date(NOW - 2 * HOUR).toISOString(),
    });
    expect(canScheduleAgain(orderOf(), [adminHold], NOW)).toBe(false);
    expect(scheduleAgainBlock(orderOf(), [adminHold], NOW)).toBe('quota_held');
  });

  it('jadwal LUNAS yang masih tayang tidak memblokir jadwal berikutnya', () => {
    const lunas = entryOf({ status: 'paid', paymentStatus: 'paid' });
    expect(canScheduleAgain(orderOf(), [lunas], NOW)).toBe(true);
  });

  it('order Kilat menang atas sebab lain (presedens)', () => {
    const menahan = entryOf({ status: 'waiting_payment' });
    expect(scheduleAgainBlock(orderOf({ distribution_type: 'kilat' }), [menahan], NOW)).toBe('kilat');
  });
});
```

- [ ] **Step 2: Jalankan tes, pastikan MERAH untuk alasan yang benar**

Run: `cd multi-step-form && npx vitest run src/utils/canScheduleAgain.spec.ts`
Expected: FAIL — `Failed to resolve import "./canScheduleAgain"`. Itu alasan yang benar (modulnya belum ada), bukan assertion yang kebetulan lolos.

- [ ] **Step 3: Tulis implementasi minimal**

Create `multi-step-form/src/utils/canScheduleAgain.ts`:

```ts
import type { AdScheduleEntry, FormSubmission } from './supabase';
import { occupiesSlot } from '@/pages/dashboard/schedule/scheduleModel';

/**
 * Boleh menawarkan tombol "Jadwalkan Iklan Lagi"?
 *
 * ⚠️ DIUKUR DARI KUOTA, BUKAN DARI TAGIHAN — dan bedanya bukan akademis.
 * Kuota harian dihitung menurut STATUS (`assert_daily_ad_quota_free` kaki 2:
 * `status IN ('waiting_payment','paid','scheduled','live')`), bukan menurut
 * pembayaran. Jadi jadwal `waiting_payment` yang belum dibayar dan bahkan
 * belum pernah ditagih TETAP memakan kuota hari itu.
 *
 * Kalau gerbang ini memakai "ada tagihan hidup", peneliti bisa menumpuk
 * beberapa jadwal `waiting_payment` tanpa tagihan di tanggal-tanggal BERBEDA
 * — `assert_schedule_window_free` hanya menolak irisan tanggal yang sama —
 * dan menghabiskan kapasitas peneliti lain tanpa pernah membayar sepeser pun.
 *
 * ⚠️ SATU-SATUNYA PELEPAS OTOMATIS adalah hold peneliti yang basi:
 * `slot_booked_by='user'` DAN belum lunas DAN lewat 1 jam. Jadwal admin tidak
 * pernah lepas sendiri (`slotHold.ts`) — itu sebabnya jadwal `waiting_payment`
 * buatan admin memblokir tombol ini selamanya sampai admin bertindak.
 * Aturan itu tidak disalin ke sini; `occupiesSlot()` sudah memuatnya.
 *
 * Efek samping yang diinginkan: begitu reservasi dibatalkan
 * (`status='cancelled'`), `occupiesSlot()` jadi false, kuotanya kembali, dan
 * tombolnya muncul lagi dengan sendirinya. Satu predikat melayani keduanya.
 */

/** Sebab tombol disembunyikan — `null` berarti tidak disembunyikan. */
export type ScheduleAgainBlock = 'kilat' | 'order_inactive' | 'quota_held' | null;

type OrderShape = Pick<FormSubmission, 'distribution_type' | 'submission_status'>;

/**
 * Status order yang TIDAK boleh menambah jadwal.
 *
 * Cerminan `sql/88`. ⚠️ `in_review` ikut di sini tapi TIDAK ada di sql/88:
 * di server ia ditolak penjaga `review_status_of()` yang terpisah. Dua daftar
 * yang berbeda karena dua penjaga yang berbeda — jangan disamakan.
 */
const INACTIVE_STATUSES = ['in_review', 'slot_cancelled', 'cancelled', 'rejected', 'spam'];

export function scheduleAgainBlock(
  submission: OrderShape,
  entries: AdScheduleEntry[],
  now: number = Date.now(),
): ScheduleAgainBlock {
  // Kilat menang atas sebab lain: gelombangnya (8/11/14/17 WIB) ditugaskan
  // admin, dan nol perpanjangan Kilat pernah terjadi.
  if (submission.distribution_type === 'kilat') return 'kilat';

  if (INACTIVE_STATUSES.includes(submission.submission_status || '')) return 'order_inactive';

  const menahan = entries.some(
    (e) => occupiesSlot(e, now) && e.paymentStatus !== 'paid' && e.paymentStatus !== 'completed',
  );
  if (menahan) return 'quota_held';

  return null;
}

export function canScheduleAgain(
  submission: OrderShape,
  entries: AdScheduleEntry[],
  now: number = Date.now(),
): boolean {
  return scheduleAgainBlock(submission, entries, now) === null;
}
```

- [ ] **Step 4: Jalankan tes, pastikan HIJAU**

Run: `cd multi-step-form && npx vitest run src/utils/canScheduleAgain.spec.ts`
Expected: PASS, 10 tes.

- [ ] **Step 5: Jalankan gerbang penuh**

Run: `cd multi-step-form && npx vitest run && npx tsc -p tsconfig.app.json 2>&1 | grep -c "error TS"`
Expected: 677 tes / 50 berkas hijau; hitungan tsc tetap **77**.

- [ ] **Step 6: Commit**

```bash
git add multi-step-form/src/utils/canScheduleAgain.ts multi-step-form/src/utils/canScheduleAgain.spec.ts
git commit -m "$(cat <<'EOF'
feat(jadwal): canScheduleAgain() — gerbang tombol diukur dari kuota

Kuota harian dihitung menurut status, bukan menurut pembayaran: jadwal
waiting_payment yang belum ditagih pun tetap memakan kuota. Gerbang
berbasis "tagihan hidup" akan meloloskan peneliti menumpuk jadwal di
tanggal-tanggal berbeda dan menghabiskan kapasitas peneliti lain.

Memakai occupiesSlot() yang sudah ada, jadi aturan hold basi (peneliti
lepas 1 jam, admin tidak pernah lepas) tidak disalin ke tempat baru.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Pasang gerbang di `SchedulePhase` + kalimat alasannya

**Files:**
- Modify: `multi-step-form/src/components/status/SchedulePhase.tsx` (~1034 dan ~1126)
- Modify: `multi-step-form/src/pages/dashboard/StatusPage.tsx` (~869 — oper entri mentah)
- Modify: `multi-step-form/src/i18n/translations.ts` (~653 EN, ~1628 ID)

**Interfaces:**
- Consumes: `canScheduleAgain`, `scheduleAgainBlock`, `ScheduleAgainBlock` dari Task 2.
- Produces: prop baru `entries: AdScheduleEntry[]` pada `SchedulePhaseProps`.

⚠️ **`SchedulePhase` hari ini tidak menerima entri mentah** — hanya `cards: ScheduleCard[]`, yang tidak membawa `status`/`slotBookedBy`/`slotReservedAt`. `StatusPage` sudah memegangnya di `ui.first` dan `ui.later`, jadi yang diperlukan cuma mengopernya.

- [ ] **Step 1: Tambah dua kunci i18n (EN)**

Modify `src/i18n/translations.ts`, sisipkan sesudah `scheduleAgainNeedsAdmin` (~baris 670):

```ts
    // Kalimat yang menggantikan tombol saat ia disembunyikan. ⚠️ Tanpa ini
    // tombolnya sekadar lenyap tanpa sebab — kebisuan yang sama dengan yang
    // ditutup 65369c1. Kontrak scheduleCardActions.ts: aksi DIHILANGKAN,
    // bukan disabled, dan alasannya dititipkan ke kartu.
    scheduleAgainBlockedQuota: "Your current schedule is still holding its date. Once it is paid — or you cancel the reservation — you can schedule the next one.",
    scheduleAgainBlockedInactive: "This order cannot take a new schedule right now. Chat with Mimin below if you need help.",
```

- [ ] **Step 2: Tambah dua kunci i18n (ID)**

Sisipkan sesudah `scheduleAgainNeedsAdmin` di blok Indonesia (~baris 1645):

```ts
    scheduleAgainBlockedQuota: "Jadwal Anda yang sekarang masih menahan tanggalnya. Setelah lunas — atau setelah reservasinya dibatalkan — Anda bisa menjadwalkan yang berikutnya.",
    scheduleAgainBlockedInactive: "Pesanan ini belum bisa menerima jadwal baru. Chat Mimin di bawah kalau butuh bantuan.",
```

- [ ] **Step 3: Oper entri mentah dari `StatusPage`**

Modify `src/pages/dashboard/StatusPage.tsx` ~baris 869, tambahkan satu prop:

```tsx
                                                    <SchedulePhase
                                                        submission={submission}
                                                        cards={cards}
                                                        entries={[ui.first, ...ui.later]}
                                                        onReschedule={() => handleReschedule(submission)}
                                                        onDataUpdated={fetchSubmissions}
                                                        active={activePhase === 2}
                                                    />
```

- [ ] **Step 4: Terima prop baru di `SchedulePhase`**

Modify `SchedulePhaseProps` (~baris 48):

```tsx
interface SchedulePhaseProps {
    submission: FormSubmission;
    cards: ScheduleCard[];
    /**
     * Baris `ad_schedules` MENTAH order ini (ordinal 1 + sisanya).
     *
     * ⚠️ `cards` tidak cukup: `ScheduleCard.info` sengaja tidak membawa
     * `status`/`slotBookedBy`/`slotReservedAt`, sehingga `occupiesSlot()`
     * — dan karena itu gerbang kuota — tidak bisa dihitung darinya.
     */
    entries: AdScheduleEntry[];
```

Tambahkan import di kepala berkas:

```tsx
import { canScheduleAgain, scheduleAgainBlock } from '@/utils/canScheduleAgain';
import type { AdScheduleEntry } from '@/utils/supabase';
```

(`AdScheduleEntry` mungkin sudah terimpor lewat baris lain — periksa dulu, jangan menduplikasi.)

- [ ] **Step 5: Ganti gerbang tombol**

Modify ~baris 1034, ganti perhitungan `isKilatOrder` menjadi gerbang penuh (pertahankan `isKilatOrder` — ia masih dipakai di baris 1141):

```tsx
    const isKilatOrder =
        submission.distribution_type === 'kilat' || cards.some((c) => !!c.info?.isKilat);

    /*
      Gerbang tombol "Jadwalkan Iklan Lagi" — satu helper murni, diuji
      terpisah (`utils/canScheduleAgain.spec.ts`).

      ⚠️ Sebelum ini gerbangnya hanya `!isKilatOrder`, sehingga tombol muncul
      untuk 397 order in_review, 17 rejected, dan 110 spam — semuanya ditolak
      RPC, SESUDAH penelitinya mengisi panel hadiah. Itu kasus yang melahirkan
      spec 2026-09-12.
    */
    const againBlock = scheduleAgainBlock(submission, entries);
    const showScheduleAgain = againBlock === null;
```

Lalu ganti blok tombol (~baris 1126):

```tsx
                    {showScheduleAgain ? (
                        <div className="mt-3">
                            <Button
                                variant="outline"
                                onClick={() => setIsScheduleAgainOpen(true)}
                                className="w-full text-xs font-semibold text-slate-700 border border-dashed border-slate-300 bg-slate-50/60 hover:bg-slate-100/80 hover:border-blue-400 hover:text-blue-700 rounded-xl min-h-11 px-4 gap-2 transition-all shadow-none justify-center"
                            >
                                <Plus className="w-4 h-4 shrink-0 text-slate-400" />
                                <span>{t('scheduleAdAgain')}</span>
                            </Button>
                        </div>
                    ) : againBlock !== 'kilat' ? (
                        /* Kilat sengaja TANPA kalimat: order Kilat tidak pernah
                           punya afordansi ini, jadi menjelaskan ketiadaannya
                           justru memperkenalkan fitur yang tidak berlaku. */
                        <p className="mt-3 text-xs text-slate-500 leading-relaxed px-1">
                            {againBlock === 'quota_held'
                                ? t('scheduleAgainBlockedQuota')
                                : t('scheduleAgainBlockedInactive')}
                        </p>
                    ) : null}
```

- [ ] **Step 6: Jalankan gerbang mesin**

Run: `cd multi-step-form && npx vitest run && npx tsc -p tsconfig.app.json 2>&1 | grep -c "error TS"`
Expected: 677 hijau; tsc tetap **77**. Kalau tsc naik, kemungkinan besar `entries` belum dioper di semua pemanggil `SchedulePhase` — cari dengan `grep -rn "<SchedulePhase"`.

- [ ] **Step 7: Commit**

```bash
git add multi-step-form/src/components/status/SchedulePhase.tsx multi-step-form/src/pages/dashboard/StatusPage.tsx multi-step-form/src/i18n/translations.ts
git commit -m "$(cat <<'EOF'
feat(jadwal): tombol "Jadwalkan Iklan Lagi" akhirnya punya gerbang kelayakan

Sebelumnya gerbangnya hanya !isKilatOrder, jadi tombol muncul untuk 397
order in_review, 17 rejected, dan 110 spam — semuanya ditolak RPC SESUDAH
penelitinya mengisi panel hadiah. Itu kasus yang melahirkan spec ini.

Tombol DIHILANGKAN, bukan disabled (kontrak scheduleCardActions.ts), dan
alasannya dititipkan ke kalimat di kartu supaya tidak lenyap tanpa sebab.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `deriveLifecycle` bisa melihat `ad_schedules`

**Files:**
- Modify: `multi-step-form/src/components/submissions/lifecycle.ts`
- Modify: `multi-step-form/src/components/submissions/actionDot.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ScheduleSignals {
    hasQuotaHoldingUnpaidFuture: boolean;
  }
  // LifecycleInfo bertambah satu field:
  //   needsScheduleFollowUp: boolean;
  export function deriveLifecycle(
    submission: SurveySubmission,
    paymentData: PaymentState,
    existingPage: ExistingPage | undefined,
    isScheduled: boolean,
    now?: number,
    scheduleSignals?: ScheduleSignals,
  ): LifecycleInfo;
  ```
  Task 5 merakit `ScheduleSignals` dan mengopernya.

⚠️ **Parameter ke-6, sesudah `now`.** `now` sudah punya default; menyisipkan sebelum­nya akan memutus ketiga pemanggil yang ada.

⚠️ **Pemanggilnya TIGA, bukan empat:** `InternalDashboard.tsx:1538`, `SubmissionsTableRow.tsx:59`, `SubmissionDetailSheet.tsx:267`. `SubmissionListRow` menerima `lifecycle` sebagai prop. `SubmissionsTableRow` **hidup** — `InternalDashboard:21` mengimpor `SubmissionsMobileCard` darinya.

- [ ] **Step 1: Tulis tes yang gagal**

Modify `src/components/submissions/actionDot.spec.ts`. Tambahkan `needsScheduleFollowUp: false` ke `lifecycleOf`, lalu tambahkan blok:

```ts
describe('getSubmissionActionDot — reservasi menahan kuota, tagihan mati', () => {
    /*
      Bug yang dilaporkan: tagihan dibatalkan sementara reservasi masih
      menahan slot, dan daftar admin tidak memberi tanda apa pun.

      Sebabnya STRUKTURAL: deriveLifecycle hanya menerima kolom
      form_submissions, jadi fungsi ini tidak pernah melihat ad_schedules.
      Input yang hilang, bukan cabang yang hilang.
    */
    it('reservasi menahan kuota tanpa tagihan hidup → MERAH', () => {
        const dot = getSubmissionActionDot(lifecycleOf({
            stage: 'paid', isPaid: true, needsScheduleFollowUp: true,
        }));
        expect(dot).toEqual({ type: 'red', label: 'Perlu tindakan: Reservasi tanpa tagihan hidup' });
    });

    /*
      ⚠️ TES YANG MENGUNCI KOREKSI 2026-09-12.

      Diukur ke produksi: 24 jadwal bertanggal depan ber-slot_booked_by, dan
      SEMUANYA payment_status='paid'. Syarat dot versi pertama spec (tanpa
      klausa "belum lunas") akan menyalakan 24 titik merah yang seluruhnya
      tidak punya pekerjaan — persis kegagalan yang dikutip lifecycle.ts:233
      sebagai pelajaran ("menagih admin yang salah").

      Klausa "belum lunas" ditegakkan di sisi PERAKIT sinyal (Task 5); di sini
      yang dijaga adalah kontraknya: sinyal false = diam.
    */
    it('tanpa sinyal → tidak ada titik tambahan (order lunas tetap diam)', () => {
        const dot = getSubmissionActionDot(lifecycleOf({
            stage: 'paid', isPaid: true, needsScheduleFollowUp: false,
        }));
        expect(dot).toBeNull();
    });

    it('sinyal TIDAK menang atas pekerjaan review', () => {
        // Review tetap presedens tertinggi — dot-nya sudah merah, dan
        // labelnya tidak boleh tertukar.
        const dot = getSubmissionActionDot(lifecycleOf({
            displayStatus: 'in_review', needsScheduleFollowUp: true,
        }));
        expect(dot?.label).toBe('Perlu tindakan di tab Review');
    });

    it('order spam/dibatalkan tetap senyap meski sinyalnya menyala', () => {
        expect(getSubmissionActionDot(lifecycleOf({
            displayStatus: 'spam', needsScheduleFollowUp: true,
        }))).toBeNull();
        expect(getSubmissionActionDot(lifecycleOf({
            stage: 'cancelled', needsScheduleFollowUp: true,
        }))).toBeNull();
    });
});
```

- [ ] **Step 2: Jalankan tes, pastikan MERAH**

Run: `cd multi-step-form && npx vitest run src/components/submissions/actionDot.spec.ts`
Expected: FAIL — TypeScript menolak `needsScheduleFollowUp` yang belum ada di `LifecycleInfo`, dan assertion merah pertama gagal karena dot-nya `null`.

- [ ] **Step 3: Tambah tipe & parameter**

Modify `src/components/submissions/lifecycle.ts`. Tambahkan sesudah `PageStatus`:

```ts
/**
 * Ringkasan `ad_schedules` per order — satu-satunya jalan bagi daftar
 * Submissions untuk melihat sumbu jadwal.
 *
 * ⚠️ Kenapa parameter, bukan query di dalam fungsi ini: `deriveLifecycle`
 * murni dan dipanggil per baris saat render. Perakitnya (`InternalDashboard`)
 * sudah memuat jadwal sekali untuk seluruh halaman.
 */
export interface ScheduleSignals {
  /**
   * Ada jadwal yang MASIH menahan kuota, tanggalnya belum lewat, dipesan
   * seseorang, dan belum lunas — sementara tagihan hidupnya tidak ada.
   *
   * ⚠️ KLAUSA "BELUM LUNAS" BUKAN HIASAN. Diukur 2026-09-12: 24 jadwal
   * bertanggal depan ber-`slot_booked_by`, SEMUANYA lunas. Tanpa klausa itu
   * daftar ini menyalakan 24 titik merah tanpa pekerjaan — kesalahan yang
   * sama persis dengan yang membuat cabang sumbu halaman dicabut (lihat
   * catatan panjang di `getSubmissionActionDot`).
   */
  hasQuotaHoldingUnpaidFuture: boolean;
}
```

Tambahkan ke `LifecycleInfo`:

```ts
  /** Reservasi menahan kuota tapi tagihannya sudah mati — admin perlu bertindak. */
  needsScheduleFollowUp: boolean;
```

Ubah tanda tangan:

```ts
export function deriveLifecycle(
  submission: SurveySubmission,
  paymentData: PaymentState,
  existingPage: ExistingPage | undefined,
  isScheduled: boolean,
  now: number = Date.now(),
  scheduleSignals?: ScheduleSignals,
): LifecycleInfo {
```

Di blok `return`, tambahkan:

```ts
    needsScheduleFollowUp: scheduleSignals?.hasQuotaHoldingUnpaidFuture ?? false,
```

- [ ] **Step 4: Tambah cabang dot**

Modify `getSubmissionActionDot`. Sisipkan **sesudah** cabang keadaan akhir (`displayStatus === 'spam' || lifecycle.stage === 'cancelled'` → `null`) dan **sebelum** `isScheduleActive`:

```ts
  /*
    Reservasi menahan kuota harian, tapi tidak ada tagihan hidup yang akan
    membayarnya. Slotnya terkunci untuk peneliti lain tanpa ada yang bergerak,
    dan hanya admin yang bisa melepaskannya (jadwal admin tidak pernah lepas
    sendiri — slotHold.ts).

    Diletakkan SESUDAH cabang review & keadaan akhir: order yang masih perlu
    di-review sudah merah karena alasan yang lebih mendesak, dan order batal
    tidak perlu ditindak sama sekali.
  */
  if (lifecycle.needsScheduleFollowUp) {
    return { type: 'red', label: 'Perlu tindakan: Reservasi tanpa tagihan hidup' };
  }
```

- [ ] **Step 5: Jalankan tes, pastikan HIJAU**

Run: `cd multi-step-form && npx vitest run src/components/submissions/actionDot.spec.ts`
Expected: PASS, 11 tes (7 lama + 4 baru).

- [ ] **Step 6: Gerbang penuh**

Run: `cd multi-step-form && npx vitest run && npx tsc -p tsconfig.app.json 2>&1 | grep -c "error TS"`
Expected: 681 hijau; tsc tetap **77**. Ketiga pemanggil lama tidak berubah karena parameternya opsional.

- [ ] **Step 7: Commit**

```bash
git add multi-step-form/src/components/submissions/lifecycle.ts multi-step-form/src/components/submissions/actionDot.spec.ts
git commit -m "$(cat <<'EOF'
feat(admin): deriveLifecycle akhirnya bisa melihat ad_schedules

Tagihan perpanjangan yang dibatalkan mustahil sampai ke
getSubmissionActionDot: keempat argumen deriveLifecycle hanya membawa
kolom form_submissions, dan isScheduled cuma boolean. Input yang hilang,
bukan cabang yang hilang.

Parameter scheduleSignals OPSIONAL supaya ketiga pemanggil yang ada tidak
berubah perilaku. Klausa "belum lunas" ditegakkan perakit sinyal: tanpa
itu 24 jadwal LUNAS bertanggal depan ikut menyala merah.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Rakit sinyal di `InternalDashboard`

**Files:**
- Modify: `multi-step-form/src/components/InternalDashboard.tsx` (~494 dan ~1538)

**Interfaces:**
- Consumes: `ScheduleSignals` dari Task 4; `fetchAdSchedules`, `fetchScheduleBilling` dari `@/utils/supabase`; `occupiesSlot` dari `scheduleModel`.

⚠️ **Di sinilah ketiga klausa dot ditegakkan.** Task 4 hanya menyediakan salurannya.

- [ ] **Step 1: Periksa dulu apa yang tersedia**

Run: `cd multi-step-form && grep -n "fetchScheduleBilling\|fetchAdSchedules" src/utils/supabase.ts | head -5`

Baca tanda tangan keduanya. `fetchScheduleBilling` mengembalikan `openInvoice` yang **sudah sadar-kedaluwarsa sejak sql/83** — jangan menulis ulang predikat kedaluwarsa sendiri (itu jebakan yang dicatat di bagian B spec).

- [ ] **Step 2: Rakit peta sinyal**

Modify `src/components/InternalDashboard.tsx`, sesudah `setScheduledSubmissionIds(scheduledIds);` (~baris 498):

```tsx
          /*
            Sinyal sumbu JADWAL untuk titik notifikasi (spec 2026-09-12 §E).

            TIGA KLAUSA, dan ketiganya diukur ke produksi:
              1. masih menahan kuota  → occupiesSlot()
              2. tanggalnya belum lewat → kalau sudah lewat, tidak ada yang
                 bisa ditindak lagi; 342 dari 368 baris ada di sini
              3. BELUM LUNAS → tanpa ini 24 jadwal lunas bertanggal depan
                 ikut menyala merah, dan yang nyata terkubur di dalamnya
            plus: ada pemesannya (slot_booked_by ≠ NULL). NULL berarti "tak
            seorang pun pernah memesannya", bukan "dipesan admin" — pembedaan
            yang sama sudah dipakai scheduleCardActions.ts:281.

            ⚠️ Menyala untuk NOL order saat ditulis. Itu jawaban yang jujur:
            keadaannya bisa terjadi, tapi tidak sedang berdiri di produksi.
          */
          const ids = transformed.map((s) => s.id).filter(Boolean) as string[];
          const [allSchedules, billingMap] = await Promise.all([
            fetchAdSchedules(ids),
            fetchScheduleBilling(ids),
          ]);

          const nowMs = Date.now();
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);

          const signalMap: Record<string, ScheduleSignals> = {};
          transformed.forEach((sub) => {
            const mine = allSchedules.filter((e) => e.submissionId === sub.id);
            const perluTindakan = mine.some((e) => {
              if (!occupiesSlot(e, nowMs)) return false;
              if (!e.slotBookedBy) return false;
              if (e.paymentStatus === 'paid' || e.paymentStatus === 'completed') return false;
              if (!e.startDate || new Date(e.startDate).getTime() < todayStart.getTime()) return false;
              return billingMap[e.id]?.openInvoice == null;
            });
            signalMap[sub.id] = { hasQuotaHoldingUnpaidFuture: perluTindakan };
          });
          setScheduleSignals(signalMap);
```

⚠️ **Bentuk `fetchAdSchedules`/`fetchScheduleBilling` mungkin berbeda** dari yang diandaikan di atas (argumen, kunci peta). Sesuaikan ke tanda tangan nyata dari Step 1 — **jangan** memaksakan bentuk ini kalau tidak cocok, dan jangan menambah query baru kalau datanya sudah dimuat di tempat lain di fungsi yang sama.

Tambahkan state di dekat `scheduledSubmissionIds` (~baris 102):

```tsx
  const [scheduleSignals, setScheduleSignals] = useState<Record<string, ScheduleSignals>>({});
```

Dan import:

```tsx
import type { ScheduleSignals } from './submissions/lifecycle';
import { occupiesSlot } from '@/pages/dashboard/schedule/scheduleModel';
```

- [ ] **Step 3: Oper ke `deriveLifecycle`**

Modify ~baris 1538:

```tsx
                    lifecycle={deriveLifecycle(
                      submission,
                      paymentStates[submission.id] || EMPTY_PAYMENT_STATE,
                      existingPages[submission.id],
                      scheduledSubmissionIds.has(submission.id),
                      undefined,
                      scheduleSignals[submission.id],
                    )}
```

⚠️ `undefined` di posisi `now` **wajib** — ia mengambil default `Date.now()`. Menghilangkannya menggeser `scheduleSignals` ke posisi `now` dan seluruh perhitungan waktu jadi `NaN`.

- [ ] **Step 4: Gerbang mesin**

Run: `cd multi-step-form && npx vitest run && npx tsc -p tsconfig.app.json 2>&1 | grep -c "error TS"`
Expected: 681 hijau; tsc tetap **77**.

- [ ] **Step 5: Build**

Run: `cd multi-step-form && npm run build`
Expected: sukses.

- [ ] **Step 6: Commit**

```bash
git add multi-step-form/src/components/InternalDashboard.tsx
git commit -m "$(cat <<'EOF'
feat(admin): titik merah saat reservasi menahan kuota tanpa tagihan hidup

Tiga klausa, ketiganya diukur ke produksi 2026-09-12: masih menahan kuota,
tanggalnya belum lewat, dan BELUM LUNAS. Klausa ketiga yang menentukan —
24 jadwal bertanggal depan ber-slot_booked_by semuanya lunas, jadi tanpa
itu daftar ini menyalakan 24 titik tanpa pekerjaan.

Menyala untuk NOL order hari ini. Keadaannya bisa terjadi, tapi tidak
sedang berdiri; uji browsernya wajib membuatnya dulu.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Uji browser — tidak tergantikan tes mesin

Jalankan sesudah kelima tugas mendarat. ⚠️ Butuh `SUPABASE_SERVICE_ROLE_KEY` di `.env` (server-side, **tanpa** prefiks `VITE_`) — tanpa itu `create-payment.js` jatuh ke kunci anon dan menjawab 404 "submission not found". Dan `npm run dev` hanya menjembatani 5 Pages Function; untuk jalur bayar penuh pakai `wrangler pages dev dist`.

- [ ] Order `in_review` → tombol **tidak muncul**, kalimat "belum bisa menerima jadwal baru" tampil. (Kasus pemicu spec ini.)
- [ ] Order `slot_cancelled` → tombol tidak muncul.
- [ ] Order Kilat → tombol tidak muncul, **dan tanpa kalimat**.
- [ ] Order dengan jadwal `waiting_payment` belum lunas → tombol **tidak muncul**, kalimat "masih menahan tanggalnya".
- [ ] Order lunas & selesai tayang → tombol **muncul**.
- [ ] Papan admin: buat keadaannya (batalkan tagihan atas reservasi bertanggal depan yang belum lunas) → **titik merah muncul**. ⚠️ Nol order produksi yang cocok hari ini; keadaannya harus dibuat.
- [ ] Order lama bertanggal lampau → **tidak ada titik**.
- [ ] Daftar admin dengan 24 jadwal lunas bertanggal depan → **nol titik merah baru**. Ini regresi yang paling mungkin terjadi.

---

## Self-review

**Cakupan spec.** A → Task 1. D → Task 2+3. E → Task 4+5. B, C, F **sengaja di luar rencana ini** (spec: "B + C + F menyusul sesudah Phase 4 terbukti di browser") — keduanya menyentuh jalur uang berjalan dan menunggu rilis terpisah.

**Yang TIDAK dikerjakan di sini, dan alasannya:**
- **B** (penjaga tagihan hidup di RPC), **C** (`cancel-own` Pages Function), **F** (sembunyikan riwayat batal) — rilis berikutnya.
- Kolom `cancelled_by` — hanya dibutuhkan F.
- Mengubah `review_status_of()` — keputusan sadar sql/62.

**Konsistensi tipe.** `ScheduleAgainBlock` (Task 2) dipakai Task 3. `ScheduleSignals` (Task 4) dirakit Task 5. `needsScheduleFollowUp` ditulis Task 4 dan dibaca di fungsi yang sama. Nama fungsi konsisten: `canScheduleAgain`/`scheduleAgainBlock` di kedua tugas.

**Risiko terbesar rencana ini:** Task 5 mengandaikan bentuk `fetchAdSchedules`/`fetchScheduleBilling` yang belum diverifikasi baris demi baris — karena itu Step 1-nya membaca tanda tangan nyata lebih dulu, dan langkahnya menyuruh menyesuaikan alih-alih memaksakan.
