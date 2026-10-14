import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminContent, supabase } from '@/utils/supabase';
import { isLive, compareDisplayOrder } from '@/utils/adOrdering';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { Files, ListOrdered, Plus, RefreshCw, Zap } from 'lucide-react';
import { PageBuilderModal } from './PageBuilder/PageBuilderModal';
import { LiveFeedTab } from './publish-pages/LiveFeedTab';
import { PageCatalogTab } from './publish-pages/PageCatalogTab';
import { KilatPagesTab } from './publish-pages/KilatPagesTab';
import { PageDetailDrawer } from './publish-pages/PageDetailDrawer';
import { isKilatPage, type PageData } from './publish-pages/types';
import { DEFAULT_CATALOG_VIEW, type CatalogView } from './publish-pages/catalogSearch';
import { toast } from 'sonner';
import { fetchProfileNames } from '../utils/profileNames';
import { fetchAllRows } from '../utils/fetchAllRows';

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

type Tab = 'live' | 'kilat' | 'catalog';

/**
 * Sama dengan PAGE_SELECT, tapi join-nya `!inner` supaya `.eq()` pada
 * `form_submissions.distribution_type` benar-benar menyaring baris induk.
 * Dipisah, bukan dijadikan satu dengan PAGE_SELECT, karena `!inner` akan
 * MEMBUANG halaman yatim — benar untuk tab Kilat, salah untuk dua tab lain.
 */
const PAGE_SELECT_KILAT = `
    *,
    form_submissions!inner (
        title,
        full_name,
        email,
        auth_user_id,
        university,
        prize_per_winner,
        winner_count,
        criteria_responden,
        distribution_type
    ),
    page_respondents (
        count
    )
`;

const PAGE_SELECT = `
    *,
    form_submissions (
        title,
        full_name,
        email,
        auth_user_id,
        university,
        prize_per_winner,
        winner_count,
        criteria_responden,
        distribution_type
    ),
    page_respondents (
        count
    )
`;

/**
 * Indeks katalog "Semua Page" — SELURUH halaman, dalam bentuk ringan.
 *
 * Kolom yang dibaca baris katalog dan drawer saja. Dua yang sengaja TIDAK ikut:
 *
 *  - `blocks` — isi halaman, bagian terberat tiap baris. Karena itu Page Builder
 *    tidak pernah dibuka dari baris ini (lihat `openPageBuilder`).
 *  - `page_respondents(count)` — ±9 ms per halaman, ±4,5 detik untuk semua;
 *    dihitung hanya untuk baris yang tampil (`useRespondentCounts`).
 *
 * Terukur 14 Okt 2026: 490 halaman ≈ 524 KB JSON (±80 KB gzip), dimuat sekali.
 * Tinjau ulang di ±3.000 halaman (±3 MB) — di sana pencarian perlu kembali ke
 * server.
 */
const CATALOG_INDEX_SELECT = `
    id,
    slug,
    title,
    submission_id,
    created_at,
    is_published,
    is_hidden,
    is_extra_ad,
    views_count,
    banner_url,
    publish_start_date,
    publish_end_date,
    display_order,
    custom_fields,
    requires_banner_update,
    form_submissions (
        title,
        full_name,
        email,
        auth_user_id,
        university,
        prize_per_winner,
        winner_count,
        criteria_responden,
        distribution_type
    )
`;

