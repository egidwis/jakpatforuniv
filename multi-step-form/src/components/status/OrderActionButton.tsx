import { Link } from 'react-router-dom';
import { CalendarClock, CreditCard, ExternalLink, FileText, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/i18n/LanguageContext';
import { formatIDR } from '@/utils/currency';
import type { PrimaryAction } from './orderAction';

export const ctaButtonClass = 'max-md:w-full min-h-9 text-xs px-4 justify-center whitespace-nowrap';
export const ctaRoyal = 'rounded-full font-bold text-white bg-gradient-to-r from-jfu-primary to-jfu-light hover:from-jfu-dark hover:to-jfu-primary shadow-xs hover:shadow transition-all';
export const ctaSoftAmber = 'rounded-full font-semibold bg-white text-amber-800 border border-amber-300 hover:bg-amber-50 shadow-2xs transition-all gap-1.5';

/**
 * Menggambar `PrimaryAction` — dipakai banner Fase ② dan kartu ringkas ponsel, jadi tombol yang
 * sama selalu tampil sama. Keputusan "tombol apa" ada di `primaryActionOf`, bukan di sini.
 */
export function OrderActionButton({ action, onReschedule }: {
    action: PrimaryAction;
    onReschedule: () => void;
}) {
    const { t } = useLanguage();

    if (action.kind === 'choose_schedule') {
        return (
            <Button size="sm" variant="outline" onClick={onReschedule} className={`${ctaButtonClass} ${ctaSoftAmber}`}>
                <CalendarClock className="w-3.5 h-3.5" />
                {t('chooseSchedule')}
            </Button>
        );
    }

    if (action.kind === 'reschedule') {
        return (
            <Button size="sm" variant="outline" onClick={onReschedule} className={`${ctaButtonClass} ${ctaSoftAmber}`}>
                <RotateCcw className="w-3.5 h-3.5" />
                {t('rescheduleSlot')}
            </Button>
        );
    }

    if (action.kind === 'view_bill') {
        return (
            <Link to={action.to} className="block max-md:w-full md:inline-block">
                <Button size="sm" variant="outline" className={`${ctaButtonClass} gap-1.5`}>
                    <FileText className="w-3.5 h-3.5" />
                    {t('groupBillFollowerCta')}
                </Button>
            </Link>
        );
    }

    const label = action.label === 'group'
        ? t('groupBillPayCta', { amount: formatIDR(action.groupTotal ?? 0) })
        : action.label === 'partial' ? t('payRemaining') : t('payNow');

    // `/bayar/` = Pages Function → <a href>; halaman Jadwal & Bayar = rute SPA → <Link>.
    return action.external ? (
        <a href={action.href} target="_blank" rel="noopener noreferrer" className="block max-md:w-full md:inline-block">
            <Button size="sm" className={`${ctaButtonClass} ${ctaRoyal} gap-1.5`}>
                <CreditCard className="w-3.5 h-3.5" />
                {label}
                <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </Button>
        </a>
    ) : (
        <Link to={action.href} className="block max-md:w-full md:inline-block">
            <Button size="sm" className={`${ctaButtonClass} ${ctaRoyal} gap-1.5`}>
                <CreditCard className="w-3.5 h-3.5" />
                {label}
            </Button>
        </Link>
    );
}
