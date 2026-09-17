import type { AdScheduleEntry } from '@/utils/supabase';
import {
  calculateTotalAdCost, calculateIncentiveCost, calculateDiscount,
  calculateAdCostPerDay, calculatePpn, getKilatAddonCost,
} from '@/utils/cost-calculator';

// ─────────────────────────────────────────────────────────────
// Berapa uang untuk SATU jadwal.
//
// ⚠️ ADA DUA ANGKA YANG BERBEDA DAN TIDAK BOLEH TERTUKAR:
//
//   YANG DITAGIH  — `ad_schedules.total_cost`, catatan sejarah. Inilah yang
//                   benar-benar keluar sebagai tagihan ke peneliti.
//   ESTIMASI      — dihitung ulang dari tarif HARI INI.
//
// Dipakai DUA LAYAR: kartu jadwal di drawer admin dan kartu Fase ② di
// dashboard peneliti. Sebelumnya masing-masing punya hitungannya sendiri, dan
// yang di sisi peneliti menghitung ulang dari nol — jadi satu order bisa
// berbunyi dua harga tergantung siapa yang membukanya. Berkasnya tinggal di
// `utils/` justru supaya tidak ada sisi yang "memiliki"-nya.
//
// Sampai Phase 3 tab admin SELALU memakai yang kedua, dan itu salah dua kali:
//   * untuk order lama ia menampilkan harga hari ini atas order yang ditagih
//     dengan tarif lama — angka yang tidak pernah ada di invoice mana pun;
//   * untuk jadwal ke-2 dst. ia memakai rumus ORDER (base × durasi order),
//     bukan rumus perpanjangan. Terukur di produksi: "Kuesioner Persepsi
//     Ideologi" #1 ditagih Rp 1.110.000 dan #2 ditagih berbeda, tapi hitung
//     ulang menghasilkan angka yang sama untuk keduanya.
//
// Aturannya: kalau sudah pernah ditagih, TAMPILKAN YANG DITAGIH. Estimasi hanya
// untuk jadwal yang belum punya tagihan — di situ ia memang penawaran, bukan
// catatan.
// ─────────────────────────────────────────────────────────────

export interface MoneyLine {
  /**
   * Teks siap-pakai. Dipakai HANYA bila `labelKey` tidak ada.
   *
   * ⚠️ Modul ini murni — ia tidak punya konteks React, jadi ia tidak bisa
   * memanggil `t()`. Selama ini akibatnya seluruh label biaya ("Iklan",
   * "Diskon Voucher", "PPN 11%") ikut tercetak Indonesia di mode Inggris.
   */
  label: string;
  /** Kunci i18n; `CostBreakdown` mengutamakannya di atas `label`. */
  labelKey?: string;
  /** Variabel interpolasi untuk `labelKey`. */
  labelVars?: Record<string, string | number>;
  /** Kunci i18n untuk `hint`, dengan alasan yang sama. */
  hintKey?: string;
  hintVars?: Record<string, string | number>;
  hint?: string;
  amount: number;
  tone?: 'discount' | 'addon';
  /**
   * Baris ini RANGKUMAN baris di atasnya (mis. Subtotal/DPP), bukan komponen
   * biaya baru.
   *
   * ⚠️ Menjumlahkan seluruh `amount` tanpa memisahkannya akan menghitung
   * ganda. Dipakai `CostBreakdown` untuk memberi pemisah visual.
   */
  isSubtotal?: boolean;
}

export interface ScheduleMoney {
  total: number;
  /** true = belum pernah ditagih; angkanya hitungan tarif hari ini. */
  isEstimate: boolean;
  /** null = rincian tidak tersimpan untuk jadwal ini (order pra-PPN). */
  lines: MoneyLine[] | null;
  /** Kenapa rinciannya tidak ada, kalau memang tidak ada. */
  note?: string;
}