/**
 * Nama & email pemilik diselesaikan SESUDAH query, dari `profiles` — bukan kolom
 * di `survey_pages`. Karena itu pencarian katalog berjalan di browser: nama
 * peneliti tidak ada di tabel yang di-query.
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
        p.owner_email = authId ? (ownerNames.get(authId)?.email || '') : '';
    });
    return rows as PageData[];
}

export function PublishPageManagement() {
    const [activeTab, setActiveTab] = useState<Tab>('live');

    const [livePages, setLivePages] = useState<PageData[]>([]);
    const [liveLoading, setLiveLoading] = useState(true);

    const [kilatPages, setKilatPages] = useState<PageData[]>([]);
    const [kilatLoading, setKilatLoading] = useState(true);

    const [catalogPages, setCatalogPages] = useState<PageData[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(true);
    /** Naik tiap indeks selesai dimuat — mereset cache hitung responden. */
    const [catalogVersion, setCatalogVersion] = useState(0);
    /** `now` bersama untuk chip status & saringan status — satu jam untuk keduanya. */
    const [catalogLoadedAt, setCatalogLoadedAt] = useState(() => Date.now());
    const catalogRequestRef = useRef(0);
    // Di induk, bukan di tab, supaya pencarian & saringan bertahan saat pindah tab.
    const [catalogView, setCatalogView] = useState<CatalogView>(DEFAULT_CATALOG_VIEW);

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
            // ── Kilat dibuang dari feed live (Phase 5) ──
            //
            // Tab ini adalah SUMBU FEED: urutan kartu di aplikasi Jakpat, mana
            // yang disembunyikan, mana yang masih banner default. Halaman Kilat
            // tidak pernah menjadi kartu feed — ia tujuan pendaratan push
            // notification — jadi kehadirannya di sini membuat SETIAP angka di
            // layar ini berbohong. Terukur 18 Sep: 32 baris untuk 4 iklan
            // reguler, dan badge "17 banner default" seluruhnya Kilat padahal
            // NOL iklan reguler butuh banner.
            //
            // Badge ikut benar dengan sendirinya: ia menghitung dari daftar ini.
            //
            // ⚠️ Halaman Kilat TIDAK hilang dari admin — ia punya tab sendiri
            // ("Kilat") dan tetap ada di "Semua Page". Ini penyaringan sumbu,
            // bukan penyembunyian.
            //
            // ⚠️ KEMBAR KETIGA. SurveyListingPage.tsx dan functions/api/surveys.js
            // punya filter yang sama. Ubah satu, tinjau ketiganya.
            const feedOnly = decorated.filter(p => !isKilatPage(p));
            setLivePages(feedOnly.filter(p => isLive(p, now)).sort(compareDisplayOrder));
        } catch (error) {
            console.error('Error fetching live pages:', error);
            toast.error('Gagal memuat feed live');
        } finally {
            setLiveLoading(false);
        }
    }, []);

    /**
     * Kilat — SEMUA halaman Kilat, gelombang terbaru di atas.
     *
     * Sengaja TIDAK dibatasi jendela tayang seperti feed. Dua sebabnya:
     *
     *  1. `publish_end_date` Kilat selalu NULL (sql/95) — tautan push tidak
     *     boleh mati — jadi "masih dalam jendela" tidak membedakan apa pun.
     *  2. Menyaring "yang aktif hari ini" akan membuat tab ini KOSONG: per
     *     18 Sep seluruh 17 halaman Kilat gelombangnya sudah lewat (terbaru
     *     14 Sep). Tab kosong terbaca seperti fitur rusak, padahal justru di
     *     sinilah admin mencari tautan yang pernah disiarkan.
     *
     * Urutannya `publish_start_date` menurun = gelombang terbaru di atas, yang
     * juga berarti yang paling mungkin dicari ada di paling atas.
     */
    const fetchKilat = useCallback(async () => {
        setKilatLoading(true);
        try {
            const { data, error } = await supabase
                .from('survey_pages')
                // ⚠️ `!inner` WAJIB — tanpa itu `.eq()` pada kolom tertaut hanya
                // menyaring ISI join-nya, bukan baris induknya. Terukur di
                // produksi 18 Sep: tanpa `!inner` kueri ini memulangkan 388
                // baris (seluruh tabel) dan bukan 17. Halaman yatim ikut gugur,
                // dan itu memang yang diinginkan di sini: Kilat selalu punya
                // submission_id, jadi `!inner` sekaligus menggantikan
                // `.not('submission_id','is',null)`.
                .select(PAGE_SELECT_KILAT)
                .eq('form_submissions.distribution_type', 'kilat')
                .order('publish_start_date', { ascending: false, nullsFirst: false });

            if (error) throw error;
            // Sabuk pengaman kedua: kalau `!inner` di atas pernah hilang saat
            // seseorang merapikan select, filter ini yang menahan kebocoran.
            const decorated = await decorateOwners(data || []);
            setKilatPages(decorated.filter(isKilatPage));
        } catch (error) {
            console.error('Error fetching kilat pages:', error);
            toast.error('Gagal memuat halaman Kilat');
        } finally {
            setKilatLoading(false);
        }
    }, []);

    /**
     * Katalog — SELURUH halaman sebagai indeks ringan; cari, saring, dan paginasi
     * berjalan di browser (catalogSearch.ts). Terbaru dibuat di atas; `id` sebagai
     * pemecah seri supaya `.range()` di `fetchAllRows` tidak melompati baris.
     */
    const fetchCatalog = useCallback(async () => {
        const request = ++catalogRequestRef.current;
        setCatalogLoading(true);
        try {
            const rows = await fetchAllRows(() => supabase
                .from('survey_pages')
                .select(CATALOG_INDEX_SELECT)
                .order('created_at', { ascending: false })
                .order('id', { ascending: true }));
            const decorated = await decorateOwners(rows);
            // Muat ulang yang lebih baru sudah jalan — jangan timpa dengan yang lama.
            if (request !== catalogRequestRef.current) return;
            setCatalogPages(decorated);
            setCatalogLoadedAt(Date.now());
            setCatalogVersion(v => v + 1);
        } catch (error) {
            console.error('Error fetching page catalog:', error);
            if (request === catalogRequestRef.current) toast.error('Gagal memuat katalog halaman');
        } finally {
            if (request === catalogRequestRef.current) setCatalogLoading(false);
        }
    }, []);

    /** Halaman kembali ke 1 setiap kueri/saringan berubah — kecuali yang berubah memang halamannya. */
    const updateCatalogView = useCallback((patch: Partial<CatalogView>) => {
        setCatalogView(v => ({ ...v, ...patch, page: patch.page ?? 1 }));
    }, []);

    useEffect(() => { void fetchLive(); }, [fetchLive]);

    useEffect(() => { void fetchKilat(); }, [fetchKilat]);
    useEffect(() => { void fetchCatalog(); }, [fetchCatalog]);

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
        await Promise.all([fetchLive(), fetchKilat(), fetchCatalog()]);
    }, [fetchLive, fetchKilat, fetchCatalog]);

    const handleToggleHide = async (page: PageData) => {
        const action = page.is_hidden ? 'menampilkan kembali' : 'menyembunyikan';
        if (!confirm(`Yakin ingin ${action} halaman "${page.title}" dari API Mobile App?`)) return;

        try {
            const { error } = await adminContent(
                {
                    action: 'patch-pages',
                    patch: { is_hidden: !page.is_hidden },
                    filters: [{ col: 'id', op: 'eq', val: page.id }],
                },
                () => supabase.from('survey_pages').update({ is_hidden: !page.is_hidden }).eq('id', page.id),
            );
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
     *
     * ⚠️ BARIS UTUH SELALU DIAMBIL ULANG SEBELUM BUILDER DIBUKA. Baris katalog
     * adalah indeks ringan TANPA `blocks`, dan builder membaca
     * `initialData.blocks || {}` — membuka dari baris ringan lalu menyimpan akan
     * MENGHAPUS isi halaman. Berlaku untuk semua jalur (katalog, drawer, Iklan
     * Live) supaya invariannya tinggal di satu tempat. Gagal ambil → builder
     * tidak dibuka.
     */
    const openPageBuilder = async (page: PageData | null) => {
        let full: PageData | null = null;
        if (page) {
            const { data, error } = await supabase
                .from('survey_pages')
                .select(PAGE_SELECT)
                .eq('id', page.id)
                .single();
            if (error || !data) {
                console.error('Error loading full page for builder:', error);
                toast.error('Gagal memuat isi halaman — coba lagi');
                return;
            }
            full = data as PageData;
        }
        setSelectedPage(null);
        setBuilderPage(full);
        setIsPageBuilderOpen(true);
    };

    const closePageBuilder = () => {
        setIsPageBuilderOpen(false);
        setBuilderPage(null);
        void refreshAll();
    };

    const loading = activeTab === 'live' ? liveLoading
        : activeTab === 'kilat' ? kilatLoading
        : catalogLoading;

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
                    // "Iklan Live", bukan "Feed Live": nama lama menyebut
                    // MEKANISME, nama baru menyebut ISI — dan berdampingan
                    // dengan "Kilat" ia jadi mengajar, karena dua tab itu
                    // persis dua jalur distribusi JFU.
                    ['live', 'Iklan Live', ListOrdered],
                    ['kilat', 'Kilat', Zap],
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
                    onClick={() => void openPageBuilder(null)}
                    size="sm"
                    className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white ml-auto mb-1.5"
                >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Create Page
                </Button>
            </div>

            {/* ── Satu kartu terpadu: toolbar · satu wilayah gulung · footer ── */}
            <div className="flex-1 min-h-0 flex flex-col bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
                {activeTab === 'kilat' ? (
                    <KilatPagesTab
                        kilatPages={kilatPages}
                        loading={kilatLoading}
                        actions={actions}
                        onSelectPage={setSelectedPage}
                    />
                ) : activeTab === 'live' ? (
                    <LiveFeedTab
                        livePages={livePages}
                        loading={liveLoading}
                        actions={actions}
                        onSelectPage={setSelectedPage}
                        onOpenPageBuilder={openPageBuilder}
                        onToggleHide={handleToggleHide}
                        onOrderSaved={fetchLive}
                    />
                ) : (
                    <PageCatalogTab
                        pages={catalogPages}
                        loading={catalogLoading}
                        loadedAt={catalogLoadedAt}
                        version={catalogVersion}
                        view={catalogView}
                        onViewChange={updateCatalogView}
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
