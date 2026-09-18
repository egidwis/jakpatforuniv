/**
 * Modul Pengiriman Email Konfirmasi Pembayaran (Kwitansi / Receipt)
 * ---------------------------------------------------------------
 * Dipanggil secara otomatis oleh webhook DOKU setelah status pembayaran
 * berhasil diverifikasi dan tercatat lunas di database (`outcome === 'ok'`).
 *
 * Fitur:
 * 1. Mengambil data transaksi, invoice, jadwal, dan form_submissions dari Supabase.
 * 2. Menghasilkan dokumen Kwitansi resmi dalam format PDF (A4 standar PDF-1.4 murni)
 *    sebagai lampiran base64 tanpa ketergantungan library eksternal.
 * 3. Menyusun email konfirmasi HTML yang elegan dan informatif.
 * 4. Mengirimkan email beserta lampiran PDF ke email peneliti via sendMail().
 * 5. Fail-safe: fungsi tidak pernah melempar error yang dapat mengganggu webhook DOKU.
 */

import { sendMail } from '../_mail.js';

const DEFAULT_ORIGIN = 'https://submit.jakpatforuniv.com';

function shortDocCode(paymentId) {
  const raw = (paymentId || '').trim();
  if (!raw) return 'XXXXXXXX';

  let rest = raw;
  for (const prefix of ['JFU-INV-', 'JFU-', 'sim_doku_', 'sim_']) {
    if (rest.toLowerCase().startsWith(prefix.toLowerCase())) {
      rest = rest.slice(prefix.length);
      break;
    }
  }

  const token = rest.split(/[-_]/).find((t) => t.length > 0) || '';
  const cleaned = token.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (cleaned) return cleaned.slice(0, 8);

  const fallback = raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return (fallback || 'XXXXXXXX').slice(0, 8);
}

function formatRupiah(amount) {
  return 'Rp ' + Number(amount || 0).toLocaleString('id-ID');
}

const SATUAN = [
  '', 'satu', 'dua', 'tiga', 'empat', 'lima',
  'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas',
];

