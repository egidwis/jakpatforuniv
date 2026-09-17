import { describe, it, expect } from 'vitest';
import { restoredDraftDuration } from './draftDuration';
import { DURATION_PRESETS } from '../components/DurationPicker';

/*
  Ini tes jalur UANG, bukan tes kenyamanan. Durasi adalah pengali harga:
  memulihkan draft dengan durasi yang berbeda dari yang disimpan peneliti
  berarti menunjukkan — dan akhirnya menagih — angka untuk pilihan yang tidak
  pernah dia buat.
*/

describe('restoredDraftDuration', () => {
  it('MEMPERTAHANKAN 1 hari yang dipilih peneliti', () => {
    /*
      Regresi yang ditutup di sini. Kode lama menimpanya jadi 2 karena tidak
      bisa membedakan "dipilih 1" dari "belum pernah dipilih".
    */
    expect(restoredDraftDuration(1, 2)).toBe(1);
  });

  it('memakai default kalau durasinya tidak ada', () => {
    expect(restoredDraftDuration(undefined, 2)).toBe(2);
    expect(restoredDraftDuration(null, 2)).toBe(2);
  });

  it('memakai default kalau durasinya bukan angka', () => {
    expect(restoredDraftDuration('2', 2)).toBe(2);
    expect(restoredDraftDuration(NaN, 2)).toBe(2);
  });

  it('menolak durasi di luar preset — draft rusak tidak boleh menentukan harga', () => {
    expect(restoredDraftDuration(0, 2)).toBe(2);
    expect(restoredDraftDuration(-5, 2)).toBe(2);
    expect(restoredDraftDuration(3, 2)).toBe(2);
    expect(restoredDraftDuration(365, 2)).toBe(2);
  });

  it('mempertahankan SETIAP preset yang sah', () => {
    for (const d of DURATION_PRESETS) {
      expect(restoredDraftDuration(d, 2)).toBe(d);
    }
  });
});
