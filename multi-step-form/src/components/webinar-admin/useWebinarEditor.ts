import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
    EMPTY_FORM, FIELD_ORDER, columnsFromForm, diffColumns, fieldDomId, formFromEvent, previewEventUrl,
    type AdminWebinarEvent, type ColumnKey, type WebinarForm,
} from '@/utils/webinarAdmin';
import {
    WebinarAdminError, closeWebinarSales, createWebinarEvent, getWebinarEvent, publishWebinarEvent, saveWebinarEvent,
    saveWebinarEventWithNotice,
} from '@/utils/webinarAdminApi';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
export type FieldErrors = Partial<Record<ColumnKey, string>>;

const AUTOSAVE_MS = 1500;
/** Batas putaran simpan berturut-turut; lebih dari ini berarti klien & server menormalisasi berbeda. */
const MAX_ROUNDS = 4;

/** Isian form → kolom yang galatnya dihapus saat isian itu disunting. */
const FORM_TO_COLUMN: Partial<Record<keyof WebinarForm, ColumnKey>> = {
    title: 'title', summary: 'summary', poster_url: 'poster_url', description_blocks: 'description_blocks',
    speakers: 'speakers', salesChoice: 'sales_open_at', openDate: 'sales_open_at', openTime: 'sales_open_at',
    closeAtStart: 'sales_close_at', closeDate: 'sales_close_at', closeTime: 'sales_close_at',
    startDate: 'starts_at', startTime: 'starts_at', duration: 'duration_minutes', price: 'price', quota: 'quota',
    meeting_url: 'meeting_url',
};

/** Gulir ke isian lalu fokuskan input pertamanya. */
export function focusField(field: ColumnKey) {
    requestAnimationFrame(() => {
        const box = document.getElementById(fieldDomId(field));
        if (!box) return;
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const input = box.querySelector<HTMLElement>('input, textarea, [contenteditable="true"], button');
        input?.focus({ preventScroll: true });
    });
}

const errorsFrom = (err: WebinarAdminError): FieldErrors => {
    if (err.code === 'missing_fields' && err.fields?.length) {
        return Object.fromEntries(err.fields.map((f) => [f, 'Wajib diisi untuk pilihan penjualan ini']));
    }
    return err.field ? { [err.field]: err.message } : {};
};

