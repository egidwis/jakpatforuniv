import { useMemo, useState } from 'react';
import {
    AlertTriangle, Copy, Download, ExternalLink, Eye, EyeOff, Image as ImageIconLucide,
    Info, Loader2, PenLine, Search, Trash2,
} from 'lucide-react';
import { DetailSheet } from '@/components/data-list/DetailSheet';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { getCdnUrl } from '@/utils/supabase';
import { downloadCsv } from '@/utils/csv';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
    PAGE_TYPE_LABEL, formatPageDateTime, formatRespondentTimestamp,
    pageAiringToken, pageTypeOf, shortOrderId, usesPlaceholderBanner,
    type PageData,
} from './types';
import { RespondentTable, usePageRespondents } from './RespondentTable';

// ─────────────────────────────────────────────────────────────
// Detail halaman — DRAWER, bukan tukar-layar.
//
// Versi lama menukar SELURUH halaman (`if (activeSubmissionPage) return …`):
// navigasi rute tanpa rute. Daftarnya hilang, posisi gulung hilang, pencarian
// hilang, dan tombol Back peramban tidak melakukan apa pun. Submissions dan
// Customers sudah memakai DetailSheet untuk hal yang persis sama.
//
// Pembagian slotnya sengaja:
//   nav    = aksi ber-lingkup RESPONDEN (cari, CSV, hapus proof)
//   footer = aksi ber-lingkup HALAMAN   (Page Builder, buka, sembunyikan)
// Yang merusak diletakkan paling kanan di barisnya masing-masing.
// ─────────────────────────────────────────────────────────────

/** Tujuh kolom tetap; sisanya satu kolom per Extra Question. */
const CSV_FIXED_HEADERS = [
    'Waktu Submit (WIB)',
    'Jakpat ID',
    'LOI (detik)',
    'E-Wallet Provider',
    'E-Wallet Number',
    'Proof URL',
];

