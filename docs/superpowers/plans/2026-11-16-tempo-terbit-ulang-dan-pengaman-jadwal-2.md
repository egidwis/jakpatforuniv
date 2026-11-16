# Terbitkan Ulang Tagihan Tempo + Pengaman Jadwal #2 + Anggota Grup Mati — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin dapat menagih ulang tagihan tempo tanpa menghentikan iklan. Admin diperingatkan dua lapis
sebelum membuat jadwal baru di atas jadwal yang belum lunas atau batal. Anggota tagihan gabungan yang
sudah mati tidak lagi dihitung di panel admin, kartu peneliti, halaman invoice, dan resolver `/bayar/`.

**Architecture:** Hampir seluruhnya perubahan UI dan util TypeScript. Mesin penggantian tagihan sudah ada
(`writeInvoiceRows` → `killDokuLinksForSchedule(markCancelled)`). Logika yang bisa diuji ditaruh di modul
murni (`*.ts`), karena vitest di repo ini hanya menjalankan `*.spec.ts` (tanpa render React). Satu migrasi
SQL kecil menyelaraskan aturan lead di `authoritative_payment_url` dengan TypeScript.

**Tech Stack:** React + TypeScript (Vite), vitest 3, Supabase Postgres (plpgsql), Cloudflare Pages Functions.

**Spec:** `docs/superpowers/specs/2026-11-16-tempo-terbit-ulang-dan-pengaman-jadwal-2-design.md`

## Global Constraints

- Kerja di branch baru `fix/tempo-terbit-ulang` dari `main`, di **worktree terpisah**
  (superpowers:using-git-worktrees). Working tree utama punya perubahan homepage milik user yang
  belum di-commit; JANGAN disentuh.
- Semua path di bawah relatif terhadap `multi-step-form/`, kecuali `docs/`.
- Uji: `npx vitest run <path>`. Gerbang tipe: `npx tsc -p tsconfig.app.json --noEmit`. Ambil baseline
  jumlah error SEBELUM Task 1, dan jumlahnya tidak boleh naik. `grep -E "TS2304|TS2552"` atas output
  wajib kosong. `tsc --noEmit` polos menipu, jangan dipakai.
- SQL TIDAK dijalankan lewat MCP. Berkas `sql/` diserahkan ke user, berisi blok DRY-RUN dan ROLLBACK
  (CLAUDE.md). Bagian APPLY juga diserahkan sebagai berkas terpisah `_APPLY.sql` yang aman di-Run utuh.
  User dua kali menjalankan seluruh berkas sekaligus, dan error UJI menghentikan APPLY.
- SQL diterapkan SEBELUM push ke `main`, karena push `main` = deploy otomatis.
- Status mati = `['expired', 'failed', 'cancelled']` (`DEAD_PAYMENT_STATUSES`, `src/utils/supabase.ts:6338`).
  Pakai konstanta itu (ekspor bila perlu), jangan menyalin daftarnya.
- Copy UI berbahasa Indonesia, persis seperti tertulis di task. Uji mencocokkan potongan kalimatnya.
- Sesudah perubahan kode: `graphify update .` dari root repo, memakai interpreter di
  `graphify-out/.graphify_python`.

## Review Focus

1. **Anggota mati adalah anggota PALING AWAL.** Lead harus pindah ke anggota hidup pertama, di TS
   (`fetchInvoiceGroups`) DAN SQL (`authoritative_payment_url`). Kalau tidak, tombol bayar semua anggota
   hidup terlempar ke halaman invoice. Uji di Task 1 dan Task 3.
2. **Seluruh grup mati** (tagihan dibatalkan utuh, atau sudah diganti `/bayar/`). Perilaku lama
   dipertahankan: semua anggota dihitung, `allDead` true, dan panel riwayat tetap utuh. Uji di Task 1, 2,
   dan 3.
3. **Kuitansi grup LUNAS yang punya satu baris batal.** Dokumen harus RECEIPT (`isPaid`) atas anggota
   hidup, dengan total = Σ anggota hidup. Uji di Task 2.
4. **Popup jadwal baru di kasus normal.** #1 lunas, order Kilat, atau order yang jadwalnya semua
   selesai/lunas → TIDAK ada popup. Popup yang muncul terus melatih admin mengklik lewat. Uji di Task 6.
