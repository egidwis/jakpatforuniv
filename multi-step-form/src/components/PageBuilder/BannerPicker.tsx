import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import imageCompression from 'browser-image-compression';
import { Check, Loader2, Trash2, Upload } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/utils/supabase';

// ─────────────────────────────────────────────────────────────
// Pemilih banner — tiga tab (Upload / Recent / URL), terkendali penuh lewat
// `value` + `onChange`.
//
// Diangkat APA ADANYA dari PageBuilderModal saat papan Schedule memerlukan jalur
// simpan banner kedua. Menyalinnya berarti dua jalur unggah yang bisa berbeda
// soal kompresi, pola nama berkas, dan bucket — dan perbedaan itu baru ketahuan
// berbulan-bulan kemudian, saat separuh banner tersimpan dengan aturan yang salah.
//
// ⚠️ Komponen ini TIDAK menyimpan apa pun ke `survey_pages`. Ia hanya memilih
// URL. Yang menyimpannya wajib lewat `bannerSavePatch()` (utils/page-banner.ts)
// supaya aturan pembersih `requires_banner_update` tidak bisa terlewat.
// ─────────────────────────────────────────────────────────────

const COMPRESSION_OPTIONS = {
    maxSizeMB: 0.5,
    maxWidthOrHeight: 1280,
    useWebWorker: true,
};

export function BannerPicker({
    value,
    onChange,
    /** Dibuka? Galeri "recent" baru diambil saat terlihat, bukan saat dipasang. */
    active = true,
}: {
    value: string;
    onChange: (url: string) => void;
    active?: boolean;
}) {
    const [tab, setTab] = useState<'upload' | 'link' | 'library'>('upload');
    const [uploading, setUploading] = useState(false);
    const [recentBanners, setRecentBanners] = useState<string[]>([]);

    useEffect(() => {
        if (!active) return;
        let cancelled = false;
        (async () => {
            const { data } = await supabase
                .from('survey_pages')
                .select('banner_url')
                .not('banner_url', 'is', null)
                .neq('banner_url', '')
                .order('created_at', { ascending: false })
                .limit(50);

            if (cancelled || !data) return;
            setRecentBanners(Array.from(new Set(data.map((d) => d.banner_url).filter(Boolean))));
        })();
        return () => { cancelled = true; };
    }, [active]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            const compressedFile = await imageCompression(file, COMPRESSION_OPTIONS);
            const fileName = `banners/${Date.now()}-${file.name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9.-]/g, '')}`;

            const { error: uploadError } = await supabase.storage
                .from('page-uploads')
                .upload(fileName, compressedFile);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('page-uploads')
                .getPublicUrl(fileName);

            onChange(publicUrl);
            toast.success('Banner uploaded successfully');
        } catch (error: any) {
            console.error('Upload failed:', error);
            toast.error('Upload failed: ' + error.message);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="bg-white rounded-lg p-2.5 border border-gray-200 shadow-sm relative overflow-hidden group">
            {!value ? (
                <div className="flex flex-col gap-2.5">
                    <div className="flex bg-gray-100 p-1 rounded-md w-full">
                        {([
                            ['upload', 'UPLOAD'],
                            ['library', 'RECENT'],
                            ['link', 'URL'],
                        ] as const).map(([id, label]) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setTab(id)}
                                className={`flex-1 flex items-center justify-center px-2 py-1 text-[10px] font-bold rounded transition-all ${tab === id ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {tab === 'upload' && (
                        <div className="border border-dashed border-gray-300 rounded-md p-3 transition-colors hover:bg-gray-50 hover:border-blue-400 cursor-pointer relative bg-white flex flex-col items-center justify-center min-h-[80px]">
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleUpload}
                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                                disabled={uploading}
                            />
                            {uploading ? (
                                <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                            ) : (
                                <div className="flex flex-col items-center text-center">
                                    <Upload className="w-4 h-4 text-gray-400 mb-1" />
                                    <span className="text-[11px] font-medium text-gray-600">Click to Upload</span>
                                </div>
                            )}
                        </div>
                    )}

                    {tab === 'library' && (
                        <div className="[display:grid] grid-cols-2 gap-2 max-h-[140px] overflow-y-auto pr-1">
                            {recentBanners.map((url, i) => (
                                <div
                                    key={i}
                                    onClick={() => onChange(url)}
                                    className={`relative aspect-video rounded-md overflow-hidden cursor-pointer border transition-all ${value === url ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-200 hover:border-gray-300'}`}
                                >
                                    <img src={url} alt={`Banner ${i}`} className="w-full h-full object-cover" />
                                    {value === url && (
                                        <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                                            <div className="bg-blue-500 rounded-full p-0.5 shadow-sm">
                                                <Check className="w-3 h-3 text-white" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {recentBanners.length === 0 && (
                                <div className="col-span-2 text-center py-4 text-xs text-gray-500">
                                    No recent banners.
                                </div>
                            )}
                        </div>
                    )}

                    {tab === 'link' && (
                        <Input
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            placeholder="https://example.com/image.jpg"
                            className="h-8 text-xs"
                        />
                    )}
                </div>
            ) : (
                <>
                    <img src={value} alt="Preview" className="w-full aspect-video object-cover rounded-md" />
                    <button
                        type="button"
                        onClick={() => onChange('')}
                        className="absolute top-3 right-3 bg-black/60 hover:bg-red-500 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-all shadow-sm backdrop-blur-sm"
                    >
                        <Trash2 className="w-3 h-3" />
                    </button>
                </>
            )}
        </div>
    );
}