function toWords(n) {
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${toWords(n - 10)} belas`;
  if (n < 100) {
    const rem = n % 10;
    return `${SATUAN[Math.floor(n / 10)]} puluh${rem ? ` ${toWords(rem)}` : ''}`;
  }
  if (n < 200) {
    const rem = n % 100;
    return `seratus${rem ? ` ${toWords(rem)}` : ''}`;
  }
  if (n < 1000) {
    const rem = n % 100;
    return `${SATUAN[Math.floor(n / 100)]} ratus${rem ? ` ${toWords(rem)}` : ''}`;
  }
  if (n < 2000) {
    const rem = n % 1000;
    return `seribu${rem ? ` ${toWords(rem)}` : ''}`;
  }
  if (n < 1_000_000) {
    const rem = n % 1000;
    return `${toWords(Math.floor(n / 1000))} ribu${rem ? ` ${toWords(rem)}` : ''}`;
  }
  if (n < 1_000_000_000) {
    const rem = n % 1_000_000;
    return `${toWords(Math.floor(n / 1_000_000))} juta${rem ? ` ${toWords(rem)}` : ''}`;
  }
  if (n < 1_000_000_000_000) {
    const rem = n % 1_000_000_000;
    return `${toWords(Math.floor(n / 1_000_000_000))} miliar${rem ? ` ${toWords(rem)}` : ''}`;
  }
  return `${n}`;
}

export function terbilangCapitalized(amount) {
  const n = Math.floor(Math.abs(amount || 0));
  if (n === 0) return 'Nol rupiah';
  const words = toWords(n).replace(/\s+/g, ' ').trim();
  return `${words.charAt(0).toUpperCase() + words.slice(1)} rupiah`;
}

export function formatChannelLabel(channel) {
  if (!channel) return 'DOKU Payment Gateway';
  const ch = String(channel).toUpperCase();
  if (ch.includes('QRIS')) return 'QRIS';
  if (ch.includes('BCA')) return 'BCA Virtual Account';
  if (ch.includes('MANDIRI')) return 'Mandiri Virtual Account';
  if (ch.includes('BRI')) return 'BRI Virtual Account';
  if (ch.includes('BNI')) return 'BNI Virtual Account';
  if (ch.includes('PERMATA')) return 'Permata Virtual Account';
  if (ch.includes('CIMB')) return 'CIMB Niaga Virtual Account';
  if (ch.includes('OVO')) return 'OVO';
  if (ch.includes('DANA')) return 'DANA';
  if (ch.includes('SHOPEE')) return 'ShopeePay';
  if (ch.includes('GOPAY')) return 'GoPay';
  if (ch.includes('CARD') || ch.includes('CREDIT')) return 'Kartu Kredit / Debit';
  return ch.replace(/_/g, ' ');
}

function formatDateIndo(dateInput) {
  if (!dateInput) return '-';
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTimeIndo(dateInput) {
  if (!dateInput) return '-';
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) + ' WIB';
}

function escapePdfText(str) {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, ' ');
}

/**
 * Generator PDF-1.4 murni tanpa dependensi eksternal.
 * Menghasilkan file PDF A4 (595.28 x 841.89 pt) dengan font Helvetica bawaan.
 */
export function generateReceiptPdf({
  docNumber,
  invoiceNumber,
  paidAtFormatted,
  fullName,
  university,
  bundles,
  subtotal,
  ppn,
  total,
  channelLabel,
  terbilangText,
}) {
  let stream = '';

  // Background header band (Jakpat Blue)
  stream += '0.0 0.4 0.8 rg\n';
  stream += '40 760 515 45 re f\n';

  // Header text inside band (White)
  stream += '1.0 1.0 1.0 rg\n';
  stream += 'BT /F2 16 Tf 55 785 Td (JAKPAT FOR UNIVERSITIES) Tj ET\n';
  stream += 'BT /F1 9 Tf 55 770 Td (Platform Survei Akademik & Riset Mahasiswa / Dosen) Tj ET\n';

  // Title & Status Badge
  stream += '0.1 0.1 0.1 rg\n';
  stream += 'BT /F2 14 Tf 40 725 Td (KWITANSI PEMBAYARAN) Tj ET\n';

  // LUNAS Badge
  stream += '0.13 0.65 0.35 rg\n'; // Green fill
  stream += '475 720 80 20 re f\n';
  stream += '1.0 1.0 1.0 rg\n';
  stream += 'BT /F2 10 Tf 498 726 Td (LUNAS) Tj ET\n';

  // Metadata Box (Border & labels)
  stream += '0.85 0.85 0.85 RG 1 w\n';
  stream += '40 620 515 85 re S\n';

  stream += '0.3 0.3 0.3 rg\n';
  stream += 'BT /F2 9 Tf 50 685 Td (No. Kwitansi:) Tj ET\n';
  stream += `BT /F1 9 Tf 130 685 Td (${escapePdfText(docNumber)}) Tj ET\n`;

  stream += 'BT /F2 9 Tf 50 665 Td (No. Tagihan:) Tj ET\n';
  stream += `BT /F1 9 Tf 130 665 Td (${escapePdfText(invoiceNumber)}) Tj ET\n`;

  stream += 'BT /F2 9 Tf 50 645 Td (Tanggal Bayar:) Tj ET\n';
  stream += `BT /F1 9 Tf 130 645 Td (${escapePdfText(paidAtFormatted)}) Tj ET\n`;

  stream += 'BT /F2 9 Tf 50 628 Td (Metode Bayar:) Tj ET\n';
  stream += `BT /F1 9 Tf 130 628 Td (${escapePdfText(channelLabel)}) Tj ET\n`;

  stream += 'BT /F2 9 Tf 320 685 Td (Diterima Dari:) Tj ET\n';
  stream += `BT /F1 9 Tf 395 685 Td (${escapePdfText(fullName)}) Tj ET\n`;

  stream += 'BT /F2 9 Tf 320 665 Td (Institusi:) Tj ET\n';
  stream += `BT /F1 9 Tf 395 665 Td (${escapePdfText(university || '-')}) Tj ET\n`;

  stream += 'BT /F2 9 Tf 320 645 Td (Status:) Tj ET\n';
  stream += 'BT /F2 9 Tf 395 645 Td (Pembayaran Berhasil) Tj ET\n';

  // Table header
  stream += '0.94 0.96 0.98 rg\n';
  stream += '40 580 515 22 re f\n';
  stream += '0.85 0.85 0.85 RG 1 w\n';
  stream += '40 580 515 22 re S\n';

  stream += '0.2 0.2 0.2 rg\n';
  stream += 'BT /F2 9 Tf 50 587 Td (No) Tj ET\n';
  stream += 'BT /F2 9 Tf 80 587 Td (Deskripsi Pesanan / Survei) Tj ET\n';
  stream += 'BT /F2 9 Tf 330 587 Td (Jadwal Tayang) Tj ET\n';
  stream += 'BT /F2 9 Tf 470 587 Td (Nominal) Tj ET\n';

  let currentY = 555;
  bundles.forEach((b, idx) => {
    stream += '0.2 0.2 0.2 rg\n';
    stream += `BT /F1 9 Tf 50 ${currentY} Td (${idx + 1}) Tj ET\n`;
    stream += `BT /F2 9 Tf 80 ${currentY} Td (${escapePdfText(b.title.slice(0, 38))}) Tj ET\n`;
    stream += `BT /F1 8 Tf 330 ${currentY} Td (${escapePdfText(b.scheduleStr)}) Tj ET\n`;
    stream += `BT /F1 9 Tf 470 ${currentY} Td (${escapePdfText(formatRupiah(b.amount))}) Tj ET\n`;

    // Item line separator
    currentY -= 12;
    stream += '0.9 0.9 0.9 RG 0.5 w\n';
    stream += `40 ${currentY} m 555 ${currentY} l S\n`;
    currentY -= 15;
  });

  // Summary box
  const summaryY = Math.min(currentY - 10, 480);
  stream += '0.85 0.85 0.85 RG 1 w\n';
  stream += `320 ${summaryY - 65} 235 75 re S\n`;

  stream += '0.3 0.3 0.3 rg\n';
  stream += `BT /F1 9 Tf 335 ${summaryY - 12} Td (Subtotal:) Tj ET\n`;
  stream += `BT /F1 9 Tf 460 ${summaryY - 12} Td (${escapePdfText(formatRupiah(subtotal))}) Tj ET\n`;

  if (ppn > 0) {
    stream += `BT /F1 9 Tf 335 ${summaryY - 28} Td (PPN (11%):) Tj ET\n`;
    stream += `BT /F1 9 Tf 460 ${summaryY - 28} Td (${escapePdfText(formatRupiah(ppn))}) Tj ET\n`;
  }

  stream += '0.0 0.4 0.8 rg\n';
  stream += `BT /F2 11 Tf 335 ${summaryY - 50} Td (TOTAL BAYAR:) Tj ET\n`;
  stream += `BT /F2 11 Tf 450 ${summaryY - 50} Td (${escapePdfText(formatRupiah(total))}) Tj ET\n`;

  // Terbilang box
  stream += '0.96 0.97 0.99 rg\n';
  stream += `40 ${summaryY - 65} 265 75 re f\n`;
  stream += '0.85 0.85 0.85 RG 1 w\n';
  stream += `40 ${summaryY - 65} 265 75 re S\n`;

  stream += '0.3 0.3 0.3 rg\n';
  stream += `BT /F2 8 Tf 50 ${summaryY - 15} Td (Terbilang:) Tj ET\n`;
  stream += `BT /F1 8 Tf 50 ${summaryY - 32} Td (${escapePdfText(terbilangText.slice(0, 48))}) Tj ET\n`;
  if (terbilangText.length > 48) {
    stream += `BT /F1 8 Tf 50 ${summaryY - 45} Td (${escapePdfText(terbilangText.slice(48, 96))}) Tj ET\n`;
  }

  // Footer / Verification Notice
  const footerY = 120;
  stream += '0.9 0.9 0.9 RG 1 w\n';
  stream += `40 ${footerY + 25} m 555 ${footerY + 25} l S\n`;

  stream += '0.4 0.4 0.4 rg\n';
  stream += `BT /F2 8 Tf 40 ${footerY + 12} Td (Catatan:) Tj ET\n`;
  stream += `BT /F1 8 Tf 40 ${footerY} Td (Kwitansi ini merupakan bukti pembayaran yang sah dan diterbitkan otomatis oleh sistem komputer.) Tj ET\n`;
  stream += `BT /F1 8 Tf 40 ${footerY - 12} Td (Verifikasi dokumen online: ${escapePdfText(DEFAULT_ORIGIN)}/invoices/${escapePdfText(invoiceNumber)}) Tj ET\n`;
  stream += `BT /F1 8 Tf 40 ${footerY - 24} Td (PT Jakpat Sumber Utama - Jakpat for Universities) Tj ET\n`;

  // PDF Objects
  const obj1 = '<< /Type /Catalog /Pages 2 0 R >>';
  const obj2 = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  const obj3 = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`;
  const obj4 = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  const obj5 = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
  const obj6 = `<< /Length ${stream.length} >>\nstream\n${stream}endstream`;

  const objects = [obj1, obj2, obj3, obj4, obj5, obj6];

  let pdfText = '%PDF-1.4\n';
  const offsets = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdfText.length);
    pdfText += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = pdfText.length;
  pdfText += `xref\n0 ${objects.length + 1}\n`;
  pdfText += '0000000000 65535 f \n';
  for (const offset of offsets) {
    pdfText += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdfText += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdfText += `startxref\n${xrefOffset}\n%%EOF\n`;

  // Encode to Base64
  let binary = '';
  for (let i = 0; i < pdfText.length; i++) {
    binary += String.fromCharCode(pdfText.charCodeAt(i) & 0xff);
  }

  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(binary, 'binary').toString('base64');
  }
  return '';
}