5. **Kartu kredit dengan tagihan terbuka NON-tempo** (anomali warisan) → TIDAK menawarkan Terbitkan Ulang.
   Uji di Task 4.

---

### Task 1: Anggota grup mati tidak dihitung — `fetchInvoiceGroups`, kartu peneliti, panel admin, pelunasan grup

**Files:**
- Modify: `src/utils/supabase.ts` (`InvoiceGroup` ±2041, `fetchInvoiceGroups` ±2152–2172, `settleGroupAsPaid` ±2239, `unsettleGroupAsPaid` ±2318)
- Modify: `src/components/status/invoiceGroups.ts` (`groupInfoFor`)
- Modify: `src/components/submissions/tabs/InvoiceGroupPanel.tsx` (bundel ±96, header ±199–206)
- Test: `src/utils/invoiceGroup.spec.ts`, `src/components/status/invoiceGroups.spec.ts`

**Interfaces:**
- Produces: `InvoiceGroup` mendapat field baru `deadCount: number`.
  - `memberCount` dan `total` = anggota HIDUP saja, kecuali semua anggota mati (lalu = semua, seperti dulu).
  - `members` tetap berisi SEMUA baris, diurutkan anggota hidup dulu, lalu `compareLeadOrder`. Jadi
    `members[0]` = lead = anggota hidup paling awal.

- [ ] **Step 0: Siapkan branch dan commit dokumen**

  Buat worktree branch `fix/tempo-terbit-ulang` dari `main`. Salin spec dan plan ini ke worktree, lalu
  commit `docs: rancangan & rencana terbitkan ulang tagihan tempo`. Catat baseline jumlah error tsc.

- [ ] **Step 1: Tulis uji yang gagal** di `src/utils/invoiceGroup.spec.ts` (`describe('fetchInvoiceGroups')`, mock pola yang sama dengan uji yang sudah ada)

```ts
it('anggota mati tidak dihitung, dan lead pindah ke anggota hidup pertama', async () => {
  // 3 baris satu payment_id: A expired (start 16 Nov), B pending (17 Nov), C pending (18 Nov), @493950
  const g = (await fetchInvoiceGroups([PID])).get(PID)!;
  expect(g.memberCount).toBe(2);
  expect(g.total).toBe(987900);
  expect(g.deadCount).toBe(1);
  expect(g.members.map((m) => m.bookingId)).toEqual(['B', 'C', 'A']);
  expect(g.allDead).toBe(false);
});
it('semua anggota mati → perilaku lama (dihitung semua)', async () => {
  // A, B cancelled
  const g = (await fetchInvoiceGroups([PID])).get(PID)!;
  expect(g.memberCount).toBe(2);
  expect(g.total).toBe(987900);
  expect(g.deadCount).toBe(2);
  expect(g.allDead).toBe(true);
});
it('settleGroupAsPaid melewati anggota mati', async () => {
  // A expired + B pending → markScheduleAsPaid dipanggil sekali, untuk B saja
});
```

- [ ] **Step 2: Jalankan, pastikan GAGAL**

  Run: `npx vitest run src/utils/invoiceGroup.spec.ts`
  Expected: FAIL (`deadCount` undefined, memberCount 3).

- [ ] **Step 3: Implementasi di `fetchInvoiceGroups`**

  - `live = members.filter((m) => !m.isDead)`, lalu `counted = live.length > 0 ? live : members`.
  - `memberCount = counted.length`, `total = Σ counted.amount`, `deadCount = members.length - live.length`.
  - Urutan: `members.sort((a, b) => Number(!!a.isDead) - Number(!!b.isDead) || compareLeadOrder(a, b))`.
  - `allPaid`/`allDead`/`isTempo`/`supersededBy` tidak berubah.
  - `settleGroupAsPaid` dan `unsettleGroupAsPaid` meng-iterasi `group.members.filter((m) => !m.isDead)`,
    kecuali `group.allDead`. Perbarui juga dokumentasi field di interface.

- [ ] **Step 4: Uji `groupInfoFor`** di `src/components/status/invoiceGroups.spec.ts`

