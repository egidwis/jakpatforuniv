import { AD_RATE_SCHEDULE, AD_TIER_LABELS, KILAT_ADDON_COST, KILAT_RATE_SCHEDULE, KILAT_TARIFF_FROM, PPN_PERCENT, type AdRateEntry } from '@/utils/constants';
import { adRateEntryAt, isKilatTariffActive } from '@/utils/cost-calculator';
import { formatYmdId, toWibYmd } from '@/utils/airing-window';
import { formatRupiah } from '@/utils/currency';

// ─────────────────────────────────────────────────────────────
// Bagian TARIF di system prompt Mimin — disusun dari AD_RATE_SCHEDULE.
//
// ⚠️ KENAPA DARI KODE, BUKAN TEKS. `ChatPage` memakai `ai_settings.system_prompt`
// bila terisi, dan prompt produksi (disunting 29 Sep 2026) tidak memuat harga
// sama sekali — blok tarif tulisan tangan di prompt bawaan tidak pernah sampai
// ke Mimin. Bagian ini ditempel SETELAH prompt mana pun, jadi suntingan di
// /internal-dash tidak bisa menghapusnya, dan 1 Des / 1 Jan cukup mengubah
// AD_RATE_SCHEDULE seperti semua pemanggil lain.
//
// SOP di `ai_skills` (sql/104) merujuk ke judul di bawah — jangan diganti.
// ─────────────────────────────────────────────────────────────

export const MIMIN_PRICING_HEADING = '=== TARIF IKLAN (OTOMATIS DARI SISTEM) ===';

const rp = (n: number) => `Rp${formatRupiah(n)}`;

/** Rentang tanggal WIB sebuah entri: "1 Okt 2026 – 30 Nov 2026", "sebelum …", "mulai …". */
function periodLabel(index: number, schedule: readonly AdRateEntry[] = AD_RATE_SCHEDULE, floor: string | null = null): string {
  const entry = schedule[index];
  const next = schedule[index + 1];
  // `floor` = awal berlakunya tabel (KILAT_TARIFF_FROM) bila lebih akhir dari `from`.
  const from = floor && (!entry.from || Date.parse(floor) > Date.parse(entry.from)) ? floor : entry.from;
  const startYmd = from ? toWibYmd(new Date(from)) : null;
  const endYmd = next?.from ? toWibYmd(new Date(Date.parse(next.from) - 1)) : null;
  if (!startYmd && endYmd) return `s/d ${formatYmdId(endYmd)}`;
  if (startYmd && !endYmd) return `mulai ${formatYmdId(startYmd)}`;
  return `${formatYmdId(startYmd ?? '')} – ${formatYmdId(endYmd ?? '')}`;
}

/**
 * Baris cara menghitung JFU Kilat. Sebelum KILAT_TARIFF_FROM: rumus lama
 * (tarif 1 hari + add-on). Sesudahnya: tabel tarif per gelombang, disusun dari
 * KILAT_RATE_SCHEDULE — entri yang sudah lewat sebelum tanggal mulai dibuang.
 */
function kilatPricingLines(nowMs: number): string {
  if (!isKilatTariffActive(nowMs) || !KILAT_TARIFF_FROM) {
    return `- JFU Kilat: tarif 1 hari + add-on Kilat ${rp(KILAT_ADDON_COST)}, ditambah hadiah responden, tanpa diskon voucher.`;
  }
  const start = Date.parse(KILAT_TARIFF_FROM);
  const lines = KILAT_RATE_SCHEDULE.map((entry, i) => {
    const next = KILAT_RATE_SCHEDULE[i + 1];
    if (next?.from && Date.parse(next.from) <= start) return null;
    const tiers = AD_TIER_LABELS.map((label, t) => {
      const cut = entry.list[t] > entry.effective[t];
      return `${label} soal ${rp(entry.effective[t])}${cut ? ` (normal ${rp(entry.list[t])})` : ''}`;
    }).join(' | ');
    return `  - Pesanan dibuat ${periodLabel(i, KILAT_RATE_SCHEDULE, KILAT_TARIFF_FROM)}: ${tiers}`;
  }).filter((line): line is string => line !== null);
  return `- JFU Kilat: tarif per GELOMBANG (satu kali siar push, bukan per hari), ditambah hadiah responden. Tidak ada pilihan durasi. Voucher yang berlaku untuk Kilat hanya kode ambassador (potongan 10% dari tarif Kilat, bukan dari hadiah).
${lines.join('\n')}`;
}