/**
 * Susun HTML email kuitansi pembayaran.
 */
export function buildReceiptEmailHtml({
  docNumber,
  invoiceNumber,
  fullName,
  university,
  paidAtFormatted,
  channelLabel,
  bundles,
  subtotal,
  ppn,
  total,
  receiptUrl,
}) {
  const terbilangStr = terbilangCapitalized(total);

  const bundleRowsHtml = bundles
    .map(
      (b, idx) => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 12px; font-size: 14px; color: #1e293b;">
          <strong>${idx + 1}. ${escapeHtml(b.title)}</strong><br>
          <span style="font-size: 12px; color: #64748b;">Jadwal: ${escapeHtml(b.scheduleStr)}</span>
        </td>
        <td style="padding: 10px 12px; font-size: 14px; text-align: right; color: #1e293b; font-weight: 600; white-space: nowrap;">
          ${formatRupiah(b.amount)}
        </td>
      </tr>`
    )
    .join('');

  const ppnRowHtml =
    ppn > 0
      ? `
      <tr>
        <td style="padding: 6px 12px; font-size: 13px; color: #64748b; text-align: right;">PPN (11%)</td>
        <td style="padding: 6px 12px; font-size: 13px; color: #1e293b; text-align: right; font-weight: 500;">${formatRupiah(ppn)}</td>
      </tr>`
      : '';

  return `
  <div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #0066cc 0%, #004c99 100%); padding: 28px 24px; text-align: center; color: #ffffff;">
      <h1 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.01em;">Jakpat for Universities</h1>
      <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">Bukti Pembayaran Berhasil (Kwitansi Resmi)</p>
    </div>

    <!-- Body -->
    <div style="padding: 24px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <span style="display: inline-block; background-color: #dcfce7; color: #15803d; font-size: 12px; font-weight: 700; padding: 4px 14px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em;">
          ✓ Pembayaran Lunas
        </span>
      </div>

      <p style="font-size: 15px; color: #334155; margin: 0 0 16px 0; line-height: 1.6;">
        Halo <strong>${escapeHtml(fullName)}</strong>,
      </p>

      <p style="font-size: 14px; color: #475569; margin: 0 0 20px 0; line-height: 1.6;">
        Terima kasih! Pembayaran Anda telah berhasil kami terima dan diverifikasi oleh sistem. Berikut adalah rincian bukti pembayaran (Kwitansi) Anda:
      </p>

      <!-- Detail Kwitansi Box -->
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 4px 0; color: #64748b; width: 140px;">No. Kwitansi</td>
            <td style="padding: 4px 0; color: #0f172a; font-weight: 600;">: ${escapeHtml(docNumber)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #64748b;">ID Tagihan</td>
            <td style="padding: 4px 0; color: #0f172a; font-weight: 500;">: ${escapeHtml(invoiceNumber)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #64748b;">Waktu Pembayaran</td>
            <td style="padding: 4px 0; color: #0f172a;">: ${escapeHtml(paidAtFormatted)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #64748b;">Metode Bayar</td>
            <td style="padding: 4px 0; color: #0f172a;">: ${escapeHtml(channelLabel)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #64748b;">Institusi / Kampus</td>
            <td style="padding: 4px 0; color: #0f172a;">: ${escapeHtml(university || '-')}</td>
          </tr>
        </table>
      </div>

      <!-- Tabel Rincian Pesanan -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
        <thead>
          <tr style="background-color: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
            <th style="padding: 8px 12px; font-size: 13px; text-align: left; color: #334155; font-weight: 600;">Rincian Pesanan</th>
            <th style="padding: 8px 12px; font-size: 13px; text-align: right; color: #334155; font-weight: 600; width: 120px;">Nominal</th>
          </tr>
        </thead>
        <tbody>
          ${bundleRowsHtml}
          <tr>
            <td style="padding: 8px 12px 4px; font-size: 13px; color: #64748b; text-align: right;">Subtotal</td>
            <td style="padding: 8px 12px 4px; font-size: 13px; color: #1e293b; text-align: right; font-weight: 500;">${formatRupiah(subtotal)}</td>
          </tr>
          ${ppnRowHtml}
          <tr style="border-top: 1px solid #cbd5e1;">
            <td style="padding: 10px 12px; font-size: 15px; color: #0f172a; text-align: right; font-weight: 700;">Total Pembayaran</td>
            <td style="padding: 10px 12px; font-size: 16px; color: #0066cc; text-align: right; font-weight: 700;">${formatRupiah(total)}</td>
          </tr>
        </tbody>
      </table>

      <!-- Terbilang Box -->
      <div style="background-color: #eff6ff; border-left: 4px solid #0066cc; padding: 10px 14px; border-radius: 4px; font-size: 13px; color: #1e40af; margin-bottom: 24px;">
        <strong>Terbilang:</strong> <em>${escapeHtml(terbilangStr)}</em>
      </div>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 28px 0;">
        <a href="${escapeHtml(receiptUrl)}" style="display: inline-block; background-color: #0066cc; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,102,204,0.2);">
          Buka Kwitansi Resmi Online →
        </a>
      </div>

      <!-- Attachment notice -->
      <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #475569; margin-bottom: 20px;">
        📎 <strong>Lampiran PDF:</strong> Berkas dokumen resmi Kwitansi (PDF) telah dilampirkan pada email ini untuk mempermudah laporan keuangan penelitian atau arsip Anda.
      </div>

      <p style="font-size: 13px; color: #64748b; margin: 0; line-height: 1.6;">
        Jika Anda memiliki pertanyaan seputar jadwal penayangan iklan survei atau bantuan teknis, silakan balas email ini atau hubungi Customer Support kami.
      </p>
    </div>

    <!-- Footer -->
    <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8;">
      Jakpat for Universities • PT Jakpat Sumber Utama<br>
      Email ini dikirimkan secara otomatis sebagai tanda bukti penerimaan pembayaran yang sah.
    </div>
  </div>`;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Pemicu utama pengiriman email kwitansi pembayaran dari Webhook DOKU.
 *
 * @param {Record<string, string|undefined>} env
 * @param {{ invoiceNumber: string, amount: number|string, paymentChannel?: string }} payload
 */
export async function sendPaymentReceipt(env, { invoiceNumber, amount, paymentChannel }) {
  if (!invoiceNumber) {
    return { ok: false, error: 'invoiceNumber kosong' };
  }

  try {
    const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.warn('[Receipt] Kredensial Supabase tidak lengkap — batal mengirim email kuitansi');
      return { ok: false, error: 'Supabase credentials missing' };
    }

    const headers = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    };

    // 1. Ambil baris transactions yang cocok
    const encoded = encodeURIComponent(invoiceNumber);
    const txnRes = await fetch(
      `${url}/rest/v1/transactions?payment_id=eq.${encoded}&select=*,form_submissions(*)&order=created_at.asc`,
      { headers }
    );
    let txnRows = txnRes.ok ? await txnRes.json() : [];

    // Fallback: Jika tidak ada di transactions, cek invoices
    let invRow = null;
    if (!Array.isArray(txnRows) || txnRows.length === 0) {
      const invRes = await fetch(
        `${url}/rest/v1/invoices?payment_id=eq.${encoded}&select=*,form_submissions(*)`,
        { headers }
      );
      if (invRes.ok) {
        const rows = await invRes.json();
        invRow = rows?.[0] || null;
      }
    }

    // Ambil data submission utama
    const primarySubmission =
      txnRows[0]?.form_submissions || invRow?.form_submissions || null;

    if (!primarySubmission || !primarySubmission.email) {
      console.warn(`[Receipt] Penerima email tidak ditemukan untuk tagihan ${invoiceNumber}`);
      return { ok: false, error: 'Recipient email not found' };
    }

    // Ambil detail jadwal dari ad_schedules jika ada
    const scheduleMap = new Map();
    const sourceIds = (txnRows.length > 0 ? txnRows : [invRow])
      .filter(Boolean)
      .map((r) => r.extend_id || r.form_submission_id || primarySubmission.id)
      .filter(Boolean);

    if (sourceIds.length > 0) {
      try {
        const schedRes = await fetch(
          `${url}/rest/v1/ad_schedules?source_id=in.(${sourceIds.map((s) => `"${encodeURIComponent(s)}"`).join(',')})&select=source_id,start_date,end_date,duration,distribution_type`,
          { headers }
        );
        if (schedRes.ok) {
          const schedRows = await schedRes.json();
          for (const s of schedRows || []) {
            scheduleMap.set(s.source_id, s);
          }
        }
      } catch (e) {
        console.warn('[Receipt] Gagal memuat ad_schedules:', e);
      }
    }

    // Susun rincian bundles
    const rowsToProcess = txnRows.length > 0 ? txnRows : [invRow];
    let calculatedSubtotal = 0;
    let calculatedPpn = 0;
    let calculatedTotal = 0;

    const bundles = rowsToProcess.map((r) => {
      const sub = r.form_submissions || primarySubmission;
      const sourceId = r.extend_id || r.form_submission_id || sub?.id;
      const sched = scheduleMap.get(sourceId);

      const start = sched?.start_date || r.billed_start_date || sub?.start_date;
      const end = sched?.end_date || sub?.end_date;
      const dur = sched?.duration || sub?.duration || 1;
      const dist = sched?.distribution_type || sub?.distribution_type || 'regular';

      let scheduleStr = 'Belum dijadwalkan';
      if (start && end) {
        scheduleStr = `${formatDateIndo(start)} — ${formatDateIndo(end)} (${dur} Hari)`;
      } else if (start) {
        scheduleStr = `${formatDateIndo(start)} (${dur} Hari)`;
      }
      if (dist === 'kilat') {
        scheduleStr += ' (Kilat)';
      }

      const rowAmount = Number(r.amount || 0);
      const rowSubtotal = Number(r.subtotal ?? (rowAmount - Number(r.ppn_amount || 0)));
      const rowPpn = Number(r.ppn_amount || 0);

      calculatedSubtotal += rowSubtotal;
      calculatedPpn += rowPpn;
      calculatedTotal += rowAmount;

      return {
        title: sub?.title || 'Survei Peneliti',
        scheduleStr,
        amount: rowAmount,
        subtotal: rowSubtotal,
        ppn: rowPpn,
      };
    });

    const finalTotal = calculatedTotal > 0 ? calculatedTotal : Number(amount || 0);
    const finalSubtotal = calculatedSubtotal > 0 ? calculatedSubtotal : finalTotal;
    const finalPpn = calculatedPpn;

    const docCode = `RCP-${shortDocCode(invoiceNumber)}`;
    const paidAtFormatted = formatDateTimeIndo(new Date());
    const channelLabel = formatChannelLabel(paymentChannel || txnRows[0]?.payment_channel);
    const terbilangText = terbilangCapitalized(finalTotal);
    const receiptUrl = `${DEFAULT_ORIGIN}/invoices/${encodeURIComponent(invoiceNumber)}`;

    // Generate Base64 PDF
    let pdfBase64 = '';
    try {
      pdfBase64 = generateReceiptPdf({
        docNumber: docCode,
        invoiceNumber,
        paidAtFormatted,
        fullName: primarySubmission.full_name || 'Peneliti',
        university: primarySubmission.university || '',
        bundles,
        subtotal: finalSubtotal,
        ppn: finalPpn,
        total: finalTotal,
        channelLabel,
        terbilangText,
      });
    } catch (pdfErr) {
      console.error('[Receipt] Gagal menghasilkan PDF kuitansi:', pdfErr);
    }

    // Susun Email HTML
    const emailHtml = buildReceiptEmailHtml({
      docNumber: docCode,
      invoiceNumber,
      fullName: primarySubmission.full_name || 'Peneliti',
      university: primarySubmission.university || '',
      paidAtFormatted,
      channelLabel,
      bundles,
      subtotal: finalSubtotal,
      ppn: finalPpn,
      total: finalTotal,
      receiptUrl,
    });

    const attachments = [];
    if (pdfBase64) {
      attachments.push({
        filename: `Kwitansi-${shortDocCode(invoiceNumber)}.pdf`,
        content: pdfBase64,
      });
    }

    const mailRes = await sendMail(env, {
      to: primarySubmission.email,
      subject: `[Kwitansi] Pembayaran Berhasil — Jakpat for Universities (${invoiceNumber})`,
      html: emailHtml,
      attachments,
    });

    console.log(
      `[Receipt] Email kuitansi ${invoiceNumber} terkirim ke ${primarySubmission.email}: ok=${mailRes.ok}, provider=${mailRes.provider}`
    );

    return mailRes;
  } catch (err) {
    console.error(`[Receipt] Exception saat mengirim email kuitansi ${invoiceNumber}:`, err);
    return { ok: false, error: err?.message || String(err) };
  }
}