```ts
it('others tidak memuat anggota mati; total & memberCount dari grup (hidup)', () => {
  const info = groupInfoFor(groups /* memberCount 2, total 987900, members [B,C,A(dead)] */, PID, 'src-B')!;
  expect(info.isLead).toBe(true);
  expect(info.memberCount).toBe(2);
  expect(info.total).toBe(987900);
  expect(info.others.map((o) => o.title)).toEqual(['C']);
});
it('grup yang tinggal 1 anggota hidup → null (diperlakukan tagihan tunggal)', () => {
  expect(groupInfoFor(groupsWithOneLive, PID, 'src-B')).toBeNull();
});
```

  Implementasi: `others` difilter `!m.isDead`. `lead = group.members[0]` tetap benar karena urutannya
  sudah hidup-dulu.

- [ ] **Step 5: `InvoiceGroupPanel.tsx`**

  `bundles` (±96) dibangun dari anggota hidup bila `!group.allDead`. Header menampilkan
  `{group.memberCount} pesanan`, dan bila `group.deadCount > 0 && !dead` ditambah teks abu
  ` · ${group.deadCount} dikeluarkan`. Baris anggota mati tetap tampil dengan gaya `m.isDead` yang ada.

- [ ] **Step 6: Jalankan, pastikan LULUS**

  Run: `npx vitest run src/utils/invoiceGroup.spec.ts src/components/status/invoiceGroups.spec.ts src/components/submissions/tabs`
  Expected: PASS, dan uji lama tetap hijau.

- [ ] **Step 7: Commit** — `fix(tagihan): anggota grup yang mati tidak dihitung di jumlah, total, dan lead`

---

### Task 2: Halaman invoice tidak mencetak/menjumlahkan anggota mati

**Files:**
- Modify: `src/utils/groupedInvoice.ts` (`buildInvoiceDocument`, `InvoiceDocument`)
- Modify: `src/pages/InvoicePage.tsx` (render ±355 dan daftar bundel)
- Test: `src/utils/groupedInvoice.spec.ts`

**Interfaces:**
- Produces: `InvoiceDocument.excluded: { title: string; amount: number }[]`. `bundles` dan semua total
  hanya dari baris hidup, KECUALI semua baris mati (lalu semua baris dipakai, `excluded = []`).

- [ ] **Step 1: Uji yang gagal**

```ts
it('baris mati dikeluarkan dari bundel dan total selama ada baris hidup', () => {
  const doc = buildInvoiceDocument([row({ status: 'pending', amount: 493950, title: 'Mun11 #PX' }),
                                    row({ status: 'expired', amount: 493950, title: 'Mun11 #Y9' })]);
  expect(doc.bundles).toHaveLength(1);
  expect(doc.total).toBe(493950);
  expect(doc.excluded).toEqual([{ title: 'Mun11 #Y9', amount: 493950 }]);
});
it('grup lunas dengan satu baris batal tetap RECEIPT', () => {
  const doc = buildInvoiceDocument([row({ status: 'paid', amount: 100 }), row({ status: 'cancelled', amount: 50 })]);
  expect(doc.isPaid).toBe(true);
  expect(doc.total).toBe(100);
});
it('semua baris mati → semua dipakai, excluded kosong (perilaku lama)', () => {
  const doc = buildInvoiceDocument([row({ status: 'cancelled', amount: 100 }), row({ status: 'expired', amount: 50 })]);
  expect(doc.bundles).toHaveLength(2);
  expect(doc.total).toBe(150);
  expect(doc.excluded).toEqual([]);
});
```

  `itemsWereCorrected` harus dihitung atas baris yang dipakai (indeks `rows` ikut disaring).