export function buildMiminPricingSection(nowMs: number = Date.now()): string {
  const current = adRateEntryAt(nowMs);
  const periods = AD_RATE_SCHEDULE.map((entry, i) => {
    const tiers = AD_TIER_LABELS.map((label, t) => {
      const cut = entry.list[t] > entry.effective[t];
      return `${label} soal ${rp(entry.effective[t])}${cut ? ` (normal ${rp(entry.list[t])})` : ''}`;
    }).join(' | ');
    const intro = entry.introUntil && entry.list.some((v, t) => v > entry.effective[t])
      ? ` — selisih terhadap harga normal = "Harga perkenalan", berlaku s/d ${formatYmdId(entry.introUntil)}`
      : '';
    const marker = entry === current ? ' [BERLAKU HARI INI]' : '';
    return `- Pesanan dibuat ${periodLabel(i)}${marker}: ${tiers}${intro}`;
  });

  // Contoh kalimat dari periode yang SEDANG berlaku (tier 31–50 soal), supaya
  // contohnya tidak basi saat 1 Des / 1 Jan. Tanpa harga perkenalan → tanpa contoh.
  const t = 2;
  const example = current.introUntil && current.list[t] > current.effective[t]
    ? ` Contoh: "${rp(current.effective[t])}/hari — Harga perkenalan dari harga normal ${rp(current.list[t])}, berlaku untuk pesanan yang dibuat s/d ${formatYmdId(current.introUntil)}."`
    : '';

  return `${MIMIN_PRICING_HEADING}
Hari ini: ${formatYmdId(toWibYmd(new Date(nowMs)))} (WIB). Angka di bawah dari sistem tagihan — pakai PERSIS, jangan dibulatkan atau dikarang.

Tarif iklan per HARI tayang, menurut jumlah pertanyaan dan tanggal pesanan dibuat:
${periods.join('\n')}

Tanggal mana yang menentukan tarif sebuah jadwal:
- Jadwal pertama sebuah order: tanggal ORDER DIBUAT — termasuk bila tanggal tayangnya baru dipilih belakangan.
- Perpanjangan (jadwal ke-2 dst.): tanggal perpanjangan DIPESAN, bukan tarif order awal.
- Jadwal yang dilepas (lewat batas bayar) atau dibatalkan lalu dipesan ulang: tanggal pemesanan ulang.
- Jadwal yang dipindah ke HARI lain sebelum dibayar (oleh peneliti maupun tim Jakpat): tanggal pemindahan. Menggeser jam di hari yang sama tidak mengubah tarif.
- Jadwal yang sudah lunas tidak pernah dinilai ulang.
- Yang menentukan adalah tanggal pesanan dibuat/dipesan, BUKAN tanggal tayang.

Cara menghitung:
- Iklan reguler: tarif per hari × jumlah hari tayang, ditambah hadiah responden (pemenang × hadiah per pemenang).
${kilatPricingLines(nowMs)}
- PPN ${PPN_PERCENT}% dihitung di atas subtotal.
- Untuk order yang sudah ada, angka di dashboard peneliti / halaman bayar yang berlaku; bila berbeda dengan hitunganmu, rujuk ke angka dashboard.

Cara menyebutnya:
- Setiap kali menyebut tarif yang sedang dalam masa "Harga perkenalan", WAJIB sertakan harga normalnya dan tanggal berakhirnya dalam kalimat yang sama.${example}
- Selisih terhadap harga normal disebut "Harga perkenalan". JANGAN menyebutnya diskon, promo, voucher, atau "hemat".
- Ke peneliti, pakai kata "pesanan dibuat" atau "dipesan". JANGAN memakai istilah internal "dikunci", "penguncian", atau "rate lock".
- Selalu sebut nominal Rupiah, bukan persen.
- Jangan menjanjikan tarif lama untuk jadwal yang dipesan ulang, dipindah hari, atau diperpanjang setelah tarif naik.`;
}
