import type { InvoiceGroup } from '@/utils/supabase';

/**
 * Apa yang perlu diketahui SATU kartu jadwal tentang tagihan gabungan yang
 * menaunginya — atau `null` kalau tagihannya cuma miliknya sendiri.
 *
 * ⚠️ INI PENUTUP CACAT A1, DAN CACATNYA SOAL UANG. Sebelum ini kartu peneliti
 * memakai porsi jadwalnya sendiri (`first.totalCost` untuk ordinal 1,
 * `b.billed` untuk ordinal ≥2) sebagai nominal di sebelah tombol "Bayar
 * Sekarang" — sementara `payUrl` yang dibukanya adalah link DOKU GRUP. Untuk
 * grup 3 pesanan @Rp 1,11jt peneliti membaca tiga kali Rp 1.110.000 lalu
 * mendarat di halaman yang menagih Rp 3.330.000, dan tidak ada satu kata pun di
 * sisi peneliti yang menyebut "gabungan".
 *
 * Aturannya, dan ketiganya mengikat:
 *
 *   1. `total` yang dipajang di tombol adalah Σ porsi SELURUH anggota — jangan
 *      pernah porsi satu jadwal, dan jangan pernah satu porsi dikali N (PPN 11%
 *      dibulatkan per baris: `Σ round(sᵢ×0,11) ≠ round(Σsᵢ×0,11)`).
 *   2. HANYA `isLead` yang boleh memegang tombol bayar. Satu link, satu pintu;
 *      tiga tombol untuk satu link adalah tiga kesempatan membayar dua kali.
 *   3. Lead = anggota dengan tanggal tayang PALING AWAL (urutan sudah ditetapkan
 *      `fetchInvoiceGroups`). Bukan kosmetik: jadwal itu pula yang mematikan
 *      link duluan lewat `invoiceLifetimeMinutes()`, jadi kartu yang menagih
 *      adalah kartu dengan tenggat paling ketat.
 */
export interface ScheduleGroupInfo {
  paymentId: string;
  /** Σ porsi seluruh anggota — yang BENAR-BENAR ditagih link DOKU-nya. */
  total: number;
  memberCount: number;
  /** Kartu ini yang memegang tombol bayar untuk seluruh grup? */
  isLead: boolean;
  /** Judul pesanan lead — dipakai kartu pengikut untuk menunjuk ke sana. */
  leadTitle: string;
  /** Anggota SELAIN kartu ini, urut sama dengan `members`. */
  others: { title: string; amount: number; isPaid: boolean }[];
  /** Seluruh anggota sudah lunas. */
  allPaid: boolean;
}

/**
 * Info grup untuk satu kartu, dikunci `sourceId` — kunci yang sama dengan
 * `SchedulePaymentMap`.
 *
 * Mengembalikan `null` untuk tagihan beranggota satu, dan itu DISENGAJA:
 * N=1 harus melewati seluruh jalur ini tanpa berubah sedikit pun. Grup adalah
 * cabang, bukan bentuk baru untuk semua.
 */
export function groupInfoFor(
  groups: Map<string, InvoiceGroup> | undefined,
  paymentId: string | null | undefined,
  sourceId: string | null | undefined,
): ScheduleGroupInfo | null {
  if (!groups || !paymentId) return null;
  const group = groups.get(paymentId);
  if (!group || group.memberCount < 2) return null;

  const lead = group.members[0];
  /*
    Kartu yang TIDAK ada di daftar anggota tetap dianggap pengikut, bukan lead.
    Baris warisan bisa saja tidak punya `source_id` yang cocok; menebaknya jadi
    lead akan memberinya tombol bayar bernominal total grup — kesalahan yang
    lebih mahal daripada kehilangan tombol.
  */
  const isLead = !!sourceId && lead?.sourceId === sourceId;

  return {
    paymentId: group.paymentId,
    total: group.total,
    memberCount: group.memberCount,
    isLead,
    leadTitle: lead?.title || '(tanpa judul)',
    others: group.members
      .filter((m) => !sourceId || m.sourceId !== sourceId)
      .map((m) => ({ title: m.title, amount: m.amount, isPaid: m.isPaid })),
    allPaid: group.allPaid,
  };
}
