# Audit Sistem Email — Jakpat for Universities

Dokumen ini memuat hasil audit menyeluruh terhadap seluruh pengiriman email transaksional dan notifikasi otomatis di dalam repositori `jakpatforuniv`, baik yang ditujukan kepada **Peneliti (User)** maupun kepada **Admin (Tim Internal)**.

---

## Ringkasan Eksekutif & Matriks Email

Sistem memiliki satu gerbang pengiriman email transaksional terpusat (`functions/api/_mail.js`) yang mendukung multi-provider (Resend, Brevo, Cloudflare Email Sending) dengan fallback otomatis, serta modul bawaan Supabase Auth untuk manajemen akun.

### Matriks Pengiriman Email

| No | Nama Notifikasi | Target Penerima | Pemicu (Trigger) | Endpoint / File Implementasi | Subjek Email |
|:---|:---|:---|:---|:---|:---|
| 1 | **Submission Baru (Manual Review)** | Peneliti | Submit formulir order yang memerlukan review manual (`!autoApproval`) | [`MultiStepForm.tsx`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/src/components/MultiStepForm.tsx) → [`send-submission-email.js`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/functions/api/send-submission-email.js) | `Terima kasih telah submit Form Order Iklan di Jakpat for Universities 🙏` |
| 2a | **Hasil Review: Disetujui** | Peneliti | Admin menyetujui survei di tab Review | [`InternalDashboard.tsx`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/src/components/InternalDashboard.tsx) → [`notify-review-result.js`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/functions/api/notify-review-result.js) | `Kuesionermu disetujui — Jakpat for Universities` |
| 2b | **Hasil Review: Butuh Perbaikan** | Peneliti | Admin menolak kuesioner sementara / minta perbaikan | [`InternalDashboard.tsx`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/src/components/InternalDashboard.tsx) → [`notify-review-result.js`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/functions/api/notify-review-result.js) | `Kuesionermu menunggu perbaikan — Jakpat for Universities` |
| 2c | **Hasil Review: Dibatalkan Admin** | Peneliti | Admin membatalkan order kuesioner | [`InternalDashboard.tsx`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/src/components/InternalDashboard.tsx) → [`notify-review-result.js`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/functions/api/notify-review-result.js) | `Pesananmu dibatalkan — Jakpat for Universities` |
| 3a | **Tagihan Siap: Order Utama** | Peneliti | Admin mereservasi jadwal dan menerbitkan tagihan order pertama | [`InvoiceForm.tsx`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/src/components/schedule/InvoiceForm.tsx) → [`send-invoice-ready-email.js`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/functions/api/send-invoice-ready-email.js) | `Pesananmu disetujui, tagihan siap dibayar — Jakpat for Universities` |
| 3b | **Tagihan Siap: Perpanjangan** | Peneliti | Admin menerbitkan invoice perpanjangan jadwal (`variant: 'extension'`) | [`InvoiceForm.tsx`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/src/components/schedule/InvoiceForm.tsx) → [`send-invoice-ready-email.js`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/functions/api/send-invoice-ready-email.js) | `Tagihan jadwal iklan barumu siap dibayar — Jakpat for Universities` |
| 3c | **Tagihan Siap: Tagihan Gabungan (Bulk)** | Peneliti | Admin menerbitkan invoice borongan beberapa survei (`variant: 'bulk'`) | [`BulkInvoiceDialog.tsx`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/src/components/schedule/BulkInvoiceDialog.tsx) → [`send-invoice-ready-email.js`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/functions/api/send-invoice-ready-email.js) | `Tagihan gabungan iklan surveimu siap dibayar — Jakpat for Universities` |
| 4a | **Jadwal Tayang: Dibatalkan Tim** | Peneliti | Admin membatalkan slot jadwal tayang (`event: 'cancelled'`) | [`ScheduleForm.tsx`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/src/components/schedule/ScheduleForm.tsx) / [`SchedulePaymentTab.tsx`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/src/components/submissions/tabs/SchedulePaymentTab.tsx) → [`notify-schedule-change.js`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/functions/api/notify-schedule-change.js) | `Jadwal tayang iklanmu dibatalkan — Jakpat for Universities` |
| 4b | **Jadwal Tayang: Digeser Tim** | Peneliti | Admin menggeser tanggal mulai tayang (`event: 'moved'`) | [`ScheduleForm.tsx`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/src/components/schedule/ScheduleForm.tsx) → [`notify-schedule-change.js`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/functions/api/notify-schedule-change.js) | `Jadwal tayang iklanmu berubah — Jakpat for Universities` |
| 5 | **Iklan Mulai Ditayangkan (Live / Extension)** | Peneliti | `pg_cron` mendeteksi jam tayang tiba (per-jadwal: ordinal 1 & perpanjangan) | Supabase `pg_cron` (`sql/95`) → [`notify-ad-live.js`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/functions/api/notify-ad-live.js) | `[Jakpat for Univ] Iklan surveimu mulai tayang hari ini 🚀` / `[Jakpat for Univ] Iklan perpanjangan surveimu mulai tayang hari ini 🚀` |
| 6 | **Iklan Selesai Ditayangkan (Completed / Extension)** | Peneliti | `pg_cron` mendeteksi periode tayang selesai (per-jadwal: ordinal 1 & perpanjangan) | Supabase `pg_cron` (`sql/95`) → [`notify-ad-completed.js`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/functions/api/notify-ad-completed.js) | `[Jakpat for Univ] Survei Selesai! Waktunya Olah Data di JFU AI Analyzer 📊` / `[Jakpat for Univ] Periode Perpanjangan Selesai! Waktunya Olah Data di JFU AI Analyzer 📊` |
| 7 | **Reset Password Akun** | Peneliti | User meminta reset password di `/forgot-password` | [`ForgotPasswordPage.tsx`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/src/pages/ForgotPasswordPage.tsx) → Supabase Auth Mailer (`supabase.auth.resetPasswordForEmail`) | `Atur Ulang Password Akun Jakpat for Universities` |
| 8 | **Verifikasi Pendaftaran Akun** | Peneliti | User mendaftar akun baru dengan email/password di `/login` | [`LoginPage.tsx`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/src/pages/LoginPage.tsx) → Supabase Auth Mailer (`supabase.auth.signUp`) | Bawaan Supabase Auth (*Confirm Your Signup*) |
| 9 | **Kwitansi Pembayaran Berhasil (Receipt + PDF)** | Peneliti | Webhook DOKU berhasil memvalidasi pembayaran lunas (`outcome === 'ok'`) | [`webhook.js`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/functions/api/doku/webhook.js) → [`_payment-receipt.js`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/functions/api/doku/_payment-receipt.js) | `[Kwitansi] Pembayaran Berhasil — Jakpat for Universities ({invoiceNumber})` |
| 10 | **Alert Masalah Webhook Pembayaran** | Admin | Webhook DOKU gagal memproses pembayaran (`write_failed`, `amount_mismatch`, `no_submission_found`, `paid_on_dead_bill`) | [`functions/api/doku/webhook.js`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/functions/api/doku/webhook.js) → [`_webhook-alert.js`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/functions/api/doku/_webhook-alert.js) | `⚠️ Webhook DOKU: <Masalah> — <Nomor Invoice>` |

