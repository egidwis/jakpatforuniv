import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

/**
 * Judul segmen + jalan keluar untuk layar pengisian order.
 *
 * ⚠️ MENGGANTIKAN `UnifiedHeader`, dan penggantinya tidak boleh sekadar lebih
 * kecil. Bar melayang itu lahir waktu submission benar-benar banyak langkah;
 * sekarang submission tinggal SATU langkah, jadi perannya sebagai penanda step
 * memang sudah tidak relevan. Tapi ia membawa dua hal yang kalau ikut mati
 * meninggalkan lubang:
 *
 *   1. RINCIAN BIAYA — sudah ada padanannya. `StepCheckout` punya kartu
 *      "Rincian Biaya" sendiri yang lebih lengkap (termasuk add-on Kilat) dan
 *      memakai `useIlkomunyBlocked` secara terpisah. Jadi menghapus bar tidak
 *      memunculkan kembali harga diskon ILKOMUNY yang tidak berhak — proteksi
 *      itu tidak pernah tinggal di bar.
 *
 *   2. BATALKAN PESANAN — TIDAK ada padanannya, dan itu sebabnya komponen ini
 *      ada. `AppNav` memang selalu tampil di rute ini, jadi peneliti bisa
 *      pergi; tapi pergi lewat `AppNav` TIDAK membuang draft. Hanya
 *      `cancelOrder` yang menghapus `STORAGE_KEY` dan
 *      `LEGACY_SURVEY_DRAFT_KEY` — dan draft yang tertinggal adalah akar
 *      insiden survei tertimpa (Tri/NISMA, lihat `resolveSubmissionMode`).
 *      Menghapus bar tanpa memindahkan tombol ini mencabut satu-satunya cara
 *      peneliti membuang draftnya sendiri.
 */

export interface OrderFormHeaderProps {
  /** Judul segmen — nama TEMPAT, bukan instruksi. */
  title: string;
  /** Kalimat instruksi di bawahnya. */
  subtitle?: string;
  /**
   * Membuang draft lalu keluar. Wajib `cancelOrder`, bukan `navigate` biasa:
   * lihat catatan no. 2 di atas.
   */
  onCancelConfirmed: () => void;
}

export function OrderFormHeader({ title, subtitle, onCancelConfirmed }: OrderFormHeaderProps) {
  const { t } = useLanguage();
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);

  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 leading-snug tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs md:text-sm text-slate-500 leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsCancelDialogOpen(true)}
          /* Kontras terukur: slate-600/slate-100 = 6.92:1 saat diam,
             rose-700/rose-50 = 5.72:1 saat hover. Keduanya lolos AA 4.5:1.
             `rose-600` yang dipakai UnifiedHeader hanya 4.28:1 — lolos ambang
             non-teks 3:1 tapi tidak lolos ambang teks, jadi digelapkan. */
          className="w-9 h-9 shrink-0 rounded-xl bg-slate-100/90 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200/90 hover:border-rose-200 flex items-center justify-center transition-all duration-150 cursor-pointer shadow-2xs"
          title={t('cancelOrderTitle')}
          aria-label={t('cancelOrderTitle')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Dialog sengaja DI LUAR pembungkus di atas — pola yang sama dengan
          `StepSurveyDetails`: elemen bertumpuk yang mewarisi
          `pointer-events-none` jadi tidak bisa diklik sama sekali. */}
      {isCancelDialogOpen && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div className="modal-header">
              <AlertTriangle size={24} className="modal-icon-warning" />
              <h3 className="modal-title">{t('cancelOrderTitle')}</h3>
            </div>
            <div className="modal-body">
              <p>{t('cancelOrderBody')}</p>
            </div>
            <div className="modal-footer">
              <button
                onClick={() => setIsCancelDialogOpen(false)}
                className="modal-button modal-button-cancel"
              >
                {t('cancelOrderKeep')}
              </button>
              <button
                onClick={onCancelConfirmed}
                className="modal-button modal-button-confirm"
              >
                {t('cancelOrderConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