- [ ] **Step 2: Run** `npx vitest run src/utils/groupedInvoice.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implementasi.** Saring `rows` di awal `buildInvoiceDocument` dengan predikat status mati yang
  sama (case-insensitive). Simpan yang dibuang ke `excluded`.
- [ ] **Step 4: `InvoicePage.tsx`.** Bila `doc.excluded.length > 0`, tampilkan satu baris kecil abu di bawah
  daftar pesanan: `{n} pesanan dikeluarkan dari tagihan ini: {judul, …}`. Tidak masuk total dan tidak masuk
  "Terbilang".
- [ ] **Step 5: Run** uji yang sama → PASS. Jalankan juga seluruh `src/utils` → hijau.
- [ ] **Step 6: Commit** — `fix(invoice): pesanan yang dikeluarkan tidak ikut total tagihan`

---

### Task 3: SQL — lead `authoritative_payment_url` mengabaikan baris mati

**Files:**
- Create: `sql/139_lead_grup_abaikan_baris_mati.sql`, plus `sql/139_lead_grup_abaikan_baris_mati_APPLY.sql`
  (hanya bagian APPLY, aman di-Run utuh)
- Verifikasi: harness PGlite di scratchpad (memori `pglite-migration-harness`). Kalau scratchpad sudah
  kosong, pasang ulang `npm i @electric-sql/pglite@0.3`.

**Interfaces:**
- Consumes: aturan lead TS dari Task 1 (hidup dulu, lalu `start_date ASC NULLS LAST, ordinal ASC NULLS FIRST`).
- Produces: `authoritative_payment_url(uuid)` dengan signature dan kolom keluaran yang sama.
  - `is_lead` dipilih dari baris hidup (fallback: semua baris bila tidak ada yang hidup).
  - `is_group` TETAP `count(semua baris) > 1`. Alasannya, follower diarahkan ke halaman invoice; jangan
    pernah ke link DOKU grup yang mungkin menagih total lama.

- [ ] **Step 1: Ambil badan produksi** lewat MCP SELECT `pg_get_functiondef('public.authoritative_payment_url(uuid)'::regprocedure)`,
  plus `md5(prosrc)` dan `proacl`. Badan ini dipakai untuk APPLY yang diubah dan untuk ROLLBACK (badan lama
  persis).
- [ ] **Step 2: Tulis berkas.**
  - **DRY-RUN:** SELECT grup ber-`payment_id` yang anggota paling awalnya mati, sementara masih ada anggota
    hidup. Itu kasus yang lead-nya akan berpindah.
  - **APPLY:** `CREATE OR REPLACE` dengan CTE `grp` dipecah menjadi `grp_all`, ditambah `grp_live` =
    `lower(coalesce(status,'')) NOT IN ('expired','failed','cancelled')`. `lead` diambil dari `grp_live`
    bila ada isinya, kalau tidak dari `grp_all`. `is_group` memakai `grp_all`. Komentar wajib menunjuk ke
    `fetchInvoiceGroups` (aturan kembar).
  - **VERIFY:** `md5(prosrc)` berubah, `proacl` sama dengan sebelum.
  - **ROLLBACK** (dikomentari): badan lama persis.
- [ ] **Step 3: Uji di PGlite** (skrip harness baru, data sintetis). Asersi:
  - Grup 3 baris, yang paling awal `expired` → `is_lead` true untuk baris hidup paling awal, false untuk
    yang mati; `is_group` true.
  - Grup semua `cancelled` → lead = baris paling awal (perilaku lama).
  - Tagihan tunggal → `is_group` false, `is_lead` true (tidak berubah).
  - ROLLBACK mengembalikan `md5(prosrc)` lama.
  - `proacl` tidak berubah.

  Expected: semua PASS.
- [ ] **Step 4: Commit** — `fix(sql): lead tagihan gabungan memilih anggota hidup (sql/139)`. Serahkan
  berkas `_APPLY.sql` ke user untuk dijalankan sebelum push.

---

### Task 4: Aksi kartu "Terbitkan Ulang Tagihan Tempo" + pesan K8 + peringatan Hentikan Tayang

**Files:**
- Create: `src/components/submissions/tabs/reissueTempo.ts`
- Modify: `src/components/submissions/tabs/scheduleCardActions.ts` (`ActionId`, `case 'airing_on_credit'` ±461)
- Modify: `src/components/submissions/tabs/ScheduleCardList.tsx` (prop `onReissueTempo`, dispatch ±810)
- Modify: `src/components/submissions/tabs/SchedulePaymentTab.tsx` (handler baru; dialog Hentikan Tayang ±211)
- Modify: `src/utils/supabase.ts` (`tempoCancelBlockReason` ±6693)
- Test: `src/components/submissions/tabs/tempoCredit.spec.ts`, `src/components/submissions/tabs/reissueTempo.spec.ts` (baru), `src/utils/invoiceGroup.spec.ts`

**Interfaces:**
- Consumes: `InvoiceGroup.memberCount` / `members` / `isDead` (Task 1).
- Produces:
  - `ActionId` ditambah `'reissue_tempo'`.
  - `reissueTempoCopy(input: { bookingId: string; paymentId: string; memberCount: number; otherTitles: string[] }): { title: string; lines: string[]; confirmLabel: string }`.

- [ ] **Step 1: Uji `planCardActions` yang gagal** (`tempoCredit.spec.ts`, pakai helper `plan` yang sudah ada)

```ts
it('kredit + tagihan tempo terbuka → menu menawarkan Terbitkan Ulang, sebelum Hentikan Tayang', () => {
  const p = plan({ state: 'airing_on_credit', b: billingWithOpenTempo });
  expect(ids(p)).toContain('reissue_tempo');
  expect(p.menu.findIndex((a) => a.id === 'reissue_tempo'))
    .toBeLessThan(p.menu.findIndex((a) => a.id === 'cancel_schedule'));
});
it('kredit tanpa tagihan → tetap tempo_invoice, tanpa reissue_tempo', () => { /* ... */ });
it('kredit + tagihan terbuka NON-tempo → tanpa reissue_tempo', () => { /* ... */ });
it('can.tempoInvoice false → tanpa reissue_tempo', () => { /* ... */ });
```

- [ ] **Step 2: Run** `npx vitest run src/components/submissions/tabs/tempoCredit.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implementasi.** Di `case 'airing_on_credit'`, bila `billing?.openInvoice?.isTempo &&
  can.tempoInvoice && can.createInvoice`, sisipkan
  `{ id: 'reissue_tempo', label: 'Terbitkan Ulang Tagihan Tempo' }` di menu sebelum `stop`. Perbarui
  komentar "TIDAK ADA Ganti Tanggal / Batalkan tagihan" supaya menyebut jalan ini.
