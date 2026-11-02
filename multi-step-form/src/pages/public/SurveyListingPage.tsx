import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
    AlertCircle,
    ArrowRight,
    CheckSquare,
    ExternalLink,
    Globe,
    Megaphone,
    Menu,
    RotateCcw,
    Trophy,
    X,
} from 'lucide-react';
import { supabase, getCdnUrl } from '@/utils/supabase';
import { compareDisplayOrder, type OrderablePage } from '@/utils/adOrdering';
import { publicPagePath } from '@/utils/page-url';
import { hiddenFromFeed, isKilatPage } from '@/components/publish-pages/types';
import { useLanguage } from '@/i18n/LanguageContext';
import logoMark from '@/assets/Jakpat Navbar Logo.webp';

/**
 * Normalize a schedule date string for accurate time comparison.
 *
 * If the value is a date-only string (e.g. "2026-04-13") without a time
 * component, `new Date()` parses it as **midnight UTC** which equals
 * 07:00 WIB — way before the intended 15:00 WIB go-live time.
 *
 * This function detects date-only values and sets the time to 08:00 UTC
 * (= 15:00 WIB), matching the default ad go-live convention.
 */
function normalizeScheduleDate(dateStr: string | null | undefined): Date {
    if (!dateStr || typeof dateStr !== 'string') {
        return new Date();
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
        return new Date();
    }
    if (!dateStr.includes('T')) {
        d.setUTCHours(8, 0, 0, 0);
    }
    return d;
}

/**
 * Apakah baris survey_pages ini milik order Kilat?
 *
 * Bentuk join PostgREST tidak konsisten: kadang objek (one-to-one), kadang
 * array (one-to-many) — `getSubmissionData` di bawah sudah lama menanganinya
 * dengan cara yang sama.
 *
 * ⚠️ HALAMAN YATIM WAJIB LOLOS. 23 halaman produksi punya `submission_id` NULL
 * (11 di antaranya terbit) — pengumuman dan iklan manual yang tidak berasal
 * dari order mana pun. Bagi mereka `form_submissions` null, dan itu berarti
 * BUKAN Kilat, bukan "tidak diketahui jadi buang". Salah di sini = 11 halaman
 * hidup lenyap dari /pages.
 */
// Implementasi tunggalnya ada di publish-pages/types.ts — diekspor ulang di
// sini supaya pemakai lama (dan tesnya) tetap mengimpor dari berkas ini.
export { hiddenFromFeed, isKilatPage };

interface JoinedSubmission {
    prize_per_winner?: number | null;
    winner_count?: number | null;
    distribution_type?: string | null;
    criteria_responden?: string | null;
}

interface ListingPageRow extends OrderablePage {
    id: string;
    slug: string;
    title: string;
    banner_url?: string | null;
    redirect_url?: string | null;
    submission_id?: string | null;
    is_published?: boolean;
    is_extra_ad?: boolean;
    display_order?: number | null;
    publish_start_date?: string | null;
    publish_end_date?: string | null;
    created_at: string;
    views_count?: number | null;
    form_submissions?: JoinedSubmission | JoinedSubmission[] | null;
}

interface BatchRewardRow {
    submission_id?: string;
    period_batch: string | null;
    prize_per_winner: number;
    winner_count: number;
    end_date: string | null;
}

type CategoryFilter = 'all' | 'survey' | 'announcement';
type SortOption = 'curated' | 'reward' | 'ending';

/**
 * Same batch-selection rule as SurveyPage.tsx and functions/api/surveys.js so
 * /pages/, /pages/:slug, and the mobile app feed always quote identical prizes.
 */
function pickDisplayBatch(batches: BatchRewardRow[]): BatchRewardRow | null {
    if (!batches || batches.length === 0) return null;
    const now = Date.now();

    const running = batches
        .filter((b) => b.end_date && new Date(b.end_date).getTime() > now)
        .sort((a, b) => new Date(a.end_date!).getTime() - new Date(b.end_date!).getTime());
    if (running.length > 0) return running[0];

    return [...batches].sort((a, b) =>
        String(b.period_batch || '').localeCompare(String(a.period_batch || ''))
    )[0];
}

const WIB_TIMEZONE = 'Asia/Jakarta';

const wibIsoDayFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: WIB_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

function toWibEpochDay(date: Date): number {
    const parts = wibIsoDayFmt.format(date).split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) {
        return Math.floor(date.getTime() / 86_400_000);
    }
    return Math.floor(Date.UTC(parts[0], parts[1] - 1, parts[2]) / 86_400_000);
}

function formatCriteriaPreview(raw: string | null | undefined): string | null {
    if (!raw || typeof raw !== 'string') return null;
    const cleaned = raw
        .split(/\r?\n/)
        .map((line) => line.trim().replace(/^[-*•]+\s*/, '').replace(/^\d+[.)]\s*/, ''))
        .filter(Boolean)
        .join(' · ')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned.length > 0 ? cleaned : null;
}

const FOCUS_RING =
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1976D2]';

