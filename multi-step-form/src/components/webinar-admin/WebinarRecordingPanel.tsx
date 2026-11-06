import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, FileText, Loader2, Play, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/utils/supabase';
import { ConfirmDialog, type ConfirmRequest } from '@/components/ui/confirm-dialog';
import { seatsSummary, type AdminWebinarEvent } from '@/utils/webinarAdmin';
import {
    abortRecordingUpload, completeRecordingUpload, publishRecording, recordingPartUrls, recordingPreview,
    saveWebinarMaterials, startRecordingUpload,
} from '@/utils/webinarAdminApi';
import {
    MATERIAL_ACCEPT, formatBytes, formatEta, formatMinutes, materialFileLabel, materialPath, readDurationMinutes,
    uploadRecording, validateMaterialFile, validateRecordingFile,
} from '@/utils/webinarRecording';
import { errorMessage, shortStamp } from '@/utils/webinarParticipants';
import { PanelHeading } from './WebinarFormParts';

const MATERIALS_BUCKET = 'webinar-materials';

interface Progress {
    name: string;
    size: number;
    loaded: number;
    startedAt: number;
}

/**
 * C12 "Rekaman & materi" di form acara (Fase 5A). Video diunggah dari browser
 * langsung ke R2 per bagian; materi ke bucket Supabase `webinar-materials`.
 * Terbit = dua centang wajib, lalu email "Rekaman tersedia" sekali per tiket (cron, sql/136b).
 */
