import { Dialog, DialogContent, DialogHeader, DialogTitle } from './dialog';
import { Button } from './button';
import { cn } from '@/lib/utils';

/**
 * Satu permintaan konfirmasi. `null` = dialog tertutup.
 *
 * ⚠️ AKSI PALING MERUSAK DULU PUNYA KONFIRMASI PALING LEMAH. "Batalkan Jadwal"
 * dan "Batalkan Tagihan" memakai `confirm()` bawaan browser — tanpa hierarki,
 * tanpa nominal yang menonjol, dan di sebagian browser bisa dibungkam permanen
 * oleh centang "jangan tampilkan lagi" — sementara "Tandai Lunas", yang tidak
 * merusak apa pun, mendapat dialog terkaya. Ketimpangan itu yang dibalik di
 * sini, dan itulah kenapa bentuknya diangkat jadi komponen: aksi merusak yang
 * SAMA harus berbunyi sama di permukaan mana pun ia ditawarkan. Menyalin dialog
 * ini ke permukaan kedua adalah cara ketimpangan tadi kembali diam-diam.
 */
export interface ConfirmRequest {
  title: string;
  /** Baris penjelas; yang pertama paling penting. */
  lines: string[];
  /** Nominal/tanggal yang dipertaruhkan — dialog aksi uang WAJIB menyebutnya. */
  highlight?: string;
  confirmLabel: string;
  tone: 'danger' | 'neutral';
  onConfirm: () => void | Promise<void>;
}

/**
 * Dialog konfirmasi untuk aksi merusak.
 *
 * Bentuknya sengaja sejajar dengan dialog "Tandai Lunas" di tab Jadwal & Bayar —
 * hierarki judul yang sama, nominal yang sama menonjolnya — supaya beratnya
 * sebuah aksi terbaca dari konsekuensinya, bukan dari kebetulan komponen mana
 * yang dipakai.
 */
export function ConfirmDialog({
  request,
  onDismiss,
}: {
  request: ConfirmRequest | null;
  /** Menutup dialog. Pemanggil yang memegang state-nya. */
  onDismiss: () => void;
}) {
  return (
    <Dialog open={!!request} onOpenChange={(open) => { if (!open) onDismiss(); }}>
      <DialogContent className="sm:max-w-[26rem] p-6">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-gray-900">
            {request?.title}
          </DialogTitle>
        </DialogHeader>

        {request?.highlight && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-center">
            <p className="text-sm font-bold text-slate-800">{request.highlight}</p>
          </div>
        )}

        <div className="space-y-1.5">
          {request?.lines.map((line, i) => (
            <p key={i} className={cn('text-xs leading-relaxed', i === 0 ? 'text-slate-700 font-medium' : 'text-slate-500')}>
              {line}
            </p>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="outline"
            onClick={onDismiss}
            className="text-xs font-semibold h-9 px-5 text-gray-600 border-gray-200 hover:bg-gray-50"
          >
            Batal
          </Button>
          <Button
            className={cn(
              'text-xs font-semibold h-9 px-5 text-white',
              request?.tone === 'danger'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700',
            )}
            onClick={() => {
              // Ditutup DULU, lalu dijalankan. Urutannya penting: `onConfirm`
              // di sini selalu async dan menyentuh jaringan, jadi menunggunya
              // sebelum menutup akan membuat dialog menggantung dan bisa
              // diklik dua kali.
              const pending = request;
              onDismiss();
              void pending?.onConfirm();
            }}
          >
            {request?.confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