const COPY = {
    id: {
        docTitle: 'Daftar Survei Terbaru | Jakpat for Universities',
        skipToContent: 'Langsung ke daftar survei',
        primaryNavLabel: 'Utama',
        footerNavLabel: 'Footer',
        mobileNavLabel: 'Menu utama seluler',
        openMenu: 'Buka menu navigasi',
        closeMenu: 'Tutup menu navigasi',
        languageGroupLabel: 'Pilih bahasa',
        navHome: 'Beranda',
        navServices: 'Layanan',
        navSurveys: 'Daftar Survei',
        navAdvertise: 'Iklankan Survei',
        heading: 'Daftar Survei Terbaru',
        subtitle: 'Bantu riset mahasiswa dan menangkan undian saldo e-wallet resmi Jakpat.',
        announcementPrefix: 'Pengumuman:',
        announcementAction: 'Lihat daftar',
        filterGroupLabel: 'Filter kategori halaman',
        filterAll: 'Semua',
        filterSurvey: 'Survei Aktif',
        filterAnnouncement: 'Pengumuman',
        sortLabel: 'Urutkan:',
        sortCurated: 'Pilihan Utama',
        sortReward: 'Hadiah / Orang Terbesar',
        sortEnding: 'Segera Berakhir',
        typeSurvey: 'Survei Undian',
        typeAnnouncement: 'Pengumuman',
        officialNotice: 'Info Resmi',
        endsToday: 'Berakhir Hari Ini',
        endsTomorrow: 'Berakhir Besok',
        endsOnPrefix: 'Berakhir',
        perPerson: '/ orang',
        winnerQuota: (count: number) => `Kuota ${count} pemenang`,
        openForRespondents: 'Terbuka untuk responden',
        researchSurveyLabel: 'Survei Riset',
        winnerListTitle: 'Daftar Pemenang',
        winnerListSub: 'Resmi terverifikasi',
        ctaJoin: 'Ikuti',
        ctaOpen: 'Buka',
        opensNewTab: '(membuka tab baru)',
        loadingLabel: 'Memuat daftar survei terbaru',
        emptyAllTitle: 'Belum Ada Survei Aktif',
        emptyAllDesc: 'Kami sedang menyiapkan survei riset berikutnya. Cek lagi nanti ya!',
        emptyFilterTitle: 'Belum Ada Halaman di Kategori Ini',
        emptyFilterDesc: 'Coba tampilkan semua kategori untuk melihat halaman lain yang sedang aktif.',
        showAllCategories: 'Tampilkan Semua',
        reloadButton: 'Muat Ulang',
        errorTitle: 'Gagal Memuat Daftar Survei',
        errorDesc: 'Koneksi sedang tidak stabil. Silakan coba muat ulang halaman ini.',
        retryButton: 'Coba Lagi',
        researcherHeading: 'Butuh responden cepat untuk skripsi atau risetmu?',
        researcherDesc: 'Iklankan kuesionermu ke 2 juta+ responden Jakpat di seluruh Indonesia.',
        researcherCta: 'Iklankan Survei',
        footerPrivacy: 'Kebijakan Privasi',
        footerTerms: 'Syarat & Ketentuan',
        copyright: '© 2026 Jakpat for Universities. All rights reserved.',
        fallbackBrand: 'Jakpat for Universities',
    },
    en: {
        docTitle: 'Latest Surveys | Jakpat for Universities',
        skipToContent: 'Skip to survey list',
        primaryNavLabel: 'Primary',
        footerNavLabel: 'Footer',
        mobileNavLabel: 'Mobile primary',
        openMenu: 'Open navigation menu',
        closeMenu: 'Close navigation menu',
        languageGroupLabel: 'Select language',
        navHome: 'Home',
        navServices: 'Services',
        navSurveys: 'Survey List',
        navAdvertise: 'Advertise Survey',
        heading: 'Latest Surveys',
        subtitle: 'Support university research and win official Jakpat e-wallet lucky draws.',
        announcementPrefix: 'Announcement:',
        announcementAction: 'View list',
        filterGroupLabel: 'Filter page category',
        filterAll: 'All',
        filterSurvey: 'Active Surveys',
        filterAnnouncement: 'Announcements',
        sortLabel: 'Sort by:',
        sortCurated: 'Featured',
        sortReward: 'Highest Prize / Winner',
        sortEnding: 'Ending Soon',
        typeSurvey: 'Lucky Draw Survey',
        typeAnnouncement: 'Announcement',
        officialNotice: 'Official Notice',
        endsToday: 'Ends Today',
        endsTomorrow: 'Ends Tomorrow',
        endsOnPrefix: 'Ends',
        perPerson: '/ winner',
        winnerQuota: (count: number) => `Quota: ${count} winners`,
        openForRespondents: 'Open for respondents',
        researchSurveyLabel: 'Research Survey',
        winnerListTitle: 'Winner List',
        winnerListSub: 'Officially verified',
        ctaJoin: 'Join',
        ctaOpen: 'Open',
        opensNewTab: '(opens in a new tab)',
        loadingLabel: 'Loading latest surveys',
        emptyAllTitle: 'No Active Surveys Right Now',
        emptyAllDesc: 'We are preparing the next batch of student research surveys. Please check back soon!',
        emptyFilterTitle: 'No Pages in This Category',
        emptyFilterDesc: 'Switch back to all categories to view other currently active pages.',
        showAllCategories: 'Show All',
        reloadButton: 'Reload',
        errorTitle: 'Unable to Load Surveys',
        errorDesc: 'Your connection appears unstable. Please try loading the list again.',
        retryButton: 'Try Again',
        researcherHeading: 'Need fast respondents for your thesis or academic research?',
        researcherDesc: 'Promote your questionnaire to 2M+ verified Jakpat respondents across Indonesia.',
        researcherCta: 'Advertise Survey',
        footerPrivacy: 'Privacy Policy',
        footerTerms: 'Terms & Conditions',
        copyright: '© 2026 Jakpat for Universities. All rights reserved.',
        fallbackBrand: 'Jakpat for Universities',
    },
} as const;

