import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Check, ChevronRight, Copy, ExternalLink, Loader2, Search, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { shortOrderId, type PageData } from './types';
import { publicPagePath, publicPageUrl } from '@/utils/page-url';

// ─────────────────────────────────────────────────────────────
// Kilat — daftar tautan pendaratan push notification.
//
// Tab ini menjawab SATU pertanyaan yang tidak bisa dijawab layar lain:
// "mana tautan Kilat yang perlu kutempel ke dashboard Jakpat?"
//
// Sebelum tab ini ada, jawabannya cuma bisa didapat lewat
// Submissions → cari order → buka → tab Page. Jalur itu mensyaratkan admin
// SUDAH TAHU order mana yang dicari, jadi ia tidak pernah bisa menjawab
// bentuk jamak dari pertanyaan itu.
//
// ⚠️ INI TAB BACA + SALIN, BUKAN TEMPAT KERJA.
//
// Tidak ada urutan feed (Kilat tidak pernah jadi kartu feed), tidak ada
// sembunyikan (`is_hidden` tidak dipakai Kilat — pengecualiannya struktural
// lewat `distribution_type`), dan tidak ada banner (push notification tidak
// menampilkannya). Menambahkan salah satunya di sini akan menghidupkan lagi
// persis kebingungan yang membuat 17 halaman Kilat menyusup ke feed live.
// ─────────────────────────────────────────────────────────────

const COL = {
    num: 'w-7 shrink-0 text-center',
    id: 'w-[104px] shrink-0 hidden sm:flex items-center',
    page: 'flex-1 min-w-0',
    wave: 'w-[150px] shrink-0 hidden md:block',
    actions: 'w-[120px] shrink-0 flex items-center justify-end gap-0.5',
};

/**
 * Gelombang Kilat, dari `publish_start_date` halaman.
 *
 * Dibaca dari HALAMAN, bukan dari `form_submissions.kilat_slot_hour`, supaya
 * yang tampil adalah jam yang benar-benar dipakai tautannya — `sql/95`
 * menuliskannya lewat `kilat_instant_of()`. Kalau keduanya pernah berselisih,
 * yang menentukan nasib responden adalah halaman.
 */
function formatWave(iso?: string | null): { date: string; hour: string } {
    if (!iso) return { date: '—', hour: '' };
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { date: '—', hour: '' };
    const date = d.toLocaleDateString('id-ID', {
        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta',
    });
    const hour = d.toLocaleTimeString('id-ID', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
    }).replace('.', ':');
    return { date, hour: `${hour} WIB` };
}

interface Props {
    kilatPages: PageData[];
    loading: boolean;
    actions: React.ReactNode;
    onSelectPage: (p: PageData) => void;
}

