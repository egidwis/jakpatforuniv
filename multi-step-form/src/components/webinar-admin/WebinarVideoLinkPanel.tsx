import { useState, type ReactNode } from 'react';
import { CheckCircle2, Circle, Loader2, Lock, PlayCircle } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmRequest } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import {
    adminDateLabel, holderAccess, linkLocked, paidLiveOf, sourceCandidates, unlinkedVideos, type AdminWebinarEvent,
} from '@/utils/webinarAdmin';
import { linkVideo, unlinkVideo } from '@/utils/webinarAdminApi';
import { errorMessage, shortStamp } from '@/utils/webinarParticipants';
import { formatMinutes, materialFileLabel } from '@/utils/webinarRecording';
import { PanelHeading } from './WebinarFormParts';

/*
  Iterasi 8: video & materi hanya diunggah di Video kelas. Webinar cukup dikaitkan ke
  satu Video kelas; pemegang tiketnya menonton rekaman itu tanpa membeli. Kaitan
  terkunci (tidak bisa dilepas/diganti) sesudah pemegang tiket bisa menonton dan ada
  tiket lunas (keputusan pemilik produk 10 Nov). Aturan yang sama ditegakkan server.
*/

type Changed = (video: AdminWebinarEvent) => void;

/** Kalimat "n pemegang tiket bisa menonton …" untuk keadaan kaitan. */
function accessLine(webinar: AdminWebinarEvent, video: AdminWebinarEvent | null, now = Date.now()): string {
    const n = paidLiveOf(webinar);
    const who = n > 0 ? `${n} pemegang tiket` : 'Pemegang tiket';
    const { state, since } = holderAccess(webinar, video, now);
    if (state === 'open') return `${who} bisa menonton sejak ${shortStamp(since!)} WIB.`;
    if (state === 'start') return `${who} bisa menonton sesudah acara mulai${since ? ` (${shortStamp(since)} WIB)` : ''}.`;
    return `${who} bisa menonton sesudah rekaman Video kelas terbit.`;
}

/**
 * Kaitkan / Lepas kaitan dengan dialog konfirmasi. Mengaitkan ke webinar yang sudah
 * mulai, dengan rekaman yang sudah terbit, langsung membuka akses + email dan
 * langsung mengunci kaitannya: dialognya menyebut itu sebelum ditekan.
 */
export function useVideoLinkActions(onChanged: Changed) {
    const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
    const [busy, setBusy] = useState(false);

    const askLink = (webinar: AdminWebinarEvent, video: AdminWebinarEvent) => {
        const linked = { ...video, source_event_id: webinar.id, source_linked_at: new Date().toISOString() };
        const opens = holderAccess(webinar, linked).state === 'open';
        const n = paidLiveOf(webinar);
        setConfirm({
            title: 'Kaitkan Video kelas ke webinar?',
            highlight: `${video.title} → ${webinar.title}`,
            lines: [
                opens && n > 0
                    ? `${n} pemegang tiket langsung bisa menonton dan otomatis menerima email "Rekaman tersedia".`
                    : 'Pemegang tiket webinar ini ikut menonton video ini tanpa membeli, sesudah rekamannya terbit dan acara mulai.',
                opens && n > 0
                    ? 'Kaitan langsung terkunci: tidak bisa dilepas atau diganti, dan Video kelas ini tidak bisa dihapus.'
                    : 'Kaitan bisa dilepas sampai pemegang tiket mulai bisa menonton; sesudah itu terkunci.',
            ],
            confirmLabel: 'Kaitkan',
            cancelLabel: 'Kembali',
            tone: 'neutral',
            onConfirm: async () => {
                setBusy(true);
                try {
                    const r = await linkVideo(webinar.id, video.id);
                    onChanged(r.video);
                    toast.success(r.notify_scheduled
                        ? `Dikaitkan. Email ke ${r.notify_scheduled} pemegang tiket berangkat dalam ±1 menit.`
                        : 'Video kelas dikaitkan');
                } catch (err) {
                    toast.error(errorMessage(err, 'Video kelas belum bisa dikaitkan.'));
                } finally {
                    setBusy(false);
                }
            },
        });
    };

    const askUnlink = (webinar: Pick<AdminWebinarEvent, 'title'> | null, video: AdminWebinarEvent) => setConfirm({
        title: 'Lepas kaitan?',
        highlight: webinar ? `${video.title} ✕ ${webinar.title}` : video.title,
        lines: [
            'Pemegang tiket webinar itu tidak lagi mendapat rekaman dari Video kelas ini.',
            'Video, materi, dan pembeli Video kelas tidak berubah.',
        ],
        confirmLabel: 'Lepas kaitan',
        cancelLabel: 'Kembali',
        tone: 'danger',
        onConfirm: async () => {
            setBusy(true);
            try {
                onChanged(await unlinkVideo(video.id));
                toast.success('Kaitan dilepas');
            } catch (err) {
                toast.error(errorMessage(err, 'Kaitan belum bisa dilepas.'));
            } finally {
                setBusy(false);
            }
        },
    });

    const dialog = <ConfirmDialog request={confirm} onDismiss={() => setConfirm(null)} />;
    return { askLink, askUnlink, busy, dialog };
}