export function WebinarRecordingPanel({ row, onRow }: { row: AdminWebinarEvent; onRow: (row: AdminWebinarEvent) => void }) {
    const [progress, setProgress] = useState<Progress | null>(null);
    const [phase, setPhase] = useState<'idle' | 'reading' | 'uploading' | 'saving'>('idle');
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewBusy, setPreviewBusy] = useState(false);
    const [materialBusy, setMaterialBusy] = useState(false);
    const [checks, setChecks] = useState({ speaker: false, faces: false });
    const [publishing, setPublishing] = useState(false);
    const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const videoInput = useRef<HTMLInputElement>(null);
    const materialInput = useRef<HTMLInputElement>(null);

    const busy = phase !== 'idle';
    const hasVideo = Boolean(row.recording_object_key);
    const published = Boolean(row.recording_published_at);
    const sold = seatsSummary(row.webinar_offer_state).sold;
    const eventEnded = row.starts_at
        ? Date.parse(row.starts_at) + (row.duration_minutes || 0) * 60_000 < Date.now()
        : true;

    // Menutup tab membatalkan unggahan; peringatkan selama berjalan.
    useEffect(() => {
        if (!busy) return;
        const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [busy]);

    // Pratinjau lama menunjuk objek yang mungkin sudah diganti.
    useEffect(() => { setPreviewUrl(null); }, [row.recording_object_key]);

    async function pickVideo(file: File | undefined) {
        if (!file) return;
        const invalid = validateRecordingFile(file);
        if (invalid) { toast.error(invalid); return; }
        setPhase('reading');
        let minutes: number;
        try {
            minutes = await readDurationMinutes(file);
        } catch (err) {
            setPhase('idle');
            toast.error(errorMessage(err, 'Durasi video tidak terbaca.'));
            return;
        }

        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setProgress({ name: file.name, size: file.size, loaded: 0, startedAt: Date.now() });
        setPhase('uploading');
        try {
            await uploadRecording(file, {
                start: () => startRecordingUpload(row.id, file.name, file.size),
                partUrls: ({ key, uploadId, partNumbers }) => recordingPartUrls(row.id, key, uploadId, partNumbers),
                complete: async (req) => {
                    setPhase('saving');
                    const result = await completeRecordingUpload(row.id, req);
                    onRow(result.event);
                    if (result.old_deleted === false) toast.warning('Video baru tersimpan, tetapi video lama gagal dihapus dari penyimpanan.');
                },
                abort: ({ key, uploadId }) => abortRecordingUpload(row.id, key, uploadId),
            }, {
                minutes,
                signal: ctrl.signal,
                onProgress: ({ loaded }) => setProgress((p) => (p ? { ...p, loaded } : p)),
            });
            toast.success(`Video tersimpan · ${formatMinutes(minutes)}`);
        } catch (err) {
            if (ctrl.signal.aborted) toast.message('Unggahan dibatalkan');
            else toast.error(errorMessage(err, 'Unggahan gagal. Coba lagi.'));
        } finally {
            abortRef.current = null;
            setProgress(null);
            setPhase('idle');
            if (videoInput.current) videoInput.current.value = '';
        }
    }

    async function loadPreview() {
        setPreviewBusy(true);
        try {
            setPreviewUrl((await recordingPreview(row.id)).url);
        } catch (err) {
            toast.error(errorMessage(err, 'Pratinjau belum bisa dimuat.'));
        } finally {
            setPreviewBusy(false);
        }
    }

    async function pickMaterial(file: File | undefined) {
        if (!file) return;
        const invalid = validateMaterialFile(file);
        if (invalid) { toast.error(invalid); return; }
        setMaterialBusy(true);
        try {
            const path = materialPath(row.id, file.name);
            const { error } = await supabase.storage.from(MATERIALS_BUCKET).upload(path, file, {
                upsert: false,
                contentType: file.type || undefined,
            });
            if (error) throw new Error(`Materi gagal diunggah: ${error.message}`);
            onRow(await saveWebinarMaterials(row.id, path));
            toast.success('Materi tersimpan');
        } catch (err) {
            toast.error(errorMessage(err, 'Materi gagal disimpan.'));
        } finally {
            setMaterialBusy(false);
            if (materialInput.current) materialInput.current.value = '';
        }
    }

    async function openMaterial() {
        if (!row.materials_path) return;
        const tab = window.open('about:blank', '_blank');
        const { data, error } = await supabase.storage.from(MATERIALS_BUCKET).createSignedUrl(row.materials_path, 600);
        if (error || !data?.signedUrl) {
            tab?.close();
            toast.error('Materi belum bisa dibuka.');
            return;
        }
        if (tab) tab.location.href = data.signedUrl; else window.open(data.signedUrl, '_blank');
    }

    function askPublish() {
        setConfirm({
            title: 'Terbitkan rekaman?',
            lines: [
                sold > 0
                    ? `${sold} pemegang tiket otomatis menerima email "Rekaman tersedia" dan bisa langsung menonton.`
                    : 'Belum ada tiket lunas, jadi belum ada email yang dikirim.',
                !row.materials_path && 'Materi belum diunggah. Bisa menyusul; pemegang tiket melihatnya begitu tersimpan.',
                !eventEnded && 'Acara ini belum selesai menurut jadwal.',
                'Email hanya dikirim sekali. Mengganti video sesudah terbit tidak mengirim email lagi.',
            ],
            confirmLabel: 'Terbitkan rekaman',
            cancelLabel: 'Kembali',
            tone: 'neutral',
            onConfirm: async () => {
                setPublishing(true);
                try {
                    const r = await publishRecording(row.id);
                    onRow(r.event);
                    toast.success(r.already
                        ? 'Rekaman sudah terbit sebelumnya'
                        : r.notify_scheduled
                            ? `Rekaman terbit. Email ke ${r.notify_scheduled} peserta berangkat dalam ±1 menit.`
                            : 'Rekaman terbit');
                } catch (err) {
                    toast.error(errorMessage(err, 'Rekaman belum bisa diterbitkan.'));
                } finally {
                    setPublishing(false);
                }
            },
        });
    }

    const pct = progress ? Math.min(100, Math.floor((progress.loaded / progress.size) * 100)) : 0;
    const elapsed = progress ? (Date.now() - progress.startedAt) / 1000 : 0;
    const eta = progress && progress.loaded > 0 ? ((progress.size - progress.loaded) / progress.loaded) * elapsed : Infinity;

    return (
        <section className="space-y-4">
            <PanelHeading>Rekaman & materi</PanelHeading>

            {/* Video */}
            <div className="rounded-xl border border-slate-200 p-3">
                <p className="mb-2 text-[13px] font-semibold text-slate-800">Video rekaman</p>
                <input
                    ref={videoInput}
                    type="file"
                    accept="video/mp4,.mp4"
                    className="sr-only"
                    onChange={(e) => { void pickVideo(e.target.files?.[0]); }}
                />

                {phase === 'reading' && (
                    <p className="flex items-center gap-2 text-[13px] text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Membaca durasi video…</p>
                )}

                {progress && (
                    <div className="space-y-2">
                        <p className="truncate text-[13px] text-slate-700" title={progress.name}>
                            {progress.name} · {formatBytes(progress.size)}
                        </p>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                            <div className="h-full rounded-full bg-blue-600 transition-[width]" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[12px] text-slate-600">
                            <span className="tabular-nums">
                                {phase === 'saving' ? 'Menyimpan…' : `${pct}%${formatEta(eta) ? ` · sisa ${formatEta(eta)}` : ''}`}
                            </span>
                            {phase === 'uploading' && (
                                <button type="button" onClick={() => abortRef.current?.abort()} className="font-semibold text-red-600 hover:underline">
                                    Batal
                                </button>
                            )}
                        </div>
                        <p className="text-[12px] font-medium text-amber-700">Jangan tutup tab ini sampai selesai.</p>
                    </div>
                )}

                {!busy && hasVideo && (
                    <div className="space-y-2">
                        <div className="relative aspect-video overflow-hidden rounded-lg bg-slate-900">
                            {previewUrl ? (
                                // Pratinjau admin: URL R2 1 jam dari server.
                                <video src={previewUrl} controls playsInline preload="metadata" className="h-full w-full" />
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => { void loadPreview(); }}
                                    disabled={previewBusy}
                                    className="absolute inset-0 flex items-center justify-center gap-2 text-sm font-semibold text-white"
                                >
                                    {previewBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />} Putar pratinjau
                                </button>
                            )}
                        </div>
                        <p className="text-[12px] text-slate-600">{formatMinutes(row.recording_minutes) || 'Durasi —'}</p>
                        <button
                            type="button"
                            onClick={() => videoInput.current?.click()}
                            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            Ganti video
                        </button>
                    </div>
                )}

                {!busy && !hasVideo && (
                    <div className="space-y-2">
                        <button
                            type="button"
                            onClick={() => videoInput.current?.click()}
                            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700"
                        >
                            <Upload className="h-4 w-4" /> Pilih file MP4
                        </button>
                        <p className="text-[12px] text-slate-500">Maks. 4 GB. Tip: rekaman cloud Zoom "speaker view" 720p.</p>
                    </div>
                )}
            </div>

            {/* Materi */}
            <div className="rounded-xl border border-slate-200 p-3">
                <p className="mb-2 text-[13px] font-semibold text-slate-800">Materi (PPT/PDF)</p>
                <input
                    ref={materialInput}
                    type="file"
                    accept={MATERIAL_ACCEPT}
                    className="sr-only"
                    onChange={(e) => { void pickMaterial(e.target.files?.[0]); }}
                />
                {row.materials_path ? (
                    <div className="space-y-2">
                        <p className="flex min-w-0 items-center gap-1.5 text-[13px] text-slate-700">
                            <FileText className="h-4 w-4 shrink-0 text-slate-500" />
                            <span className="truncate" title={materialFileLabel(row.materials_path)}>{materialFileLabel(row.materials_path)}</span>
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" disabled={materialBusy} onClick={() => materialInput.current?.click()}
                                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                                {materialBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Ganti
                            </button>
                            <button type="button" onClick={() => { void openMaterial(); }}
                                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50">
                                Lihat
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <button type="button" disabled={materialBusy} onClick={() => materialInput.current?.click()}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                            {materialBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Unggah materi
                        </button>
                        <p className="text-[12px] text-slate-500">PDF, PPT/PPTX, DOC/DOCX, atau ZIP · maks. 50 MB. Boleh menyusul.</p>
                    </div>
                )}
            </div>

            {/* Terbit */}
            <div className="rounded-xl border border-slate-200 p-3">
                <p className="mb-2 text-[13px] font-semibold text-slate-800">Terbitkan ke pemegang tiket</p>
                {published ? (
                    <p className="flex items-start gap-1.5 text-[13px] text-emerald-700">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>Terbit {shortStamp(row.recording_published_at!)} WIB. Status email ada di halaman Peserta.</span>
                    </p>
                ) : (
                    <div className="space-y-2">
                        <label className="flex items-start gap-2 text-[13px] text-slate-700">
                            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={checks.speaker}
                                onChange={(e) => setChecks((c) => ({ ...c, speaker: e.target.checked }))} />
                            Ada izin tertulis pembicara
                        </label>
                        <label className="flex items-start gap-2 text-[13px] text-slate-700">
                            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={checks.faces}
                                onChange={(e) => setChecks((c) => ({ ...c, faces: e.target.checked }))} />
                            Wajah/nama peserta di sesi tanya-jawab sudah dipotong
                        </label>
                        <button
                            type="button"
                            onClick={askPublish}
                            disabled={!hasVideo || busy || publishing || !checks.speaker || !checks.faces}
                            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                            {publishing && <Loader2 className="h-4 w-4 animate-spin" />} Terbitkan rekaman
                        </button>
                        <p className="text-[12px] text-slate-500">
                            {hasVideo ? `→ ${sold} pemegang tiket dapat email` : 'Unggah video dulu.'}
                        </p>
                    </div>
                )}
            </div>

            <ConfirmDialog request={confirm} onDismiss={() => setConfirm(null)} />
        </section>
    );
}
