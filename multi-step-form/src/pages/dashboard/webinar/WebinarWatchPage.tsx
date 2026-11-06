import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Loader2, Maximize, Minimize } from 'lucide-react';
import { toast } from 'sonner';
import { WebinarApiError, downloadMaterial, fetchWatch, type WebinarWatchView } from '@/utils/webinarApi';
import { WATERMARK_TICK_MS, formatMinutes, watermarkSpot } from '@/utils/webinarRecording';
import { AdminContactLine, CARD_CLASS } from '@/components/webinar/WebinarParts';

type Failure = { code: string; message: string };

const FAILURE_COPY: Record<string, { title: string; body: string }> = {
    not_owner: { title: 'Rekaman ini untuk pemilik tiket', body: 'Masuk dengan akun yang dipakai saat membeli tiket. Akun yang dipakai tertulis di e-tiketmu.' },
    inactive: { title: 'Tiket tidak aktif', body: 'Hubungi admin bila ada pertanyaan.' },
    not_ready: { title: 'Rekaman segera tersedia', body: 'Kamu akan menerima email begitu rekaman bisa ditonton.' },
    cancelled: { title: 'Acara dibatalkan', body: 'Acara ini tidak punya rekaman.' },
};

type FullscreenDoc = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type FullscreenEl = HTMLElement & { webkitRequestFullscreen?: () => void };

const fullscreenSupported = () => {
    const d = document as FullscreenDoc;
    return Boolean(d.fullscreenEnabled || d.webkitFullscreenEnabled);
};
const fullscreenElement = () => {
    const d = document as FullscreenDoc;
    return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
};

/**
 * C14 halaman tonton (Fase 5A). Penghalang ringan, bukan DRM:
 * - URL video hanya dari /api/webinar/watch (3 jam); habis → minta baru, lanjut di detik yang sama.
 * - Tanpa tombol unduh, PiP, dan menu klik kanan.
 * - Watermark email·kode berpindah tiap ±45 detik. Layar penuh memakai tombol kita yang
 *   membesarkan PEMBUNGKUS, jadi watermark ikut. Di iPhone (tanpa Fullscreen API) tombolnya
 *   disembunyikan; layar penuh bawaan iPhone tidak membawa watermark (batas yang diterima).
 */