export function useWebinarEditor(eventId: string | null) {
    const [row, setRowState] = useState<AdminWebinarEvent | null>(null);
    const [form, setFormState] = useState<WebinarForm>(EMPTY_FORM);
    const [loading, setLoading] = useState(Boolean(eventId));
    const [loadError, setLoadError] = useState<string | null>(null);
    const [status, setStatus] = useState<SaveStatus>('idle');
    const [savedAt, setSavedAt] = useState<Date | null>(null);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [busy, setBusy] = useState<null | 'publish' | 'save' | 'close'>(null);

    const rowRef = useRef<AdminWebinarEvent | null>(null);
    const formRef = useRef<WebinarForm>(EMPTY_FORM);
    const chain = useRef<Promise<unknown>>(Promise.resolve());

    const setRow = useCallback((next: AdminWebinarEvent | null) => {
        rowRef.current = next;
        setRowState(next);
    }, []);

    const setForm = useCallback((next: WebinarForm) => {
        formRef.current = next;
        setFormState(next);
    }, []);

    useEffect(() => {
        if (!eventId) return;
        let cancelled = false;
        setLoading(true);
        getWebinarEvent(eventId)
            .then((event) => {
                if (cancelled) return;
                setRow(event);
                setForm(formFromEvent(event));
                setLoadError(null);
            })
            .catch((err) => { if (!cancelled) setLoadError(err?.message || 'Acara tidak bisa dimuat'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [eventId, setForm, setRow]);

    const updateForm = useCallback((patch: Partial<WebinarForm>) => {
        const next = { ...formRef.current, ...patch };
        setForm(next);
        const touched = Object.keys(patch).map((k) => FORM_TO_COLUMN[k as keyof WebinarForm]).filter(Boolean) as ColumnKey[];
        if (touched.length) {
            setFieldErrors((prev) => {
                if (!touched.some((c) => prev[c])) return prev;
                const copy = { ...prev };
                touched.forEach((c) => delete copy[c]);
                return copy;
            });
        }
    }, [setForm]);

    const pending = useMemo(() => {
        const result = columnsFromForm(form);
        if ('error' in result) return { invalid: result, diff: null };
        return { invalid: null, diff: diffColumns(row, result.columns) };
    }, [form, row]);

    const isEditable = !row || row.status !== 'cancelled';
    const hasContent = Boolean(form.title.trim() || form.summary.trim() || form.poster_url.trim());
    const dirty = isEditable && (row
        ? Boolean(pending.invalid) || Object.keys(pending.diff ?? {}).length > 0
        : hasContent);

    const showError = useCallback((err: unknown, focus = true) => {
        if (err instanceof WebinarAdminError) {
            const errors = errorsFrom(err);
            if (Object.keys(errors).length) {
                setFieldErrors((prev) => ({ ...prev, ...errors }));
                const first = FIELD_ORDER.find((f) => errors[f]);
                if (focus && first) focusField(first);
            }
            if (err.code === 'stale') toast.error(err.message);
            else if (!Object.keys(errors).length) toast.error(err.message);
            else if (err.code === 'missing_fields') toast.error('Lengkapi isian yang ditandai merah dulu');
            return;
        }
        toast.error('Terjadi kendala. Coba lagi beberapa saat.');
    }, []);

    /**
     * Simpan draft sampai server sama dengan form. Antrean satu per satu: perubahan
     * yang diketik selama menyimpan ikut di putaran berikutnya. Form tidak di-reset
     * dari jawaban server, supaya ketikan tidak hilang.
     */
    const flush = useCallback((): Promise<AdminWebinarEvent | null> => {
        const run = async (): Promise<AdminWebinarEvent | null> => {
            for (let round = 0; round < MAX_ROUNDS; round += 1) {
                const current = rowRef.current;
                if (current && current.status !== 'draft') return current;
                const result = columnsFromForm(formRef.current);
                if ('error' in result) {
                    setFieldErrors((prev) => ({ ...prev, [result.field]: result.error }));
                    setStatus('error');
                    return current;
                }
                if (!current && !result.columns.title) return null;
                const diff = diffColumns(current, result.columns);
                if (current && Object.keys(diff).length === 0) {
                    setStatus('saved');
                    return current;
                }
                setStatus('saving');
                try {
                    const saved = current
                        ? await saveWebinarEvent(current.id, diff, current.updated_at)
                        : await createWebinarEvent(result.columns);
                    setRow(saved);
                    setSavedAt(new Date());
                } catch (err) {
                    setStatus('error');
                    showError(err, false);
                    return rowRef.current;
                }
            }
            console.error('[webinar-admin] simpan otomatis tidak pernah sama dengan server');
            setStatus('error');
            return rowRef.current;
        };
        const next = chain.current.then(run, run);
        chain.current = next.catch(() => null);
        return next;
    }, [setRow, showError]);

    // Simpan otomatis hanya untuk draft (dan acara baru yang sudah berjudul).
    const autosaveKey = JSON.stringify(pending.diff ?? pending.invalid);
    useEffect(() => {
        if (loading || loadError) return;
        const draftLike = !row || row.status === 'draft';
        if (!draftLike || !dirty || pending.invalid) return;
        if (!row && !form.title.trim()) return;
        const timer = setTimeout(() => { void flush(); }, AUTOSAVE_MS);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autosaveKey, row?.status, loading, loadError]);

    // Peringatan keluar tab selama ada perubahan.
    useEffect(() => {
        if (!dirty) return;
        const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    /** Hasil kolom form, atau tandai isiannya merah. */
    const columnsOrMark = useCallback(() => {
        const result = columnsFromForm(formRef.current);
        if ('error' in result) {
            setFieldErrors((prev) => ({ ...prev, [result.field]: result.error }));
            focusField(result.field);
            return null;
        }
        return result.columns;
    }, []);

    const publish = useCallback(async () => {
        if (!formRef.current.title.trim()) {
            setFieldErrors((prev) => ({ ...prev, title: 'Judul wajib diisi' }));
            focusField('title');
            return;
        }
        setBusy('publish');
        try {
            await chain.current;
            let current = rowRef.current;
            if (!current) current = await flush();
            if (!current) return;
            const columns = columnsOrMark();
            if (!columns) return;
            const event = await publishWebinarEvent(current.id, diffColumns(current, columns), current.updated_at);
            setRow(event);
            setSavedAt(new Date());
            setStatus('saved');
            toast.success('Acara diterbitkan');
        } catch (err) {
            showError(err);
        } finally {
            setBusy(null);
        }
    }, [columnsOrMark, flush, setRow, showError]);

    /**
     * Simpan perubahan acara terbit.
     * @returns `{ confirmSold }` bila jadwal berubah padahal tiket sudah terjual.
     */
    const saveChanges = useCallback(async (confirmScheduleChange = false): Promise<{ confirmSold?: number }> => {
        const current = rowRef.current;
        if (!current) return {};
        const columns = columnsOrMark();
        if (!columns) return {};
        const diff = diffColumns(current, columns);
        if (Object.keys(diff).length === 0) return {};
        setBusy('save');
        try {
            const { event, notified, notify_error: notifyError } = await saveWebinarEventWithNotice(current.id, diff, current.updated_at, confirmScheduleChange);
            setRow(event);
            setSavedAt(new Date());
            setStatus('saved');
            if (notifyError) {
                toast.warning('Perubahan disimpan, tetapi email jadwal baru gagal diantrekan. Kabari peserta lewat WA.', { duration: 10000 });
            } else {
                toast.success(notified ? `Perubahan disimpan. ${notified} peserta dikabari lewat email.` : 'Perubahan disimpan');
            }
            return {};
        } catch (err) {
            if (err instanceof WebinarAdminError && err.code === 'confirm_schedule') return { confirmSold: err.sold ?? 0 };
            showError(err);
            return {};
        } finally {
            setBusy(null);
        }
    }, [columnsOrMark, setRow, showError]);

    const closeSales = useCallback(async () => {
        const current = rowRef.current;
        if (!current) return;
        setBusy('close');
        try {
            const event = await closeWebinarSales(current.id);
            setRow(event);
            updateForm({ salesChoice: 'closed', openDate: '', openTime: '' });
            toast.success('Penjualan ditutup');
        } catch (err) {
            showError(err);
        } finally {
            setBusy(null);
        }
    }, [setRow, showError, updateForm]);

    /** Tab dibuka lebih dulu (sebelum await) supaya tidak kena pemblokir popup. */
    const openPreview = useCallback(async () => {
        const tab = window.open('about:blank', '_blank');
        try {
            const current = !rowRef.current || rowRef.current.status === 'draft' ? await flush() : rowRef.current;
            if (!current) {
                tab?.close();
                setFieldErrors((prev) => ({ ...prev, title: 'Isi judul dulu untuk membuat pratinjau' }));
                focusField('title');
                return;
            }
            const url = previewEventUrl(current.slug, current.preview_token);
            if (tab) tab.location.href = url;
            else window.open(url, '_blank');
        } catch {
            tab?.close();
        }
    }, [flush]);

    return {
        row, form, updateForm, loading, loadError, status, savedAt, fieldErrors, busy, dirty, isEditable,
        flush, publish, saveChanges, closeSales, openPreview,
    };
}
