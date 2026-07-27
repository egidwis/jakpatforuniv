# Auto-review Microsoft Forms via link publik

## Context

Hari ini JFU hanya punya **satu** jalur auto-review: import Google Form lewat OAuth +
Google Picker. Semua submission lain masuk antrean review manual admin.

Data antrean manual di produksi memastikan prioritasnya:

| Platform | Review manual |
|---|---|
| **Microsoft Forms** | **110** |
| Google Forms | 100 |
| Lainnya | 63 |
| SurveyMonkey | 5 |
| Typeform | 1 |

MS Forms adalah penyumbang terbesar dan sama sekali belum terlayani. Ronde ini menyasar
itu. Google tetap memakai OAuth — tidak diubah.

Kekhawatiran awal (jalur URL publik tidak akurat pada form ber-logic page) sudah diuji
langsung terhadap data submission nyata dan **terbantah**. Hasil benchmark di bawah.

Ronde ini juga memperbaiki dua cacat produksi yang ditemukan saat benchmark: deteksi
keyword `phone` yang salah menandai form (presisi ~50% — separuh flag PII hari ini keliru),
dan pengecekan form tertutup yang meloloskan form berlokale Indonesia.

---

## Benchmark terhadap data produksi

### Microsoft Forms — 38 submission user JFU

| Metrik | Hasil |
|---|---|
| Terbaca anonim tanpa autentikasi | **38/38 (100%)** — nol gagal, nol dinding login |
| Jumlah pertanyaan cocok dengan angka user | **38/38 persis** |

**Aturan hitung yang benar** (temuan kunci): MS Forms merepresentasikan grid sebagai
1 kontainer `Question.MatrixChoiceGroup` + N baris `Question.MatrixChoice`, keduanya
masuk array `questions`. Naif `len(questions)` selalu kelebihan tepat sejumlah kontainer.

```
jumlah_pertanyaan = jumlah questions yang type != 'Question.MatrixChoiceGroup'
```

Baris grid terhitung satuan — konvensi identik dengan `questionGroupItem` di jalur Google
API (`google-forms-api-browser.ts:124`). Dengan aturan ini, 38/38 cocok tanpa kecuali.

Terverifikasi juga:
- `groupId` **mengaitkan baris grid ke kontainernya, bukan penanda section**
- `descriptiveQuestions` benar-benar terpisah dari `questions` (satu form punya 6 item
  deskriptif, semuanya tidak ikut terhitung)
- `settings.IsAnonymous = true` terbaca di semua form
- Form tertutup membalas HTTP 403 `{"code":"5000","message":"This form is closed."}`

**Bias sampel yang harus diakui:** 38 form itu hanya memuat 4 tipe pertanyaan
(`MatrixChoice`, `MatrixChoiceGroup`, `Choice`, `TextField`); dari sampel eksternal
kutambah `Rating` dan `DateTime`. Tidak ada satu pun yang memakai branching
(`mfpBranchingData` null di semua). Justru karena itu guardrail tipe-tak-dikenal wajib ada.

### Google — 34 baris, `question_count` hasil OAuth sebagai ground truth

**26 cocok persis. 4 meleset. 4 tidak terekstrak.**

Empat yang tidak terekstrak semuanya **keputusan yang benar**: 1 form kini privat
(HTTP 401), 3 form memang sudah ditutup. Nol false positive.

Empat yang meleset tidak menunjukkan tanda cacat parser — tanpa grid, tanpa tipe ambigu,
aritmetika internal konsisten. Bukti bahwa ground truth-nya sendiri bergerak: **satu form
yang sama tercatat 92 pertanyaan (7 Apr) dan 91 (15 Apr) oleh API OAuth**, dan pembacaan
publik hari ini 92. Dua dari empat kasus juga kehilangan keyword `phone`-nya — persis pola
yang diharapkan kalau mahasiswa mengedit form setelah review JFU menyuruh hapus pertanyaan
data pribadi.

Di antara 26 yang cocok ada form 130, 117, 106, dan 103 pertanyaan dengan sampai **28 page
break**. Kalau parser cacat pada section/logic page, form-form itulah yang jatuh duluan.
Tidak satu pun jatuh.

**Celah nyata yang terkonfirmasi (khusus Google):** setting bawaan "Collect email
addresses" tidak terbaca dari payload publik — 2 form positif vs 4 kontrol tidak
menunjukkan field pembeda, dan notifikasinya dirender di klien sehingga absen dari HTML
awal. Muncul di 3 dari 34 baris (~9%). **Celah ini tidak ada di MS Forms.** Inilah alasan
berbasis data untuk mempertahankan OAuth di sisi Google.