---

## Rincian dan Teks Lengkap Setiap Email

---

### 1. Email Konfirmasi Pengajuan Survei Baru (Jalur Review Manual)
- **Implementasi**: [`functions/api/send-submission-email.js`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/functions/api/send-submission-email.js)
- **Pemicu**: `MultiStepForm.tsx` (baris 354) sesudah user menekan submit dan kuesioner masuk jalur review manual (`!auto`).
- **Penerima**: Alamat email peneliti (`formData.email`).
- **Subjek**: `Terima kasih telah submit Form Order Iklan di Jakpat for Universities 🙏`

#### Teks Email:
```html
<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <p>Halo Kak <strong>{{name}}</strong>,</p>
  <p>Terima kasih telah submit Form Order Iklan di Jakpat for Universities 🙏</p>
  <p>Survei yang Kakak kirimkan akan kami review terlebih dahulu untuk memastikan sudah sesuai dengan ketentuan dan siap untuk diiklankan.</p>
  <p>Mohon kesediaannya untuk menunggu ya. Kami akan segera menghubungi Kakak kembali melalui e-mail setelah proses review selesai.</p>
  <p>Terima kasih atas kepercayaan Kakak kepada Jakpat for Universities.</p>
  <br>
  <p>Semoga kami bisa membantu kebutuhan riset Kakak dengan optimal 😊</p>
  <p>Salam,</p>
  <p><strong>Tim Jakpat for Universities</strong></p>
</div>
```

---

### 2. Email Hasil Review Kuesioner
- **Implementasi**: [`functions/api/notify-review-result.js`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/functions/api/notify-review-result.js)
- **Pemicu**: `InternalDashboard.tsx` (`notifyReviewResult`) saat status survei diubah oleh admin di dashboard.
- **Penerima**: Alamat email peneliti (`row.email` dibaca ulang langsung dari DB).
- **Pengamanan**: Server memverifikasi kecocokan status aktual di database, dan membatalkan pengiriman jika aksi pembatalan dilakukan sendiri oleh peneliti.

#### Varian 2a: Kuesioner Disetujui (`status === 'approved'`)
- **Subjek**: `Kuesionermu disetujui — Jakpat for Universities`
- **Teks Email**:
```html
<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <p>Halo Kak <strong>{{name}}</strong>,</p>
  <p>Kabar baik! Kuesionermu untuk survei <strong>{{title}}</strong> sudah selesai kami review dan <strong>disetujui</strong>.</p>
  <p>Jumlah pertanyaan yang kami catat: <strong>{{question_count}} pertanyaan</strong>.</p>
  <p>Berikutnya, <strong>tim kami yang akan menetapkan jadwal tayang</strong> lalu menerbitkan tagihannya. Kakak tidak perlu memilih jadwal sendiri — kami kabari lagi begitu tagihannya siap dibayar.</p>
  
  <!-- Blok Catatan Reviewer (jika ada) -->
  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin:16px 0;">
    <strong style="display:block;font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:#92400e;margin-bottom:4px;">Catatan dari Tim Reviewer</strong>
    <span style="white-space:pre-line;">{{admin_notes}}</span>
  </div>

  <br>
  <p>Kalau ada yang ingin ditanyakan, balas email ini atau hubungi tim kami lewat dashboard.</p>
  <p>Salam,</p>
  <p><strong>Tim Jakpat for Universities</strong></p>
</div>
```

#### Varian 2b: Kuesioner Menunggu Perbaikan (`status === 'rejected'`)
- **Subjek**: `Kuesionermu menunggu perbaikan — Jakpat for Universities`
- **Teks Email**:
```html
<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <p>Halo Kak <strong>{{name}}</strong>,</p>
  <p>Terima kasih sudah mengajukan kuesioner untuk survei <strong>{{title}}</strong> di Jakpat for Universities.</p>
  <p>Saat proses review, kami menemukan beberapa hal yang perlu diperbaiki lebih dulu. <strong>Ini bukan penolakan</strong> — begitu Kakak selesai memperbaikinya, kami review lagi.</p>
  
  <!-- Blok Catatan Reviewer -->
  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin:16px 0;">
    <strong style="display:block;font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:#92400e;margin-bottom:4px;">Catatan dari Tim Reviewer</strong>
    <span style="white-space:pre-line;">{{admin_notes}}</span>
  </div>

  <p>Silakan perbaiki kuesionernya, lalu buka dashboard dan klik tombol <strong>&ldquo;Saya Sudah Perbaiki Kuesioner&rdquo;</strong> agar dapat kami proses kembali.</p>
  <p style="margin:24px 0;">
    <a href="{{dashboardUrl}}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Buka Dashboard</a>
  </p>

  <br>
  <p>Kalau ada yang ingin ditanyakan, balas email ini atau hubungi tim kami lewat dashboard.</p>
  <p>Salam,</p>
  <p><strong>Tim Jakpat for Universities</strong></p>
</div>
```