- [ ] **Step 4: Uji copy yang gagal** (`reissueTempo.spec.ts`)

```ts
it('tunggal', () => {
  const c = reissueTempoCopy({ bookingId: 'KH7QQM9T', paymentId: 'JFU-INV-x', memberCount: 1, otherTitles: [] });
  expect(c.title).toBe('Terbitkan ulang tagihan tempo #KH7QQM9T?');
  expect(c.lines[0]).toBe('Iklannya TETAP tayang. Yang diganti hanya tagihannya.');
  expect(c.lines.join(' ')).toContain('Link bayar lama JFU-INV-x dimatikan');
  expect(c.lines.join(' ')).not.toContain('gabungan');
  expect(c.confirmLabel).toBe('Lanjut ke formulir tagihan');
});
it('gabungan menyebut anggota lain dan jalan Tagihan Gabungan', () => {
  const c = reissueTempoCopy({ bookingId: 'KH7QQM9T', paymentId: 'JFU-INV-x', memberCount: 3, otherTitles: ['Mun11', 'Mun12'] });
  expect(c.lines.join(' ')).toContain('tagihan gabungan 3 pesanan');
  expect(c.lines.join(' ')).toContain('Mun11, Mun12');
  expect(c.lines.join(' ')).toContain('ditagih ulang otomatis dengan nominal sisanya');
  expect(c.lines.join(' ')).toContain('pakai Tagihan Gabungan');
});
```

  Copy persis:
  - `lines[0]` = `'Iklannya TETAP tayang. Yang diganti hanya tagihannya.'`
  - `lines[1]` = `` `Link bayar lama ${paymentId} dimatikan, lalu tagihan tempo baru terbit dengan link baru.` ``
  - Grup (`memberCount > 1`): `` `${paymentId} adalah tagihan gabungan ${memberCount} pesanan. Pesanan lain (${otherTitles.join(', ')}) TIDAK ikut tagihan baru ini; mereka ditagih ulang otomatis dengan nominal sisanya saat link /bayar/-nya dibuka. Untuk menagih ulang seluruh grup sekaligus, pakai Tagihan Gabungan.` ``

- [ ] **Step 5: Hubungkan UI.**
  - `ScheduleCardList`: prop `onReissueTempo?: (entry: AdScheduleEntry) => void`, dan
    `case 'reissue_tempo': return actions.onReissueTempo?.(entry);`.
  - `SchedulePaymentTab`: `handleReissueTempo(entry)` membaca `billings.get(entry.id)?.openInvoice` dan
    `groups.get(paymentId)`. `otherTitles` = anggota hidup selain jadwal ini. Lalu
    `setPendingConfirm({ ...reissueTempoCopy(...), tone: 'neutral', onConfirm: () => onCreateTempoInvoice(entry) })`.
    Hanya dioper ke `ScheduleCardList` bila `onCreateTempoInvoice` ada (drawer admin).
  - Dialog Hentikan Tayang (cabang `aired`): tambahkan baris `'Kalau tujuanmu menagih ulang atau
    mengganti nominal, JANGAN hentikan. Pakai "Terbitkan Ulang Tagihan Tempo". Jadwal yang dihentikan
    tidak bisa ditayangkan lagi dari dashboard.'`