function LockNote({ webinar }: { webinar: AdminWebinarEvent }) {
    return (
        <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Terkunci: {paidLiveOf(webinar)} pemegang tiket sudah bisa menonton. Kaitan tidak bisa dilepas atau diganti.</span>
        </p>
    );
}

function StepLine({ done, children }: { done: boolean; children: ReactNode }) {
    const Icon = done ? CheckCircle2 : Circle;
    return (
        <p className={cn('flex items-start gap-1.5 text-[13px]', done ? 'text-slate-700' : 'text-slate-500')}>
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', done ? 'text-emerald-600' : 'text-slate-300')} />
            <span className="min-w-0">{children}</span>
        </p>
    );
}

/**
 * Panel "Rekaman & materi" di editor WEBINAR terbit: pilih Video kelas yang dikaitkan,
 * atau buat dari webinar ini. Data dari daftar acara (`events`), tanpa permintaan baru.
 */
export function WebinarVideoLinkPanel({
    webinar,
    events,
    onVideoChanged,
    onCreateVideo,
    onOpenVideo,
}: {
    webinar: AdminWebinarEvent;
    events: AdminWebinarEvent[];
    onVideoChanged: Changed;
    onCreateVideo?: () => void;
    onOpenVideo?: (video: AdminWebinarEvent) => void;
}) {
    const video = events.find((e) => e.offer_kind === 'replay' && e.source_event_id === webinar.id) ?? null;
    // Jumlah tiket dari daftar (sold_live) bila ada; baris form membawa offer_state.
    const listRow = events.find((e) => e.id === webinar.id);
    const web = { ...webinar, sold_live: listRow?.sold_live ?? webinar.sold_live };
    const choices = unlinkedVideos(events).filter((e) => Boolean(e.is_test) === Boolean(webinar.is_test));
    const [picked, setPicked] = useState('');
    const { askLink, askUnlink, busy, dialog } = useVideoLinkActions(onVideoChanged);
    const locked = linkLocked(web, video);

    return (
        <section className="space-y-3">
            <PanelHeading>Rekaman &amp; materi</PanelHeading>
            <p className="text-[13px] text-slate-600">
                Rekaman dan materi diunggah di Video kelas, lalu dikaitkan ke webinar ini. Pemegang tiket menonton tanpa membeli.
            </p>

            {video ? (
                <div className="space-y-2.5 rounded-xl border border-slate-200 p-3">
                    <p className="flex min-w-0 items-start gap-1.5 text-[13px] font-semibold text-slate-800">
                        <PlayCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                        <span className="min-w-0">
                            {video.title}
                            <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                                {video.status === 'published' ? 'Terbit' : 'Draft'}
                            </span>
                        </span>
                    </p>
                    <StepLine done={Boolean(video.recording_published_at)}>
                        Rekaman {video.recording_published_at
                            ? `terbit ${shortStamp(video.recording_published_at)}${video.recording_minutes ? ` · ${formatMinutes(video.recording_minutes)}` : ''}`
                            : video.recording_object_key ? 'diunggah, belum terbit' : 'belum diunggah'}
                    </StepLine>
                    <StepLine done={Boolean(video.materials_path)}>
                        Materi {video.materials_path ? materialFileLabel(video.materials_path) : 'belum diunggah'}
                    </StepLine>
                    <p className="text-[13px] font-medium text-slate-700">{accessLine(web, video)}</p>
                    {locked && <LockNote webinar={web} />}
                    <div className="flex flex-wrap gap-2">
                        {onOpenVideo && (
                            <button type="button" onClick={() => onOpenVideo(video)}
                                className="h-9 rounded-lg border border-blue-200 bg-white px-3 text-[13px] font-semibold text-blue-700 hover:bg-blue-50">
                                Buka Video kelas →
                            </button>
                        )}
                        {!locked && (
                            <button type="button" disabled={busy} onClick={() => askUnlink(webinar, video)}
                                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                                Lepas kaitan
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <div className="space-y-2.5 rounded-xl border border-dashed border-slate-300 p-3">
                    {choices.length > 0 && (
                        <div className="space-y-2">
                            <select
                                value={picked}
                                onChange={(e) => setPicked(e.target.value)}
                                aria-label="Pilih Video kelas"
                                className="block h-9 w-full rounded-lg border px-2 text-[13px]"
                            >
                                <option value="">Pilih Video kelas…</option>
                                {choices.map((e) => (
                                    <option key={e.id} value={e.id}>
                                        {e.title}{e.status === 'draft' ? ' (draft)' : ''}{e.recording_published_at ? '' : ' · rekaman belum terbit'}
                                    </option>
                                ))}
                            </select>
                            <button
                                type="button"
                                disabled={!picked || busy}
                                onClick={() => {
                                    const chosen = choices.find((e) => e.id === picked);
                                    if (chosen) askLink(web, chosen);
                                }}
                                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Kaitkan
                            </button>
                        </div>
                    )}
                    {onCreateVideo ? (
                        <p className="text-[13px] text-slate-600">
                            {choices.length > 0 && 'atau '}
                            <button type="button" onClick={onCreateVideo} className="font-semibold text-blue-700 hover:underline">
                                + Buat Video kelas dari webinar ini
                            </button>
                        </p>
                    ) : choices.length === 0 && (
                        <p className="text-[13px] text-slate-500">Belum ada Video kelas yang bisa dikaitkan.</p>
                    )}
                    <p className="text-[12px] text-slate-500">
                        Rekaman khusus peserta? Biarkan halaman Video kelasnya draft; cukup terbitkan rekamannya.
                    </p>
                </div>
            )}
            {dialog}
        </section>
    );
}

/**
 * Isian "Dijual sebagai" di editor VIDEO KELAS: Dijual saja / Dikaitkan dengan webinar.
 * Kaitan tidak ikut simpan otomatis; selalu lewat Kaitkan / Lepas kaitan.
 */
export function WebinarVideoSourceField({
    video,
    events,
    disabled,
    onVideoChanged,
}: {
    /** Null = draft belum tersimpan. */
    video: AdminWebinarEvent | null;
    events: AdminWebinarEvent[];
    disabled?: boolean;
    onVideoChanged: Changed;
}) {
    const linkedTo = video?.source_event_id ? events.find((e) => e.id === video.source_event_id) ?? null : null;
    const [mode, setMode] = useState<'solo' | 'linked'>(video?.source_event_id ? 'linked' : 'solo');
    const [picked, setPicked] = useState('');
    const { askLink, askUnlink, busy, dialog } = useVideoLinkActions((next) => {
        setMode(next.source_event_id ? 'linked' : 'solo');
        setPicked('');
        onVideoChanged(next);
    });
    const locked = Boolean(video && linkedTo && linkLocked(linkedTo, video));
    const candidates = video
        ? sourceCandidates(events, video.id).filter((e) => e.status === 'published' && Boolean(e.is_test) === Boolean(video.is_test))
        : [];
    const shownMode = video?.source_event_id ? 'linked' : mode;

    const choose = (next: 'solo' | 'linked') => {
        if (next === shownMode) return;
        if (next === 'solo' && video?.source_event_id) { askUnlink(linkedTo, video); return; }
        setMode(next);
    };

    return (
        <div className="space-y-2">
            <span className="text-[13px] font-semibold text-slate-800">Dijual sebagai</span>
            <div role="radiogroup" aria-label="Dijual sebagai" className="flex flex-wrap gap-2">
                {([['solo', 'Dijual saja'], ['linked', 'Dikaitkan dengan webinar']] as const).map(([value, label]) => (
                    <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={shownMode === value}
                        disabled={disabled || locked || busy || !video}
                        onClick={() => choose(value)}
                        className={cn(
                            'h-9 rounded-lg border px-3 text-[13px] font-semibold disabled:opacity-60',
                            shownMode === value ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                        )}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {!video ? (
                <p className="text-xs text-slate-500">Isi judul dulu; sesudah draft tersimpan, video ini bisa dikaitkan dengan webinar.</p>
            ) : shownMode === 'linked' && video.source_event_id ? (
                <div className="space-y-2">
                    <p className="text-[13px] text-slate-700">
                        Dikaitkan dengan <span className="font-semibold">{linkedTo?.title ?? 'webinar'}</span>
                        {linkedTo?.starts_at ? ` · ${adminDateLabel(linkedTo.starts_at)}` : ''}
                    </p>
                    <p className="text-xs text-slate-500">
                        {linkedTo ? accessLine(linkedTo, video) : 'Pemegang tiket webinar ini ikut menonton video ini tanpa membeli.'}
                    </p>
                    {locked && linkedTo && <LockNote webinar={linkedTo} />}
                </div>
            ) : shownMode === 'linked' ? (
                <div className="space-y-2">
                    <div className="space-y-2">
                        <select
                            value={picked}
                            onChange={(e) => setPicked(e.target.value)}
                            disabled={disabled || busy}
                            aria-label="Pilih webinar"
                            className="block h-9 w-full rounded-lg border px-2 text-[13px]"
                        >
                            <option value="">Pilih webinar…</option>
                            {candidates.map((e) => (
                                <option key={e.id} value={e.id}>{e.title}{e.starts_at ? ` · ${adminDateLabel(e.starts_at)}` : ''}</option>
                            ))}
                        </select>
                        <button
                            type="button"
                            disabled={!picked || disabled || busy}
                            onClick={() => {
                                const web = candidates.find((e) => e.id === picked);
                                if (web) askLink(web, video);
                            }}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Kaitkan
                        </button>
                    </div>
                    <p className="text-xs text-slate-500">
                        {candidates.length
                            ? 'Pemegang tiket webinar ini ikut menonton video ini tanpa membeli. Rekaman khusus peserta? Biarkan halaman ini draft; cukup terbitkan rekamannya.'
                            : 'Belum ada webinar terbit yang bisa dikaitkan. Satu webinar paling banyak satu Video kelas.'}
                    </p>
                </div>
            ) : (
                <p className="text-xs text-slate-500">Dijual ke umum tanpa webinar. Pilih "Dikaitkan" bila video ini rekaman salah satu webinar.</p>
            )}
            {dialog}
        </div>
    );
}
