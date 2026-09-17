import { DURATION_PRESETS } from '../components/DurationPicker';

/**
 * Durasi mana yang dipakai saat draft dipulihkan?
 *
 * ⚠️ APA YANG SALAH SEBELUMNYA. Kodenya berbunyi:
 *
 *     if (!draft.formData.duration || draft.formData.duration === 1) merged.duration = 2;
 *
 * Maksudnya "seragamkan draft lama yang masih memakai default 1 hari dengan
 * default baru 2 hari". Tapi kondisinya tidak bisa membedakan dua hal yang
 * sangat berbeda:
 *
 *   - draft yang durasinya TIDAK PERNAH DIPILIH (lahir sebelum defaultnya
 *     berubah), dan
 *   - draft yang durasinya DIPILIH peneliti, dan yang dipilihnya adalah 1 hari.
 *
 * 1 hari masih pilihan sah — ia ada di `DURATION_PRESETS`. Jadi cabang itu
 * membuang pilihan sadar peneliti secara diam-diam, DAN durasi menentukan
 * harga: orang yang menyimpan draft 1 hari membukanya lagi sebagai 2 hari,
 * dengan angka yang ikut naik, tanpa pernah diberi tahu.
 *
 * Aturannya sekarang: durasi tersimpan yang SAH selalu menang. Yang diisi
 * default hanyalah yang memang tidak ada atau tidak masuk akal.
 */
export function restoredDraftDuration(
  stored: unknown,
  fallback: number,
): number {
  if (typeof stored !== 'number' || !Number.isFinite(stored)) return fallback;
  /*
    Nilai di luar daftar preset ditolak, bukan dipakai apa adanya: durasi
    menentukan harga, dan angka yang tidak pernah bisa dipilih dari UI hanya
    bisa datang dari draft rusak atau localStorage yang disunting tangan.
  */
  if (!DURATION_PRESETS.includes(stored)) return fallback;
  return stored;
}