- [ ] **Step 6: K8.** `tempoCancelBlockReason` diakhiri dengan
  `' Untuk mengganti nominal atau anggota tagihan, pakai "Terbitkan Ulang Tagihan Tempo" di kartu jadwalnya. Iklannya tetap tayang.'`
  Uji di `invoiceGroup.spec.ts` (sebelah ±482):
  `expect(await tempoCancelBlockReason('JFU-INV-t-1')).toMatch(/Terbitkan Ulang Tagihan Tempo/)`.
- [ ] **Step 7: Run** `npx vitest run src/components/submissions/tabs src/utils/invoiceGroup.spec.ts`. Expected: PASS.
- [ ] **Step 8: Commit** — `feat(tempo): Terbitkan Ulang Tagihan Tempo tanpa menghentikan iklan`

---

### Task 5: Tagihan Gabungan menerima jadwal kredit yang sudah bertagihan tempo

**Files:**
- Modify: `src/components/schedule/bulkInvoiceCandidates.ts` (`isBillable` ±94, `BulkCandidate`, `REASONS.airing_on_credit` ±61)
- Modify: `src/components/schedule/BulkInvoiceDialog.tsx` (baris kandidat)
- Test: `src/components/schedule/bulkInvoiceCandidates.spec.ts`

**Interfaces:**
- Produces: `BulkCandidate.replacesPaymentId: string | null`, berisi `payment_id` tagihan tempo terbuka
  yang akan digantikan.

- [ ] **Step 1: Uji yang gagal**

```ts
it('mode tempo: kredit + tempo terbuka → kandidat, dengan replacesPaymentId', () => {
  const p = planBulkInvoice({ ...input(creditEntry, billingOpenTempo('JFU-INV-old')), tempo: true });
  expect(p.candidates[0].replacesPaymentId).toBe('JFU-INV-old');
});
it('mode biasa: kredit + tempo terbuka → ditolak, alasannya menyebut centang Tagihan tempo', () => {
  const p = planBulkInvoice({ ...input(creditEntry, billingOpenTempo('JFU-INV-old')), tempo: false });
  expect(p.rejected[0].reason).toContain('centang "Tagihan tempo"');
});
it('kredit + tagihan terbuka NON-tempo → tetap ditolak di mode tempo', () => { /* ... */ });
```