#### Varian 2c: Pesanan Dibatalkan oleh Tim Admin (`status === 'cancelled'`)
- **Subjek**: `Pesananmu dibatalkan — Jakpat for Universities`
- **Teks Email**:
```html
<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <p>Halo Kak <strong>{{name}}</strong>,</p>
  <p>Kami mengabari bahwa pesanan untuk survei <strong>{{title}}</strong> telah <strong>dibatalkan</strong> dan tidak akan tayang.</p>
  
  <!-- Blok Catatan Reviewer (jika ada) -->
  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin:16px 0;">
    <strong style="display:block;font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:#92400e;margin-bottom:4px;">Catatan dari Tim Reviewer</strong>
    <span style="white-space:pre-line;">{{admin_notes}}</span>
  </div>

  <p>Tagihan yang mungkin sempat terbit untuk pesanan ini <strong>sudah tidak berlaku</strong> — mohon jangan membayar tautan pembayaran lama yang mungkin sudah Kakak terima.</p>
  <p>Kalau Kakak masih ingin mengiklankan survei ini, silakan buat pesanan baru dari dashboard.</p>
  <p style="margin:24px 0;">
    <a href="{{dashboardUrl}}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Buka Dashboard</a>
  </p>

  <br>
  <p>Kalau ada yang ingin ditanyakan, balas email ini atau hubungi tim kami lewat dashboard.</p>
  <p>Salam,</p>
  <p><strong>Tim Jakpat for Universities</strong></p>
</div>
```

---

### 3. Email Tagihan Siap Dibayar (Invoice Ready)
- **Implementasi**: [`functions/api/send-invoice-ready-email.js`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/functions/api/send-invoice-ready-email.js)
- **Pemicu**:
  1. [`InvoiceForm.tsx`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/src/components/schedule/InvoiceForm.tsx) saat admin menerbitkan tagihan satuan untuk order utama atau perpanjangan jadwal.
  2. [`BulkInvoiceDialog.tsx`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/src/components/schedule/BulkInvoiceDialog.tsx) saat admin menerbitkan invoice borongan (bulk/gabungan) untuk beberapa survei.
- **Penerima**: Email peneliti (`submission.researcherEmail` / `buyer.researcherEmail`).

#### Varian 3a: Order Utama (`variant === 'order'`)
- **Subjek**: `Pesananmu disetujui, tagihan siap dibayar — Jakpat for Universities`
- **Teks Email**:
```html
<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <p>Halo Kak <strong>{{name}}</strong>,</p>
  <p>Kabar baik! Pesananmu untuk survei <strong>{{title}}</strong> sudah kami periksa dan disetujui.</p>
  <p>Tim admin kami telah membantu mereservasi jadwal penayangan iklan surveimu dan tagihan resmi telah diterbitkan senilai <strong>Rp{{amount}}</strong>.</p>
  
  <!-- Detail Reservasi Jadwal -->
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:14px;">
    <strong>Detail Pesanan & Jadwal Reservasi:</strong>
    <ul style="margin:8px 0 0 0;padding-left:20px;">
      <li><strong>Judul Survei:</strong> {{title}}</li>
      <li><strong>Jadwal Tayang:</strong> {{airingStart}} s.d. {{airingEnd}}</li>
      <li><strong>Booking ID:</strong> #{{bookingId}}</li>
      <li><strong>Total Tagihan:</strong> Rp{{amount}}</li>
    </ul>
  </div>

  <p>Silakan selesaikan pembayaran untuk mengonfirmasi jadwal tayang tersebut agar slot iklanmu resmi terkunci di sistem.</p>
  <p style="margin: 24px 0;">
    <a href="{{invoiceUrl}}" style="background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
      Bayar Sekarang
    </a>
  </p>
  <p>Kalau tombolnya tidak muncul, salin tautan ini: <br><a href="{{invoiceUrl}}">{{invoiceUrl}}</a></p>

  <!-- Disclaimer Pembayaran -->
  <p style="font-size: 13px; color: #64748b; background: #f1f5f9; padding: 10px 14px; border-radius: 6px; border-left: 3px solid #94a3b8; margin: 16px 0;">
    💡 <strong>Catatan:</strong> Jika Kakak sudah menyelesaikan pembayaran, abaikan email tagihan ini. Status pembayaran akan otomatis terverifikasi di sistem kami.
  </p>
  <br>
  <p>Terima kasih atas kepercayaan Kakak kepada Jakpat for Universities.</p>
  <p>Salam,</p>
  <p><strong>Tim Jakpat for Universities</strong></p>
</div>
```

#### Varian 3b: Jadwal Perpanjangan (`variant === 'extension'`)
- **Subjek**: `Tagihan jadwal iklan barumu siap dibayar — Jakpat for Universities`
- **Teks Email**:
```html
<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <p>Halo Kak <strong>{{name}}</strong>,</p>
  <p>Jadwal iklan tambahan untuk survei <strong>{{title}}</strong> untuk tayang mulai <strong>{{airingText}}</strong> sudah kami siapkan.</p>
  <p>Tagihannya siap dibayar senilai <strong>Rp{{amount}}</strong>. Tanggal itu kami tahan untukmu sampai pembayarannya masuk — kalau lewat batas waktu, slotnya kembali terbuka untuk peneliti lain.</p>
  <p style="margin: 24px 0;">
    <a href="{{invoiceUrl}}" style="background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
      Bayar Sekarang
    </a>
  </p>
  <p>Kalau tombolnya tidak muncul, salin tautan ini: <br><a href="{{invoiceUrl}}">{{invoiceUrl}}</a></p>

  <!-- Disclaimer Pembayaran -->
  <p style="font-size: 13px; color: #64748b; background: #f1f5f9; padding: 10px 14px; border-radius: 6px; border-left: 3px solid #94a3b8; margin: 16px 0;">
    💡 <strong>Catatan:</strong> Jika Kakak sudah menyelesaikan pembayaran, abaikan email tagihan ini. Status pembayaran akan otomatis terverifikasi di sistem kami.
  </p>
  <br>
  <p>Terima kasih atas kepercayaan Kakak kepada Jakpat for Universities.</p>
  <p>Salam,</p>
  <p><strong>Tim Jakpat for Universities</strong></p>
</div>
```

