import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle, Info, Loader2, Lock, Mail, Phone, Ticket, User } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { getOwnProfile, isProfileComplete, type ResearcherProfile } from '@/utils/supabase';
import { createInFlightGate } from '@/utils/inFlightGate';
import {
    checkoutErrorText, fetchMyWebinarOrders, fetchWebinarEvent, previewWebinarVoucher, startWebinarCheckout, webinarContactError,
    WebinarApiError, type WebinarCheckoutResult, type WebinarContact, type WebinarEventView, type WebinarVoucherPreview,
} from '@/utils/webinarApi';
import { FieldRow, SectionLabel } from '@/components/SurveyFieldRow';
import { Switch } from '@/components/ui/switch';
import { ProfileCompletionSheet } from '@/components/ProfileCompletionSheet';
import { AdminContactLine, CARD_CLASS, WebinarBadge, WebinarPoster } from '@/components/webinar/WebinarParts';

export function WebinarCheckoutPage() {
    const { slug = '' } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [event, setEvent] = useState<WebinarEventView | null>(null);
    const [profile, setProfile] = useState<ResearcherProfile | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [terms, setTerms] = useState(false);
    const [consent, setConsent] = useState(false);
    const [paying, setPaying] = useState(false);
    const [profileSheet, setProfileSheet] = useState(false);
    // Sama dengan Detail Invoice di alur iklan (StepCheckout): menyala = data akun
    // terkunci; dimatikan = kontak khusus order ini, tanpa mengubah profil.
    const [useAccountData, setUseAccountData] = useState(true);
    const [contact, setContact] = useState<WebinarContact>({ name: '', email: '', phone: '' });
    const [contactTouched, setContactTouched] = useState(false);
    const gate = useMemo(() => createInFlightGate<WebinarCheckoutResult>(), []);
    // Voucher: pola alur iklan (kode → pesan di bawah kolom). Di sini dinilai server,
    // karena katalog dan harga webinar ada di sana; pratinjau tidak menentukan tagihan.
    const [voucherCode, setVoucherCode] = useState('');
    const [voucher, setVoucher] = useState<WebinarVoucherPreview | null>(null);
    const [voucherChecking, setVoucherChecking] = useState(false);

    useEffect(() => {
        const code = voucherCode.trim();
        setVoucher(null);
        if (!code) { setVoucherChecking(false); return undefined; }
        setVoucherChecking(true);
        let alive = true;
        const timer = setTimeout(() => {
            previewWebinarVoucher(slug, code)
                .then((r) => { if (alive) setVoucher(r); })
                .catch(() => { if (alive) setVoucher({ valid: false, reason: 'unknown', message: 'Voucher belum bisa dicek. Coba lagi.' }); })
                .finally(() => { if (alive) setVoucherChecking(false); });
        }, 450);
        return () => { alive = false; clearTimeout(timer); };
    }, [voucherCode, slug]);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const [ev, mine, own] = await Promise.all([fetchWebinarEvent(slug), fetchMyWebinarOrders(), getOwnProfile()]);
                if (!alive) return;
                // Pending dan lunas sama-sama punya halaman sendiri; jangan menawarkan bayar lagi.
                const existing = mine.orders.find((o) => o.event.slug === slug && (o.status === 'paid' || o.status === 'pending'));
                if (existing && (existing.status === 'pending' || existing.kind === 'live' || ev.kind === 'replay')) {
                    navigate(`/dashboard/webinar/tiket/${existing.id}`, { replace: true });
                    return;
                }
                setEvent(ev);
                setProfile(own);
                if (!isProfileComplete(own)) setProfileSheet(true);
            } catch (err) {
                if (alive) setLoadError(err instanceof WebinarApiError && err.status === 404 ? 'Acara tidak ditemukan.' : 'Halaman belum bisa dimuat. Coba lagi beberapa saat.');
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [slug, navigate]);

    const reloadProfile = async () => {
        const own = await getOwnProfile();
        setProfile(own);
        setProfileSheet(false);
    };

    const accountContact: WebinarContact = {
        name: profile?.full_name ?? '',
        email: user?.email ?? '',
        phone: profile?.phone_number ?? '',
    };
    const shown = useAccountData ? accountContact : contact;
    const contactError = useAccountData ? null : webinarContactError(contact);
    const isEmailMismatch = !useAccountData && !!contact.email.trim()
        && contact.email.trim().toLowerCase() !== (user?.email ?? '').toLowerCase();

    const handleUseAccountDataChange = (checked: boolean) => {
        setUseAccountData(checked);
        setContactTouched(false);
        // Sama dengan alur iklan: dimatikan berarti mulai dari kolom kosong.
        if (!checked) setContact({ name: '', email: '', phone: '' });
    };

    const pay = async () => {
        if (!terms || paying) return;
        if (!isProfileComplete(profile)) {
            setProfileSheet(true);
            return;
        }
        if (contactError) {
            setContactTouched(true);
            toast.error(contactError);
            return;
        }
        // Kode yang diketik tapi tidak berlaku tidak boleh diam-diam dibayar harga penuh.
        if (voucherCode.trim() && (voucherChecking || !voucher?.valid)) {
            toast.error(voucherChecking ? 'Voucher sedang dicek. Tunggu sebentar.' : (voucher?.message ?? 'Kode voucher belum berlaku.'));
            return;
        }
        // Tab dibuka sebelum await supaya tidak kena pemblokir popup.
        const tab = window.open('about:blank', '_blank');
        setPaying(true);
        try {
            const result = await gate.run(() => startWebinarCheckout(slug, consent, useAccountData ? null : {
                name: contact.name.trim(), email: contact.email.trim(), phone: contact.phone.trim(),
            }, voucher?.valid ? voucher.code : ''));
            if (result.paymentUrl) {
                if (tab) tab.location.href = result.paymentUrl;
                else {
                    window.location.href = result.paymentUrl;
                    return;
                }
            } else {
                tab?.close();
            }
            navigate(`/dashboard/webinar/tiket/${result.orderId}`, { replace: true });
        } catch (err) {
            tab?.close();
            if (err instanceof WebinarApiError && err.code === 'voucher_invalid') {
                setVoucher({ valid: false, reason: 'unknown', message: err.message });
                toast.error(err.message);
            } else if (err instanceof WebinarApiError && err.code === 'contact_invalid') {
                setContactTouched(true);
                toast.error(err.message);
            } else if (err instanceof WebinarApiError && err.code === 'profile_incomplete') {
                setProfileSheet(true);
            } else {
                toast.error(checkoutErrorText(err));
            }
            setPaying(false);
        }
    };

    if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-jfu-primary" /></div>;

    if (loadError || !event) {
        return (
            <div className="max-w-xl mx-auto px-4 py-10 text-center space-y-3">
                <p className="text-slate-700">{loadError ?? 'Acara tidak ditemukan.'}</p>
                <Link className="font-semibold text-jfu-primary" to="/dashboard/webinar">Kembali ke Webinar</Link>
            </div>
        );
    }

    const summary = (
        <div className={`${CARD_CLASS} p-4 space-y-3`}>
            <WebinarPoster event={event} />
            <WebinarBadge event={event} />
            <h2 className="font-bold text-slate-900 leading-snug">{event.title}</h2>
            {event.schedule_label && <p className="text-sm text-slate-600">{event.schedule_label}</p>}
            <div className="border-t border-slate-100 pt-3 space-y-1.5">
                <div className="flex items-baseline justify-between">
                    <span className="text-sm text-slate-600">{event.kind === 'live' ? 'Tiket' : 'Video kelas'}</span>
                    <span className={`text-sm ${voucher?.valid ? 'text-slate-500 line-through' : 'font-bold text-slate-900'}`}>{event.price_label}</span>
                </div>
                {voucher?.valid && (
                    <>
                        <div className="flex items-baseline justify-between text-sm text-emerald-700">
                            <span>Voucher {voucher.code}</span>
                            <span>{voucher.discount_label}</span>
                        </div>
                        <div className="flex items-baseline justify-between">
                            <span className="text-sm font-semibold text-slate-900">Total</span>
                            <span className="font-bold text-slate-900">{voucher.total_label}</span>
                        </div>
                    </>
                )}
                <p className="text-right text-xs text-slate-500">sudah termasuk PPN 11%</p>
            </div>
        </div>
    );
    const totalLabel = voucher?.valid ? voucher.total_label : event.price_label;

    const payButton = (
        <button
            type="button"
            onClick={pay}
            disabled={!terms || paying || !event.can_buy}
            className="w-full rounded-xl bg-jfu-primary px-4 py-3 font-semibold text-white disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
            {paying && <Loader2 className="w-4 h-4 animate-spin" />}
            Bayar
        </button>
    );

    return (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-5 md:py-8 pb-28 lg:pb-8 space-y-4">
            <Link to="/dashboard/webinar" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500">
                <ArrowLeft className="w-4 h-4" /> Kembali
            </Link>
            <h1 className="text-xl font-bold text-slate-900">Konfirmasi {event.kind === 'live' ? 'tiket' : 'pembelian'}</h1>

            {!event.can_buy && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {event.note ?? 'Penjualan belum dibuka.'}
                </div>
            )}

            <div className="grid gap-4 lg:grid-cols-12 items-start">
                <div className="lg:col-span-7 space-y-4 order-2 lg:order-1">
                    <section className={`${CARD_CLASS} p-4 md:p-5 space-y-4`}>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <SectionLabel>Data peserta</SectionLabel>
                            <div className="flex items-center gap-2.5 select-none">
                                <span className="text-xs font-medium text-slate-600">Sama dengan data akun</span>
                                <Switch
                                    checked={useAccountData}
                                    onCheckedChange={handleUseAccountDataChange}
                                    className="data-[state=unchecked]:!bg-slate-200 data-[state=checked]:!bg-jfu-primary"
                                />
                            </div>
                        </div>
                        <p className="text-xs text-slate-500 -mt-1 leading-relaxed">
                            {event.kind === 'live' ? 'E-tiket' : 'Bukti pembelian'} dan kwitansi dikirim ke kontak berikut.
                        </p>
                        <div className="space-y-2.5">
                            {([
                                { key: 'name', icon: User, label: 'Nama Lengkap', type: 'text', placeholder: 'Nama sesuai KTP' },
                                { key: 'email', icon: Mail, label: event.kind === 'live' ? 'Email E-tiket' : 'Email', type: 'email', placeholder: 'email@contoh.com' },
                                { key: 'phone', icon: Phone, label: 'No Telepon', type: 'tel', placeholder: '08xxxxxxxxxx' },
                            ] as const).map((f) => (
                                <FieldRow
                                    key={f.key}
                                    icon={f.icon}
                                    label={f.label}
                                    htmlFor={`webinar-${f.key}`}
                                    required
                                    compact
                                    readOnly={useAccountData}
                                    hint={f.key === 'email' && isEmailMismatch ? (
                                        <span className="flex items-start gap-1.5 text-amber-700 bg-amber-50/80 p-2 rounded-lg border border-amber-200/70 mt-1">
                                            <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                                            <span>
                                                Email ini berbeda dari akun login kamu (<strong>{user?.email}</strong>). E-tiket dikirim ke email di atas, dan tiketnya tetap tersimpan di akun ini.
                                            </span>
                                        </span>
                                    ) : undefined}
                                >
                                    <input
                                        id={`webinar-${f.key}`}
                                        type={f.type}
                                        disabled={useAccountData}
                                        readOnly={useAccountData}
                                        className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                                        placeholder={f.placeholder}
                                        value={shown[f.key]}
                                        onChange={(e) => setContact((c) => ({ ...c, [f.key]: e.target.value }))}
                                        onBlur={() => setContactTouched(true)}
                                    />
                                    {useAccountData && (
                                        <span className="shrink-0 text-slate-400 ml-2" title="Terkunci dari data akun">
                                            <Lock size={14} />
                                        </span>
                                    )}
                                </FieldRow>
                            ))}
                        </div>
                        {contactTouched && contactError && <p className="text-xs font-medium text-red-600">{contactError}</p>}

                        {/* SEKSI 2: kode voucher, sama dengan kartu Detail Invoice di alur iklan */}
                        <div className="pt-5 border-t border-slate-200/80 space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <SectionLabel>Kode Voucher / Referral</SectionLabel>
                                    <span className="text-xs text-slate-400 font-normal mb-2.5">(opsional)</span>
                                </div>
                                {voucher?.valid && (
                                    <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/80 mb-2.5">
                                        <CheckCircle size={12} />
                                        <span>Digunakan</span>
                                    </div>
                                )}
                            </div>
                            <FieldRow
                                icon={Ticket}
                                label="Kode Voucher"
                                htmlFor="webinar-voucher"
                                compact
                                hint={voucherChecking ? (
                                    <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                                        <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
                                        <span>Mengecek voucher…</span>
                                    </span>
                                ) : voucher ? (
                                    <span className={`flex items-center gap-1.5 text-xs font-medium ${voucher.valid ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {voucher.valid
                                            ? <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                                            : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                                        <span>{voucher.message}</span>
                                    </span>
                                ) : undefined}
                            >
                                <input
                                    id="webinar-voucher"
                                    type="text"
                                    maxLength={40}
                                    className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none uppercase font-mono tracking-wider"
                                    placeholder="Masukkan kode voucher atau referral"
                                    value={voucherCode}
                                    onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                                />
                            </FieldRow>
                        </div>
                    </section>

                    <section className={`${CARD_CLASS} p-4 space-y-3`}>
                        <label className="flex items-start gap-2.5 text-sm text-slate-700">
                            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>
                                Saya menyetujui{' '}
                                <a className="font-medium text-jfu-primary underline" href="https://jakpatforuniv.com/terms-conditions.html#webinar" target="_blank" rel="noopener noreferrer">Syarat &amp; Ketentuan</a>
                                , termasuk bahwa sesi ini direkam dan rekamannya tersedia sebagai video kelas di JFU.
                            </span>
                        </label>
                        <label className="flex items-start gap-2.5 text-sm text-slate-700">
                            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>Saya setuju dihubungi JFU lewat email/WhatsApp tentang webinar berikutnya (opsional).</span>
                        </label>
                        <AdminContactLine />
                    </section>
                </div>

                <aside className="lg:col-span-5 lg:sticky lg:top-24 space-y-3 order-1 lg:order-2">
                    {summary}
                    <div className="max-lg:hidden">{payButton}</div>
                </aside>
            </div>

            <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                <div className="flex items-center gap-3">
                    <span className="shrink-0">
                        <span className="block font-bold text-slate-900">{totalLabel}</span>
                        <span className="block text-xs text-slate-500">QRIS</span>
                    </span>
                    {payButton}
                </div>
            </div>

            <ProfileCompletionSheet open={profileSheet} onOpenChange={setProfileSheet} onCompleted={reloadProfile} />
        </div>
    );
}