- [ ] **Step 2: Run** `npx vitest run src/components/schedule/bulkInvoiceCandidates.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implementasi.**
  - `isBillable` untuk `airing_on_credit`: `!billing?.openInvoice || !!billing.openInvoice.isTempo`.
  - `replacesPaymentId = billing?.openInvoice?.isTempo ? billing.openInvoice.paymentId ?? null : null`;
    kandidat lain `null`.
  - `REASONS.airing_on_credit.text` =
    `'Sudah tayang sebelum lunas — centang "Tagihan tempo" untuk menerbitkan ulang tagihannya'`.
  - `BulkInvoiceDialog`: bila `replacesPaymentId`, tampilkan teks kecil amber di baris kandidat:
    `Menggantikan tagihan {replacesPaymentId}. Iklannya tetap tayang.`
- [ ] **Step 4: Run** → PASS (uji lama ikut hijau).
- [ ] **Step 5: Commit** — `feat(tempo): tagihan gabungan bisa menerbitkan ulang tagihan tempo yang sedang tayang`

---

### Task 6: Pengaman ganda "Jadwal Iklan Baru"

**Files:**
- Create: `src/components/submissions/tabs/newScheduleGuard.ts`
- Modify: `src/components/submissions/tabs/SchedulePaymentTab.tsx` (tombol ±838, `onCreateSchedule` prop)
- Modify: `src/components/submissions/SubmissionDetailSheet.tsx` (`subView` `create` ±109 dan ±483, `ScheduleForm` ±578)
- Modify: `src/components/schedule/ScheduleForm.tsx` (props ±49, `canSave` ±566)
- Test: `src/components/submissions/tabs/newScheduleGuard.spec.ts` (baru)

**Interfaces:**
- Consumes: `scheduleAgainBlock` (`src/utils/canScheduleAgain.ts`), dipanggil dengan `{ kilatOpen: true }`
  supaya Kilat tidak menyamar sebagai blokir; Kilat sudah digerbang `canAddSchedule`.
- Produces:
  - `type NewScheduleGuardCause = 'parent_cancelled' | 'parent_on_credit' | 'parent_unpaid'`
  - `interface NewScheduleGuard { cause: NewScheduleGuardCause; parent: AdScheduleEntry }`
  - `newScheduleGuardOf(submission: { distribution_type?: string | null; submission_status?: string | null }, entries: AdScheduleEntry[], now?: number): NewScheduleGuard | null`
  - `newScheduleGuardCopy(g: NewScheduleGuard): { title: string; lines: string[]; confirmLabel: string; ackLabel: string }`
  - `onCreateSchedule: (isExtraAd: boolean, guard?: NewScheduleGuard) => void`
  - `subView` `{ kind: 'create'; isExtraAd: boolean; guard?: NewScheduleGuard }`
  - `ScheduleFormProps.acknowledgement?: { lines: string[]; label: string }`

- [ ] **Step 1: Uji predikat yang gagal**

```ts
it('#1 lunas → null', () => expect(newScheduleGuardOf(sub('paid'), [e1Paid])).toBeNull());
it('Kilat lunas → null', () => expect(newScheduleGuardOf(subKilat, [e1Paid])).toBeNull());
it('order slot_cancelled, #1 batal → parent_cancelled, parent = #1', () => {
  const g = newScheduleGuardOf(sub('slot_cancelled'), [e1Cancelled])!;
  expect(g.cause).toBe('parent_cancelled');
  expect(g.parent.ordinal).toBe(1);
});
it('#1 tayang kredit belum lunas → parent_on_credit', () => {
  expect(newScheduleGuardOf(sub('scheduled'), [e1CreditPending])!.cause).toBe('parent_on_credit');
});
it('#1 menahan slot, belum lunas, bukan kredit → parent_unpaid', () => {
  expect(newScheduleGuardOf(sub('scheduled'), [e1WaitingPayment])!.cause).toBe('parent_unpaid');
});
```

  Aturan `parent`:
  - `quota_held` → jadwal ber-ordinal terkecil yang `occupiesSlot` dan belum `paid`/`completed`;
    `cause = airOnCreditAt ? 'parent_on_credit' : 'parent_unpaid'`.
  - `order_inactive` → jadwal ordinal 1; `cause = status === 'cancelled' ? 'parent_cancelled' : 'parent_unpaid'`.
  - Hasil `scheduleAgainBlock` lain → `null`.

- [ ] **Step 2: Uji copy yang gagal**

```ts
it('parent_cancelled', () => {
  const c = newScheduleGuardCopy({ cause: 'parent_cancelled', parent: e1Cancelled /* KH7QQM9T, 493950, 5 × 35000 */ });
  expect(c.title).toBe('Jadwal #1 (#KH7QQM9T) sudah dibatalkan');
  expect(c.lines[0]).toBe('Peneliti tidak bisa membuat jadwal baru di keadaan ini. Pastikan ini memang yang dimaksud.');
  expect(c.lines[1]).toContain('Rp 493.950');
  expect(c.lines[1]).toContain('5 × Rp 35.000');
  expect(c.lines.join(' ')).toContain('Jadwal #1 TIDAK ikut pindah ke tanggal baru');
  expect(c.confirmLabel).toBe('Tetap buat jadwal baru');
  expect(c.ackLabel).toBe('Saya paham: jadwal ini perpanjangan tanpa reward, dan jadwal sebelumnya tidak ikut pindah.');
});
it('parent_on_credit menunjuk ke Terbitkan Ulang Tagihan Tempo', () => { /* lines contain 'Terbitkan Ulang Tagihan Tempo' */ });
it('parent_unpaid menunjuk ke Ganti Tanggal', () => { /* lines contain '"Ganti Tanggal"' */ });
it('parent tanpa reward → kalimat reward tidak disebut', () => { /* winnerCount 0 → lines[1] not contain '×' */ });
```

  Copy persis (`#N` = `parent.ordinal`, `B` = `parent.bookingId`; rupiah memakai `formatIDR` yang dipakai
  file tab):
  - **title**
    - cancelled: `Jadwal #N (#B) sudah dibatalkan`
    - on_credit: `Jadwal #N (#B) sedang tayang sebelum lunas`
    - unpaid: `Jadwal #N (#B) belum lunas`
  - **lines[0]** = `'Peneliti tidak bisa membuat jadwal baru di keadaan ini. Pastikan ini memang yang dimaksud.'`
  - **lines[1]**
    - dengan reward: `` `Jadwal baru dicatat sebagai PERPANJANGAN. Di periode yang sama, reward responden TIDAK ditagihkan lagi, jadi nominalnya berbeda dari jadwal #N (Harga Tercatat ${formatIDR(totalCost)}, termasuk reward ${winnerCount} × ${formatIDR(prizePerWinner)}).` ``
    - tanpa reward: `` `Jadwal baru dicatat sebagai PERPANJANGAN dengan harga dihitung ulang (jadwal #N: Harga Tercatat ${formatIDR(totalCost)}).` ``
  - **lines[2]**
    - cancelled: `'Jadwal #1 TIDAK ikut pindah ke tanggal baru; ia tetap batal.'`
    - on_credit: `'Kalau tujuanmu menagih ulang atau mengganti nominal, batalkan ini dan pakai "Terbitkan Ulang Tagihan Tempo" di kartu jadwalnya.'`
    - unpaid: `'Kalau tujuanmu memindah tanggal, batalkan ini dan pakai "Ganti Tanggal" di kartu jadwal itu.'`