#### Varian 3c: Tagihan Borongan / Gabungan (`variant === 'bulk'`)
- **Subjek**: `Tagihan gabungan iklan surveimu siap dibayar — Jakpat for Universities`
- **Teks Email**:
```html
<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <p>Halo Kak <strong>{{name}}</strong>,</p>
  <p>Kabar baik! Tim admin kami telah menyiapkan <strong>tagihan gabungan</strong> untuk {{itemsCount}} survei/jadwal iklan yang telah disetujui dan direservasi.</p>
  <p>Total tagihan borongan yang siap dibayar senilai <strong>Rp{{amount}}</strong>.</p>

  <!-- Rincian Daftar Survei & Jadwal -->
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:14px;">
    <strong>Rincian Pesanan & Jadwal yang Dipesan:</strong>
    <ul style="margin:8px 0 0 0;padding-left:20px;">
      {{#items}}
      <li style="margin-bottom:6px;">
        <strong>{{title}}</strong> ({{booking_id}})<br>
        <span style="color:#64748b;font-size:13px;">Jadwal: {{scheduleDate}} · Rp{{amount}}</span>
      </li>
      {{/items}}
    </ul>
  </div>

  <p>Silakan selesaikan pembayaran satu pintu melalui tautan di bawah ini untuk mengonfirmasi seluruh jadwal iklan tersebut:</p>
  <p style="margin: 24px 0;">
    <a href="{{invoiceUrl}}" style="background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
      Bayar Tagihan Gabungan
    </a>
  </p>
  <p>Kalau tombolnya tidak muncul, salin tautan ini: <br><a href="{{invoiceUrl}}">{{invoiceUrl}}</a></p>

  <!-- Disclaimer Pembayaran -->
  <p style="font-size: 13px; color: #64748b; background: #f1f5f9; padding: 10px 14px; border-radius: 6px; border-left: 3px solid #94a3b8; margin: 16px 0;">
    💡 <strong>Catatan:</strong> Jika Kakak sudah menyelesaikan pembayaran, abaikan email tagihan ini. Status pembayaran akan otomatis terverifikasi di sistem kami.
  </p>
  <br>
  <p>Terima kasih atas kepercayaan Kakak kepada Jakpat for Universities.</p>
  <p>Salam,</p>
  <p><strong>Tim Jakpat for Universities</strong></p>
</div>
```


---

### 4. Email Perubahan / Pembatalan Jadwal Tayang
- **Implementasi**: [`functions/api/notify-schedule-change.js`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/functions/api/notify-schedule-change.js)
- **Pemicu**: `ScheduleForm.tsx` & `SchedulePaymentTab.tsx` via `notifyScheduleChange()`.
- **Penerima**: Peneliti (`order.email` dari database).

#### Varian 4a: Jadwal Dibatalkan oleh Admin (`event === 'cancelled'`)
- **Subjek**: `Jadwal tayang iklanmu dibatalkan — Jakpat for Universities`
- **Teks Email**:
```html
<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <p>Halo Kak <strong>{{name}}</strong>,</p>
  <p>Kami mengabari bahwa <strong>tim Jakpat membatalkan jadwal tayang</strong> untuk survei <strong>{{title}}</strong> yang dijadwalkan <strong>{{when}}</strong>.</p>
  <p>Kuota tanggal itu sudah kami bebaskan. <strong>Kuesionermu tetap lolos review</strong> — yang batal hanya tanggalnya, bukan pesanannya, dan Kakak tidak perlu mengajukan ulang apa pun.</p>
  
  <!-- Blok peringatan jika BELUM lunas -->
  <p style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;">
    Kalau tagihan untuk tanggal ini sudah terlanjur Kakak terima, <strong>tagihan itu tidak berlaku lagi</strong> — <strong>jangan bayar link yang lama</strong>. Link pembayaran lama bisa saja masih terbuka, tapi uang yang masuk ke sana tidak otomatis menghidupkan jadwal yang sudah dibatalkan.
  </p>

  <p>Tim kami akan menghubungi Kakak untuk menetapkan tanggal penggantinya. Kalau butuh penjelasan lebih dulu, balas email ini atau chat Mimin lewat dashboard.</p>
  <p style="color:#6b7280;font-size:12px;">Booking ID: <strong>#{{booking_id}}</strong></p>
  <p style="margin:24px 0;">
    <a href="{{DASHBOARD_URL}}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Buka Dashboard</a>
  </p>
  <br>
  <p>Kalau ada yang ingin ditanyakan, balas email ini atau hubungi tim kami lewat dashboard.</p>
  <p>Salam,</p>
  <p><strong>Tim Jakpat for Universities</strong></p>
</div>
```

#### Varian 4b: Tanggal Jadwal Digeser oleh Admin (`event === 'moved'`)
- **Subjek**: `Jadwal tayang iklanmu berubah — Jakpat for Universities`
- **Teks Email**:
```html
<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <p>Halo Kak <strong>{{name}}</strong>,</p>
  <p>Jadwal tayang iklan untuk survei <strong>{{title}}</strong> baru saja <strong>kami ubah</strong>.</p>
  <p>Dari <strong>{{previousStart}}</strong> menjadi <strong>{{newStart}}</strong>.</p>
  
  <!-- Jika iklan sedang berstatus LIVE saat digeser -->
  <p style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;">
    <strong>Catatan:</strong> iklan ini sedang tayang saat jadwalnya kami ubah, jadi periode tayangnya ikut menyesuaikan.
  </p>

  <!-- Jika SUDAH lunas -->
  <p>Pesanan ini <strong>sudah dibayar</strong>, jadi tidak ada tagihan baru yang perlu Kakak selesaikan — jadwalnya saja yang bergeser.</p>
  <!-- ATAU jika BELUM lunas -->
  <!-- <p>Kalau tagihan untuk tanggal lama sudah terlanjur Kakak terima, <strong>tagihan itu tidak berlaku lagi</strong>. Tunggu tagihan pengganti dari kami — jangan bayar link yang lama.</p> -->

  <p style="color:#6b7280;font-size:12px;">Booking ID: <strong>#{{booking_id}}</strong></p>
  <p style="margin:24px 0;">
    <a href="{{DASHBOARD_URL}}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Buka Dashboard</a>
  </p>
  <br>
  <p>Kalau ada yang ingin ditanyakan, balas email ini atau hubungi tim kami lewat dashboard.</p>
  <p>Salam,</p>
  <p><strong>Tim Jakpat for Universities</strong></p>
</div>
```

