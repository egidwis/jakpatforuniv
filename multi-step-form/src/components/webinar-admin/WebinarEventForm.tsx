import { useEffect, useState } from 'react';
import { ArrowLeft, Eye, Loader2 } from 'lucide-react';
import { BlockEditor } from '@/components/PageBuilder/BlockEditor';
import { BannerPicker } from '@/components/PageBuilder/BannerPicker';
import { ConfirmDialog, type ConfirmRequest } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import {
    WEBINAR_PUBLIC_BUCKET, adminDateLabel, linkedVideoOf, publishConsequence, slugifyTitle, sourceCandidates,
    webinarImageUrl, type AdminWebinarEvent, type OfferKind,
} from '@/utils/webinarAdmin';
import { useWebinarEditor, type SaveStatus } from './useWebinarEditor';
import { WebinarSalesPanel } from './WebinarSalesPanel';
import { WebinarSpeakersField } from './WebinarSpeakersField';
import { WebinarRecordingPanel } from './WebinarRecordingPanel';
import { Field, inputClass } from './WebinarFormParts';

const timeLabel = (d: Date) => d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

function SaveIndicator({ status, savedAt, dirty, isDraft }: { status: SaveStatus; savedAt: Date | null; dirty: boolean; isDraft: boolean }) {
    if (status === 'saving') {
        return <span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Menyimpan…</span>;
    }
    if (status === 'error') return <span className="text-xs font-medium text-red-600">● Belum tersimpan</span>;
    if (dirty) return <span className="text-xs font-medium text-amber-600">● {isDraft ? 'Ada perubahan' : 'Perubahan belum disimpan'}</span>;
    if (savedAt) return <span className="text-xs text-emerald-700">● Tersimpan {timeLabel(savedAt)}</span>;
    return null;
}

const STATUS_CHIP: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600',
    published: 'bg-emerald-50 text-emerald-700',
    cancelled: 'bg-red-50 text-red-700',
};