- [ ] **Step 3: Run** `npx vitest run src/components/submissions/tabs/newScheduleGuard.spec.ts`. Expected: FAIL → implementasi → PASS.
- [ ] **Step 4: Lapis 1 (popup).** Tombol "Jadwal Iklan Baru": `guard = newScheduleGuardOf(submission, schedules)`.
  - Bila ada: `setPendingConfirm({ title, lines, confirmLabel, tone: 'danger', onConfirm: () => onCreateSchedule(isExtraAd, guard) })`.
  - Bila tidak: perilaku lama.
- [ ] **Step 5: Lapis 2 (centang).**
  - `SubmissionDetailSheet` meneruskan `guard` ke `ScheduleForm` sebagai
    `acknowledgement={{ lines: copy.lines.slice(1), label: copy.ackLabel }}`.
  - `ScheduleForm` menampilkan kotak amber berisi `lines` dan sebuah checkbox `label` di atas aksi.
    `canSave = (logika lama) && (!acknowledgement || acknowledged)`. State `acknowledged` mulai `false`
    setiap formulir dipasang.
- [ ] **Step 6: Commit** — `feat(jadwal): pengaman ganda saat admin menambah jadwal di atas jadwal belum lunas/batal`

---

### Task 7: Verifikasi akhir

- [ ] **Step 1:** `npx vitest run` → semua hijau.
- [ ] **Step 2:** `npx tsc -p tsconfig.app.json --noEmit 2>&1 | tee /tmp/tsc.txt | grep -cE "error TS"`
  ≤ baseline, dan `grep -E "TS2304|TS2552" /tmp/tsc.txt` kosong.
- [ ] **Step 3:** Uji manual `npm run dev:full` (DB produksi, bayar/email mati). JANGAN menekan Simpan atau
  Terbitkan pada order sungguhan; cukup buka dialognya.
  - **Mun#07 (KH7QQM9T):** menu kartu memuat "Terbitkan Ulang Tagihan Tempo", dan dialognya menyebut
    gabungan 6 pesanan. Panel gabungan "6 pesanan", total Rp 2.963.700.
  - **"Jadwal Iklan Baru"** di Mun#07 → popup `parent_on_credit` → formulir dengan Simpan nonaktif sampai
    dicentang.
  - **Order dengan #1 lunas:** tanpa popup.
  - **`/invoices/JFU-INV-57caff-1794809989063`** (grup lama, semua mati): tetap 7 pesanan, sebagai riwayat.
- [ ] **Step 4:** `graphify update .` dari root repo. Commit kalau ada sisa. Serahkan ke user:
  - urutan deploy: sql/139 `_APPLY.sql` dulu, baru merge ke `main` + pull + push;
  - daftar perubahan copy, untuk direview.