---

### 5. Email Iklan Survei Mulai Ditayangkan (Ad Live)
- **Implementasi**: [`functions/api/notify-ad-live.js`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/functions/api/notify-ad-live.js)
- **Pemicu**: Cron job Supabase `notify-primary-ads-live` (berjalan tiap 15 menit via ekstensi `pg_cron` dan `pg_net` memanggil endpoint dengan secret token `?k=`). Kini diperluas via `sql/95` untuk memindai tabel `public.ad_schedules` per-jadwal (ordinal 1 s.d. n).
- **Penerima**: Alamat email peneliti (`email`).

#### Varian 5a: Jadwal Utama (`ordinal === 1`)
- **Subjek**: `[Jakpat for Univ] Iklan surveimu mulai tayang hari ini 🚀`
- **Headline**: `Iklan Survei Mulai Ditayangkan! 🚀`
- **Teks Utama**: `Kuesioner survei <strong>{{title}}</strong> sekarang sudah <strong>mulai aktif ditayangkan</strong> ke panel responden Jakpat.`

#### Varian 5b: Jadwal Perpanjangan (`ordinal > 1`)
- **Subjek**: `[Jakpat for Univ] Iklan perpanjangan surveimu mulai tayang hari ini 🚀`
- **Headline**: `Iklan Perpanjangan Survei Mulai Ditayangkan! 🚀`
- **Teks Utama**: `Jadwal perpanjangan survei <strong>{{title}}</strong> (Kode: <code>{{booking_id}}</code>) sekarang sudah <strong>mulai aktif ditayangkan</strong> ke panel responden Jakpat.`

#### Template Teks Email:
```html
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
  <div style="margin-bottom: 24px;">
    <span style="font-size: 13px; font-weight: 700; color: #4f46e5; letter-spacing: 0.5px; text-transform: uppercase;">Jakpat for Universities</span>
    <h2 style="margin: 6px 0 0; font-size: 20px; font-weight: 800; color: #0f172a;">{{headline}}</h2>
  </div>
  
  <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 16px;">
    Halo Kak <strong>{{name}}</strong>,
  </p>
  <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 16px;">
    {{leadText}}
  </p>
  
  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #4f46e5; border-radius: 8px; padding: 14px 16px; margin: 18px 0; font-size: 13px; color: #334155;">
    <p>Iklan tayang mulai <strong>{{startText}}</strong> pukul {{startTimeText}} WIB sampai <strong>{{endText}}</strong>.</p>
  </div>

  <!-- Teaser JFU AI Analyzer -->
  <div style="background: linear-gradient(135deg, #eef2ff 0%, #faf5ff 100%); border: 1px solid #c7d2fe; border-radius: 12px; padding: 18px; margin: 24px 0;">
    <div style="display: flex; align-items: center; margin-bottom: 8px;">
      <span style="font-size: 16px; margin-right: 6px;">💡</span>
      <strong style="font-size: 13px; color: #3730a3;">Tips Riset & Olah Data:</strong>
    </div>
    <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #4338ca;">
      Sambil menunggu respon terkumpul, ketahui bahwa setelah penayangan selesai nanti, Anda bisa langsung mengolah visualisasi grafik, tabulasi silang, dan draf narasi untuk <strong>skripsi, riset, maupun jurnal</strong> secara otomatis menggunakan <strong>JFU AI Analyzer</strong>.
    </p>
  </div>

  <div style="margin: 28px 0 20px; text-align: center;">
    <a href="https://submit.jakpatforuniv.com/dashboard" style="display: inline-block; background-color: #4f46e5; color: #ffffff; font-size: 13px; font-weight: 700; text-decoration: none; padding: 12px 24px; border-radius: 10px; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.2);">
      Pantau Status Penayangan &rarr;
    </a>
  </div>
  
  <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0 16px;" />
  <p style="font-size: 12px; color: #64748b; margin: 0; line-height: 1.5;">
    Semoga proses pengumpulan data berjalan lancar dan hasil riset optimal.<br>
    <strong>Tim Jakpat for Universities</strong>
  </p>
</div>
```

---

### 6. Email Iklan Selesai Ditayangkan (Ad Completed)
- **Implementasi**: [`functions/api/notify-ad-completed.js`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/functions/api/notify-ad-completed.js)
- **Pemicu**: Cron job Supabase `notify-primary-ads-completed` (dikonfigurasi di `sql/95_ad_schedules_notifications.sql`) via `pg_cron` dan `pg_net`. Memindai per-jadwal di `ad_schedules` (ordinal 1 s.d. n).
- **Penerima**: Alamat email peneliti (`email`).

#### Varian 6a: Jadwal Utama (`ordinal === 1`)
- **Subjek**: `[Jakpat for Univ] Survei Selesai! Waktunya Olah Data di JFU AI Analyzer 📊`
- **Headline**: `Survei Anda Telah Selesai Ditayangkan! 🎉`
- **Teks Utama**: `Periode penayangan iklan survei <strong>{{title}}</strong> telah <strong>resmi selesai</strong> dan responden Jakpat telah terkumpul.`

#### Varian 6b: Jadwal Perpanjangan (`ordinal > 1`)
- **Subjek**: `[Jakpat for Univ] Periode Perpanjangan Selesai! Waktunya Olah Data di JFU AI Analyzer 📊`
- **Headline**: `Periode Perpanjangan Selesai Ditayangkan! 🎉`
- **Teks Utama**: `Periode penayangan iklan perpanjangan survei <strong>{{title}}</strong> (Kode: <code>{{booking_id}}</code>) telah <strong>resmi selesai</strong> dan responden tambahan Jakpat telah terkumpul.`

