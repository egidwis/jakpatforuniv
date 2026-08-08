import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { isLive, compareDisplayOrder } from '@/utils/adOrdering';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { Files, ListOrdered, Plus, RefreshCw } from 'lucide-react';
import { PageBuilderModal } from './PageBuilder/PageBuilderModal';
import { LiveFeedTab } from './publish-pages/LiveFeedTab';
import { PageCatalogTab } from './publish-pages/PageCatalogTab';
import { PageDetailDrawer } from './publish-pages/PageDetailDrawer';
import type { PageData } from './publish-pages/types';
import { toast } from 'sonner';
import { fetchProfileNames } from '../utils/profileNames';

// ─────────────────────────────────────────────────────────────
// Pages — TEMPAT KERJA sumbu HALAMAN.
//
// Halaman ini dibangun waktu admin memegang tiga pekerjaan sekaligus: membangun
// page iklan dari submission, mengundi pemenang, dan mengatur urutan feed. Dua
// yang pertama sudah pergi — page iklan dibuat & diterbitkan otomatis oleh
// `ensure_survey_page()` (sql/40), dan pengundian pindah ke platform pihak ketiga
// lewat /api/respondents, sehingga `survey_winners` beku sejak 5 Mei 2026.
//
// Pembagian dengan papan Schedule, supaya keduanya tidak menjawab pertanyaan yang
// sama dengan dua jawaban berbeda:
//
//   SCHEDULE — sumbu TANGGAL, papan pantau, nol aksi.
//              "apa yang tayang hari ini", "hari mana yang penuh",
//              "mana yang lunas tapi belum punya halaman".
//   PAGES    — sumbu HALAMAN, tempat kerja, semua aksi.
//              "urutan kartu di feed", "mana yang disembunyikan",
//              "mana yang masih banner default", "buat page standalone",
//              "audit responden & hapus proof".
//
// Karena itu TIDAK ADA pemilih periode di sini. Yang ada sebelumnya bahkan salah:
// ia menyaring bulan lewat `toISOString().slice(0,7)` — UTC, bukan WIB.
// ─────────────────────────────────────────────────────────────

type Tab = 'live' | 'catalog';

const CATALOG_LIMIT = 100;

const PAGE_SELECT = `
    *,
    form_submissions (
        title,
        full_name,
        auth_user_id,
        university,
        prize_per_winner,
        winner_count,
        criteria_responden
    ),
    page_respondents (
        count
    )
`;

/**
 * Nama pemilik diselesaikan SESUDAH query, dari `profiles` — bukan kolom di
 * `survey_pages`. Itu sebabnya pencarian katalog di server hanya menjangkau judul
 * dan slug: nama peneliti tidak ada di tabel yang sedang dicari.
 */
async function decorateOwners(rows: any[]): Promise<PageData[]> {
    const ownerNames = await fetchProfileNames(
        rows.map((p: any) => p.form_submissions?.auth_user_id)
    );
    rows.forEach((p: any) => {
        const authId = p.form_submissions?.auth_user_id;
        // Halaman bertaut: nama akun auth (jangan biodata/Nama Invoice).
        // Halaman yatim (tanpa auth_user_id): Nama Invoice-nya — pengecualian yang diterima.
        p.owner_name = authId
            ? (ownerNames.get(authId)?.name || '')
            : (p.form_submissions?.full_name || '');
    });
    return rows as PageData[];
}

