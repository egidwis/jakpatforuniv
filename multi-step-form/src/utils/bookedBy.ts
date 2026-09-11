/**
 * Siapa yang memesan sebuah slot — SATU aturan, satu tempat.
 *
 * ⚠️ TIGA KEADAAN, BUKAN DUA.
 *
 *   'user' / 'customer' → PENELITI memesannya sendiri
 *   'admin' (dan nilai tak dikenal) → ADMIN yang memesankan
 *   NULL / kosong → TAK SEORANG PUN pernah memesannya
 *
 * Keadaan ketiga itu yang paling mudah hilang, dan hilangnya mahal: **705 baris
 * produksi** (diukur 2026-09-11) ber-`slot_booked_by` NULL. Menyamakannya
 * dengan "dipesan admin" membuat papan berbohong soal slot yang sebenarnya tak
 * pernah direservasi — dan `scheduleCardActions.ts` sudah memakai perbedaan itu
 * sebagai gerbang "Kabari via WA": mengabari "slot Anda sudah dipesan" untuk
 * reservasi yang tak pernah terjadi adalah kebohongan yang tepat berbahaya.
 *
 * ⚠️ INI BUKAN KOSMETIK — IA MENJELASKAN PERILAKU. `slotHold.ts` hanya melepas
 * hold `slot_booked_by === 'user'`; jadwal yang dipesan admin **tidak pernah
 * lepas sendiri**. Labelnya memberi tahu admin kenapa satu slot punya timer dan
 * yang lain tidak — dan sesudah Phase 4 ia menjawab pertanyaan yang baru ada:
 * *"ini aku yang pesan, atau penelitinya sendiri?"*
 *
 * Sebelum berkas ini, aturannya hidup di TIGA tempat dengan TIGA kata berbeda,
 * dua di antaranya memajang nilai kolom MENTAH (`Booked By: User`,
 * `· dipesan user`) — kata yang tidak dipakai siapa pun saat bicara.
 */

export type BookedByActor = 'researcher' | 'admin' | 'nobody';

/**
 * Normalisasi `slot_booked_by` jadi tiga keadaan.
 *
 * ⚠️ Nilai TAK DIKENAL jatuh ke `'admin'`, bukan ke `'nobody'`. Barisnya jelas
 * punya pemesan — kolomnya terisi — hanya katanya yang tidak kita kenal.
 * Memetakannya ke "belum dipesan" akan MENGHAPUS fakta bahwa slot itu dipesan
 * seseorang, dan itu kehilangan informasi, bukan kehati-hatian.
 */
export function bookedByActor(raw: string | null | undefined): BookedByActor {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) return 'nobody';
  // `customer` nilai warisan yang berarti hal yang sama dengan `user`.
  if (v === 'user' || v === 'customer') return 'researcher';
  return 'admin';
}

export interface BookedByLabelOptions {
  /**
   * Cakupan barisnya.
   *
   * ⚠️ `'order'` WAJIB dipakai permukaan yang membaca
   * `form_submissions.slot_booked_by` — kolom ORDER, yang menggambarkan jadwal
   * PERTAMA saja. Sesudah Phase 4 satu order bisa punya jadwal pertama yang
   * dipesan admin dan jadwal kedua yang dipesan penelitinya sendiri; kalau
   * kartu order memajang label order sementara kartu jadwal di sebelahnya
   * memajang label jadwal, admin melihat dua jawaban untuk satu pertanyaan.
   *
   * Cakupan ada di KALIMAT pemanggil, bukan di dalam helper ini.
   */
  scope?: 'schedule' | 'order';
}

/** Kata yang dibaca manusia. Tidak pernah memulangkan nilai kolom mentah. */
export function bookedByLabel(
  raw: string | null | undefined,
  { scope = 'schedule' }: BookedByLabelOptions = {},
): string {
  const subject = scope === 'order' ? 'Slot pertama' : 'Slot';
  switch (bookedByActor(raw)) {
    case 'researcher':
      return `${subject} dipesan peneliti`;
    case 'admin':
      return `${subject} dipesan admin`;
    case 'nobody':
      return `${subject} belum dipesan`;
  }
}