#### Template Teks Email:
```html
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
  <div style="margin-bottom: 24px;">
    <span style="font-size: 13px; font-weight: 700; color: #4f46e5; letter-spacing: 0.5px; text-transform: uppercase;">Jakpat for Universities</span>
    <h2 style="margin: 6px 0 0; font-size: 20px; font-weight: 800; color: #0f172a;">{{headline}}</h2>
  </div>
  
  <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 16px;">
    Halo Kak <strong>{{name}}</strong>,
  </p>
  <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 16px;">
    {{leadText}}
  </p>

  <!-- Guide 3 Langkah -->
  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 20px 0;">
    <h3 style="margin: 0 0 14px; font-size: 14px; font-weight: 700; color: #1e293b;">Olah Data Respon Anda dalam 3 Langkah Mudah:</h3>
    
    <div style="margin-bottom: 12px; display: flex; align-items: flex-start;">
      <span style="display: inline-block; width: 22px; height: 22px; line-height: 22px; background-color: #4f46e5; color: #ffffff; border-radius: 50%; text-align: center; font-size: 12px; font-weight: bold; margin-right: 10px;">1</span>
      <span style="font-size: 13px; color: #334155; line-height: 1.5;"><strong>Download file CSV</strong> respon dari Google Form / platform kuesioner Anda.</span>
    </div>
    
    <div style="margin-bottom: 12px; display: flex; align-items: flex-start;">
      <span style="display: inline-block; width: 22px; height: 22px; line-height: 22px; background-color: #4f46e5; color: #ffffff; border-radius: 50%; text-align: center; font-size: 12px; font-weight: bold; margin-right: 10px;">2</span>
      <span style="font-size: 13px; color: #334155; line-height: 1.5;"><strong>Upload ke JFU AI Analyzer</strong> untuk memetakan grafik & tabulasi silang secara instan.</span>
    </div>
    
    <div style="display: flex; align-items: flex-start;">
      <span style="display: inline-block; width: 22px; height: 22px; line-height: 22px; background-color: #4f46e5; color: #ffffff; border-radius: 50%; text-align: center; font-size: 12px; font-weight: bold; margin-right: 10px;">3</span>
      <span style="font-size: 13px; color: #334155; line-height: 1.5;"><strong>Copy gambar & narasi akademik</strong> langsung ke Word / Google Docs untuk laporan riset atau skripsi.</span>
    </div>
  </div>

  <!-- CTA Button -->
  <div style="margin: 28px 0; text-align: center;">
    <a href="https://submit.jakpatforuniv.com/dashboard/analyzer/new" style="display: inline-block; background-color: #4f46e5; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 12px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);">
      🚀 Buka JFU AI Analyzer Sekarang &rarr;
    </a>
  </div>
  
  <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0 16px;" />
  <p style="font-size: 12px; color: #64748b; margin: 0; line-height: 1.5;">
    Terima kasih telah mempercayakan pengumpulan data responden kepada Jakpat for Universities.<br>
    <strong>Tim Jakpat for Universities</strong>
  </p>
</div>
```

---

### 7. Email Reset Password Akun (Supabase Recovery)
- **Implementasi**: Template HTML di [`supabase/templates/recovery.html`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/supabase/templates/recovery.html), dikonfigurasi di [`supabase/config.toml`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/supabase/config.toml).
- **Pemicu**: Peneliti meminta reset password dari form `/forgot-password`.
- **Penerima**: Email peneliti.
- **Subjek**: `Atur Ulang Password Akun Jakpat for Universities`

