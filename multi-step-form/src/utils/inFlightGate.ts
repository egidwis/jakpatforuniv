/**
 * Gerbang satu-permintaan-berjalan: selama `run` sebelumnya belum selesai,
 * panggilan berikutnya menunggu promise YANG SAMA alih-alih memanggil `fn`.
 *
 * Dipakai penerbitan tagihan di Jadwal & Bayar: pemicu otomatis sesudah kunci
 * dan klik "Bayar Sekarang" selama tagihan itu disiapkan berbagi satu
 * permintaan — klik tidak pernah melahirkan link DOKU kedua.
 *
 * Gerbang terbuka lagi begitu permintaan selesai, berhasil maupun gagal.
 */
export function createInFlightGate<T>() {
  let current: Promise<T> | null = null;
  return {
    run(fn: () => Promise<T>): Promise<T> {
      if (current) return current;
      // `.then(fn)`: lemparan sinkron di `fn` ikut jadi penolakan.
      const p: Promise<T> = Promise.resolve()
        .then(fn)
        .finally(() => {
          if (current === p) current = null;
        });
      current = p;
      return p;
    },
    get busy() {
      return current !== null;
    },
  };
}
