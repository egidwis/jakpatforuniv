import { AD_RATE_SCHEDULE, AD_TIER_LABELS, KILAT_ADDON_COST, PPN_PERCENT } from '@/utils/constants';
import { adRateEntryAt } from '@/utils/cost-calculator';
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
function periodLabel(index: number): string {
  const entry = AD_RATE_SCHEDULE[index];
  const next = AD_RATE_SCHEDULE[index + 1];
  const startYmd = entry.from ? toWibYmd(new Date(entry.from)) : null;
  const endYmd = next?.from ? toWibYmd(new Date(Date.parse(next.from) - 1)) : null;
  if (!startYmd && endYmd) return `s/d ${formatYmdId(endYmd)}`;
  if (startYmd && !endYmd) return `mulai ${formatYmdId(startYmd)}`;
  return `${formatYmdId(startYmd ?? '')} – ${formatYmdId(endYmd ?? '')}`;
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
    return `- Dikunci ${periodLabel(i)}${marker}: ${tiers}${intro}`;
  });

  return `${MIMIN_PRICING_HEADING}
Hari ini: ${formatYmdId(toWibYmd(new Date(nowMs)))} (WIB). Angka di bawah dari sistem tagihan — pakai PERSIS, jangan dibulatkan atau dikarang.

Tarif iklan per HARI tayang, menurut jumlah pertanyaan dan tanggal tarifnya DIKUNCI:
${periods.join('\n')}

Kapan tarif sebuah jadwal dikunci:
- Jadwal pertama sebuah order: tanggal ORDER DIBUAT — termasuk bila tanggal tayangnya baru dipilih belakangan.
- Perpanjangan (jadwal ke-2 dst.): tanggal perpanjangan DIPESAN, bukan tarif order awal.
- Jadwal yang dilepas (lewat batas bayar) atau dibatalkan lalu dipesan ulang: tanggal pemesanan ulang.
- Jadwal yang dipindah ke HARI lain sebelum dibayar (oleh peneliti maupun tim Jakpat): tanggal pemindahan. Menggeser jam di hari yang sama tidak mengubah tarif.
- Jadwal yang sudah lunas tidak pernah dinilai ulang.
- Yang menentukan adalah tanggal pemesanan/penguncian, BUKAN tanggal tayang.

Cara menghitung:
- Iklan reguler: tarif per hari × jumlah hari tayang, ditambah hadiah responden (pemenang × hadiah per pemenang).
- JFU Kilat: tarif 1 hari + add-on Kilat ${rp(KILAT_ADDON_COST)}, ditambah hadiah responden, tanpa diskon voucher.
- PPN ${PPN_PERCENT}% dihitung di atas subtotal.
- Untuk order yang sudah ada, angka di dashboard peneliti / halaman bayar yang berlaku; bila berbeda dengan hitunganmu, rujuk ke angka dashboard.

Cara menyebutnya:
- Selisih terhadap harga normal disebut "Harga perkenalan" beserta tanggal berakhirnya. JANGAN menyebutnya diskon, promo, voucher, atau "hemat".
- Selalu sebut nominal Rupiah, bukan persen.
- Jangan menjanjikan tarif lama untuk jadwal yang dipesan ulang, dipindah hari, atau diperpanjang setelah tarif naik.`;
}
