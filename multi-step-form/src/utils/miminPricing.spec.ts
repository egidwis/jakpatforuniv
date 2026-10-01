import { describe, it, expect } from 'vitest';
import { MIMIN_PRICING_HEADING, buildMiminPricingSection } from './miminPricing';
import { AD_RATE_SCHEDULE, AD_TIER_LABELS } from './constants';
import { formatRupiah } from './currency';

const OCT_01 = Date.parse('2026-10-01T11:00:00+07:00');
const DEC_02 = Date.parse('2026-12-02T11:00:00+07:00');
const JAN_05 = Date.parse('2027-01-05T11:00:00+07:00');

const periodLines = (text: string) => text.split('\n').filter((l) => l.startsWith('- Pesanan dibuat '));

describe('buildMiminPricingSection — tarif Mimin dari AD_RATE_SCHEDULE', () => {
  const text = buildMiminPricingSection(OCT_01);

  it('judul tetap (dirujuk SOP sql/104)', () => {
    expect(text.startsWith(MIMIN_PRICING_HEADING)).toBe(true);
    expect(MIMIN_PRICING_HEADING).toBe('=== TARIF IKLAN (OTOMATIS DARI SISTEM) ===');
  });

  it('setiap periode memuat setiap tier dengan angka efektif — dan harga normal bila beda', () => {
    const lines = periodLines(text);
    expect(lines).toHaveLength(AD_RATE_SCHEDULE.length);
    AD_RATE_SCHEDULE.forEach((entry, i) => {
      AD_TIER_LABELS.forEach((label, t) => {
        const eff = `${label} soal Rp${formatRupiah(entry.effective[t])}`;
        const normal = entry.list[t] > entry.effective[t] ? ` (normal Rp${formatRupiah(entry.list[t])})` : '';
        expect(lines[i]).toContain(eff + normal);
      });
    });
  });

  it('rentang periode dibaca kalender WIB', () => {
    const lines = periodLines(text);
    expect(lines[0]).toMatch(/^- Pesanan dibuat s\/d 30 Sep 2026: /);
    expect(lines[1]).toMatch(/^- Pesanan dibuat 1 Okt 2026 – 30 Nov 2026 \[BERLAKU HARI INI\]: /);
    expect(lines[2]).toMatch(/^- Pesanan dibuat 1 Des 2026 – 31 Des 2026: /);
    expect(lines[3]).toMatch(/^- Pesanan dibuat mulai 1 Jan 2027: /);
  });

  it('"Harga perkenalan" beserta batasnya; tanpa bingkai hemat/diskon pada angka', () => {
    const lines = periodLines(text);
    expect(lines[1]).toContain('"Harga perkenalan", berlaku s/d 30 Nov 2026');
    expect(lines[2]).toContain('"Harga perkenalan", berlaku s/d 31 Des 2026');
    expect(lines[3]).not.toContain('Harga perkenalan');
    expect(lines.join('\n')).not.toMatch(/hemat|diskon|promo/i);
  });

  it('penanda "berlaku hari ini" mengikuti tanggal', () => {
    expect(periodLines(buildMiminPricingSection(DEC_02))[2]).toContain('[BERLAKU HARI INI]');
    expect(periodLines(buildMiminPricingSection(JAN_05))[3]).toContain('[BERLAKU HARI INI]');
    expect(buildMiminPricingSection(JAN_05).match(/BERLAKU HARI INI/g)).toHaveLength(1);
  });

  it('aturan kunci tarif, Kilat, dan PPN ikut', () => {
    expect(text).toContain('Jadwal pertama sebuah order: tanggal ORDER DIBUAT');
    expect(text).toContain('Menggeser jam di hari yang sama tidak mengubah tarif');
    expect(text).toContain('add-on Kilat Rp200.000');
    expect(text).toContain('PPN 11%');
  });

  it('aturan wajib: tarif perkenalan selalu disertai harga normal + batasnya, dengan contoh dari periode berjalan', () => {
    expect(text).toContain('WAJIB sertakan harga normalnya dan tanggal berakhirnya');
    expect(text).toContain('Contoh: "Rp300.000/hari — Harga perkenalan dari harga normal Rp500.000, berlaku untuk pesanan yang dibuat s/d 30 Nov 2026."');
    expect(buildMiminPricingSection(DEC_02))
      .toContain('Contoh: "Rp400.000/hari — Harga perkenalan dari harga normal Rp500.000, berlaku untuk pesanan yang dibuat s/d 31 Des 2026."');
    expect(buildMiminPricingSection(JAN_05)).not.toContain('Contoh:');
  });

  it('istilah internal "dikunci" hanya muncul di larangannya — Mimin menyalin kata dari prompt', () => {
    const mentions = text.split('\n').filter((l) => /kunci/i.test(l));
    expect(mentions).toHaveLength(1);
    expect(mentions[0]).toMatch(/^- Ke peneliti, pakai kata "pesanan dibuat"/);
  });
});