export function WebinarEventForm({
    eventId,
    kind = 'live',
    events = [],
    onBack,
    onDirtyChange,
    onCreateVideoFrom,
    onOpenEvent,
}: {
    eventId: string | null;
    /** Jenis acara baru (tombol [+ Webinar] / [+ Video kelas]); acara lama memakai jenis barisnya. */
    kind?: OfferKind;
    /** Daftar acara (aksi list) untuk pilihan "Dari webinar" dan Video kelas tersambung. */
    events?: AdminWebinarEvent[];
    onBack: () => void;
    onDirtyChange?: (dirty: boolean) => void;
    onCreateVideoFrom?: (event: AdminWebinarEvent) => void;
    onOpenEvent?: (event: AdminWebinarEvent) => void;
}) {
    const editor = useWebinarEditor(eventId, kind);
    const { row, form, updateForm, fieldErrors: errors, busy, dirty, isEditable, status, savedAt } = editor;
    const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

    const isDraft = !row || row.status === 'draft';
    const isPublished = row?.status === 'published';
    const disabled = !isEditable;
    const replay = form.offer_kind === 'replay';
    // Video kelas memakai panel Rekaman sejak draft tersimpan; webinar sesudah terbit.
    const showRecording = Boolean(row) && (isPublished || (isDraft && replay));
    const candidates = replay ? sourceCandidates(events, row?.id ?? null) : [];
    const linkedVideo = row && !replay ? linkedVideoOf(row, events) : null;

    useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
    useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

    const back = async () => {
        if (dirty && !isDraft && !window.confirm('Perubahan belum disimpan. Tetap kembali ke daftar?')) return;
        // Draft: tunggu simpanan terakhir supaya daftar yang dimuat sudah memuatnya.
        if (dirty && isDraft) await editor.flush();
        onBack();
    };

    const saveChanges = async () => {
        const result = await editor.saveChanges();
        if (result.confirmSold !== undefined) {
            setConfirm({
                title: 'Jadwal berubah',
                lines: [
                    `Tiket sudah terjual ke ${result.confirmSold} peserta.`,
                    'Sesudah disimpan, mereka otomatis menerima email jadwal baru. Tiket tetap berlaku.',
                ],
                confirmLabel: 'Simpan & kabari peserta',
                cancelLabel: 'Kembali',
                tone: 'neutral',
                onConfirm: async () => { await editor.saveChanges(true); },
            });
        }
    };

    const slug = row && row.status !== 'draft' ? row.slug : (row?.slug ?? slugifyTitle(form.title));
    const summaryLength = [...form.summary].length;

    if (editor.loading) {
        return <div className="flex flex-1 items-center justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;
    }
    if (editor.loadError) {
        return (
            <div className="p-6">
                <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600"><ArrowLeft className="h-4 w-4" /> Webinar</button>
                <p className="mt-6 text-sm text-red-600">{editor.loadError}</p>
            </div>
        );
    }

    return (
        <div className="flex min-h-full flex-col">
            {/* Kepala */}
            <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200/70 bg-white/80 px-5 py-3 backdrop-blur-md">
                <div className="flex min-w-0 items-center gap-3">
                    <button type="button" onClick={() => { void back(); }} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-100">
                        <ArrowLeft className="h-4 w-4" /> Webinar
                    </button>
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_CHIP[row?.status ?? 'draft'])}>
                        {row?.status === 'published' ? (row.view?.badge ?? 'Terbit') : row?.status === 'cancelled' ? 'Batal' : 'Draft'}
                    </span>
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                        {replay ? 'Video kelas' : 'Webinar'}
                    </span>
                    {row?.is_test && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-600">UJI</span>}
                </div>
                <SaveIndicator status={status} savedAt={savedAt} dirty={dirty} isDraft={isDraft} />
            </div>

            {row?.status === 'cancelled' && (
                <div className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    Acara ini sudah dibatalkan dan hanya bisa dilihat.
                </div>
            )}

            {/* Isi: satu kolom di HP, dua kolom di desktop */}
            <div className="flex-1 px-5 pb-8 pt-5">
                <div className="mx-auto [display:grid] max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <Field
                            field="title"
                            label={replay ? 'Judul video kelas' : 'Judul acara'}
                            error={errors.title}
                            hint={<>URL: <span className="font-mono text-slate-600">/webinar/{slug}</span>{row && row.status !== 'draft' && ' · terkunci sejak terbit'}</>}
                        >
                            <input
                                value={form.title}
                                onChange={(e) => updateForm({ title: e.target.value })}
                                disabled={disabled}
                                maxLength={200}
                                placeholder="Olah Data SPSS untuk Skripsi"
                                className={cn(inputClass(errors.title), 'h-11 text-base font-semibold')}
                            />
                        </Field>

                        <Field field="summary" label="Ringkasan" aside={`${summaryLength}/160`} error={errors.summary}
                            hint="Tampil di kartu, preview link WA/IG, dan homepage.">
                            <textarea
                                value={form.summary}
                                onChange={(e) => updateForm({ summary: e.target.value })}
                                disabled={disabled}
                                rows={2}
                                placeholder="Satu-dua kalimat tentang manfaat acara ini"
                                className="w-full resize-none rounded-lg border px-3 py-2 text-sm"
                            />
                        </Field>

                        <Field field="poster_url" label="Poster 16:9" error={errors.poster_url}>
                            <BannerPicker
                                value={form.poster_url}
                                onChange={(url) => updateForm({ poster_url: url })}
                                uploadBucket={WEBINAR_PUBLIC_BUCKET}
                                pathPrefix="poster/"
                                hideRecent
                                resolveUploadedUrl={webinarImageUrl}
                                labels={{ upload: 'Unggah gambar', uploaded: 'Poster terunggah', failed: 'Poster gagal diunggah' }}
                            />
                        </Field>

                        <Field field="description_blocks" label="Deskripsi" error={errors.description_blocks}>
                            <BlockEditor
                                content={form.description_blocks}
                                onChange={(doc) => updateForm({ description_blocks: doc })}
                                editable={!disabled}
                                uploadBucket={WEBINAR_PUBLIC_BUCKET}
                                uploadPathPrefix="deskripsi/"
                                allowBase64={false}
                                placeholder="Tulis isi acara: siapa yang cocok ikut, apa yang dipelajari, agenda…"
                                resolveUploadedUrl={webinarImageUrl}
                            />
                        </Field>

                        <Field field="speakers" label="Pembicara" error={errors.speakers}>
                            <WebinarSpeakersField
                                value={form.speakers}
                                onChange={(speakers) => updateForm({ speakers })}
                                disabled={disabled}
                            />
                        </Field>

                        {replay && (
                            <Field
                                field="source_event_id"
                                label="Dari webinar (opsional)"
                                error={errors.source_event_id}
                                hint={form.source_event_id
                                    ? 'Pemegang tiket webinar ini tidak perlu membeli; mereka dibawa ke tiketnya.'
                                    : 'Pilih bila video ini rekaman salah satu webinar. Satu webinar paling banyak satu Video kelas.'}
                            >
                                <select
                                    value={form.source_event_id}
                                    onChange={(e) => updateForm({ source_event_id: e.target.value })}
                                    disabled={disabled}
                                    className={cn(inputClass(errors.source_event_id), 'h-10')}
                                >
                                    <option value="">Tanpa webinar asal</option>
                                    {candidates.map((e) => (
                                        <option key={e.id} value={e.id}>
                                            {e.title}{e.starts_at ? ` · ${adminDateLabel(e.starts_at)}` : ''}{e.status === 'cancelled' ? ' (batal)' : ''}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        )}
                    </div>

                    {/* Rekaman (Fase 5A) di bawah panel penjualan; tanpa sticky supaya kolom kanan bisa digulir.
                        Draft Video kelas juga memakainya: rekaman wajib terbit sebelum dijual (Fase 5B). */}
                    <div className="space-y-6">
                        <aside className={cn('h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm', !showRecording && 'lg:sticky lg:top-20')}>
                            <WebinarSalesPanel form={form} update={updateForm} errors={errors} row={row} disabled={disabled} />
                        </aside>
                        {showRecording && row && (
                            <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                <WebinarRecordingPanel
                                    row={row}
                                    onRow={editor.adoptRow}
                                    errors={{ recording: errors.recording, materials_path: errors.materials_path }}
                                    offerKind={form.offer_kind}
                                    linkedVideo={linkedVideo}
                                    onCreateVideo={onCreateVideoFrom && !dirty ? () => onCreateVideoFrom(row) : undefined}
                                    onOpenVideo={onOpenEvent && linkedVideo ? () => onOpenEvent(linkedVideo) : undefined}
                                />
                            </aside>
                        )}
                        {replay && !row && (
                            <aside className="h-fit rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
                                <p className="text-[13px] font-semibold text-slate-800">Rekaman &amp; materi</p>
                                <p className="mt-1">Isi judul dulu untuk mulai mengunggah. Sesudah draft tersimpan, video dan materi diunggah di sini.</p>
                            </aside>
                        )}
                    </div>
                </div>
            </div>

            {/* Bar tombol menempel di bawah */}
            {isEditable && (
                <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/90 px-5 py-3 backdrop-blur-md">
                    <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => { void editor.openPreview(); }}
                            aria-label="Pratinjau"
                            className="mr-auto inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            <Eye className="h-4 w-4" /> <span className="hidden sm:inline">Pratinjau</span>
                        </button>

                        {isDraft ? (
                            <>
                                <button
                                    type="button"
                                    onClick={() => { void editor.flush(); }}
                                    disabled={status === 'saving' || !form.title.trim()}
                                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold sm:px-4 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                >
                                    Simpan Draft
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { void editor.publish(); }}
                                    disabled={busy !== null}
                                    className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm sm:px-4 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                                >
                                    {busy === 'publish' && <Loader2 className="h-4 w-4 animate-spin" />}
                                    {publishConsequence(form)}
                                </button>
                            </>
                        ) : isPublished ? (
                            <>
                                {row?.sales_mode !== 'closed' && (
                                    <button
                                        type="button"
                                        onClick={() => setConfirm({
                                            title: 'Tutup penjualan?',
                                            lines: [
                                                row?.offer_kind === 'replay'
                                                    ? 'Tombol beli hilang dari halaman. Video yang sudah dibeli tetap bisa ditonton.'
                                                    : 'Tombol beli hilang dari halaman acara. Tiket yang sudah terjual tetap berlaku.',
                                                'Buka lagi kapan saja dengan memilih Sekarang atau Pada tanggal, lalu Simpan perubahan.',
                                            ],
                                            confirmLabel: 'Tutup penjualan',
                                            cancelLabel: 'Kembali',
                                            tone: 'neutral',
                                            onConfirm: editor.closeSales,
                                        })}
                                        disabled={busy !== null}
                                        className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold sm:px-4 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                                    >
                                        Tutup Penjualan
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => { void saveChanges(); }}
                                    disabled={busy !== null || !dirty}
                                    className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm sm:px-4 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {busy === 'save' && <Loader2 className="h-4 w-4 animate-spin" />}
                                    Simpan Perubahan
                                </button>
                            </>
                        ) : null}
                    </div>
                </div>
            )}

            <ConfirmDialog request={confirm} onDismiss={() => setConfirm(null)} />
        </div>
    );
}