export function KilatPagesTab({ kilatPages, loading, actions, onSelectPage }: Props) {
    const [query, setQuery] = useState('');
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return kilatPages;
        return kilatPages.filter(p =>
            (p.title || '').toLowerCase().includes(q) ||
            (p.slug || '').toLowerCase().includes(q) ||
            (p.owner_name || '').toLowerCase().includes(q)
        );
    }, [kilatPages, query]);

    const handleCopy = (page: PageData) => {
        const url = publicPageUrl(page.slug);
        navigator.clipboard.writeText(url);
        setCopiedId(page.id);
        toast.success('Tautan halaman survei berhasil disalin');
        window.setTimeout(() => setCopiedId(c => (c === page.id ? null : c)), 1500);
    };

    return (
        <>
            {/* ── Toolbar ── */}
            <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-gray-200">
                <div className="flex items-center gap-1.5 shrink-0">
                    <Zap className="w-4 h-4 text-amber-600" />
                    <span className="text-sm font-semibold text-gray-800">
                        {kilatPages.length} halaman
                    </span>
                </div>

                <div className="relative flex-1 min-w-0 max-w-xs ml-2">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Cari judul, slug, peneliti…"
                        className="w-full h-8 pl-8 pr-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                    />
                </div>

                <div className="ml-auto flex items-center gap-1">{actions}</div>
            </div>

            {/* ── Penjelas: kenapa tab ini ada ── */}
            <div className="shrink-0 px-3 py-2 bg-amber-50/60 border-b border-amber-100">
                <p className="text-[11px] leading-relaxed text-amber-900">
                    Survei JFU Kilat disiarkan lewat <strong>push notification</strong> di aplikasi
                    Jakpat — tidak tampil di daftar iklan publik. Salin tautan di bawah lalu pasang
                    ke dalam survei Jakpat sebagai tujuan pendaratan responden.
                    <span className="text-amber-700"> Tautan tidak memiliki tanggal kedaluwarsa.</span>
                </p>
            </div>

            {/* ── Header kolom ── */}
            <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 bg-gray-50 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                <span className={COL.num}>#</span>
                <span className={COL.id}>Page ID</span>
                <span className={COL.page}>Page</span>
                <span className={COL.wave}>Gelombang</span>
                <span className={COL.actions}>Aksi</span>
            </div>

            {/* ── Baris ── */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-16 text-gray-400">
                        <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                ) : visible.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                        <Zap className="w-8 h-8 text-gray-300 mb-2" />
                        <p className="text-sm font-medium text-gray-500">
                            {query ? 'Tidak ada yang cocok' : 'Belum ada halaman Kilat'}
                        </p>
                        <p className="text-xs text-gray-400 mt-1 max-w-sm">
                            {query
                                ? 'Coba kata kunci lain, atau kosongkan pencarian.'
                                : 'Halaman Kilat terbit otomatis begitu order Kilat lunas.'}
                        </p>
                    </div>
                ) : (
                    visible.map((page, i) => {
                        const wave = formatWave(page.publish_start_date);
                        const copied = copiedId === page.id;
                        return (
                            <div
                                key={page.id}
                                className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 hover:bg-amber-50/40 transition-colors group"
                            >
                                <span className={cn(COL.num, 'text-xs text-gray-400')}>{i + 1}</span>

                                <span className={COL.id}>
                                    <code className="px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-mono text-gray-600">
                                        {shortOrderId(page)}
                                    </code>
                                </span>

                                <button
                                    type="button"
                                    onClick={() => onSelectPage(page)}
                                    className={cn(COL.page, 'flex flex-col items-start text-left min-w-0')}
                                >
                                    <span className="truncate w-full text-sm font-semibold text-gray-900" title={page.title}>
                                        {page.title}
                                    </span>
                                    <span className="truncate w-full font-mono text-[11px] text-gray-500">
                                        /{page.slug}
                                    </span>
                                    {/* Gelombang ikut di sini pada layar sempit, tempat kolomnya disembunyikan. */}
                                    <span className="md:hidden truncate w-full text-[11px] text-amber-700">
                                        {wave.date}{wave.hour && ` · ${wave.hour}`}
                                    </span>
                                </button>

                                <span className={cn(COL.wave, 'text-xs')}>
                                    <span className="block text-gray-700">{wave.date}</span>
                                    {wave.hour && (
                                        <span className="block text-[11px] text-amber-700 font-medium">{wave.hour}</span>
                                    )}
                                </span>

                                <span className={COL.actions}>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-amber-800/70 hover:text-amber-900 hover:bg-amber-100"
                                        title="Salin tautan untuk survei Jakpat"
                                        onClick={() => handleCopy(page)}
                                    >
                                        {copied
                                            ? <Check className="w-3.5 h-3.5 text-green-600" />
                                            : <Copy className="w-3.5 h-3.5" />}
                                    </Button>
                                    <a
                                        href={publicPagePath(page.slug)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-amber-800/70 hover:text-amber-900 hover:bg-amber-100 transition-colors"
                                        title="Buka halaman"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-gray-400 hover:text-gray-700"
                                        title="Lihat detail"
                                        onClick={() => onSelectPage(page)}
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </Button>
                                </span>
                            </div>
                        );
                    })
                )}
            </div>
        </>
    );
}