/**
 * Apakah jadwal ini benar-benar MENDANAI kolam hadiah?
 *
 * ⚠️ ATURAN YANG SAMA DENGAN SISI SERVER — `pricingRowForSchedule()` di
 * `functions/api/doku/create-payment.js:229-230` menulisnya begini:
 *
 *     // Hanya batch baru yang mendanai pool.
 *     winner_count:     isNewBatch ? … : 0,
 *     prize_per_winner: isNewBatch ? … : 0,
 *
 * Asalnya `sql/37`: pool sebuah batch sudah didanai jadwal sebelumnya, jadi
 * menagihnya lagi adalah penagihan ganda.
 *
 * ⚠️ ORDINAL 1 SELALU MENDANAI. `is_new_period` pada jadwal pertama bernilai
 * false di produksi (kolom itu lahir untuk membedakan PERPANJANGAN), jadi
 * menggerbangi hanya dengan `isNewPeriod` akan mencabut hadiah dari setiap
 * order pertama yang pernah ada.
 *
 * Kenapa ini perlu ada di sisi BACA, padahal jalur tulis sudah mengirim 0:
 * sampai sekarang berkas ini menampilkan hadiah tanpa syarat, dan hasilnya
 * benar hanya karena kolomnya kebetulan nol. Satu baris batch-lama berhadiah —
 * dibuat admin, atau lewat jalur masa depan — memajang hadiah yang tidak
 * pernah ditagih.
 */
function fundsPrizePool(e: AdScheduleEntry): boolean {
  return e.ordinal === 1 || e.isNewPeriod;
}

/** Insentif yang tersimpan untuk jadwal ini, kalau bisa dipercaya. */
function storedIncentive(e: AdScheduleEntry): number | null {
  // Top-up menempel ke pool berjalan, dan jumlah pemenang pool itu TIDAK
  // tersimpan di baris ini — mengalikannya dengan winner_count baris ini akan
  // menghasilkan angka karangan. Untuk kasus itu kita menolak memecah.
  //
  // ⚠️ ALASANNYA BERBEDA DARI GERBANG BATCH di bawah, jadi keduanya sengaja
  // TIDAK digabung: yang ini "tidak bisa dihitung", yang itu "tidak ditagih".
  if (e.additionalPrizePerWinner > 0) return null;

  // Perpanjangan batch lama tidak mendanai pool — hadiahnya nol, apa pun isi
  // kolomnya.
  if (!fundsPrizePool(e)) return 0;

  return e.prizePerWinner * e.winnerCount;
}

/**
 * Voucher mana yang berlaku untuk jadwal ini?
 *
 * ⚠️ VOUCHER JADWAL YANG KOSONG BERARTI "TIDAK MENYATAKAN APA-APA", BUKAN
 * "TANPA DISKON". Aturan yang sama persis sudah berdiri di sisi server,
 * `pricingRowForSchedule()` (create-payment.js:231):
 *
 *     // Presedensi: voucher tagihan > voucher jadwal > voucher order.
 *
 * Sisi baca memakai `entry.voucherCode ?? undefined` dan karena itu menyimpang
 * dari sisi tagih. Terukur di produksi 17 Sep 2026 pada jadwal #4 `GTFBMQ6F`:
 * layar menawarkan Rp 666.000 sementara tagihan yang sudah terbit berbunyi
 * Rp 1.110 — selisih 600×, dan yang benar adalah tagihannya.
 *
 * Sebabnya struktural, bukan kebetulan: SELURUH 18 baris `ad_schedules` di
 * produksi ber-`voucher_code` NULL, karena jalur tulis tidak pernah menyalin
 * voucher ke baris jadwal. Jadi cabang "kosong = tanpa diskon" selalu salah
 * untuk setiap order ber-voucher.
 *
 * ⚠️ HANYA UNTUK ESTIMASI. Jadwal yang sudah punya `total_cost` adalah catatan
 * sejarah; menghitung ulangnya dengan voucher hari ini justru cacat yang sudah
 * ditutup berkas ini. Pemanggilnya menjaga batas itu.
 */
function effectiveVoucher(
  entryVoucher: string | null | undefined,
  orderVoucher: string | null | undefined,
): string | undefined {
  const fromSchedule = String(entryVoucher ?? '').trim();
  if (fromSchedule) return fromSchedule;
  const fromOrder = String(orderVoucher ?? '').trim();
  return fromOrder || undefined;
}