export function PageDetailDrawer({
    page,
    onClose,
    onOpenPageBuilder,
    onToggleHide,
}: {
    page: PageData | null;
    onClose: () => void;
    onOpenPageBuilder: (page: PageData) => void;
    onToggleHide: (page: PageData) => void;
}) {
    const [searchQuery, setSearchQuery] = useState('');
    const [confirmBulk, setConfirmBulk] = useState(false);

    const collectsRespondents = !!page?.submission_id;
    const {
        loading, respondents, deletingId, bulkDeleting, deleteProof, bulkDeleteProofs, proofCount,
    } = usePageRespondents(collectsRespondents ? (page?.id ?? null) : null);

    const filtered = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return respondents;
        return respondents.filter(r => r.jakpat_id.toLowerCase().includes(q));
    }, [respondents, searchQuery]);

    /**
     * Ekspor SELURUH responden halaman ini — bukan `filtered`.
     *
     * Angka di tombol sengaja total, bukan cacah tersaring, supaya itu terbaca
     * sendiri. Berkas berjudul "data halaman ini" yang diam-diam cuma memuat
     * hasil pencarian adalah kegagalan yang tidak terlihat sampai terlambat.
     *
     * Kolom Extra Question adalah bagian yang MENAMBAH, bukan memindahkan:
     * `page_respondents.custom_answers` diisi SurveyPage di-key dengan
     * `custom_fields[].label`, tapi tidak pernah dirender di admin dan tidak ikut
     * dilayani /api/respondents. Sampai sekarang jawabannya berhenti di database.
     */
    const handleDownloadCsv = () => {
        if (!page || respondents.length === 0) return;
        const extraLabels: string[] = (page.custom_fields ?? [])
            .map((f: any) => f?.label)
            .filter((l: any): l is string => typeof l === 'string' && l.trim() !== '');

        const headers = [...CSV_FIXED_HEADERS, ...extraLabels];
        const rows = respondents.map(r => [
            formatRespondentTimestamp(r.submitted_at),
            r.jakpat_id,
            r.loi_seconds ?? '',
            r.ewallet_provider ?? '',
            r.e_wallet_number ?? '',
            r.proof_url ? getCdnUrl(r.proof_url) : '',
            ...extraLabels.map(label => {
                const v = r.custom_answers?.[label];
                if (v === null || v === undefined) return '';
                return Array.isArray(v) ? v.join('; ') : String(v);
            }),
        ]);

        const filename = `responden-${page.slug || page.id}-${new Date().toISOString().slice(0, 10)}.csv`;
        downloadCsv(filename, headers, rows);
    };

    if (!page) return null;

    const type = pageTypeOf(page);
    const token = pageAiringToken(page, Date.now());
    const orderId = shortOrderId(page);
    const placeholderBanner = usesPlaceholderBanner(page);
    const bannerSrc = page.banner_url ? getCdnUrl(page.banner_url) : null;

    const subtitleParts = [
        orderId,
        page.owner_name || null,
        page.form_submissions?.university || null,
    ].filter(Boolean);

    return (
        <DetailSheet
            open={!!page}
            onOpenChange={(open) => { if (!open) { setSearchQuery(''); setConfirmBulk(false); onClose(); } }}
            size="lg"
            title={page.title}
            subtitle={subtitleParts.length > 0 ? subtitleParts.join(' · ') : undefined}
            chips={
                <>
                    <Chip variant={token.variant} size="sm" dot={token.dot} pulse={token.pulse}>
                        {token.label}
                    </Chip>
                    <span
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                            navigator.clipboard.writeText(page.id);
                            toast.success('Page ID berhasil disalin!');
                        }}
                        className="group/id inline-flex items-center gap-1.5 font-mono text-[11px] text-gray-600 bg-white hover:bg-blue-50 hover:text-blue-700 border border-gray-200 hover:border-blue-200 rounded px-1.5 py-0.5 whitespace-nowrap transition-colors cursor-pointer"
                        title={`Klik untuk menyalin Page ID (${page.id})`}
                    >
                        <span>#{page.id.slice(0, 8)}</span>
                        <Copy className="w-3 h-3 text-gray-400 group-hover/id:text-blue-600 shrink-0 transition-colors" />
                    </span>
                    <Chip variant="outline" size="sm">{PAGE_TYPE_LABEL[type]}</Chip>
                    {page.is_hidden && (
                        <Chip variant="red" size="sm" title="Disembunyikan dari API mobile app">
                            Disembunyikan
                        </Chip>
                    )}
                    {placeholderBanner && (
                        <Chip variant="amber" size="sm" title="Masih memakai banner bawaan">
                            Banner default
                        </Chip>
                    )}
                    {page.requires_banner_update && (
                        <Chip variant="amber" size="sm" title="Info hadiah pada banner sudah basi">
                            Banner perlu diupdate
                        </Chip>
                    )}
                </>
            }
            nav={
                collectsRespondents ? (
                    <div className="flex flex-wrap items-center gap-2 py-2.5">
                        <div className="relative flex-1 min-w-[150px]">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                            <Input
                                placeholder="Cari Jakpat ID..."
                                className="pl-8 h-8 text-xs bg-gray-50/50 border-gray-200 focus:bg-white"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        <Button
                            variant="outline" size="sm"
                            className="h-8 text-xs font-semibold border-gray-200 text-gray-700 hover:bg-gray-50"
                            onClick={handleDownloadCsv}
                            disabled={loading || respondents.length === 0}
                            title="Unduh seluruh responden halaman ini (bukan hasil pencarian)"
                        >
                            <Download className="w-3.5 h-3.5 mr-1.5" />
                            CSV ({respondents.length})
                        </Button>

                        {proofCount > 0 && (
                            confirmBulk ? (
                                <div className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2 py-1">
                                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                    <span className="text-[11px] font-medium text-red-700">
                                        Hapus {proofCount} proof?
                                    </span>
                                    <Button
                                        size="sm"
                                        className="h-6 px-2 text-[11px] bg-red-600 hover:bg-red-700 text-white font-semibold"
                                        onClick={async () => { await bulkDeleteProofs(); setConfirmBulk(false); }}
                                        disabled={bulkDeleting}
                                    >
                                        {bulkDeleting && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                                        Ya
                                    </Button>
                                    <Button
                                        variant="ghost" size="sm"
                                        className="h-6 px-1.5 text-[11px] text-gray-600"
                                        onClick={() => setConfirmBulk(false)}
                                        disabled={bulkDeleting}
                                    >
                                        Batal
                                    </Button>
                                </div>
                            ) : (
                                <Button
                                    variant="outline" size="sm"
                                    className="h-8 text-xs font-semibold border-red-200 text-red-600 hover:bg-red-50"
                                    onClick={() => setConfirmBulk(true)}
                                    title="Hapus semua file bukti transfer di halaman ini"
                                >
                                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                                    Hapus Proof ({proofCount})
                                </Button>
                            )
                        )}
                    </div>
                ) : undefined
            }
            footer={
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        size="sm"
                        className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={() => onOpenPageBuilder(page)}
                    >
                        <PenLine className="w-3.5 h-3.5 mr-1.5" />
                        Page Builder
                    </Button>
                    {page.is_published && (
                        <Button
                            variant="outline" size="sm"
                            className="h-8 text-xs border-gray-200 text-gray-700"
                            onClick={() => window.open(`/pages/${page.slug}`, '_blank')}
                        >
                            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                            Buka
                        </Button>
                    )}
                    <Button
                        variant="outline" size="sm"
                        className={cn(
                            'h-8 text-xs ml-auto',
                            page.is_hidden
                                ? 'border-blue-200 text-blue-600 hover:bg-blue-50'
                                : 'border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50'
                        )}
                        onClick={() => onToggleHide(page)}
                        title={page.is_hidden ? 'Tampilkan lagi di mobile app' : 'Sembunyikan dari mobile app'}
                    >
                        {page.is_hidden
                            ? <><Eye className="w-3.5 h-3.5 mr-1.5" />Tampilkan</>
                            : <><EyeOff className="w-3.5 h-3.5 mr-1.5" />Sembunyikan</>}
                    </Button>
                </div>
            }
        >
            {/* ── Meta: banner + identitas halaman ──
                Thumbnail-nya bukan hiasan. Badge "banner default" cuma bilang ada
                masalah; gambarnya membuat masalah itu bisa diputuskan. Sampai
                sekarang tidak ada satu layar admin pun yang menampilkan banner. */}
            <div className="flex items-start gap-3">
                <div className={cn(
                    'w-24 h-[54px] shrink-0 rounded-md border overflow-hidden bg-gray-50 flex items-center justify-center',
                    placeholderBanner ? 'border-amber-300' : 'border-gray-200'
                )}>
                    {bannerSrc ? (
                        <img src={bannerSrc} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <ImageIconLucide className="w-4 h-4 text-gray-300" />
                    )}
                </div>
                <div className="min-w-0 flex-1 text-xs leading-relaxed">
                    <p className="font-mono text-[11px] text-gray-700 truncate">/{page.slug}</p>
                    <p className="text-gray-500">
                        {formatPageDateTime(page.publish_start_date)} → {formatPageDateTime(page.publish_end_date)}
                    </p>
                    <p className="text-gray-500">
                        <span className="font-semibold text-gray-800 tabular-nums">{page.views_count || 0}</span> views
                        {collectsRespondents && (
                            <>
                                {' · '}
                                <span className="font-semibold text-gray-800 tabular-nums">{respondents.length}</span> responden
                            </>
                        )}
                    </p>
                </div>
            </div>

            {page.form_submissions?.criteria_responden && (
                <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] leading-relaxed text-blue-800">
                    <strong className="block font-semibold">Syarat responden survei ini</strong>
                    <span className="opacity-90">{page.form_submissions.criteria_responden}</span>
                </div>
            )}

            {collectsRespondents ? (
                <>
                    <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-gray-600">
                        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gray-400" />
                        <span>
                            Pengundian &amp; pemenang dijalankan di platform pihak ketiga lewat{' '}
                            <code className="font-mono text-[10px]">/api/respondents</code>. Di sini untuk
                            audit data dan bersih-bersih file proof.
                        </span>
                    </div>

                    <RespondentTable
                        respondents={filtered}
                        loading={loading}
                        deletingId={deletingId}
                        onDeleteProof={deleteProof}
                        emptyLabel={
                            searchQuery.trim()
                                ? 'Tidak ada responden yang cocok dengan pencarian.'
                                : 'Belum ada responden.'
                        }
                    />
                </>
            ) : (
                <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-6 text-center text-xs text-gray-400">
                    Halaman standalone — tidak mengumpulkan responden.
                </p>
            )}
        </DetailSheet>
    );
}