export function WebinarWatchPage() {
    const { orderId = '' } = useParams();
    const [view, setView] = useState<WebinarWatchView | null>(null);
    const [failure, setFailure] = useState<Failure | null>(null);
    const [playError, setPlayError] = useState(false);
    const [tick, setTick] = useState(0);
    const [isFull, setIsFull] = useState(false);
    const [materialBusy, setMaterialBusy] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const resumeAt = useRef<number | null>(null);
    const refreshed = useRef(false);
    const canFullscreen = typeof document !== 'undefined' && fullscreenSupported();

    const load = useCallback(async () => {
        setFailure(null);
        setPlayError(false);
        try {
            setView(await fetchWatch(orderId));
        } catch (err) {
            const code = err instanceof WebinarApiError ? err.code ?? 'error' : 'error';
            setFailure({ code, message: err instanceof Error ? err.message : '' });
        }
    }, [orderId]);

    useEffect(() => { void load(); }, [load]);

    useEffect(() => {
        const t = setInterval(() => setTick((n) => n + 1), WATERMARK_TICK_MS);
        return () => clearInterval(t);
    }, []);

    useEffect(() => {
        const onChange = () => setIsFull(fullscreenElement() === wrapRef.current);
        document.addEventListener('fullscreenchange', onChange);
        document.addEventListener('webkitfullscreenchange', onChange);
        return () => {
            document.removeEventListener('fullscreenchange', onChange);
            document.removeEventListener('webkitfullscreenchange', onChange);
        };
    }, []);

    // Link habis (atau jaringan putus): minta URL baru SEKALI lalu lanjut dari detik yang sama.
    const onVideoError = async () => {
        const video = videoRef.current;
        if (refreshed.current || !video) { setPlayError(true); return; }
        refreshed.current = true;
        resumeAt.current = video.currentTime || resumeAt.current;
        try {
            setView(await fetchWatch(orderId));
        } catch {
            setPlayError(true);
        }
    };

    const onLoadedMetadata = () => {
        const video = videoRef.current;
        if (video && resumeAt.current) {
            video.currentTime = resumeAt.current;
            resumeAt.current = null;
            void video.play().catch(() => undefined);
        }
    };

    const toggleFullscreen = () => {
        const d = document as FullscreenDoc;
        if (fullscreenElement()) {
            if (d.exitFullscreen) void d.exitFullscreen(); else d.webkitExitFullscreen?.();
            return;
        }
        const el = wrapRef.current as FullscreenEl | null;
        if (!el) return;
        if (el.requestFullscreen) void el.requestFullscreen().catch(() => undefined);
        else el.webkitRequestFullscreen?.();
    };

    const getMaterial = async () => {
        setMaterialBusy(true);
        try {
            await downloadMaterial(orderId);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Materi belum bisa diunduh.');
        } finally {
            setMaterialBusy(false);
        }
    };

    const back = (
        <Link to="/dashboard/webinar" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600">
            <ArrowLeft className="h-4 w-4" /> Webinar
        </Link>
    );

    if (failure) {
        const copy = FAILURE_COPY[failure.code];
        return (
            <div className="mx-auto max-w-3xl px-4 py-5 md:px-6 md:py-8">
                {back}
                <div className={`${CARD_CLASS} mt-4 p-6 text-center`}>
                    <p className="font-semibold text-slate-900">{copy?.title ?? 'Video belum bisa diputar'}</p>
                    <p className="mt-1 text-sm text-slate-600">{copy?.body ?? 'Coba muat ulang atau ganti jaringan.'}</p>
                    {failure.code === 'not_owner' && (
                        <Link to="/dashboard/webinar" className="mt-4 inline-block text-sm font-semibold text-jfu-primary">Lihat webinar & tiketmu →</Link>
                    )}
                    {!copy && (
                        <button type="button" onClick={() => { void load(); }} className="mt-4 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
                            Muat ulang
                        </button>
                    )}
                </div>
                <AdminContactLine className="mt-4" />
            </div>
        );
    }

    if (!view) {
        return <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-jfu-primary" /></div>;
    }

    const { event } = view;
    const spot = watermarkSpot(view.watermark, tick);
    const speakers = event.speakers.map((s) => s.name).filter(Boolean).join(', ');
    const minutes = formatMinutes(view.minutes);

    return (
        <div className="mx-auto max-w-6xl px-4 py-5 md:px-6 md:py-8">
            {back}
            <div className="mt-4 [display:grid] gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="min-w-0">
                    <div
                        ref={wrapRef}
                        onContextMenu={(e) => e.preventDefault()}
                        className="relative aspect-video overflow-hidden rounded-xl bg-black select-none"
                    >
                        <video
                            ref={videoRef}
                            key={view.video_url}
                            src={view.video_url}
                            poster={event.poster_url ?? undefined}
                            controls
                            controlsList="nodownload nofullscreen noremoteplayback"
                            disablePictureInPicture
                            playsInline
                            preload="metadata"
                            onError={() => { void onVideoError(); }}
                            onLoadedMetadata={onLoadedMetadata}
                            onPlaying={() => { refreshed.current = false; setPlayError(false); }}
                            onDoubleClick={(e) => { e.preventDefault(); if (canFullscreen) toggleFullscreen(); }}
                            className="h-full w-full object-contain"
                        />
                        <span
                            aria-hidden="true"
                            className="pointer-events-none absolute z-10 rounded bg-black/25 px-1.5 py-0.5 text-[11px] font-medium text-white/70 transition-all duration-700"
                            style={spot}
                        >
                            {view.watermark}
                        </span>
                        {canFullscreen && (
                            <button
                                type="button"
                                onClick={toggleFullscreen}
                                aria-label={isFull ? 'Keluar layar penuh' : 'Layar penuh'}
                                className="absolute right-2 top-2 z-20 rounded-lg bg-black/50 p-1.5 text-white hover:bg-black/70"
                            >
                                {isFull ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                            </button>
                        )}
                        {playError && (
                            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/80 p-4 text-center text-sm text-white">
                                Video belum bisa diputar. Coba muat ulang atau ganti jaringan.
                                <button type="button" onClick={() => { refreshed.current = false; void load(); }} className="rounded-lg bg-white px-3 py-1.5 font-semibold text-slate-900">
                                    Muat ulang
                                </button>
                            </div>
                        )}
                    </div>

                    <h1 className="mt-4 text-lg font-bold text-slate-900">{event.title}</h1>
                    <p className="text-sm text-slate-500">{[minutes, speakers].filter(Boolean).join(' · ')}</p>
                    <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                        Rekaman ini hanya untuk akunmu. Email-mu tampil di video sebagai penanda; jangan unduh atau sebarkan.
                    </p>
                </div>

                <aside className={`${CARD_CLASS} h-fit p-4`}>
                    {view.has_materials && (
                        <button
                            type="button"
                            onClick={() => { void getMaterial(); }}
                            disabled={materialBusy}
                            className="mb-4 inline-flex items-center justify-center gap-2 rounded-xl bg-jfu-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                            style={{ width: '100%' }}
                        >
                            {materialBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Unduh materi
                        </button>
                    )}
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Tentang acara</p>
                    {event.schedule_label && <p className="mt-1 text-sm text-slate-700">{event.schedule_label}</p>}
                    {event.speakers.map((s) => (
                        <p key={`${s.name}-${s.title}`} className="text-sm text-slate-600">{[s.name, s.title].filter(Boolean).join(', ')}</p>
                    ))}
                    <AdminContactLine className="mt-4" />
                </aside>
            </div>
        </div>
    );
}