export function deriveScheduleMoney(
  entry: AdScheduleEntry,
  submission: {
    questionCount?: number | null;
    question_count?: number | null;
    distribution_type?: string | null;
    distributionType?: string | null;
    /**
     * Voucher milik ORDER — cadangan saat baris jadwal tidak menyatakan apa-apa.
     * Lihat `effectiveVoucher()` untuk alasannya.
     */
    voucher_code?: string | null;
    voucherCode?: string | null;
  },
): ScheduleMoney {
  const isKilat = entry.distributionType === 'kilat' || submission.distribution_type === 'kilat' || submission.distributionType === 'kilat';
  const questionCount = submission.question_count ?? submission.questionCount ?? 0;
  const orderVoucher = submission.voucher_code ?? submission.voucherCode ?? null;

  // ── Sudah ditagih ────────────────────────────────────────
  if (entry.totalCost > 0) {
    const total = entry.totalCost;

    if (entry.subtotal != null && entry.ppnAmount != null) {
      const incentive = storedIncentive(entry);
      const netAdCost = incentive != null ? entry.subtotal - incentive : null;
      const duration = entry.duration || 1;
      /*
        Voucher order ikut jadi cadangan DI SINI JUGA — tapi perannya sempit:
        ia hanya dipakai MEMECAH `subtotal` tersimpan jadi kotor + diskon.
        Totalnya tetap `entry.totalCost` apa pun hasilnya, jadi tidak ada
        nominal yang dihitung ulang dengan tarif hari ini.

        Tanpa ini, baris ber-`voucher_code` NULL (yaitu semua baris jadwal di
        produksi) gagal memecah: baris "Diskon Voucher" hilang dan harga kotor
        tercetak sama dengan nilai bersih, sehingga peneliti melihat tagihan
        yang benar tanpa pernah melihat hematnya.
      */
      const voucher = effectiveVoucher(entry.voucherCode, orderVoucher);

      let grossAdCost = netAdCost;
      let discountAmount = 0;

      if (voucher && netAdCost != null && netAdCost > 0) {
        let calculatedGross = isKilat
          ? calculateAdCostPerDay(questionCount)
          : calculateTotalAdCost(questionCount, duration);
        let calculatedDiscount = isKilat ? 0 : calculateDiscount(voucher, calculatedGross, incentive || 0, duration);

        if (calculatedGross > 0 && Math.abs((calculatedGross - calculatedDiscount) - netAdCost) < 10) {
          grossAdCost = calculatedGross;
          discountAmount = calculatedDiscount;
        } else if (!isKilat) {
          // `question_count` kosong, jadi harga kotornya tidak bisa dihitung ulang
          // — ia harus dibalik dari nilai bersih yang tersimpan.
          //
          // ⚠️ JANGAN MENDAFTAR KODE VOUCHER DI SINI. `calculateDiscount` sudah
          // jadi sumber kebenaran (dan sudah punya satu duplikat di
          // create-payment.js yang wajib diubah bersamaan) — menaruh salinan
          // ketiga berarti tarif diam-diam menyimpang. Yang dilakukan: PROBE
          // fungsi itu di dua titik. Kalau diskonnya proporsional terhadap harga
          // (semua voucher persentase), dua probe memberi rasio yang sama dan
          // pembalikannya sah: net = gross × (1 − r).
          //
          // Voucher non-proporsional (JFUFEB/ILKOMUNY yang memakai cap harian,
          // JFUTGRX yang mematok total) sengaja TIDAK dibalik — dua probenya
          // berbeda, dan baris diskon dilewati alih-alih menampilkan angka karangan.
          const probeA = 1_000_000;
          const probeB = 2_000_000;
          const rateA = calculateDiscount(voucher, probeA, 0, duration) / probeA;
          const rateB = calculateDiscount(voucher, probeB, 0, duration) / probeB;
          const isProportional = Math.abs(rateA - rateB) < 1e-9 && rateA > 0 && rateA < 1;

          if (isProportional) {
            grossAdCost = Math.round(netAdCost / (1 - rateA));
            discountAmount = grossAdCost - netAdCost;
          }
        }
      }

      const lines: MoneyLine[] = [];

      if (grossAdCost != null && grossAdCost >= 0) {
        lines.push({
          label: 'Iklan',
          labelKey: 'costLineAd',
          hint: entry.duration ? `${entry.duration} hari` : undefined,
          hintKey: entry.duration ? 'costHintDays' : undefined,
          hintVars: { d: entry.duration ?? 0 },
          amount: grossAdCost,
        });

        if (discountAmount > 0) {
          lines.push({
            label: `Diskon Voucher (${voucher})`,
            labelKey: 'costLineVoucherNamed',
            labelVars: { code: voucher ?? '' },
            amount: -discountAmount,
            tone: 'discount',
          });
        }

        if (incentive != null && incentive > 0) {
          lines.push({
            label: 'Reward',
            labelKey: 'costLineReward',
            hint: `Rp ${entry.prizePerWinner.toLocaleString('id-ID')} × ${entry.winnerCount}`,
            amount: incentive,
          });
        }
      } else {
        lines.push({ label: 'Subtotal (DPP)', labelKey: 'costLineSubtotal', amount: entry.subtotal });
      }

      lines.push({ label: 'PPN 11%', labelKey: 'costLinePpn', amount: entry.ppnAmount });
      return { total, isEstimate: false, lines };
    }

    return {
      total,
      isEstimate: false,
      lines: null,
      note: 'Rincian tidak tersimpan — order sebelum PPN diberlakukan (sql/34).',
    };
  }

  /*
    ── Jadwal yang DIBATALKAN: tidak ada yang bisa dikatakan jujur ──

    ⚠️ ESTIMASI ADALAH PENAWARAN; JADWAL YANG DIBATALKAN TIDAK SEDANG
    DITAWARKAN.

    Terukur di order af004b84: kartu jadwal #2 memajang "Estimasi Total
    Rp 3.108.000" padahal `total_cost` baris itu 0 dan tagihan sungguhannya
    Rp 444.000. Sebabnya persis di sini — `entry.totalCost > 0` dipakai sebagai
    "sudah ditagih", jadwal batal itu bernilai 0, dan cabang di bawah menghitung
    ulang 57 Qs × 7 hari dengan tarif HARI INI. Angka itu membantah header
    kartunya sendiri ("Rp 999.000 ditagih") DAN invoice yang benar-benar terbit.

    Untuk jadwal batal: tampilkan yang benar-benar tercatat, atau tidak sama
    sekali. `total` 0 + `lines: null` membuat kartu memilih diam.
  */
  if (entry.status === 'cancelled') {
    return {
      total: 0,
      isEstimate: false,
      lines: null,
      note: 'Jadwal dibatalkan — tidak ada nominal yang ditagihkan untuk jadwal ini.',
    };
  }

  // ── Belum ditagih: penawaran, bukan catatan ──────────────
  const duration = entry.duration || 0;
  // Gerbang yang sama dengan `storedIncentive` — perpanjangan batch lama tidak
  // mendanai pool, jadi estimasinya pun tidak boleh menawarkan hadiah.
  const incentive = fundsPrizePool(entry)
    ? calculateIncentiveCost(entry.winnerCount, entry.prizePerWinner)
    : 0;

  // Kilat: base rate 1× (durasi tidak berlaku — selesai ~2 jam), plus add-on,
  // tanpa diskon voucher. Rumus yang sama dipakai invoice admin dan
  // functions/api/doku/create-payment.js.
  const adCost = isKilat
    ? calculateAdCostPerDay(questionCount)
    : calculateTotalAdCost(questionCount, duration);
  const voucher = effectiveVoucher(entry.voucherCode, orderVoucher);
  const addon = isKilat ? getKilatAddonCost(voucher) : 0;
  const discount = isKilat ? 0 : calculateDiscount(voucher, adCost, incentive, duration);

  const subtotal = adCost - discount + addon + incentive;
  const ppn = calculatePpn(subtotal);

  const lines: MoneyLine[] = [
    {
      label: 'Iklan',
      labelKey: 'costLineAd',
      hint: isKilat ? `${questionCount} Qs · base rate` : `${questionCount} Qs × ${duration} hari`,
      hintKey: isKilat ? undefined : 'costHintQsDays',
      hintVars: { q: questionCount, d: duration },
      amount: adCost,
    },
  ];
  if (addon > 0) lines.push({ label: 'Add-on JFU Kilat', labelKey: 'costLineKilatAddon', amount: addon, tone: 'addon' });
  if (discount > 0) lines.push({ label: `Diskon Voucher (${voucher})`, labelKey: 'costLineVoucherNamed', labelVars: { code: voucher ?? '' }, amount: -discount, tone: 'discount' });
  if (incentive > 0) {
    lines.push({
      label: 'Reward',
      labelKey: 'costLineReward',
      hint: `Rp ${entry.prizePerWinner.toLocaleString('id-ID')} × ${entry.winnerCount}`,
      amount: incentive,
    });
  }
  lines.push({ label: 'PPN 11%', labelKey: 'costLinePpn', amount: ppn });

  return { total: subtotal + ppn, isEstimate: true, lines };
}
