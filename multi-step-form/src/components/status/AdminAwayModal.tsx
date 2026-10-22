import { useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarOff, CheckCircle2, Hourglass, MessageCircle } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import type { TranslationKey } from '@/i18n/translations';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  ackAway,
  awayMessageFor,
  getAdminAway,
  isAwayAcked,
  useAdminAway,
  type AdminAway,
} from '@/utils/operationalHolidays';

/**
 * Modal mode libur untuk PENELITI (sql/122, keputusan 21 Okt 2026).
 *
 * Satu host (`AdminAwayModalHost`, dipasang sekali di DashboardLayout) dan
 * dua pintu untuk pemanggil:
 *   - `awayGuard(ctx, action)` — varian A–E sebelum submit/bayar. Tidak libur
 *     atau sudah "Lanjutkan" di masa libur ini → `action` LANGSUNG jalan.
 *   - `awayBlocksKilatPick({ leave })` — varian F, pemblokir pemilih gelombang
 *     Kilat. `true` = sedang libur, modal dibuka, pemanggil JANGAN berpindah
 *     halaman / merender pemilih.
 *
 * Keputusannya SINKRON dari store (`getAdminAway`), supaya `window.open` di
 * dalam `action` masih dihitung sebagai gestur pengguna (tidak diblokir
 * pemblokir popup).
 */
export type AwayModalCtx =
  | { kind: 'submit'; product: 'ads' | 'kilat'; path: 'schedule' | 'pay' | 'review' | 'kilat_away' }
  | { kind: 'pay'; product: 'ads' | 'kilat'; schedule?: string; wave?: string }
  | { kind: 'kilat_pick'; leave: boolean };

export type AwayVariant = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export function awayModalVariant(ctx: AwayModalCtx): AwayVariant {
  if (ctx.kind === 'kilat_pick') return 'F';
  if (ctx.kind === 'pay') return ctx.product === 'kilat' ? 'E' : 'D';
  if (ctx.path === 'review') return 'B';
  // Kilat jalur otomatis selama libur SELALU dialihkan (checkoutPath); jalur
  // lain untuk Kilat di sini berarti pemanggil salah susun — tetap C.
  return ctx.product === 'kilat' ? 'C' : 'A';
}

interface ModalRequest {
  ctx: AwayModalCtx;
  away: AdminAway;
  onContinue?: () => void;
}