export function PublishPageManagement() {
    const [activeTab, setActiveTab] = useState<Tab>('live');

    const [livePages, setLivePages] = useState<PageData[]>([]);
    const [liveLoading, setLiveLoading] = useState(true);

    const [catalogPages, setCatalogPages] = useState<PageData[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [catalogTotal, setCatalogTotal] = useState<number | null>(null);
    const [catalogQuery, setCatalogQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');

    const [selectedPage, setSelectedPage] = useState<PageData | null>(null);
    const [isPageBuilderOpen, setIsPageBuilderOpen] = useState(false);
    const [builderPage, setBuilderPage] = useState<PageData | null>(null);

    const selectedPageIdRef = useRef<string | null>(null);
    selectedPageIdRef.current = selectedPage?.id ?? null;

    /**
     * Feed live — dibatasi JENDELA TAYANG, bukan kerecentan.
     *
     * Iklan 30 hari yang mulai dua bulan lalu masih live hari ini; membatasi
     * dengan `created_at` akan memotongnya diam-diam dari daftar urutan, dan
     * urutan yang bolong adalah urutan yang salah disimpan.
     *
     * Batas SQL cuma mengecilkan payload. `isLive()` tetap sumber kebenarannya —
     * ia dipakai bersama listing publik dan functions/api/surveys.js.
     */
    const fetchLive = useCallback(async () => {
        setLiveLoading(true);
        try {
            const nowIso = new Date().toISOString();
            const { data, error } = await supabase
                .from('survey_pages')
                .select(PAGE_SELECT)
                .eq('is_published', true)
                .or(`publish_start_date.is.null,publish_start_date.lte."${nowIso}"`)
                .or(`publish_end_date.is.null,publish_end_date.gte."${nowIso}"`);

            if (error) throw error;
            const decorated = await decorateOwners(data || []);
            const now = Date.now();
            setLivePages(decorated.filter(p => isLive(p, now)).sort(compareDisplayOrder));
        } catch (error) {
            console.error('Error fetching live pages:', error);
            toast.error('Gagal memuat feed live');
        } finally {
            setLiveLoading(false);
        }
    }, []);

    /** Katalog — 100 terbaru; pencarian dikirim ke server, bukan disaring di klien. */
    const fetchCatalog = useCallback(async (query: string) => {
        setCatalogLoading(true);
        try {
            let q = supabase
                .from('survey_pages')
                .select(PAGE_SELECT, { count: 'exact' })
                .order('created_at', { ascending: false })
                .limit(CATALOG_LIMIT);

            const term = query.trim();
            if (term) {
                const safe = term.replace(/[%,()]/g, ' ');
                q = q.or(`title.ilike.%${safe}%,slug.ilike.%${safe}%`);
            }

            const { data, error, count } = await q;
            if (error) throw error;
            setCatalogPages(await decorateOwners(data || []));
            setCatalogTotal(count ?? null);
        } catch (error) {
            console.error('Error fetching page catalog:', error);
            toast.error('Gagal memuat katalog halaman');
        } finally {
            setCatalogLoading(false);
        }
    }, []);

    useEffect(() => { void fetchLive(); }, [fetchLive]);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedQuery(catalogQuery), 300);
        return () => clearTimeout(t);
    }, [catalogQuery]);

    useEffect(() => { void fetchCatalog(debouncedQuery); }, [fetchCatalog, debouncedQuery]);

    /**
     * Drawer memegang snapshot halaman, jadi ia harus ikut segar setiap kali data
     * dimuat ulang — kalau tidak, menyembunyikan halaman dari footer drawer akan
     * memperbarui daftar di belakangnya tapi meninggalkan drawernya berbohong.
     */
    useEffect(() => {
        const id = selectedPageIdRef.current;
        if (!id) return;
        const fresh = livePages.find(p => p.id === id) || catalogPages.find(p => p.id === id);
        if (fresh) setSelectedPage(fresh);
    }, [livePages, catalogPages]);

    const refreshAll = useCallback(async () => {
        await Promise.all([fetchLive(), fetchCatalog(debouncedQuery)]);
    }, [fetchLive, fetchCatalog, debouncedQuery]);

    const handleToggleHide = async (page: PageData) => {
        const action = page.is_hidden ? 'menampilkan kembali' : 'menyembunyikan';
        if (!confirm(`Yakin ingin ${action} halaman "${page.title}" dari API Mobile App?`)) return;

        try {
            const { error } = await supabase
                .from('survey_pages')
                .update({ is_hidden: !page.is_hidden })
                .eq('id', page.id);
            if (error) throw error;
            toast.success(`Halaman berhasil ${page.is_hidden ? 'ditampilkan' : 'disembunyikan'} dari Mobile App`);
            await refreshAll();
        } catch (error) {
            console.error('Error toggling hide page:', error);
            toast.error(`Gagal ${page.is_hidden ? 'menampilkan' : 'menyembunyikan'} halaman`);
        }
    };

    /**
     * Page Builder dibuka DARI drawer, dan drawernya ditutup lebih dulu: dua lapis
     * Radix (Sheet lalu Dialog) berebut jebakan fokus, dan admin yang menyunting
     * halaman tidak sedang membaca daftar respondennya.
     *
     * Hapus halaman dan End Campaign tinggal DI DALAM Page Builder — sengaja tidak
     * ada afordans hapus baru di daftar.
     */
    const openPageBuilder = (page: PageData | null) => {
        setSelectedPage(null);
        setBuilderPage(page);
        setIsPageBuilderOpen(true);
    };

    const closePageBuilder = () => {
        setIsPageBuilderOpen(false);
        setBuilderPage(null);
        void refreshAll();
    };

    const loading = activeTab === 'live' ? liveLoading : catalogLoading;

    /**
     * Muat ulang menyegarkan apa yang sedang dilihat, jadi ia tinggal di toolbar
     * kartu — beda dengan "Create Page", yang milik layar dan karena itu duduk di
     * baris tab. Tombol yang sama muncul dua kali di dua tab membuatnya terbaca
     * seolah membuat dua hal yang berbeda.
     */
    const actions = useMemo(() => (
        <Button
            onClick={() => void refreshAll()}
            variant="ghost"
            size="icon"
            disabled={loading}
            className="h-8 w-8 text-gray-500 hover:text-blue-600 hover:bg-blue-50"
            title="Muat ulang"
        >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </Button>
    ), [loading, refreshAll]);

    return (
        <div className="p-4 pb-0 md:px-6 md:pt-4 md:pb-0 flex-1 min-h-0 flex flex-col">
            {/* ── Tab DI LUAR kartu, seperti Schedule dan Finance ── */}
            <div className="shrink-0 flex items-center border-b border-gray-200 mb-4">
                {([
                    ['live', 'Feed Live', ListOrdered],
                    ['catalog', 'Semua Page', Files],
                ] as const).map(([id, label, Icon]) => (
                    <button
                        key={id}
                        onClick={() => setActiveTab(id)}
                        className={cn(
                            'flex items-center gap-1.5 px-4 py-2.5 -mb-px text-sm font-semibold border-b-2 transition-colors',
                            activeTab === id
                                ? 'border-blue-600 text-blue-700'
                                : 'border-transparent text-gray-500 hover:text-gray-800'
                        )}
                    >
                        <Icon className="w-4 h-4" />
                        {label}
                    </button>
                ))}

                {/* Membuat halaman bukan aksi milik salah satu tab — ia berlaku di
                    kedua-duanya, jadi tempatnya di baris tab, bukan di dalam kartu. */}
                <Button
                    onClick={() => openPageBuilder(null)}
                    size="sm"
                    className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white ml-auto mb-1.5"
                >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Create Page
                </Button>
            </div>

            {/* ── Satu kartu terpadu: toolbar · satu wilayah gulung · footer ── */}
            <div className="flex-1 min-h-0 flex flex-col bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
                {activeTab === 'live' ? (
                    <LiveFeedTab
                        livePages={livePages}
                        loading={liveLoading}
                        actions={actions}
                        onSelectPage={setSelectedPage}
                        onOrderSaved={fetchLive}
                    />
                ) : (
                    <PageCatalogTab
                        pages={catalogPages}
                        loading={catalogLoading}
                        query={catalogQuery}
                        onQueryChange={setCatalogQuery}
                        totalCount={catalogTotal}
                        actions={actions}
                        onSelectPage={setSelectedPage}
                    />
                )}
            </div>

            <PageDetailDrawer
                page={selectedPage}
                onClose={() => setSelectedPage(null)}
                onOpenPageBuilder={openPageBuilder}
                onToggleHide={handleToggleHide}
            />

            {isPageBuilderOpen && (
                <PageBuilderModal
                    isOpen={isPageBuilderOpen}
                    onClose={closePageBuilder}
                    onSuccess={closePageBuilder}
                    initialData={builderPage || undefined}
                    submissionId={builderPage?.submission_id}
                />
            )}
        </div>
    );
}
