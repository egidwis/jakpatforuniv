/**
 * Deep-link papan Jadwal/Kilat → drawer Submissions: kapan membuka, dan kapan
 * permintaannya HABIS.
 *
 * ⚠️ DIKONSUMSI SEKALI. Dulu `focusSubmission` tidak pernah dikosongkan, dan
 * efek pembuka drawer bergantung pada `[focusSubmission, submissions]` — jadi
 * SETIAP perubahan `submissions` (Reset, Approve, Reject, muat ulang, audit AI
 * yang selesai) membuka lagi order hasil deep-link lama. Admin me-reset order Y
 * lalu mendapati drawer-nya pindah ke order X, dan tindakan berikutnya jatuh ke
 * order yang bukan yang ia kira.
 *
 * Kembalian `consume: true` berarti pemanggil WAJIB memberi tahu induknya
 * (`onFocusConsumed`) supaya nilai focus dikosongkan di sumbernya.
 */
export interface FocusOpenDecision {
  /** Id yang harus dibuka sekarang, atau null. */
  openId: string | null;
  /** Permintaan sudah terpenuhi — kosongkan focus di induk. */
  consume: boolean;
}

export function resolveFocusOpen(
  focus: { id: string } | null | undefined,
  loadedIds: readonly string[],
): FocusOpenDecision {
  if (!focus) return { openId: null, consume: false };
  // Baris belum termuat (fetch bulan/filter baru masih jalan): tunggu. Jangan
  // konsumsi — permintaannya belum terpenuhi.
  if (!loadedIds.includes(focus.id)) return { openId: null, consume: false };
  return { openId: focus.id, consume: true };
}
