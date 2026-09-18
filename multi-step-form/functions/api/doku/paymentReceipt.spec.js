import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateReceiptPdf,
  buildReceiptEmailHtml,
  sendPaymentReceipt,
  formatChannelLabel,
  terbilangCapitalized,
} from './_payment-receipt.js';

describe('formatChannelLabel & terbilangCapitalized', () => {
  it('memformat kode channel DOKU ke teks ramah pengguna', () => {
    expect(formatChannelLabel('VIRTUAL_ACCOUNT_BCA')).toBe('BCA Virtual Account');
    expect(formatChannelLabel('QRIS')).toBe('QRIS');
    expect(formatChannelLabel('EMONEY_OVO')).toBe('OVO');
    expect(formatChannelLabel(null)).toBe('DOKU Payment Gateway');
  });

  it('mengonversi angka rupiah ke teks terbilang yang benar', () => {
    expect(terbilangCapitalized(1500000)).toBe('Satu juta lima ratus ribu rupiah');
    expect(terbilangCapitalized(2220000)).toBe('Dua juta dua ratus dua puluh ribu rupiah');
    expect(terbilangCapitalized(0)).toBe('Nol rupiah');
  });
});

describe('generateReceiptPdf', () => {
  it('menghasilkan base64 PDF-1.4 yang valid dengan struktur standar', () => {
    const base64Pdf = generateReceiptPdf({
      docNumber: 'RCP-5C97C5',
      invoiceNumber: 'JFU-INV-5c97c5-1788158299791',
      paidAtFormatted: '18 Sep 2026, 09:00 WIB',
      fullName: 'Budi Santoso',
      university: 'Universitas Indonesia',
      bundles: [
        {
          title: 'Survei Preferensi Konsumen E-Commerce',
          scheduleStr: '20 Sep 2026 — 22 Sep 2026 (3 Hari)',
          amount: 2220000,
          subtotal: 2000000,
          ppn: 220000,
        },
      ],
      subtotal: 2000000,
      ppn: 220000,
      total: 2220000,
      channelLabel: 'QRIS',
      terbilangText: 'Dua juta dua ratus dua puluh ribu rupiah',
    });

    expect(typeof base64Pdf).toBe('string');
    expect(base64Pdf.length).toBeGreaterThan(100);

    // Decode base64 to check PDF markers
    const decoded = Buffer.from(base64Pdf, 'base64').toString('utf-8');
    expect(decoded.startsWith('%PDF-1.4')).toBe(true);
    expect(decoded.includes('%%EOF')).toBe(true);
    expect(decoded.includes('RCP-5C97C5')).toBe(true);
    expect(decoded.includes('Budi Santoso')).toBe(true);
    expect(decoded.includes('KWITANSI PEMBAYARAN')).toBe(true);
    expect(decoded.includes('LUNAS')).toBe(true);
  });
});

describe('buildReceiptEmailHtml', () => {
  it('menyusun email HTML dengan nomor kwitansi, rincian, dan link receipt online', () => {
    const html = buildReceiptEmailHtml({
      docNumber: 'RCP-5C97C5',
      invoiceNumber: 'JFU-INV-5c97c5-1788158299791',
      fullName: 'Siti Aminah',
      university: 'UGM',
      paidAtFormatted: '18 Sep 2026, 09:15 WIB',
      channelLabel: 'BCA Virtual Account',
      bundles: [
        {
          title: 'Riset Dampak AI pada Pembelajaran Mahasiswa',
          scheduleStr: '25 Sep 2026 — 27 Sep 2026 (3 Hari)',
          amount: 1500000,
        },
      ],
      subtotal: 1500000,
      ppn: 0,
      total: 1500000,
      receiptUrl: 'https://submit.jakpatforuniv.com/invoices/JFU-INV-5c97c5-1788158299791',
    });

    expect(html).toContain('RCP-5C97C5');
    expect(html).toContain('JFU-INV-5c97c5-1788158299791');
    expect(html).toContain('Siti Aminah');
    expect(html).toContain('UGM');
    expect(html).toContain('BCA Virtual Account');
    expect(html).toContain('Riset Dampak AI pada Pembelajaran Mahasiswa');
    expect(html).toContain('https://submit.jakpatforuniv.com/invoices/JFU-INV-5c97c5-1788158299791');
    expect(html).toContain('Kwitansi (PDF) telah dilampirkan');
  });
});

describe('sendPaymentReceipt', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mengirim email kwitansi dengan lampiran PDF ke peneliti saat data valid', async () => {
    const env = {
      VITE_SUPABASE_URL: 'https://mock.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
      MAIL_PROVIDER: 'brevo',
      BREVO_API_KEY: 'test-brevo-key',
    };

    // 1. Mock transactions query
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        {
          payment_id: 'JFU-INV-123456',
          amount: 1110000,
          subtotal: 1000000,
          ppn_amount: 110000,
          payment_channel: 'QRIS',
          form_submissions: {
            id: 'sub-1',
            title: 'Survei Skripsi Mahasiswa',
            full_name: 'Dewi Lestari',
            email: 'dewi@example.ac.id',
            university: 'Universitas Indonesia',
            start_date: '2026-09-20',
            end_date: '2026-09-22',
            duration: 3,
            distribution_type: 'regular',
          },
        },
      ],
    });

    // 2. Mock ad_schedules query
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        {
          source_id: 'sub-1',
          start_date: '2026-09-20',
          end_date: '2026-09-22',
          duration: 3,
          distribution_type: 'regular',
        },
      ],
    });

    // 3. Mock Brevo mail send
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ messageId: 'msg-receipt-1' }),
    });

    const res = await sendPaymentReceipt(env, {
      invoiceNumber: 'JFU-INV-123456',
      amount: 1110000,
      paymentChannel: 'QRIS',
    });

    expect(res.ok).toBe(true);
    expect(res.provider).toBe('brevo');

    // Cek bahwa panggilan ke provider memuat attachment PDF
    const brevoCall = fetchMock.mock.calls[2];
    const brevoBody = JSON.parse(brevoCall[1].body);
    expect(brevoBody.to).toEqual([{ email: 'dewi@example.ac.id' }]);
    expect(brevoBody.subject).toContain('[Kwitansi] Pembayaran Berhasil');
    expect(brevoBody.attachment).toHaveLength(1);
    expect(brevoBody.attachment[0].name).toContain('Kwitansi-');
    expect(brevoBody.attachment[0].name).toContain('.pdf');
  });

  it('tidak pernah melempar error jika database atau email gagal (fail-safe)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Koneksi putus'));

    const res = await sendPaymentReceipt(
      {
        VITE_SUPABASE_URL: 'https://mock.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'test-key',
      },
      { invoiceNumber: 'JFU-INV-999' }
    );

    expect(res.ok).toBe(false);
    expect(res.error).toBeDefined();
  });
});