let request: ModalRequest | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const open = (r: ModalRequest) => { request = r; emit(); };
const close = () => { request = null; emit(); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/**
 * `awayGuard` akan membuka modal (bukan langsung menjalankan aksi)? Untuk
 * tautan `<a>`: hanya klik yang memang dicegat yang di-`preventDefault`.
 */
export function awayGuardWouldOpen(): boolean {
  const away = getAdminAway();
  return !!away && !isAwayAcked(away.since);
}

export function awayGuard(ctx: Exclude<AwayModalCtx, { kind: 'kilat_pick' }>, action: () => void): void {
  const away = getAdminAway();
  if (!away || isAwayAcked(away.since)) {
    action();
    return;
  }
  open({
    ctx,
    away,
    onContinue: () => {
      ackAway(away.since);
      close();
      action();
    },
  });
}

export function awayBlocksKilatPick({ leave }: { leave: boolean }): boolean {
  const away = getAdminAway();
  if (!away) return false;
  open({ ctx: { kind: 'kilat_pick', leave }, away });
  return true;
}

type Tone = 'go' | 'wait';

interface VariantCopy {
  tone: Tone;
  highlight: string;
  notes: string[];
  contact: TranslationKey;
  cta: TranslationKey;
}

function copyOf(ctx: AwayModalCtx, t: (k: TranslationKey, v?: Record<string, string>) => string): VariantCopy {
  const variant = awayModalVariant(ctx);
  switch (variant) {
    case 'A':
      return {
        tone: 'go',
        highlight: t('awayHighlightAds'),
        notes: [],
        contact: 'adminAwayContactIfIssue',
        cta: ctx.kind === 'submit' && ctx.path === 'schedule' ? 'awayCtaPickSchedule' : 'awayCtaContinue',
      };
    case 'B':
      return {
        tone: 'wait',
        highlight: t('awayHighlightReview'),
        notes: [t(ctx.kind === 'submit' && ctx.product === 'kilat' ? 'awayNoteReviewKilat' : 'awayNoteReviewAds')],
        contact: 'adminAwayContactPromise',
        cta: 'awayCtaSubmit',
      };
    case 'C':
      return {
        tone: 'wait',
        highlight: t('awayHighlightKilatDiverted'),
        notes: [t('awayNoteNoPayment')],
        contact: 'adminAwayContactPromise',
        cta: 'awayCtaSendOrder',
      };
    case 'D': {
      const schedule = ctx.kind === 'pay' ? ctx.schedule : undefined;
      return {
        tone: 'go',
        highlight: schedule ? t('awayHighlightAdsScheduled', { schedule }) : t('awayHighlightAds'),
        notes: [],
        contact: 'adminAwayContactIfIssue',
        cta: 'awayCtaPay',
      };
    }
    case 'E':
      return {
        tone: 'wait',
        highlight: t('awayHighlightKilatPay', { wave: (ctx.kind === 'pay' && ctx.wave) || '—' }),
        notes: [],
        contact: 'adminAwayContactPromise',
        cta: 'awayCtaPay',
      };
    case 'F':
      return {
        tone: 'wait',
        highlight: t('awayHighlightKilatPick'),
        notes: [t('awayNoteOrderSafe')],
        contact: 'adminAwayContactPromise',
        cta: ctx.kind === 'kilat_pick' && ctx.leave ? 'awayCtaBackDashboard' : 'awayCtaGotIt',
      };
  }
}

const TONE: Record<Tone, string> = {
  go: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  wait: 'border-amber-200 bg-amber-50 text-amber-950',
};

export function AdminAwayModalHost() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  // Langganan inilah yang menjaga poller tetap hidup di seluruh dashboard,
  // supaya `getAdminAway()` di handler klik membaca keadaan yang segar.
  useAdminAway();
  const current = useSyncExternalStore(subscribe, () => request, () => null);
  if (!current) return null;

  const { ctx, away } = current;
  const copy = copyOf(ctx, t);
  const message = awayMessageFor(away, language);
  const HighlightIcon = copy.tone === 'go' ? CheckCircle2 : Hourglass;

  const onPrimary = () => {
    if (current.onContinue) return current.onContinue();
    close();
    if (ctx.kind === 'kilat_pick' && ctx.leave) navigate('/dashboard');
  };

  return (
    <Dialog open onOpenChange={(isOpen) => { if (!isOpen) close(); }}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md rounded-2xl bg-white p-5 sm:p-6">
        <div className="flex items-start gap-3 pr-6">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700" aria-hidden="true">
            <CalendarOff className="size-4.5" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-base font-bold text-slate-900">{t('adminHolidayTitle')}</DialogTitle>
            {message
              ? <DialogDescription className="mt-0.5 text-sm text-slate-700 break-words">{message}</DialogDescription>
              : <DialogDescription className="sr-only">{copy.highlight}</DialogDescription>}
          </div>
        </div>

        <div className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm leading-relaxed ${TONE[copy.tone]}`}>
          <HighlightIcon className="size-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p>{copy.highlight}</p>
        </div>

        {copy.notes.map((n) => (
          <p key={n} className="text-sm leading-relaxed text-slate-600">{n}</p>
        ))}

        <p className="flex items-start gap-2 text-sm leading-relaxed text-blue-800">
          <MessageCircle className="size-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{t(copy.contact)}</span>
        </p>

        <button
          type="button"
          onClick={onPrimary}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-jfu-primary px-4 py-3 text-sm font-semibold text-white hover:bg-jfu-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary focus-visible:ring-offset-2 cursor-pointer"
        >
          {t(copy.cta)}
          {current.onContinue && <span aria-hidden="true">→</span>}
        </button>
      </DialogContent>
    </Dialog>
  );
}