#### Teks Email:
```html
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f6f9;padding:32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
        <tr>
          <td style="background:#00bcd4;padding:28px 32px;text-align:center;">
            <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.02em;">Jakpat for Universities</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#111827;">Atur Ulang Password</h1>
            <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#4b5563;">
              Kami menerima permintaan untuk mengatur ulang password akunmu. Klik tombol di bawah
              untuk membuat password baru. Tautan ini berlaku sementara dan hanya bisa dipakai sekali.
            </p>
            <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto 24px;">
              <tr>
                <td align="center" style="border-radius:10px;background:#00bcd4;">
                  <a href="{{ .ConfirmationURL }}" target="_blank"
                     style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
                    Atur Password Baru
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#6b7280;">
              Kalau tombol tidak berfungsi, salin dan tempel tautan ini di browser:
            </p>
            <p style="margin:0 0 20px;font-size:12px;line-height:1.5;word-break:break-all;">
              <a href="{{ .ConfirmationURL }}" style="color:#00bcd4;">{{ .ConfirmationURL }}</a>
            </p>
            <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;border-top:1px solid #eef0f3;padding-top:16px;">
              Merasa tidak meminta ini? Abaikan saja email ini — password kamu tidak akan berubah.
              Butuh bantuan? Hubungi
              <a href="mailto:support@jakpatforuniv.com" style="color:#00bcd4;">support@jakpatforuniv.com</a>.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:18px 32px;text-align:center;">
            <span style="font-size:11px;color:#9ca3af;">© Jakpat for Universities</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

---

### 8. Email Verifikasi Pendaftaran Akun (Supabase Confirm Signup)
- **Implementasi**: Bawaan default Supabase Auth.
- **Pemicu**: Peneliti melakukan pendaftaran akun baru via email & password di `/login`.
- **Subjek Bawaan**: `Confirm Your Signup`
- **Teks Ringkasan**: Link konfirmasi email default yang disediakan platform Supabase Auth sebelum akun dapat digunakan secara penuh.

---

### 9. Email Kwitansi Pembayaran Berhasil (Payment Receipt + Lampiran PDF)
- **Implementasi**: [`functions/api/doku/_payment-receipt.js`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/functions/api/doku/_payment-receipt.js)
- **Pemicu**: `functions/api/doku/webhook.js` saat webhook DOKU berhasil memvalidasi pembayaran dan database diperbarui (`outcome === 'ok' && appStatus === 'completed'`).
- **Penerima**: Alamat email peneliti (`form_submissions.email`).
- **Subjek**: `[Kwitansi] Pembayaran Berhasil — Jakpat for Universities ({{invoiceNumber}})`
- **Lampiran**: File PDF Kwitansi resmi `Kwitansi-{{shortCode}}.pdf` (A4 PDF-1.4 murni yang di-generate langsung di Cloudflare Pages Functions).

#### Teks Email:
```html
<div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
  <div style="background: linear-gradient(135deg, #0066cc 0%, #004c99 100%); padding: 28px 24px; text-align: center; color: #ffffff;">
    <h1 style="margin: 0; font-size: 20px; font-weight: 700;">Jakpat for Universities</h1>
    <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">Bukti Pembayaran Berhasil (Kwitansi Resmi)</p>
  </div>

  <div style="padding: 24px;">
    <div style="text-align: center; margin-bottom: 20px;">
      <span style="display: inline-block; background-color: #dcfce7; color: #15803d; font-size: 12px; font-weight: 700; padding: 4px 14px; border-radius: 9999px;">
        ✓ Pembayaran Lunas
      </span>
    </div>

    <p style="font-size: 15px; color: #334155; margin: 0 0 16px 0;">Halo <strong>{{fullName}}</strong>,</p>
    <p style="font-size: 14px; color: #475569; margin: 0 0 20px 0;">
      Terima kasih! Pembayaran Anda telah berhasil kami terima dan diverifikasi oleh sistem. Berikut adalah rincian bukti pembayaran (Kwitansi) Anda:
    </p>

    <!-- Detail Kwitansi Box -->
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr><td style="padding: 4px 0; color: #64748b; width: 140px;">No. Kwitansi</td><td style="padding: 4px 0; font-weight: 600;">: {{docNumber}}</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">ID Tagihan</td><td style="padding: 4px 0; font-weight: 500;">: {{invoiceNumber}}</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">Waktu Pembayaran</td><td style="padding: 4px 0;">: {{paidAtFormatted}}</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">Metode Bayar</td><td style="padding: 4px 0;">: {{channelLabel}}</td></tr>
        <tr><td style="padding: 4px 0; color: #64748b;">Institusi / Kampus</td><td style="padding: 4px 0;">: {{university}}</td></tr>
      </table>
    </div>

    <!-- Tabel Rincian Pesanan -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
      <thead>
        <tr style="background-color: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
          <th style="padding: 8px 12px; font-size: 13px; text-align: left;">Rincian Pesanan</th>
          <th style="padding: 8px 12px; font-size: 13px; text-align: right;">Nominal</th>
        </tr>
      </thead>
      <tbody>
        {{#bundles}}
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 10px 12px; font-size: 14px;"><strong>{{title}}</strong><br><span style="font-size: 12px; color: #64748b;">Jadwal: {{scheduleStr}}</span></td>
          <td style="padding: 10px 12px; font-size: 14px; text-align: right; font-weight: 600;">{{amountFormatted}}</td>
        </tr>
        {{/bundles}}
        <tr><td style="padding: 8px 12px 4px; text-align: right;">Subtotal</td><td style="padding: 8px 12px 4px; text-align: right;">{{subtotalFormatted}}</td></tr>
        {{#ppnRow}}<tr><td style="padding: 6px 12px; text-align: right;">PPN (11%)</td><td style="padding: 6px 12px; text-align: right;">{{ppnFormatted}}</td></tr>{{/ppnRow}}
        <tr style="border-top: 1px solid #cbd5e1;">
          <td style="padding: 10px 12px; font-size: 15px; font-weight: 700; text-align: right;">Total Pembayaran</td>
          <td style="padding: 10px 12px; font-size: 16px; font-weight: 700; color: #0066cc; text-align: right;">{{totalFormatted}}</td>
        </tr>
      </tbody>
    </table>

    <div style="background-color: #eff6ff; border-left: 4px solid #0066cc; padding: 10px 14px; border-radius: 4px; font-size: 13px; color: #1e40af; margin-bottom: 24px;">
      <strong>Terbilang:</strong> <em>{{terbilangStr}}</em>
    </div>

    <div style="text-align: center; margin: 28px 0;">
      <a href="{{receiptUrl}}" style="display: inline-block; background-color: #0066cc; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 8px;">
        Buka Kwitansi Resmi Online →
      </a>
    </div>

    <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #475569; margin-bottom: 20px;">
      📎 <strong>Lampiran PDF:</strong> Berkas dokumen resmi Kwitansi (PDF) telah dilampirkan pada email ini untuk mempermudah laporan keuangan penelitian atau arsip Anda.
    </div>
  </div>
</div>
```

---

### 10. Email Alert Insiden Webhook DOKU (Khusus Admin)
- **Implementasi**: [`functions/api/doku/_webhook-alert.js`](file:///Users/jakpat/GarCode/jakpatforuniv/multi-step-form/functions/api/doku/_webhook-alert.js)
- **Pemicu**: `functions/api/doku/webhook.js` saat mendeteksi kegagalan rekonsiliasi atau pencatatan pembayaran:
  - `write_failed`: DB gagal menulis status pembayaran (pada percobaan pertama).
  - `amount_mismatch`: Nominal bayar di DOKU tidak sesuai dengan nominal invoice di sistem.
  - `no_submission_found`: Invoice yang dibayar di DOKU tidak terdaftar di `transactions` / `invoices`.
  - `paid_on_dead_bill`: Pembayaran masuk untuk tagihan yang sudah tidak berlaku (dibatalkan / kadaluwarsa).
- **Penerima**: Admin (`ADMIN_EMAILS` di environment, atau fallback ke `product@jakpat.net`).
- **Subjek**: `⚠️ Webhook DOKU: {{label}} — {{invoiceNumber}}`

#### Teks Email:
```html
<div style="font-family: Arial, sans-serif; line-height:1.6; color:#333; max-width:600px;">
  <p style="margin:0 0 16px;">
    Satu notifikasi pembayaran dari DOKU <strong>tidak selesai diproses</strong>.
    Pembayarannya kemungkinan sudah diterima DOKU, tapi status di dashboard admin
    belum tentu ikut berubah.
  </p>
  <table style="border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap;">Nomor invoice</td><td style="padding:6px 0;font-weight:600;">{{invoiceNumber}}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap;">Masalah</td><td style="padding:6px 0;font-weight:600;">{{label}}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap;">Jumlah</td><td style="padding:6px 0;font-weight:600;">{{amountText}}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap;">Status dari DOKU</td><td style="padding:6px 0;font-weight:600;">{{dokuStatus}}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap;">Channel</td><td style="padding:6px 0;font-weight:600;">{{paymentChannel}}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap;">Kita balas ke DOKU</td><td style="padding:6px 0;font-weight:600;">{{httpStatus}}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap;">Percobaan ke</td><td style="padding:6px 0;font-weight:600;">{{attempt}}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap;">Waktu (WIB)</td><td style="padding:6px 0;font-weight:600;">{{currentTime}}</td></tr>
  </table>

  <!-- Blok Pesan Error (jika ada) -->
  <p style="margin:16px 0 8px;color:#666;">Pesan error:</p>
  <pre style="background:#f4f4f5;border-radius:6px;padding:12px;font-size:12px;white-space:pre-wrap;word-break:break-word;">{{errorMessage}}</pre>

  <p style="margin:20px 0 8px;">Langkah pemulihan:</p>
  <ol style="margin:0;padding-left:20px;">
    {{advice}}
    <li>Setelah beres, buka <strong>Keuangan</strong> di dashboard admin dan klik
        <strong>Tandai selesai</strong> pada baris ini supaya banner-nya hilang.</li>
  </ol>
  <p style="margin:20px 0 0;color:#888;font-size:12px;">
    Email otomatis dari webhook DOKU jakpatforuniv-submit.
    Riwayat lengkapnya ada di tabel <code>doku_webhook_events</code>.
  </p>
</div>
```

---

## Rekap Audit & Status Implementasi Perbaikan

Semua temuan kritis dan perbaikan yang teridentifikasi dalam audit sistem email ini telah disetujui dan **SELESAI DIIMPLEMENTASIKAN SECARA LENGKAP**:

### 1. ✅ Penyelarasan Domain Dashboard (`submit.jakpatforuniv.com/dashboard`) [SELESAI]
- **Perubahan**:
  - `notify-review-result.js`: Diperbarui menjadi `https://submit.jakpatforuniv.com/dashboard`.
  - `notify-schedule-change.js`: Diperbarui menjadi `https://submit.jakpatforuniv.com/dashboard`.
- **Hasil**: Memperbaiki broken link / typo domain `jakpatforuniversities.com` yang sebelumnya dapat menyebabkan error DNS saat peneliti mengklik tombol CTA di email.

### 2. ✅ Perbaikan Kontradiksi Invoice Order Pertama & Detail Reservasi Admin [SELESAI]
- **Perubahan**:
  - Kalimat lama yang membingungkan (*"Setelah dibayar, kamu akan diarahkan memilih jadwal tayang iklanmu"*) telah dihapus.
  - Digantikan dengan konfirmasi bahwa admin telah membantu mereservasi jadwal penayangan, dilengkapi kotak rincian pesanan (*Judul Survei, Periode Tayang, Booking ID, dan Nominal Tagihan*).
  - Ditambahkan disclaimer pembayaran: *"💡 Catatan: Jika Kakak sudah menyelesaikan pembayaran, abaikan email tagihan ini. Status pembayaran akan otomatis terverifikasi di sistem kami."*
- **Hasil**: Peneliti menerima data jadwal yang jelas dan tidak ada kebingungan alur reservasi.

### 3. ✅ Varian Khusus Tagihan Massal / Borongan (`variant: 'bulk'`) [SELESAI]
- **Perubahan**:
  - `BulkInvoiceDialog.tsx` kini mengirimkan parameter `variant: 'bulk'` beserta array `items` (judul survei, booking ID, jadwal, dan nominal).
  - `send-invoice-ready-email.js` menyusun tabel rincian seluruh bundel survei/jadwal yang dipesan.
  - Dilengkapi disclaimer pembayaran yang sama agar peneliti tidak bingung jika sudah melunasi tagihan.
- **Hasil**: Peneliti yang memesan beberapa survei sekaligus menerima email borongan yang jelas dan profesional.

### 4. ✅ Label & Saran Mitigasi Lengkap untuk `paid_on_dead_bill` di Alert Webhook [SELESAI]
- **Perubahan**:
  - `_webhook-alert.js` ditambahkan entri resmi `paid_on_dead_bill`:
    - Label: `'Pembayaran masuk pada tagihan yang sudah tidak berlaku (batal/expired)'`
    - Saran: 3 langkah panduan rekonsiliasi spesifik (cek mutasi DOKU, koordinasi dengan peneliti apakah dialihkan ke jadwal baru atau refund, dan auto-resolve).
- **Hasil**: Admin yang menerima notifikasi darurat langsung memahami duduk perkara tanpa menebak-nebak kode error mentah.

### 5. ✅ Email Konfirmasi Pembayaran Sukses (Kwitansi) + Lampiran PDF [SELESAI]
- **Perubahan**:
  - `_mail.js` kini mendukung properti `attachments` untuk Resend dan Brevo.
  - Modul baru `functions/api/doku/_payment-receipt.js` menghasilkan dokumen PDF-1.4 Kwitansi resmi tanpa dependensi pihak ketiga, menyusun email tanda terima dengan status LUNAS, rincian biaya, terbilang rupiah, dan tombol verifikasi online.
  - `webhook.js` memicu pengiriman kwitansi secara non-blocking via `context.waitUntil(...)` begitu `outcome === 'ok' && appStatus === 'completed'`.
- **Hasil**: Peneliti otomatis mendapatkan bukti bayar resmi dan arsip PDF langsung di inbox mereka begitu pembayaran terverifikasi.

### 6. ✅ Notifikasi Mulai Tayang & Selesai untuk Jadwal Perpanjangan (Extension) [SELESAI]
- **Perubahan**:
  - Migrasi `sql/95_ad_schedules_notifications.sql` menambahkan kolom pelacak `live_notified_at` dan `completed_notified_at` pada `ad_schedules`, backfill data ordinal 1, dan memperbarui fungsi cron `notify_primary_ads_live()` & `notify_primary_ads_completed()` agar memindai seluruh jadwal (`ordinal 1..n`).
  - `notify-ad-live.js` dan `notify-ad-completed.js` kini menerima parameter `ordinal` dan menyesuaikan subjek serta copywriting khusus perpanjangan saat `ordinal > 1`.
- **Hasil**: Seluruh jadwal iklan (baik jadwal awal maupun perpanjangan yang tayang dengan jeda hari) mendapatkan notifikasi tayang dan selesai secara tepat waktu.