### Cara kerja ekstraksi MS Forms

```
1. GET <link publik>  (mengikuti redirect /r/, /g/, /e/ → responsepage.aspx)   → 200 HTML
   HTML memuat "prefetchFormUrl":
   ".../formapi/api/{tenantId}/(users|groups)/{ownerId}/light/runtimeForms('<id>')
    ?$expand=questions($expand=choices)"
2. GET url itu, tanpa header auth apa pun                                      → 200 JSON
```

Tidak ada API resmi (Graph hanya punya `adminForms`/`formsSettings` beta untuk reporting
tenant), dan jalur ber-token butuh consent admin Entra tiap kampus — **tidak ada padanan
OAuth yang layak untuk MS Forms**. Link publik adalah satu-satunya rute yang bisa
dioperasikan, dan benchmark membuktikan rute itu memadai.

Sifat pengaman bawaan: **kalau server kita tidak bisa membacanya anonim, panelis Jakpat
juga tidak bisa mengisinya.** Form yang dikunci ke tenant gagal di langkah 1 (redirect
login, tidak ada `prefetchFormUrl`) — pengecekan aksesnya dan persyaratan produknya adalah
hal yang sama.

---

## Keputusan yang sudah diambil

| Topik | Keputusan |
|---|---|
| Kepercayaan | Auto-approve hanya bila parser 100% yakin; satu blocker → review manual |
| Google Forms | Tetap OAuth + Picker (celah `collectEmail` ~9% tidak tertutup jalur publik) |
| Bukti kepemilikan MS Forms | Tidak diwajibkan; diganti kontrol kompensasi |
| Bug deteksi form tertutup | Diperbaiki sekalian di ronde ini |
| False positive deteksi `phone` | Diperbaiki sekalian, plus backfill baris lama yang salah ter-flag |
| Badge PII di dashboard admin | Hanya selama menunggu keputusan (+ `rejected`/`spam`); snapshot pindah ke `review_history` |

---

## Rancangan

### 1. Abstraksi provider — hapus hardcode `docs.google.com/forms`

Ekspresi gate terduplikasi di 5 tempat; semua harus lewat satu sumber kebenaran.

Baru: `multi-step-form/src/utils/form-providers.ts`

```ts
export type FormProvider = 'google_forms' | 'ms_forms';
export function detectProvider(url: string): FormProvider | null
export function isAutoReviewCapable(url: string): boolean   // provider !== null
```

Allowlist host MS: `forms.office.com`, `forms.cloud.microsoft`, `forms.microsoft.com`
(path `/r/`, `/g/`, `/e/`, `/pages/responsepage.aspx`). Query string seperti
`?origin=lprLink` harus tetap diterima — muncul di data produksi.

Titik yang diubah — pola sama di semuanya, ganti `.includes('docs.google.com/forms')`
dengan `isAutoReviewCapable(url)`:
- `src/components/MultiStepForm.tsx:197` — `isAutoApprovalPath`
- `src/components/UnifiedHeader.tsx:30` — duplikat `isAutoApprovalPath`
- `src/components/StepCheckout.tsx:63` — `isManualForm`
- `src/components/status/deriveOrderUiState.ts:52` — `isAutoReviewed()`
- `src/components/StepSurveyDetails.tsx:29` — `getInitialFlowState()`
- `src/components/submissions/SubmissionListRow.tsx:85` — chip, tambah `MS Form`

### 2. Cloudflare Pages Function — ekstraksi server-side

Baru: `multi-step-form/functions/api/ms-forms-extract.js`
(pola mengikuti `functions/api/google-forms-proxy.js`)

- Wajib JWT Supabase; rate limit per user
- Validasi host terhadap allowlist **sebelum** fetch (cegah SSRF)
- Ikuti redirect → ambil `prefetchFormUrl` → fetch JSON anonim → parse → kembalikan
  `SurveyInfo` + `blockers[]`
- Peta error ke key terjemahan yang sudah ada: 403 code 5000 → `errorFormNotPublished`;
  tidak ada `prefetchFormUrl` / redirect login → `errorFormRestricted`

Server-side, bukan browser: menghindari CORS dan melepas ketergantungan `corsproxy.io`.

### 3. Parser murni + guardrail

Baru: `multi-step-form/src/utils/ms-forms-parse.ts` — fungsi murni `rawJson → hasil`,
dipakai bersama oleh Function dan test.