export function SurveyListingPage() {
    const { language, setLanguage } = useLanguage();
    const copy = COPY[language];

    const [pages, setPages] = useState<ListingPageRow[]>([]);
    const [rewardBySubmission, setRewardBySubmission] = useState<
        Record<string, { prize_per_winner: number; winner_count: number }>
    >({});
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [filter, setFilter] = useState<CategoryFilter>('all');
    const [sortBy, setSortBy] = useState<SortOption>('curated');
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [failedBanners, setFailedBanners] = useState<Record<string, true>>({});

    useEffect(() => {
        document.title = copy.docTitle;
        document.documentElement.setAttribute('lang', language);
    }, [copy.docTitle, language]);

    useEffect(() => {
        if (!mobileMenuOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setMobileMenuOpen(false);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [mobileMenuOpen]);

    const loadPages = useCallback(async () => {
        setLoading(true);
        setLoadError(false);

        try {
            const { data, error } = await supabase
                .from('survey_pages')
                // `distribution_type` ikut ditarik SEMATA untuk menyaring Kilat di
                // bawah — lihat komentar di filter. Jangan dibuang saat merapikan
                // select ini. Kolom berat (`blocks`, `custom_fields`) sengaja tidak
                // ditarik di direktori publik.
                .select(
                    'id, slug, title, banner_url, redirect_url, submission_id, is_published, is_extra_ad, display_order, publish_start_date, publish_end_date, created_at, views_count, form_submissions!submission_id(prize_per_winner, winner_count, distribution_type, criteria_responden)'
                )
                .eq('is_published', true)
                // Base order; final ordering applied in JS via compareDisplayOrder.
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Client-side filtering for schedule
            const now = new Date();
            const activePages = ((data || []) as ListingPageRow[]).filter((page) => {
                // ── Kilat tidak pernah tampil di sini (Phase 5, sql/95) ───────
                // Kilat punya halaman, tapi halamannya adalah tujuan pendaratan
                // push notification di aplikasi Jakpat — bukan kartu iklan di
                // feed. Admin menyalin tautannya dari dashboard; ia tidak pernah
                // ditawarkan ke pengunjung /pages.
                //
                // ⚠️ INI SATU-SATUNYA PENAHAN. Halaman Kilat terbit
                // (is_published=true, WAJIB — undian membacanya), tidak
                // tersembunyi (is_hidden=false), dan publish_end_date-nya NULL
                // sehingga LOLOS filter tanggal di bawah. Tidak ada sabuk
                // pengaman kedua. Dikunci oleh surveyListingKilat.spec.ts.
                //
                // ⚠️ KEMBAR: functions/api/surveys.js punya filter yang sama.
                // Ubah satu, ubah keduanya.
                if (hiddenFromFeed(page)) return false;

                const startDate = page.publish_start_date
                    ? normalizeScheduleDate(page.publish_start_date)
                    : null;
                const endDate = page.publish_end_date
                    ? normalizeScheduleDate(page.publish_end_date)
                    : null;

                // If scheduled in future, hide
                if (startDate && startDate > now) return false;
                // If ended, hide
                if (endDate && endDate < now) return false;

                return true;
            });

            // Apply listing order: manual display_order, then type priority, then recency.
            activePages.sort(compareDisplayOrder);
            setPages(activePages);

            // Sync multi-batch rewards with SurveyPage.tsx and /api/surveys.
            // Raw form_submissions columns stay as fallback if RPC is unavailable.
            const submissionIds = Array.from(
                new Set(
                    activePages
                        .map((p) => p.submission_id)
                        .filter((id): id is string => Boolean(id))
                )
            );

            if (submissionIds.length > 0) {
                const nextRewards: Record<string, { prize_per_winner: number; winner_count: number }> = {};
                const RPC_CHUNK = 200;

                for (let i = 0; i < submissionIds.length; i += RPC_CHUNK) {
                    const chunk = submissionIds.slice(i, i + RPC_CHUNK);
                    try {
                        const { data: batchData, error: batchError } = await supabase.rpc(
                            'get_batch_rewards_bulk',
                            { p_submission_ids: chunk }
                        );
                        if (batchError) {
                            console.error('get_batch_rewards_bulk RPC error:', batchError);
                            continue;
                        }
                        const grouped: Record<string, BatchRewardRow[]> = {};
                        ((batchData || []) as BatchRewardRow[]).forEach((row) => {
                            if (!row.submission_id) return;
                            if (!grouped[row.submission_id]) grouped[row.submission_id] = [];
                            grouped[row.submission_id].push(row);
                        });
                        Object.entries(grouped).forEach(([sid, batches]) => {
                            const picked = pickDisplayBatch(batches);
                            if (picked) {
                                nextRewards[sid] = {
                                    prize_per_winner: picked.prize_per_winner || 0,
                                    winner_count: picked.winner_count || 0,
                                };
                            }
                        });
                    } catch (rpcErr) {
                        console.error('get_batch_rewards_bulk RPC error:', rpcErr);
                    }
                }

                setRewardBySubmission(nextRewards);
            } else {
                setRewardBySubmission({});
            }
        } catch (error) {
            console.error('Error loading pages:', error);
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadPages();
    }, [loadPages]);

    const getSubmissionData = useCallback(
        (page: ListingPageRow) => {
            const sub = page.form_submissions;
            const raw = Array.isArray(sub) ? sub[0] : sub;
            const batch = page.submission_id ? rewardBySubmission[page.submission_id] : undefined;

            const prizePerWinner = batch
                ? batch.prize_per_winner || 0
                : raw?.prize_per_winner || 0;
            const winnerCount = batch
                ? batch.winner_count || 0
                : raw?.winner_count || 0;

            return {
                prizePerWinner,
                winnerCount,
                totalReward: prizePerWinner * winnerCount,
                criteriaPreview: formatCriteriaPreview(raw?.criteria_responden),
            };
        },
        [rewardBySubmission]
    );

    const wibShortDateFmt = useMemo(
        () =>
            new Intl.DateTimeFormat(language === 'id' ? 'id-ID' : 'en-US', {
                timeZone: WIB_TIMEZONE,
                day: 'numeric',
                month: 'short',
            }),
        [language]
    );

    const getDeadlineMeta = useCallback(
        (page: ListingPageRow) => {
            const isAnnouncement = !page.submission_id;
            if (!page.publish_end_date) {
                return {
                    label: isAnnouncement ? copy.officialNotice : null,
                    urgent: false,
                    sortTimestamp: Number.POSITIVE_INFINITY,
                };
            }

            const endDate = normalizeScheduleDate(page.publish_end_date);
            const now = new Date();
            const dayDiff = toWibEpochDay(endDate) - toWibEpochDay(now);
            const formattedDate = wibShortDateFmt.format(endDate);

            if (isAnnouncement) {
                return {
                    label: copy.officialNotice,
                    urgent: false,
                    sortTimestamp: endDate.getTime(),
                };
            }

            if (dayDiff <= 0) {
                return {
                    label: copy.endsToday,
                    urgent: true,
                    sortTimestamp: endDate.getTime(),
                };
            }
            if (dayDiff === 1) {
                return {
                    label: copy.endsTomorrow,
                    urgent: true,
                    sortTimestamp: endDate.getTime(),
                };
            }
            return {
                label: `${copy.endsOnPrefix} ${formattedDate}`,
                urgent: dayDiff <= 3,
                sortTimestamp: endDate.getTime(),
            };
        },
        [copy.endsOnPrefix, copy.endsToday, copy.endsTomorrow, copy.officialNotice, wibShortDateFmt]
    );

    const counts = useMemo(() => {
        let survey = 0;
        let announcement = 0;
        for (const p of pages) {
            if (p.submission_id) survey += 1;
            else announcement += 1;
        }
        return {
            all: pages.length,
            survey,
            announcement,
        };
    }, [pages]);

    const latestAnnouncement = useMemo(() => {
        const announcements = pages.filter((p) => !p.submission_id);
        if (announcements.length === 0) return null;
        return [...announcements].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];
    }, [pages]);

    const visiblePages = useMemo(() => {
        const filtered = pages.filter((p) => {
            if (filter === 'survey') return Boolean(p.submission_id);
            if (filter === 'announcement') return !p.submission_id;
            return true;
        });

        if (sortBy === 'curated') {
            return [...filtered].sort(compareDisplayOrder);
        }

        if (sortBy === 'reward') {
            return [...filtered].sort((a, b) => {
                const diff = getSubmissionData(b).prizePerWinner - getSubmissionData(a).prizePerWinner;
                return diff !== 0 ? diff : compareDisplayOrder(a, b);
            });
        }

        return [...filtered].sort((a, b) => {
            const aEnd = getDeadlineMeta(a).sortTimestamp;
            const bEnd = getDeadlineMeta(b).sortTimestamp;
            if (aEnd !== bEnd) return aEnd - bEnd;
            return compareDisplayOrder(a, b);
        });
    }, [pages, filter, sortBy, getSubmissionData, getDeadlineMeta]);

    const markBannerFailed = useCallback((pageId: string) => {
        setFailedBanners((prev) => (prev[pageId] ? prev : { ...prev, [pageId]: true }));
    }, []);

    const latestAnnouncementRedirect =
        latestAnnouncement && typeof latestAnnouncement.redirect_url === 'string'
            ? latestAnnouncement.redirect_url.trim()
            : '';

    return (
        <div className="min-h-screen flex flex-col bg-[#f8fafc] text-[#0f172a] font-jakarta antialiased [color-scheme:light] selection:bg-[#1976D2]/15 selection:text-[#1976D2] relative overflow-x-hidden">
            {/* Centered Ambient Aura Glow (Pusat pendaran lembut selaras dengan halaman Login Peneliti) */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none" aria-hidden="true">
                {/* Titik 1: Top Header — Pendaran Biru Jakpat, Sky Blue & Warm Rose Lembut */}
                <div
                    className="absolute -top-[12%] left-1/2 -translate-x-[45%] w-[750px] md:w-[1100px] h-[650px] md:h-[900px] rounded-full pointer-events-none transform-gpu"
                    style={{
                        background:
                            'radial-gradient(circle at center, rgba(24, 124, 255, 0.18) 0%, rgba(56, 189, 248, 0.13) 40%, rgba(244, 114, 182, 0.10) 65%, transparent 80%)',
                        filter: 'blur(100px)',
                    }}
                />

                {/* Titik 2: Soft Pink/Rose Accent (Kiri Atas — persis seperti Titik 2 di LoginPage) */}
                <div
                    className="absolute top-[4%] -left-[10%] md:-left-[2%] w-[550px] md:w-[750px] h-[550px] md:h-[750px] rounded-full pointer-events-none transform-gpu"
                    style={{
                        background:
                            'radial-gradient(circle, rgba(251, 113, 133, 0.16) 0%, rgba(244, 114, 182, 0.08) 50%, transparent 75%)',
                        filter: 'blur(105px)',
                    }}
                />

                {/* Titik 3: Mid-Right — Soft Sky Blue & Rose Accent di Balik Kartu Survei */}
                <div
                    className="absolute top-[28%] -right-[6%] md:right-[2%] w-[600px] md:w-[850px] h-[600px] md:h-[850px] rounded-full pointer-events-none transform-gpu"
                    style={{
                        background:
                            'radial-gradient(circle at center, rgba(56, 189, 248, 0.15) 0%, rgba(24, 124, 255, 0.10) 45%, transparent 75%)',
                        filter: 'blur(105px)',
                    }}
                />

                {/* Titik 4: Mid-Left — Soft Rose/Pink Penyeimbang di Balik Kartu Baris Tengah */}
                <div
                    className="absolute top-[46%] -left-[6%] md:left-[0%] w-[550px] md:w-[800px] h-[550px] md:h-[800px] rounded-full pointer-events-none transform-gpu"
                    style={{
                        background:
                            'radial-gradient(circle, rgba(251, 113, 133, 0.13) 0%, rgba(129, 140, 248, 0.08) 45%, transparent 75%)',
                        filter: 'blur(105px)',
                    }}
                />

                {/* Titik 5: Bottom-Center — Pendaran Lembut di Balik Kartu Bawah & Strip Peneliti */}
                <div
                    className="absolute bottom-[2%] left-[15%] md:left-[28%] w-[650px] md:w-[900px] h-[600px] md:h-[850px] rounded-full pointer-events-none transform-gpu"
                    style={{
                        background:
                            'radial-gradient(circle at center, rgba(56, 189, 248, 0.14) 0%, rgba(244, 114, 182, 0.09) 45%, transparent 75%)',
                        filter: 'blur(110px)',
                    }}
                />
            </div>

            {/* Skip Link */}
            <a
                href="#daftar-survei-heading"
                className={`sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2.5 focus:rounded-full focus:bg-[#1976D2] focus:text-white focus:text-sm focus:font-semibold focus:shadow-lg ${FOCUS_RING}`}
            >
                {copy.skipToContent}
            </a>

            {/* Top Hero Wash + Subtle Dot Grid + Floating Glass Pill Navbar + Opsi B Centered Header */}
            <div className="relative z-10 overflow-hidden">
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 opacity-35"
                    style={{
                        backgroundImage:
                            'radial-gradient(circle, rgba(25, 118, 210, 0.08) 1px, transparent 1px)',
                        backgroundSize: '24px 24px',
                    }}
                />

                {/* Floating Glass Pill Navbar (consistent with /homepage/ & enhanced glassmorphism) */}
                <div className="relative z-30 pt-4 px-3 sm:px-6 lg:px-10">
                    <nav
                        aria-label={copy.primaryNavLabel}
                        className="max-w-[1280px] mx-auto bg-white/70 backdrop-blur-2xl backdrop-saturate-150 rounded-[20px] px-4 sm:px-6 py-3 border border-white/85 shadow-[0_10px_35px_rgba(25,118,210,0.09),0_2px_6px_rgba(15,23,42,0.03),inset_0_1px_1px_rgba(255,255,255,0.95)] flex items-center justify-between gap-3"
                    >
                        <a
                            href="/homepage/"
                            className={`flex items-center gap-2.5 shrink-0 rounded-xl group ${FOCUS_RING}`}
                        >
                            <img
                                src={logoMark}
                                alt=""
                                width={32}
                                height={32}
                                className="h-7 sm:h-8 w-auto transition-transform duration-200 group-hover:scale-105 motion-reduce:transition-none motion-reduce:transform-none"
                            />
                            <span className="font-bold text-sm sm:text-lg tracking-tight text-[#1976D2]">
                                Jakpat for Universities
                            </span>
                        </a>

                        {/* Desktop Nav Links */}
                        <ul className="hidden md:flex items-center gap-1 list-none m-0 p-0">
                            <li>
                                <a
                                    href="/homepage/"
                                    className={`px-3.5 py-2 rounded-full text-sm font-medium text-[#555555] hover:text-[#1976D2] hover:bg-[#1976D2]/[0.08] transition-colors motion-reduce:transition-none ${FOCUS_RING}`}
                                >
                                    {copy.navHome}
                                </a>
                            </li>
                            <li>
                                <a
                                    href="/homepage/#layanan"
                                    className={`px-3.5 py-2 rounded-full text-sm font-medium text-[#555555] hover:text-[#1976D2] hover:bg-[#1976D2]/[0.08] transition-colors motion-reduce:transition-none ${FOCUS_RING}`}
                                >
                                    {copy.navServices}
                                </a>
                            </li>
                            <li>
                                <Link
                                    to="/pages"
                                    aria-current="page"
                                    className={`px-4 py-2 rounded-full text-sm font-semibold text-[#1976D2] bg-[#1976D2]/[0.12] shadow-[0_2px_8px_rgba(25,118,210,0.12)] ${FOCUS_RING}`}
                                >
                                    {copy.navSurveys}
                                </Link>
                            </li>
                        </ul>

                        {/* Right Actions */}
                        <div className="flex items-center gap-2 sm:gap-2.5">
                            {/* Desktop Language Toggle */}
                            <div
                                role="group"
                                aria-label={copy.languageGroupLabel}
                                className="hidden lg:inline-flex items-center gap-1 bg-[#1976D2]/[0.08] border border-[#1976D2]/15 rounded-full px-1.5 py-1"
                            >
                                <Globe aria-hidden="true" className="w-3.5 h-3.5 text-[#1976D2] ml-1" />
                                <button
                                    type="button"
                                    onClick={() => setLanguage('id')}
                                    aria-pressed={language === 'id'}
                                    className={`px-2 py-0.5 rounded-full text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING} ${
                                        language === 'id'
                                            ? 'bg-[#1976D2]/15 text-[#1976D2]'
                                            : 'text-[#555555] hover:text-[#1a1a1a]'
                                    }`}
                                >
                                    ID
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setLanguage('en')}
                                    aria-pressed={language === 'en'}
                                    className={`px-2 py-0.5 rounded-full text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING} ${
                                        language === 'en'
                                            ? 'bg-[#1976D2]/15 text-[#1976D2]'
                                            : 'text-[#555555] hover:text-[#1a1a1a]'
                                    }`}
                                >
                                    EN
                                </button>
                            </div>

                            <Link
                                to="/dashboard"
                                className={`hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs sm:text-sm font-semibold text-white bg-gradient-to-br from-[#1976D2] to-[#42A5F5] shadow-[0_6px_18px_rgba(25,118,210,0.28)] hover:shadow-[0_10px_24px_rgba(25,118,210,0.38)] hover:-translate-y-0.5 transition-all motion-reduce:transition-none motion-reduce:transform-none ${FOCUS_RING}`}
                            >
                                <span>{copy.navAdvertise}</span>
                                <ArrowRight aria-hidden="true" className="w-3.5 h-3.5" />
                            </Link>

                            {/* Mobile Menu Trigger */}
                            <button
                                type="button"
                                onClick={() => setMobileMenuOpen((prev) => !prev)}
                                aria-expanded={mobileMenuOpen}
                                aria-controls="pages-mobile-menu"
                                aria-label={mobileMenuOpen ? copy.closeMenu : copy.openMenu}
                                className={`md:hidden inline-flex items-center justify-center w-9 h-9 rounded-xl text-[#1a1a1a] hover:text-[#1976D2] hover:bg-[#1976D2]/10 transition-colors motion-reduce:transition-none ${FOCUS_RING}`}
                            >
                                {mobileMenuOpen ? (
                                    <X aria-hidden="true" className="w-5 h-5" />
                                ) : (
                                    <Menu aria-hidden="true" className="w-5 h-5" />
                                )}
                            </button>
                        </div>
                    </nav>

                    {/* Mobile Collapsible Menu */}
                    {mobileMenuOpen && (
                        <nav
                            id="pages-mobile-menu"
                            aria-label={copy.mobileNavLabel}
                            className="md:hidden max-w-[1280px] mx-auto mt-2 bg-white/95 backdrop-blur-md rounded-2xl p-4 border border-[#1976D2]/15 shadow-[0_12px_32px_rgba(25,118,210,0.12)] space-y-3"
                        >
                            <ul className="space-y-1 list-none m-0 p-0">
                                <li>
                                    <a
                                        href="/homepage/"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className={`block px-3.5 py-2.5 rounded-xl text-sm font-medium text-[#555555] hover:text-[#1976D2] hover:bg-[#1976D2]/[0.08] ${FOCUS_RING}`}
                                    >
                                        {copy.navHome}
                                    </a>
                                </li>
                                <li>
                                    <a
                                        href="/homepage/#layanan"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className={`block px-3.5 py-2.5 rounded-xl text-sm font-medium text-[#555555] hover:text-[#1976D2] hover:bg-[#1976D2]/[0.08] ${FOCUS_RING}`}
                                    >
                                        {copy.navServices}
                                    </a>
                                </li>
                                <li>
                                    <Link
                                        to="/pages"
                                        aria-current="page"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className={`block px-3.5 py-2.5 rounded-xl text-sm font-semibold text-[#1976D2] bg-[#1976D2]/[0.12] ${FOCUS_RING}`}
                                    >
                                        {copy.navSurveys}
                                    </Link>
                                </li>
                            </ul>

                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
                                <div
                                    role="group"
                                    aria-label={copy.languageGroupLabel}
                                    className="inline-flex items-center gap-1 bg-[#1976D2]/[0.08] border border-[#1976D2]/15 rounded-full px-2 py-1"
                                >
                                    <Globe aria-hidden="true" className="w-3.5 h-3.5 text-[#1976D2]" />
                                    <button
                                        type="button"
                                        onClick={() => setLanguage('id')}
                                        aria-pressed={language === 'id'}
                                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${FOCUS_RING} ${
                                            language === 'id'
                                                ? 'bg-[#1976D2]/15 text-[#1976D2]'
                                                : 'text-[#555555]'
                                        }`}
                                    >
                                        ID
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setLanguage('en')}
                                        aria-pressed={language === 'en'}
                                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${FOCUS_RING} ${
                                            language === 'en'
                                                ? 'bg-[#1976D2]/15 text-[#1976D2]'
                                                : 'text-[#555555]'
                                        }`}
                                    >
                                        EN
                                    </button>
                                </div>

                                <Link
                                    to="/dashboard"
                                    onClick={() => setMobileMenuOpen(false)}
                                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold text-white bg-gradient-to-br from-[#1976D2] to-[#42A5F5] shadow-sm ${FOCUS_RING}`}
                                >
                                    <span>{copy.navAdvertise}</span>
                                    <ArrowRight aria-hidden="true" className="w-3.5 h-3.5" />
                                </Link>
                            </div>
                        </nav>
                    )}
                </div>

                {/* Distilled Page Header — Opsi B: Centered Minimal (Title + 1 Short Line) */}
                <header className="relative z-10 max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 pt-8 pb-6 sm:pt-10 sm:pb-7">
                    <div className="text-center max-w-xl mx-auto space-y-2 py-2">
                        <h1
                            id="daftar-survei-heading"
                            tabIndex={-1}
                            className="text-3xl sm:text-4xl font-extrabold text-[#1a1a1a] tracking-[-0.02em] leading-tight outline-none"
                        >
                            {copy.heading}
                        </h1>
                        <p className="text-sm sm:text-base text-[#555555] leading-relaxed">
                            {copy.subtitle}
                        </p>
                    </div>
                </header>
            </div>

            {/* Main Directory Content */}
            <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 pb-14">
                {loading ? (
                    /* Skeleton Loading View */
                    <div role="progressbar" aria-label={copy.loadingLabel} aria-busy="true">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
                            {Array.from({ length: 6 }).map((_, idx) => (
                                <div
                                    key={idx}
                                    className="rounded-[20px] bg-white/60 backdrop-blur-xl backdrop-saturate-150 border border-white/80 shadow-[0_8px_30px_rgba(25,118,210,0.08),inset_0_1px_1px_rgba(255,255,255,0.95)] overflow-hidden animate-pulse motion-reduce:animate-none"
                                >
                                    <div className="aspect-[2.5/1] bg-slate-200/80" />
                                    <div className="p-5 space-y-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="h-3.5 w-24 bg-slate-200 rounded-full" />
                                            <div className="h-3.5 w-20 bg-slate-100 rounded-full" />
                                        </div>
                                        <div className="h-5 w-11/12 bg-slate-200 rounded-lg" />
                                        <div className="h-4 w-4/5 bg-slate-100 rounded-lg" />
                                        <div className="pt-3.5 border-t border-slate-900/[0.06] flex justify-between items-center">
                                            <div className="space-y-1.5">
                                                <div className="h-5 w-28 bg-slate-200 rounded-md" />
                                                <div className="h-3 w-20 bg-slate-100 rounded-md" />
                                            </div>
                                            <div className="h-8 w-20 bg-slate-200 rounded-full" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : loadError ? (
                    /* Dedicated Error + Retry State */
                    <div
                        role="alert"
                        className="py-16 px-6 text-center bg-white/70 backdrop-blur-2xl backdrop-saturate-150 rounded-[20px] border border-red-200/80 shadow-[0_10px_35px_rgba(25,118,210,0.08),inset_0_1px_1px_rgba(255,255,255,0.95)]"
                    >
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-50 text-red-600 mb-4">
                            <AlertCircle aria-hidden="true" className="w-7 h-7" />
                        </div>
                        <h2 className="text-xl font-bold text-[#1a1a1a] mb-1.5">{copy.errorTitle}</h2>
                        <p className="text-sm text-[#555555] max-w-md mx-auto mb-5">
                            {copy.errorDesc}
                        </p>
                        <button
                            type="button"
                            onClick={loadPages}
                            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white bg-gradient-to-br from-[#1976D2] to-[#42A5F5] shadow-md hover:opacity-95 transition-opacity motion-reduce:transition-none ${FOCUS_RING}`}
                        >
                            <RotateCcw aria-hidden="true" className="w-4 h-4" />
                            <span>{copy.retryButton}</span>
                        </button>
                    </div>
                ) : pages.length === 0 ? (
                    /* Global Empty State */
                    <div className="py-16 px-6 text-center bg-white/70 backdrop-blur-2xl backdrop-saturate-150 rounded-[20px] border border-white/85 shadow-[0_10px_35px_rgba(25,118,210,0.08),inset_0_1px_1px_rgba(255,255,255,0.95)]">
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#1976D2]/10 text-[#1976D2] mb-4">
                            <CheckSquare aria-hidden="true" className="w-7 h-7" />
                        </div>
                        <h2 className="text-xl font-bold text-[#1a1a1a] mb-1.5">
                            {copy.emptyAllTitle}
                        </h2>
                        <p className="text-sm text-[#555555] max-w-md mx-auto mb-5">
                            {copy.emptyAllDesc}
                        </p>
                        <button
                            type="button"
                            onClick={loadPages}
                            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-[#1976D2] bg-[#1976D2]/10 hover:bg-[#1976D2] hover:text-white transition-colors motion-reduce:transition-none ${FOCUS_RING}`}
                        >
                            <RotateCcw aria-hidden="true" className="w-4 h-4" />
                            <span>{copy.reloadButton}</span>
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Slim 1-Line Winner Announcement Spotlight Bar */}
                        {latestAnnouncement && filter !== 'announcement' && (
                            latestAnnouncementRedirect ? (
                                <a
                                    href={latestAnnouncementRedirect}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`group mb-5 rounded-2xl bg-white/65 hover:bg-white/80 backdrop-blur-xl backdrop-saturate-150 border border-white/85 hover:border-[#1976D2]/40 shadow-[0_6px_24px_rgba(25,118,210,0.07),inset_0_1px_1px_rgba(255,255,255,0.95)] hover:shadow-[0_12px_32px_rgba(25,118,210,0.12),inset_0_1px_2px_rgba(255,255,255,1)] transition-all motion-reduce:transition-none flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 ${FOCUS_RING}`}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <span className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 inline-flex items-center justify-center shrink-0">
                                            <Trophy aria-hidden="true" className="w-4 h-4" />
                                        </span>
                                        <p className="text-xs sm:text-sm text-[#1a1a1a] truncate">
                                            <strong className="font-bold text-amber-800">
                                                {copy.announcementPrefix}
                                            </strong>{' '}
                                            {latestAnnouncement.title}
                                        </p>
                                    </div>
                                    <span className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-[#1976D2] group-hover:translate-x-0.5 transition-transform motion-reduce:transition-none motion-reduce:transform-none shrink-0">
                                        <span>{copy.announcementAction}</span>
                                        <ExternalLink aria-hidden="true" className="w-3.5 h-3.5" />
                                        <span className="sr-only">{copy.opensNewTab}</span>
                                    </span>
                                </a>
                            ) : (
                                <Link
                                    to={publicPagePath(latestAnnouncement.slug)}
                                    className={`group mb-5 rounded-2xl bg-white/65 hover:bg-white/80 backdrop-blur-xl backdrop-saturate-150 border border-white/85 hover:border-[#1976D2]/40 shadow-[0_6px_24px_rgba(25,118,210,0.07),inset_0_1px_1px_rgba(255,255,255,0.95)] hover:shadow-[0_12px_32px_rgba(25,118,210,0.12),inset_0_1px_2px_rgba(255,255,255,1)] transition-all motion-reduce:transition-none flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 ${FOCUS_RING}`}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <span className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 inline-flex items-center justify-center shrink-0">
                                            <Trophy aria-hidden="true" className="w-4 h-4" />
                                        </span>
                                        <p className="text-xs sm:text-sm text-[#1a1a1a] truncate">
                                            <strong className="font-bold text-amber-800">
                                                {copy.announcementPrefix}
                                            </strong>{' '}
                                            {latestAnnouncement.title}
                                        </p>
                                    </div>
                                    <span className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-[#1976D2] group-hover:translate-x-0.5 transition-transform motion-reduce:transition-none motion-reduce:transform-none shrink-0">
                                        <span>{copy.announcementAction}</span>
                                        <ArrowRight aria-hidden="true" className="w-3.5 h-3.5" />
                                    </span>
                                </Link>
                            )
                        )}

                        {/* Filter Pill Controls + Sort Select inside Semantic <search> Landmark */}
                        <search className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                            <div
                                role="group"
                                aria-label={copy.filterGroupLabel}
                                className="flex flex-wrap items-center gap-2"
                            >
                                {(
                                    [
                                        { id: 'all', label: copy.filterAll, count: counts.all },
                                        {
                                            id: 'survey',
                                            label: copy.filterSurvey,
                                            count: counts.survey,
                                        },
                                        {
                                            id: 'announcement',
                                            label: copy.filterAnnouncement,
                                            count: counts.announcement,
                                        },
                                    ] as const
                                ).map((tab) => {
                                    const active = filter === tab.id;
                                    return (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            onClick={() => setFilter(tab.id)}
                                            aria-pressed={active}
                                            className={`px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all motion-reduce:transition-none ${FOCUS_RING} ${
                                                active
                                                    ? 'bg-gradient-to-r from-[#1976D2] to-[#2196F3] text-white shadow-[0_4px_16px_rgba(25,118,210,0.35)]'
                                                    : 'bg-white/65 hover:bg-white/85 backdrop-blur-xl backdrop-saturate-150 text-[#555555] hover:text-[#1976D2] border border-white/85 hover:border-[#1976D2]/40 shadow-[0_2px_8px_rgba(0,0,0,0.02),inset_0_1px_1px_rgba(255,255,255,0.95)]'
                                            }`}
                                        >
                                            <span>{tab.label}</span>
                                            <span
                                                className={`ml-1.5 tabular-nums ${
                                                    active ? 'opacity-85' : 'text-slate-400'
                                                }`}
                                            >
                                                {tab.count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="flex items-center gap-2 self-start sm:self-auto">
                                <label
                                    htmlFor="survey-sort-select"
                                    className="text-xs font-medium text-slate-500 whitespace-nowrap"
                                >
                                    {copy.sortLabel}
                                </label>
                                <select
                                    id="survey-sort-select"
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                                    className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-white/65 hover:bg-white/85 backdrop-blur-xl backdrop-saturate-150 border border-white/85 hover:border-[#1976D2]/40 text-[#1a1a1a] shadow-[0_2px_8px_rgba(0,0,0,0.02),inset_0_1px_1px_rgba(255,255,255,0.95)] cursor-pointer transition-all motion-reduce:transition-none ${FOCUS_RING}`}
                                >
                                    <option value="curated">{copy.sortCurated}</option>
                                    <option value="reward">{copy.sortReward}</option>
                                    <option value="ending">{copy.sortEnding}</option>
                                </select>
                            </div>
                        </search>

                        {/* Filtered Empty State vs Clean Survey Card Grid */}
                        {visiblePages.length === 0 ? (
                            <div className="py-14 px-6 text-center bg-white/70 backdrop-blur-2xl backdrop-saturate-150 rounded-[20px] border border-white/85 shadow-[0_10px_35px_rgba(25,118,210,0.08),inset_0_1px_1px_rgba(255,255,255,0.95)]">
                                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#1976D2]/10 text-[#1976D2] mb-3.5">
                                    <Megaphone aria-hidden="true" className="w-6 h-6" />
                                </div>
                                <h2 className="text-lg font-bold text-[#1a1a1a] mb-1">
                                    {copy.emptyFilterTitle}
                                </h2>
                                <p className="text-sm text-[#555555] max-w-md mx-auto mb-4">
                                    {copy.emptyFilterDesc}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setFilter('all')}
                                    className={`px-5 py-2 rounded-full text-sm font-semibold text-[#1976D2] bg-[#1976D2]/10 hover:bg-[#1976D2] hover:text-white transition-colors motion-reduce:transition-none ${FOCUS_RING}`}
                                >
                                    {copy.showAllCategories}
                                </button>
                            </div>
                        ) : (
                            <ul
                                role="list"
                                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 list-none m-0 p-0"
                            >
                                {visiblePages.map((page, index) => {
                                    const isSurvey = Boolean(page.submission_id);
                                    const subData = getSubmissionData(page);
                                    const deadline = getDeadlineMeta(page);
                                    const redirectUrl =
                                        typeof page.redirect_url === 'string'
                                            ? page.redirect_url.trim()
                                            : '';
                                    const isExternal = redirectUrl.length > 0;
                                    const hasBanner =
                                        Boolean(page.banner_url) && !failedBanners[page.id];
                                    const isLcpCandidate = index === 0;
                                    const shouldLazyLoad = index >= 3;

                                    const cardClassName = `group flex-1 flex flex-col rounded-[20px] bg-white/65 hover:bg-white/80 backdrop-blur-xl backdrop-saturate-150 border border-white/80 hover:border-white shadow-[0_8px_32px_rgba(25,118,210,0.08),0_2px_8px_rgba(15,23,42,0.04),inset_0_1px_1px_rgba(255,255,255,0.95),inset_0_-1px_1px_rgba(255,255,255,0.3)] hover:shadow-[0_20px_40px_rgba(25,118,210,0.16),0_4px_12px_rgba(15,23,42,0.06),inset_0_1px_2px_rgba(255,255,255,1)] hover:-translate-y-1 transition-all duration-300 motion-reduce:transition-none motion-reduce:transform-none overflow-hidden ${FOCUS_RING}`;

                                    const cardInner = (
                                        <>
                                            {/* Crisp 2.5:1 Poster (no dark muddy scrim) */}
                                            <div className="relative aspect-[2.5/1] w-full overflow-hidden bg-slate-100 ring-1 ring-inset ring-black/5">
                                                {hasBanner ? (
                                                    <img
                                                        src={getCdnUrl(page.banner_url!)}
                                                        alt=""
                                                        width={1000}
                                                        height={400}
                                                        {...(isLcpCandidate
                                                            ? { fetchPriority: 'high' as const }
                                                            : {})}
                                                        {...(shouldLazyLoad
                                                            ? { loading: 'lazy' as const }
                                                            : {})}
                                                        decoding="async"
                                                        onError={() => markBannerFailed(page.id)}
                                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:transform-none"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#1976D2]/10 to-[#42A5F5]/15 text-[#1565C0] px-4 text-center">
                                                        {isSurvey ? (
                                                            <Trophy
                                                                aria-hidden="true"
                                                                className="w-8 h-8 mb-1.5 opacity-80"
                                                            />
                                                        ) : (
                                                            <Megaphone
                                                                aria-hidden="true"
                                                                className="w-8 h-8 mb-1.5 opacity-80"
                                                            />
                                                        )}
                                                        <span className="text-xs font-bold tracking-tight">
                                                            {copy.fallbackBrand}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Card Body */}
                                            <div className="flex-1 p-5 flex flex-col justify-between gap-4">
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between gap-2">
                                                        {isSurvey ? (
                                                            <span className="text-xs font-semibold text-[#1976D2]">
                                                                {copy.typeSurvey}
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs font-semibold text-amber-700">
                                                                {copy.typeAnnouncement}
                                                            </span>
                                                        )}

                                                        {deadline.label &&
                                                            (deadline.urgent ? (
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-900 border border-amber-500/30 backdrop-blur-xs tabular-nums">
                                                                    <span
                                                                        aria-hidden="true"
                                                                        className="w-1.5 h-1.5 rounded-full bg-amber-500"
                                                                    />
                                                                    {deadline.label}
                                                                </span>
                                                            ) : (
                                                                <span className="text-xs font-medium text-slate-500 tabular-nums">
                                                                    {deadline.label}
                                                                </span>
                                                            ))}
                                                    </div>

                                                    <h2 className="text-lg font-bold text-[#1a1a1a] leading-snug group-hover:text-[#1976D2] transition-colors motion-reduce:transition-none line-clamp-2">
                                                        {page.title}
                                                    </h2>

                                                    {subData.criteriaPreview && (
                                                        <p className="text-xs text-[#666666] leading-relaxed line-clamp-1">
                                                            {subData.criteriaPreview}
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Hairline Footer: Per-person reward + Winner quota + Quiet-to-solid CTA */}
                                                <div className="pt-3.5 border-t border-slate-900/[0.06] flex items-center justify-between gap-3">
                                                    {isSurvey ? (
                                                        subData.prizePerWinner > 0 ? (
                                                            <div className="min-w-0">
                                                                <div className="flex items-baseline gap-1 flex-wrap">
                                                                    <span className="text-base font-extrabold text-[#1a1a1a] tabular-nums">
                                                                        Rp{' '}
                                                                        {subData.prizePerWinner.toLocaleString(
                                                                            'id-ID'
                                                                        )}
                                                                    </span>
                                                                    <span className="text-xs font-medium text-slate-500">
                                                                        {copy.perPerson}
                                                                    </span>
                                                                </div>
                                                                {subData.winnerCount > 0 && (
                                                                    <p className="text-xs text-slate-500 tabular-nums">
                                                                        {copy.winnerQuota(
                                                                            subData.winnerCount
                                                                        )}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className="min-w-0">
                                                                <p className="text-sm font-bold text-[#1a1a1a]">
                                                                    {copy.researchSurveyLabel}
                                                                </p>
                                                                <p className="text-xs text-slate-500">
                                                                    {copy.openForRespondents}
                                                                </p>
                                                            </div>
                                                        )
                                                    ) : (
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-bold text-[#1a1a1a]">
                                                                {copy.winnerListTitle}
                                                            </p>
                                                            <p className="text-xs text-slate-500">
                                                                {copy.winnerListSub}
                                                            </p>
                                                        </div>
                                                    )}

                                                    <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold bg-[#1976D2]/10 border border-[#1976D2]/15 text-[#1976D2] group-hover:bg-[#1976D2] group-hover:text-white group-hover:border-transparent transition-all motion-reduce:transition-none shrink-0 shadow-2xs">
                                                        <span>
                                                            {isSurvey ? copy.ctaJoin : copy.ctaOpen}
                                                        </span>
                                                        {isExternal ? (
                                                            <>
                                                                <ExternalLink
                                                                    aria-hidden="true"
                                                                    className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:transform-none"
                                                                />
                                                                <span className="sr-only">
                                                                    {copy.opensNewTab}
                                                                </span>
                                                            </>
                                                        ) : (
                                                            <ArrowRight
                                                                aria-hidden="true"
                                                                className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:transform-none"
                                                            />
                                                        )}
                                                    </span>
                                                </div>
                                            </div>
                                        </>
                                    );

                                    return (
                                        <li key={page.id} className="flex">
                                            {isExternal ? (
                                                <a
                                                    href={redirectUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={cardClassName}
                                                >
                                                    {cardInner}
                                                </a>
                                            ) : (
                                                <Link
                                                    to={publicPagePath(page.slug)}
                                                    className={cardClassName}
                                                >
                                                    {cardInner}
                                                </Link>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </>
                )}

                {/* Slim Researcher Conversion Strip */}
                <div
                    className="mt-12 rounded-[20px] px-6 py-6 sm:px-8 text-white shadow-[0_12px_32px_rgba(25,118,210,0.18),inset_0_1px_1px_rgba(255,255,255,0.4)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-white/20"
                    style={{
                        background:
                            'linear-gradient(135deg, #1976D2 0%, #03A9F4 52%, #64B5F6 100%)',
                    }}
                >
                    <div>
                        <h2 className="text-lg sm:text-xl font-extrabold tracking-tight mb-0.5">
                            {copy.researcherHeading}
                        </h2>
                        <p className="text-xs sm:text-sm text-white/90">{copy.researcherDesc}</p>
                    </div>
                    <Link
                        to="/dashboard"
                        className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs sm:text-sm font-bold bg-white text-[#1976D2] hover:bg-slate-50 shadow-md hover:-translate-y-0.5 transition-all motion-reduce:transition-none motion-reduce:transform-none shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white`}
                    >
                        <span>{copy.researcherCta}</span>
                        <ArrowRight aria-hidden="true" className="w-4 h-4" />
                    </Link>
                </div>
            </main>

            {/* Full-Bleed Gradient Footer (consistent with /homepage/) */}
            <footer className="bg-gradient-to-br from-[#1976D2] to-[#42A5F5] text-white py-8 px-4 sm:px-8">
                <div className="max-w-[1280px] mx-auto text-center space-y-3">
                    <nav
                        aria-label={copy.footerNavLabel}
                        className="flex flex-wrap items-center justify-center gap-6 text-sm font-medium"
                    >
                        <a
                            href="/homepage/"
                            className="text-white/90 hover:text-white hover:underline underline-offset-4 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                        >
                            {copy.navHome}
                        </a>
                        <Link
                            to="/pages"
                            aria-current="page"
                            className="text-white font-semibold underline underline-offset-4 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                        >
                            {copy.navSurveys}
                        </Link>
                        <a
                            href="/homepage/privacy-policy.html"
                            className="text-white/90 hover:text-white hover:underline underline-offset-4 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                        >
                            {copy.footerPrivacy}
                        </a>
                        <a
                            href="/homepage/terms-conditions.html"
                            className="text-white/90 hover:text-white hover:underline underline-offset-4 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                        >
                            {copy.footerTerms}
                        </a>
                    </nav>
                    <p className="text-xs text-white/85">{copy.copyright}</p>
                </div>
            </footer>
        </div>
    );
}
