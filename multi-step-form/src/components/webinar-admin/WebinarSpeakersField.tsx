import { useState } from 'react';
import { toast } from 'sonner';
import { Camera, Loader2, Plus, X } from 'lucide-react';
import { uploadPickedImage } from '@/components/PageBuilder/BannerPicker';
import { WEBINAR_PUBLIC_BUCKET, webinarImageUrl, type WebinarSpeaker } from '@/utils/webinarAdmin';

const MAX_SPEAKERS = 10;

function SpeakerPhoto({ value, onChange, disabled }: { value?: string; onChange: (url: string) => void; disabled: boolean }) {
    const [uploading, setUploading] = useState(false);

    const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setUploading(true);
        try {
            onChange(await uploadPickedImage(file, { bucket: WEBINAR_PUBLIC_BUCKET, pathPrefix: 'pembicara/', resolveUrl: webinarImageUrl }));
        } catch (err: any) {
            toast.error(`Foto gagal diunggah: ${err?.message ?? ''}`);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="relative h-11 w-11 shrink-0">
            <label
                className={`h-11 w-11 rounded-full border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center ${disabled ? '' : 'cursor-pointer hover:border-blue-400'}`}
                title="Foto pembicara (opsional)"
            >
                {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                ) : value ? (
                    <img src={value} alt="" className="h-full w-full object-cover" />
                ) : (
                    <Camera className="h-4 w-4 text-slate-400" />
                )}
                <input type="file" accept="image/*" className="sr-only" onChange={handle} disabled={disabled || uploading} />
            </label>
            {value && !disabled && (
                <button
                    type="button"
                    onClick={() => onChange('')}
                    className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-slate-700 text-white flex items-center justify-center"
                    aria-label="Hapus foto"
                >
                    <X className="h-2.5 w-2.5" />
                </button>
            )}
        </div>
    );
}

export function WebinarSpeakersField({
    value,
    onChange,
    disabled = false,
}: {
    value: WebinarSpeaker[];
    onChange: (next: WebinarSpeaker[]) => void;
    disabled?: boolean;
}) {
    const update = (index: number, patch: Partial<WebinarSpeaker>) => {
        onChange(value.map((s, i) => {
            if (i !== index) return s;
            const next = { ...s, ...patch };
            if (!next.photo_url) delete next.photo_url;
            return next;
        }));
    };
    const remove = (index: number) => {
        const next = value.filter((_, i) => i !== index);
        onChange(next.length ? next : [{ name: '', title: '' }]);
    };

    return (
        <div className="space-y-2">
            {value.map((speaker, i) => (
                <div key={i} className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-2.5">
                    <SpeakerPhoto value={speaker.photo_url} onChange={(url) => update(i, { photo_url: url })} disabled={disabled} />
                    <div className="min-w-0 flex-1 [display:grid] gap-2 sm:grid-cols-2">
                        <input
                            value={speaker.name}
                            onChange={(e) => update(i, { name: e.target.value })}
                            placeholder="Nama"
                            maxLength={120}
                            disabled={disabled}
                            className="h-9 rounded-lg border px-3 text-sm"
                            aria-label={`Nama pembicara ${i + 1}`}
                        />
                        <input
                            value={speaker.title}
                            onChange={(e) => update(i, { title: e.target.value })}
                            placeholder="Jabatan, mis. Dosen Statistika UI"
                            maxLength={160}
                            disabled={disabled}
                            className="h-9 rounded-lg border px-3 text-sm"
                            aria-label={`Jabatan pembicara ${i + 1}`}
                        />
                    </div>
                    {!disabled && (
                        <button
                            type="button"
                            onClick={() => remove(i)}
                            className="mt-1.5 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                            aria-label={`Hapus pembicara ${i + 1}`}
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
            ))}
            {!disabled && value.length < MAX_SPEAKERS && (
                <button
                    type="button"
                    onClick={() => onChange([...value, { name: '', title: '' }])}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                >
                    <Plus className="h-3.5 w-3.5" /> Tambah pembicara
                </button>
            )}
        </div>
    );
}