```
KONTAINER = { 'Question.MatrixChoiceGroup' }
DIKENAL   = { TextField, Choice, MatrixChoice, Rating, DateTime, Ranking,
              NetPromoterScore, FileUpload }   // + KONTAINER
jumlah = count(q => q.type ∉ KONTAINER)
```

`blockers[]` — **ada satu saja → `submission_status: 'in_review'`**:

| Blocker | Pemicu |
|---|---|
| `unsupported_question_type` | ada `type` di luar DIKENAL — menjaga kalau Microsoft menambah tipe baru |
| `has_branching` | `mfpBranchingData !== null` — belum terbukti di sampel mana pun, dilepas setelah terkonfirmasi |
| `identity_recorded` | `settings.IsAnonymous === false` atau `NotRecordIdentity === false` |
| `not_active` | `status !== 'Active'` |
| `personal_data` | hasil scanner PII |

Jangan pakai `groupId` sebagai pemicu apa pun — benchmark membuktikan itu penanda
keanggotaan baris grid, bukan section.

**Deteksi PII harus satu sumber.** Regex hari ini tertanam di
`google-forms-api-browser.ts:334-393`. Ekstrak ke `src/utils/personal-data-detect.ts`,
lalu Google dan MS memanggil fungsi yang sama. Tanpa ini dua jalur akan menyimpang
diam-diam. Sekaligus perbaiki cacat `phone` di bawah.

### 4. Perbaiki false positive deteksi `phone`

Regex `phone` sekarang mencocokkan **kata bendanya**, bukan permintaan nomornya. Diukur
pada 1.591 pertanyaan dari 25 form produksi:

| | judul kena | form ter-flag |
|---|---|---|
| Regex sekarang | 53 | 6 |
| Usulan | **3** | **3** |

Tiga yang tersisa memang benar meminta nomor responden; 50 yang gugur semuanya false
positive. Contoh terburuk: riset "Hubungan Psikologis antara Pemilik dan Brand Smartphone"
kena **48 kali** dari kalimat Likert seperti `"13. Pencapaian brand hp saya membuat saya
terkesan dan bangga."` — kampanye yang sudah live memakai ikon PII merah tanpa alasan.

Aturan pengganti — wajib ada **peminta** di dekat **kanal**, bukan kanal sendirian:

```
KANAL   = telepon|telpon|telp|hp|handphone|hanphone|henpon|hanpon|hape|
          ponsel|seluler|whats ?app|wa|phone|mobile
PEMINTA = nomor|nomer|no.?|number|kontak|contact
VERBA   = tuliskan|masukkan|isikan|cantumkan|sertakan|berikan|input|enter|provide

1. PEMINTA [pemisah] KANAL          → "Nomor HP", "No. Telp", "Kontak WhatsApp"
2. KANAL [pemisah] PEMINTA          → "Phone number", "WA number"
3. VERBA …≤25 karakter… KANAL       → "Masukkan nomor WhatsApp Anda"
4. "(yang) bisa/dapat dihubungi" | "narahubung" | "contact number|info|details"
5. Judul pendek yang isinya HANYA kanal → "HP/WA", "WhatsApp", "Telepon", "Whatsapp (aktif)"
```

Aturan 5 penting: judul yang isinya cuma `"HP/WA"` jelas sebuah field permintaan, sedangkan
kalimat panjang yang menyebut "hp" tidak. Empat frasa itu bahkan lolos dari aturan 1–4.

