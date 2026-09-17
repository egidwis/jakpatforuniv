import { describe, it, expect } from 'vitest';
import { newSchedulePlan, NEW_SCHEDULE_BLOCK_KEY } from './newSchedulePlan';
import type { NewScheduleInput } from './newSchedulePlan';
import type { BatchContext } from './batchContext';

/*
  Gerbang "kunci jadwal BARU" — dipisah dari layar karena satu cabangnya
  menyentuh uang.

  ⚠️ BATCH DIJAWAB SERVER. Menyimpulkannya di browser adalah yang dulu membuat
  jadwal #3 ditagih untuk pool yang sudah didanai jadwal #2. Helper ini hanya
  MEMBACA jawaban server; ia tidak pernah menyimpulkan sendiri.

  ⚠️ `null` BUKAN "batch lama". Ia "tidak bisa dipastikan", dan itu wajib jadi
  penolakan yang bersuara — bukan lolos diam-diam ke `create_ad_schedule` yang
  akan menolaknya di server sesudah penelitinya mengisi seluruh layar.
*/

const batchLama: BatchContext = {
  periodBatch: '2026-09',
  isNewBatch: false,
  poolPrizePerWinner: 50000,
  poolWinnerCount: 2,
};
const batchBaru: BatchContext = { ...batchLama, periodBatch: '2026-10', isNewBatch: true };

const inputOf = (over: Partial<NewScheduleInput> = {}): NewScheduleInput => ({
  selected: '2026-09-22',
  availabilityReady: true,
  batch: batchLama,
  isResolvingBatch: false,
  prizePerWinner: 0,
  winnerCount: 0,
  isSaving: false,
  ...over,
});

describe('newSchedulePlan — jalan mulus', () => {
  it('batch LAMA tanpa hadiah: boleh submit', () => {
    // Ikut kolam yang sudah didanai. Menanyakan hadiah lagi = menagih dua kali.
    const p = newSchedulePlan(inputOf());
    expect(p.canSubmit).toBe(true);
    expect(p.block).toBeNull();
    expect(p.needsReward).toBe(false);
  });

  it('batch BARU dengan hadiah terisi: boleh submit', () => {
    const p = newSchedulePlan(inputOf({ batch: batchBaru, prizePerWinner: 50000, winnerCount: 2 }));
    expect(p.canSubmit).toBe(true);
    expect(p.needsReward).toBe(true);
  });
});

describe('newSchedulePlan — ⚠️ cabang uang', () => {
  it('batch BARU tanpa hadiah: DITOLAK, dan sebabnya bernama', () => {
    const p = newSchedulePlan(inputOf({ batch: batchBaru }));
    expect(p.canSubmit).toBe(false);
    expect(p.block).toBe('reward_missing');
    expect(p.needsReward).toBe(true);
  });

  it('batch BARU dengan hadiah setengah terisi: DITOLAK', () => {
    for (const sebagian of [
      { prizePerWinner: 50000, winnerCount: 0 },
      { prizePerWinner: 0, winnerCount: 2 },
    ]) {
      const p = newSchedulePlan(inputOf({ batch: batchBaru, ...sebagian }));
      expect(p.canSubmit).toBe(false);
      expect(p.block).toBe('reward_missing');
    }
  });

  it('batch NULL bukan batch lama — menolak, tidak menebak', () => {
    /*
      Ini inti modul. Kalau `null` lolos sebagai batch lama, panel hadiah tidak
      pernah muncul untuk batch yang sebenarnya BARU, dan `create_ad_schedule`
      menolaknya di server setelah peneliti mengisi seluruh layar.
    */
    const p = newSchedulePlan(inputOf({ batch: null }));
    expect(p.canSubmit).toBe(false);
    expect(p.block).toBe('batch_unknown');
    expect(p.needsReward).toBe(false);
  });

  it('batch NULL tidak pernah diselamatkan oleh hadiah yang terisi', () => {
    // Mengisi hadiah tidak menjawab pertanyaan "batch mana" — server yang tahu.
    const p = newSchedulePlan(inputOf({ batch: null, prizePerWinner: 50000, winnerCount: 2 }));
    expect(p.canSubmit).toBe(false);
    expect(p.block).toBe('batch_unknown');
  });

  it('hadiah batch LAMA diabaikan, bukan dipakai menagih', () => {
    // Terisi pun, batch lama tetap tidak butuh — `needsReward` tetap false.
    const p = newSchedulePlan(inputOf({ prizePerWinner: 99999, winnerCount: 9 }));
    expect(p.needsReward).toBe(false);
    expect(p.canSubmit).toBe(true);
  });
});

describe('newSchedulePlan — urutan penolakan', () => {
  it('tanpa tanggal: no_date', () => {
    expect(newSchedulePlan(inputOf({ selected: null })).block).toBe('no_date');
  });

  it('ketersediaan belum terbaca ditolak SEBELUM batch — kosong bukan lowong', () => {
    const p = newSchedulePlan(inputOf({ availabilityReady: false, batch: null }));
    expect(p.block).toBe('availability_unknown');
  });

  it('batch sedang ditanyakan: batch_resolving, bukan batch_unknown', () => {
    // Beda sebab, beda kalimat: yang satu "tunggu", yang lain "gagal".
    const p = newSchedulePlan(inputOf({ batch: null, isResolvingBatch: true }));
    expect(p.block).toBe('batch_resolving');
  });

  it('sedang menyimpan menang atas segalanya', () => {
    const p = newSchedulePlan(inputOf({ isSaving: true, selected: null }));
    expect(p.block).toBe('saving');
  });
});

describe('newSchedulePlan — setiap penolakan bersuara', () => {
  it('tiap sebab punya kunci i18n — nol tombol mati yang bisu', () => {
    /*
      Modal lama mematikan tombolnya lewat boolean telanjang: peneliti melihat
      tombol abu-abu tanpa tahu apa yang kurang.
    */
    const semua: Array<Partial<NewScheduleInput>> = [
      { selected: null },
      { availabilityReady: false },
      { batch: null, isResolvingBatch: true },
      { batch: null },
      { batch: batchBaru },
      { isSaving: true },
    ];
    for (const over of semua) {
      const p = newSchedulePlan(inputOf(over));
      expect(p.block).not.toBeNull();
      expect(NEW_SCHEDULE_BLOCK_KEY[p.block!]).toBeTruthy();
    }
  });
});