Diuji: **recall 24/24** pada daftar frasa permintaan nomor yang realistis, **presisi 10/10**
pada kalimat jebakan (brand HP, "menggunakan WhatsApp untuk berkomunikasi", "telepon
genggam", "aplikasi mobile"). Aturan 5 tidak menambah satu pun false positive di korpus nyata.

**Penyakit yang sama ada di `email`.** Satu-satunya kecocokan `email` di korpus adalah
`"Penggunaan email meningkatkan efisiensi dan produktivitas kerja."` — juga pernyataan
Likert, bukan permintaan alamat. Regexnya `\b(email|e-mail)\b`, persis pola yang sama.
Perlakukan sekalian dengan bentuk aturan yang sama (peminta/verba + kanal, atau judul
pendek). `address` tidak muncul sama sekali di korpus, jadi perbaikannya bersifat
pencegahan dan boleh menyusul.

**Backfill baris lama.** `detected_keywords` tersimpan di DB, jadi submission yang sudah
salah ter-flag tidak sembuh sendiri — termasuk kampanye live yang sekarang menampilkan ikon
PII merah. Setelah detektor baru lolos test, jalankan ulang ekstraksi untuk baris
`google_import` yang punya `phone` di `detected_keywords`, hitung ulang dengan aturan baru,
dan hasilkan `UPDATE` untuk ditinjau manual sebelum dijalankan — jangan hapus massal buta.

### 5. Badge PII hanya selama menunggu keputusan

Badge `ShieldAlert` merah di dashboard admin ([SubmissionListRow.tsx:103](../../../multi-step-form/src/components/submissions/SubmissionListRow.tsx#L103))
tampil selama `detected_keywords` tidak kosong, tanpa peduli status. Akibatnya kampanye
yang sudah lolos review dan sedang **Live** tetap memakai ikon peringatan — persis kasus
yang dilaporkan.

Badge itu alat kerja untuk memutuskan, bukan cap permanen. Setelah admin memutuskan,
informasinya pindah ke riwayat.

**Ambang tampil** — helper baru di `src/components/submissions/lifecycle.ts` (rumah yang
sudah ada untuk predikat status):

| Status | Badge |
|---|---|
| `in_review`, `pending` | tampil — masih menunggu keputusan |
| `rejected`, `spam` | tampil — konteks cepat kenapa ditolak |
| `approved`, `waiting_payment`, `paid`, `scheduled`, `live`, `completed` | hilang |

**Riwayat menyimpan snapshot.** `ReviewHistoryEntry` (`components/submissions/types.ts:6`)
ditambah `detected_keywords?: string[]`, dan `handleStatusChange`
([InternalDashboard.tsx:457](../../../multi-step-form/src/components/InternalDashboard.tsx#L457))
mengisinya dari `submission.detected_keywords` saat entry dibuat. `ReviewTimeline` di
detail sheet menampilkannya per entry, jadi terbaca sebagai "apa yang terdeteksi waktu
keputusan ini diambil".

Untuk baris yang sudah disetujui **sebelum** perubahan ini, entry-nya belum punya snapshot
— timeline jatuh ke `detected_keywords` di baris induk sebagai fallback. Tidak ada
informasi yang hilang.

**Kolom `detected_keywords` tidak pernah dikosongkan.** Itu fakta hasil ekstraksi; yang
berubah hanya kapan ia ditampilkan. Backfill di bagian 4 tetap boleh memperbaikinya karena
memang mengoreksi hasil deteksi yang salah, bukan menghapus jejak keputusan.

Di detail sheet ([SubmissionDetailSheet.tsx:804](../../../multi-step-form/src/components/submissions/SubmissionDetailSheet.tsx#L804))
baris "Detected keywords" mengikuti ambang yang sama; sesudah keputusan, tempatnya di
timeline.

### 6. Perbaiki deteksi form tertutup (bug produksi aktif)

`google-forms-api-browser.ts:284-291` hanya mencocokkan frasa Inggris dan satu varian
Indonesia. Form yang ditemukan saat benchmark menampilkan **"ditutup"** dengan URL
`closedform` — tidak satu pun pola cocok, sehingga form Indonesia yang sudah ditutup
**lolos dan bisa ter-auto-approve hari ini**.

Tambahkan `closedform` (cek URL final setelah redirect) dan `ditutup` ke daftar pola.

### 7. UI

- `StepOneMethodSelection.tsx` — kartu ketiga "Import Microsoft Forms". Google tetap ⭐ Recommended.
- Baru: `src/components/StepOneMsForm.tsx` + `src/components/MsFormImport.tsx` —
  cerminkan `GoogleDriveImportSimple.tsx` (paste link → verifikasi → kartu hasil →
  peringatan PII amber → lanjut), pakai ulang komponen kartu dan gaya yang sama.
- `questionCount` tetap `readOnly` seperti jalur Google (`StepOneFormFields.tsx:326`) —
  ini yang menjaga integritas harga.
- Key i18n baru di `src/i18n/translations.ts`, **id dan en dua-duanya**.

### 8. Persistensi — tanpa migration baru

- `submission_method` dapat nilai `'ms_forms_import'` (kolom `text`, tanpa DDL)
- Verdict & blockers ditulis ke `admin_notes` berprefiks `[auto-review]` saat insert
  (baris baru selalu kosong, jadi tidak menimpa catatan admin)

Sengaja tanpa kolom baru: sql/34 dan sql/35 masih belum diterapkan dan sudah jadi blocker
deploy.

### 9. Rilis dengan kill switch

Flag konstan `MS_FORMS_AUTO_APPROVE`, awalnya `false`: ekstraksi jalan penuh dan verdict
tersimpan, tapi submission tetap `'in_review'` sehingga admin bisa membandingkan.

Benchmark 38/38 sudah memenuhi ambang akurasi, jadi ini periode pengaman pendek — nyalakan
setelah ~10 submission nyata cocok, bukan validasi terbuka. Flag tetap ada sebagai kill
switch kalau Microsoft mengubah endpoint.

### 10. Test

Belum ada test runner (`src/utils/submissionMode.test.ts` dan
`src/components/customers/types.test.ts` yatim — vitest tidak terpasang, tidak ada script
`test`). Pasang vitest + script `test`; dua test yatim itu ikut hidup.

Fixture parser MS: JSON mentah dari beberapa form MS produksi yang dipakai benchmark
(terutama yang punya grid, dan yang punya `descriptiveQuestions`). Uji jumlah pertanyaan,
pengecualian `MatrixChoiceGroup`, tiap blocker, dan pemetaan error form tertutup.

Fixture detektor PII: kasus positif dan jebakan dari korpus nyata — minimal `"Nomor Hp
(Opsional, hanya untuk pengiriman reward)"`, `"No Handphone / ID Line ? (Opsional)"`,
`"HP/WA"` harus terdeteksi; `"13. Pencapaian brand hp saya membuat saya terkesan dan
bangga."`, `"Saya menggunakan WhatsApp atau media sosial untuk berkomunikasi dengan
pelanggan."`, `"Penggunaan email meningkatkan efisiensi dan produktivitas kerja."` tidak
boleh. Ini yang mencegah regexnya melar lagi di kemudian hari.

---

## Kontrol kompensasi pengganti bukti kepemilikan

Tidak ada Picker untuk MS Forms, jadi siapa pun bisa menempel link form orang lain.

1. Form memang wajib bisa diisi publik — membacanya anonim persis yang dilakukan panelis.
   Tidak ada eskalasi akses.
2. Guard URL duplikat: URL sama pernah disubmit akun lain → paksa review manual. Data
   produksi menunjukkan duplikat URL memang terjadi, jadi guard ini akan terpakai.
3. Kerugian kasus terburuk rendah — biaya iklan dan hadiah keluar dari kantong pengirim.

---

## Spike tersisa

Benchmark sudah menutup pertanyaan akurasi dan aksesibilitas. Yang belum:

- **S1 — egress Cloudflare.** Jalankan Function di preview deploy, ekstrak 3 link MS yang
  terbukti terbaca dari lokal. Kalau Microsoft memblokir IP datacenter, seluruh pendekatan
  gugur — **jalankan paling awal**.
- **S2 — branching & tipe langka.** Buat form MS uji: (a) dengan branching, (b) dengan
  `Rating`/`Ranking`/`FileUpload`, (c) dikunci ke organisasi, (d) ditutup. Konfirmasi tiap
  blocker menyala tepat. Sampel produksi tidak memuat satu pun kasus ini.

---

## Verifikasi end-to-end

1. `npm run typecheck` dan `npm run lint` di `multi-step-form/` bersih
2. `npm test` — test parser lulus, termasuk fixture grid, form tertutup, dan form ber-PII
3. `npm run dev`, buka `/dashboard/submit-iklan`:
   - Tempel link MS Form publik tanpa PII → judul, deskripsi, jumlah pertanyaan terisi;
     `questionCount` read-only. Pakai salah satu link produksi yang sudah dibenchmark dan
     bandingkan angkanya dengan tabel hasil
   - Flag mati: submit → baris Supabase `submission_status = 'in_review'`,
     `submission_method = 'ms_forms_import'`, `admin_notes` memuat `[auto-review]`
   - Flag nyala: submit ulang → `submission_status = 'waiting_payment'`,
     `slot_booked_by = 'user'`, step Jadwal muncul di wizard
   - Link MS Form tertutup → pesan `errorFormNotPublished`
   - Link MS Form terkunci organisasi → pesan `errorFormRestricted`
   - Link Google Form ditempel di kolom MS → ditolak allowlist
4. Regresi Google: import lewat OAuth + Picker masih auto-approve, dan form Google yang
   benar-benar meminta nomor responden masih jatuh ke review manual
5. Deteksi `phone`: import ulang form "Hubungan Psikologis antara Pemilik dan Brand
   Smartphone" (104 pertanyaan, 48 false positive hari ini) → harus lolos tanpa flag PII,
   sementara form "KUESIONER PENELITIAN PENGARUH SIKAP…" tetap ter-flag karena punya
   `"Nomor Hp (Opsional, hanya untuk pengiriman reward…)"`
6. Perbaikan form tertutup: form Google berlokale Indonesia yang sudah ditutup kini ditolak
7. Backfill: `UPDATE` hasil hitung ulang ditinjau baris per baris sebelum dijalankan
8. Badge PII: baris berstatus `live`/`paid`/`scheduled` tidak lagi menampilkan ikon merah
   meski `detected_keywords` terisi; baris `in_review` dan `rejected` masih menampilkannya.
   Setujui satu submission ber-PII dari `in_review` → badge hilang dari list, dan entry baru
   di `ReviewTimeline` memuat keyword yang terdeteksi saat itu
9. Dashboard admin: baris baru muncul dengan chip `MS Form` dan verdict terbaca

---

## Di luar cakupan

- **Google Form via link publik.** Parsernya terbukti akurat (26/30 cocok persis, sisanya
  pergeseran form pasca-submit, form bersection sampai 28 page break tetap tepat), tapi
  setting "Collect email addresses" tidak terdeteksi pada ~9% form — celah kepatuhan PII
  yang tidak tertutup. Keputusan: Google tetap OAuth. Parser dan angkanya tercatat di sini
  kalau nanti dibuka lagi.
- Typeform / Jotform / SurveyMonkey — butuh API key pemilik form per platform; 6 review
  manual gabungan, tidak sepadan.
- Bersih-bersih kode mati (`worker-service.ts`, `form-extractor.worker.ts` 933 baris,
  `google-forms-api.ts`, `google-drive*.ts`, `google-picker.ts`, `GoogleDriveImport.tsx`,
  `api/extract.js`) — semuanya tidak diimpor dari mana pun. Layak dihapus, tapi di PR
  terpisah; perhatikan `survey-service.ts` masih menyuplai tipe `SurveyInfo` ke jalur hidup.

---

# Lampiran

## A. Mekanika ekstraksi Microsoft Forms

```
Langkah 1 — GET <link publik>, ikuti redirect
  Bentuk link yang ditemukan di produksi:
    https://forms.office.com/r/XXXXXXXX
    https://forms.cloud.microsoft/r/XXXXXXXX
    https://forms.cloud.microsoft/r/XXXXXXXX?origin=lprLink     ← query string harus ditoleransi
  Semuanya berakhir di:
    https://forms.cloud.microsoft/pages/responsepage.aspx?id=<id>&route=shorturl

Langkah 2 — cari di HTML respons:
  "prefetchFormUrl":"https://forms.cloud.microsoft/formapi/api/{tenantId}/
     (users|groups)/{ownerId}/light/runtimeForms('<id>')?$expand=questions($expand=choices)"
  Escape ' (petik tunggal) dan & (ampersand) harus di-unescape.
  Baca dari HTML, jangan susun sendiri — bentuknya berbeda untuk form milik grup.

Langkah 3 — GET url itu, tanpa header auth apa pun → 200 + JSON penuh
```

Field yang dipakai:

| Field | Guna |
|---|---|
| `questions[]` → `title`, `type`, `required`, `choices`, `order`, `groupId` | hitungan & scan PII |
| `descriptiveQuestions[]` | blok teks, sudah terpisah — abaikan |
| `status` | `"Active"` = masih menerima respon |
| `settings` (string JSON) → `IsAnonymous`, `NotRecordIdentity`, `IsQuizMode` | cek perekaman identitas |
| `mfpBranchingData` | null = tanpa branching |
| `rowCount` | jumlah respon yang sudah masuk |
| `ownerId`, `ownerTenantId` | diagnostik |

Bentuk error yang harus dipetakan:

```
403 {"error":{"code":"5000","message":"This form is closed.",
     "@ms.form.error.type":"ExpectedFailure",
     "@ms.form.error.customizedMessage":"…pesan kustom pemilik form…"}}
  → errorFormNotPublished

Tidak ada "prefetchFormUrl" di HTML / dialihkan ke login.microsoftonline.com
  → errorFormRestricted  (form dikunci ke tenant; panelis Jakpat juga tak bisa mengisinya)
```

Tipe pertanyaan yang teramati: `Question.TextField`, `Question.Choice`,
`Question.MatrixChoice`, `Question.MatrixChoiceGroup`, `Question.Rating`,
`Question.DateTime`. Belum teramati tapi ada di produk: `Question.Likert`,
`Question.Ranking`, `Question.NetPromoterScore`, `Question.FileUpload` — masuk daftar
DIKENAL kalau sudah diverifikasi, sebelum itu biarkan memicu `unsupported_question_type`.

## B. Detektor `phone` versi baru (siap tempel)

```ts
const CHANNEL =
  '(?:telepon|telpon|telp|hp|handphone|hanphone|henpon|hanpon|hape|ponsel|seluler|whats\\s?app|wa|phone|mobile)';
const REQUESTER = '(?:nomor|nomer|no\\.?|number|kontak|contact)';
const ASK_VERB =
  '(?:tuliskan|masukkan|isikan|cantumkan|sertakan|berikan|input|enter|provide)';

/** Peminta berdampingan dengan kanal, di dalam kalimat apa pun. */
const PHONE_IN_SENTENCE = new RegExp(
  `\\b${REQUESTER}\\s*[.:/,-]?\\s*${CHANNEL}\\b` +      // "Nomor HP", "No. Telp"
  `|\\b${CHANNEL}\\s*[.:/,-]?\\s*${REQUESTER}\\b` +     // "Phone number", "WA number"
  `|\\b${ASK_VERB}\\b[^.?!]{0,25}?\\b${CHANNEL}\\b` +   // "Masukkan nomor WhatsApp Anda"
  `|\\b(?:yang\\s+)?(?:bisa|dapat)\\s+dihubungi\\b` +
  `|\\bnarahubung\\b` +
  `|\\bcontact\\s*(?:number|info|details?)\\b`,
  'i',
);

/** Judul yang isinya HANYA kanal — "HP/WA", "WhatsApp", "Telepon", "Whatsapp (aktif)". */
const PHONE_ONLY_TITLE = new RegExp(
  `^\\s*(?:${REQUESTER}\\s*[.:]?\\s*)?${CHANNEL}(?:\\s*[/,&|+-]\\s*${CHANNEL})*` +
  `\\s*[?:.]?\\s*(?:\\(.*\\))?\\s*$`,
  'i',
);

export function asksForPhoneNumber(questionTitle: string): boolean {
  const t = questionTitle.trim();
  return PHONE_IN_SENTENCE.test(t) || PHONE_ONLY_TITLE.test(t);
}
```

Yang **wajib** tetap terdeteksi (24/24 lulus): `Nomor HP` · `No. HP` · `No HP/WA` ·
`Nomor WhatsApp` · `Nomor Telepon` · `No Telp` · `Nomor handphone yang bisa dihubungi` ·
`Kontak WhatsApp` · `Masukkan nomor WhatsApp Anda` · `Silakan tuliskan nomor HP kamu` ·
`Nomor yang bisa dihubungi` · `Narahubung` · `Contact number` · `Phone number` ·
`Mobile number` · `No WA aktif` · `Nomor Ponsel` · `Berapa nomor WA kamu?` · `HP/WA` ·
`WhatsApp` · `Whatsapp (aktif)` · `Telepon` · `No Handphone / ID Line ? (Opsional)` ·
`Nomor Hp (Opsional, hanya untuk pengiriman reward)`

Yang **wajib** tidak terdeteksi (10/10 lulus): `13. Pencapaian brand hp saya membuat saya
terkesan dan bangga.` · `Saya menggunakan WhatsApp atau media sosial untuk berkomunikasi
dengan pelanggan.` · `Berapa lama anda menggunakan brand Hp tersebut` · `Seberapa sering
Anda menggunakan telepon genggam dalam sehari?` · `Apakah Anda memiliki HP pribadi?` ·
`Merek HP yang Anda gunakan saat ini` · `Saya merasa brand hp saya mencerminkan
kepribadian saya` · `Usaha batik saya konsisten membagikan konten digital di WA dan
Instagram` · `Aplikasi mobile mana yang paling sering Anda buka?` · `Bagaimana penilaian
Anda terhadap layanan customer service via WhatsApp?`

## C. Angka benchmark (dijalankan 26–27 Juli 2026)

**Microsoft Forms — 38 submission produksi**

- Terbaca anonim: 38/38. Gagal: 0. Dinding login: 0.
- Jumlah pertanyaan cocok dengan angka ketikan user: 38/38, setelah
  `Question.MatrixChoiceGroup` dikecualikan.
- Sebelum koreksi, selisihnya selalu tepat sama dengan jumlah `MatrixChoiceGroup`
  (+2 sampai +7).
- Komposisi tipe pada sampel: `MatrixChoice`, `MatrixChoiceGroup`, `Choice`, `TextField`.
  Nol branching, nol `FileUpload`, nol `Rating`.

**Google Forms — 34 baris, `question_count` OAuth sebagai ground truth**

| Hasil | Jumlah | Keterangan |
|---|---|---|
| Cocok persis | 26 | termasuk form 130/117/106/103 pertanyaan dengan sampai 28 page break |
| Meleset | 4 | tanpa grid/tipe ambigu; pola konsisten dengan form diedit pasca-submit |
| Tidak terekstrak | 4 | 1 privat (HTTP 401) + 3 memang ditutup — semuanya keputusan benar |

Bukti ground truth ikut bergeser: form `1FAIpQLSerSE0k0dQ…` tercatat **92** pertanyaan
(7 Apr) dan **91** (15 Apr) oleh API OAuth yang sama; pembacaan publik hari ini 92.

Celah `collectEmail`: 2 form positif vs 4 kontrol tidak menunjukkan field pembeda di
`FB_PUBLIC_LOAD_DATA_[1][10]`, dan tidak ada penanda teks di HTML awal. Muncul di 3 dari
34 baris.

**Detektor `phone` — 1.591 pertanyaan dari 25 form**

| | judul kena | form ter-flag |
|---|---|---|
| Regex sekarang | 53 | 6 |
| Regex usulan | 3 | 3 |

Kasus terburuk: `1HJ2pKvxsQdobWQSKdtxmv-SSFIcxuSxckjScelaB_ok` ("Hubungan Psikologis
antara Pemilik dan Brand Smartphone", 104 pertanyaan) kena 48 kali. Aturan judul-pendek
menambah 0 false positive di korpus nyata.

`email` di korpus yang sama kena 1 judul, dan judul itu false positive
(`"Penggunaan email meningkatkan efisiensi dan produktivitas kerja."`). `address`: 0.

## D. Kode acuan Google `FB_PUBLIC_LOAD_DATA_`

Diperlukan kalau jalur publik Google dibuka lagi, dan untuk memahami paritas hitungan.

```
Item: [itemId, title, description, type, [[questionId, options, required, …], …], …]
       item[4] berisi SATU entri per baris grid → baris grid terhitung satuan,
       sama dengan perlakuan questionGroupItem di jalur API.

Type: 0 isian pendek · 1 paragraf · 2 radio · 3 dropdown · 4 checkbox · 5 skala linear
      6 blok teks/section header · 7 grid · 8 page break · 9 tanggal · 10 waktu
      11 gambar · 12 video · 13 file upload · 18 rating (tipe baru)

Hitungan benar = Σ max(1, len(item[4])) untuk item dengan type ∉ {6, 8, 11, 12}
Judul form   = d[1][8]     Deskripsi = d[1][0]     requiresLogin = d[1][10][1]
```

Parser lama `filter(q => q[3] !== 8)` salah dua arah: menghitung blok teks/gambar/video,
dan menghitung grid sebagai 1.

## E. Cara mengulang benchmark

Semua angka di atas dihasilkan dari skrip Python sekali-pakai (urllib + regex, tanpa
dependensi) yang: mengambil daftar `survey_url` dari query di bagian bawah, mengambil tiap
form secara publik, mem-parsing, lalu membandingkan dengan `question_count` dan
`detected_keywords` di DB. Query pengambil sampelnya:

```sql
-- Ground truth Google (question_count = hasil Forms API lewat OAuth)
select id, created_at::date, submission_status, question_count, detected_keywords, survey_url
from form_submissions
where submission_method = 'google_import'
  and survey_url ilike '%docs.google.com/forms%'
  and coalesce(question_count, 0) > 0
order by created_at desc;

-- URL Microsoft Forms nyata (question_count diketik user, bukan ground truth)
select id, created_at::date, submission_status, question_count, survey_url
from form_submissions
where survey_url ~* 'forms\.(office\.com|cloud\.microsoft|microsoft\.com)'
order by created_at desc;

-- Ukuran dampak: komposisi platform di antrean review manual
select case
    when survey_url ~* 'docs\.google\.com/forms|forms\.gle' then 'Google Forms'
    when survey_url ~* 'forms\.(office\.com|cloud\.microsoft|microsoft\.com)' then 'Microsoft Forms'
    when survey_url ~* 'typeform\.com' then 'Typeform'
    when survey_url ~* 'jotform' then 'Jotform'
    when survey_url ~* 'surveymonkey' then 'SurveyMonkey'
    else 'Lainnya' end as platform,
  count(*) as jumlah
from form_submissions
where submission_method = 'manual'
group by 1 order by 2 desc;
```

Ulangi sebelum eksekusi kalau jaraknya sudah berbulan-bulan — form mahasiswa berubah dan
ditutup, jadi angka absolutnya akan bergeser meski kesimpulannya tidak.
