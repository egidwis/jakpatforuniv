import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
// import { Switch } from '@/components/ui/switch'; // Removed unused
import { BlockEditor } from './BlockEditor';
import { supabase, updateFormStatus } from '@/utils/supabase';
import { airingWindowState, toAiringStartIso, toWibYmd } from '@/utils/airing-window';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Eye, Save, Trash2, Plus, Trophy, Users, Calendar, StopCircle, ExternalLink } from 'lucide-react';
import { BannerPicker } from './BannerPicker';
import { bannerSavePatch } from '@/utils/page-banner';
import { publicPagePath } from '@/utils/page-url';

/**
 * Normalize a schedule date string for accurate time comparison & display.
 * Date-only strings (e.g. "2026-04-13") are parsed as midnight UTC by JS,
 * which equals 07:00 WIB — before the intended 15:00 WIB go-live time.
 * This detects date-only values and forces 08:00 UTC (= 15:00 WIB).
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

interface PageBuilderModalProps {
    isOpen: boolean;
    onClose: () => void;
    submissionId?: string; // Optional for standalone pages
    initialData?: any; // If editing existing page
    onSuccess: () => void;
    submissionTitle?: string; // Title from the submission for auto-fill
    submissionStartDate?: string;
    submissionEndDate?: string;
    submissionPrizePerWinner?: number;
    submissionWinnerCount?: number;
    submissionCriteria?: string;
    isExtraAd?: boolean; // Whether this page is an Extra Ad (set via SchedulePaymentView)
    /**
     * ⚠️ TIDAK ADA PEMANGGIL YANG MENGOPER INI SEJAK 2026-08-08.
     *
     * Satu-satunya yang pernah mengopernya adalah Page Calendar (`SchedulingPage`),
     * yang dipensiunkan bersama Phase 3. Selama tidak diisi, `isUnpaid` selalu
     * `false` dan ketiga penjaganya (peringatan kuning, tombol publish mati,
     * auto-publish ditahan) tidak berbuat apa-apa. Jangan membacanya sebagai
     * "publish order belum lunas sudah dijaga" — hari ini tidak.
     *
     * Sengaja tidak ikut dihapus: penjaganya benar dan murah, dan permukaan
     * berikutnya yang membiarkan admin membuat halaman untuk order belum lunas
     * tinggal mengisinya.
     *
     * ⚠️ Kalau menyambungkannya lagi, JANGAN oper `form_submissions.payment_status`
     * mentah-mentah. Sebagian order dibayar di luar sistem dan kolomnya tetap
     * `pending` selamanya — tombol publish mereka akan mati padahal iklannya sudah
     * dibayar dan tayang. Turunkan dari `deriveLifecycle().isPaid`.
     */
    paymentStatus?: string; // e.g. 'pending', 'paid', 'expired'
    // When true, the page is being edited in an extend context (e.g. banner refresh for a new
    // reward batch). Date editing is disabled and dates are NOT synced, so the original period
    // (form_submissions) and the cron-managed publish_* window stay intact. Saving also clears
    // requires_banner_update so the extend can be activated by cron.
    preserveSubmissionDates?: boolean;
}

// Helper: generate slug from title
const generateSlug = (title: string): string => {
    return title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '') // remove special chars
        .replace(/\s+/g, '-')          // spaces to hyphens
        .replace(/-+/g, '-')           // collapse multiple hyphens
        .slice(0, 60);                 // max 60 chars
};

const defaultSurveiAdBlocks = {
    type: 'doc',
    content: [
        {
            type: 'paragraph',
            content: [
                {
                    type: 'text',
                    text: 'Hi Jakpaters! Yuk, isi survei berikut sesuai dengan kondisi kamu saat ini. Hanya responden yang sesuai kriteria, mengisi dengan serius, dan tidak menjawab asal-asalan yang akan masuk ke dalam undian 😉',
                },
            ],
        },
        {
            type: 'paragraph',
            content: [
                {
                    type: 'text',
                    text: 'Jangan lupa untuk mengisi Jakpat ID kamu dengan benar (tanpa teks "https://jakpat.net/s/" di awal dan tanpa spasi di dalam Jakpat ID mu).',
                },
            ],
        },
        {
            type: 'paragraph',
            content: [
                {
                    type: 'text',
                    text: 'Semua pemenang undian survei akan diumumkan setiap akhir bulan, jadi tunggu pengumuman dari kami ya. Semoga beruntung! ✨',
                },
            ],
        },
    ],
};

export function PageBuilderModal({ isOpen, onClose, submissionId, initialData, onSuccess, submissionTitle, submissionStartDate, submissionEndDate, submissionPrizePerWinner, submissionWinnerCount, submissionCriteria, isExtraAd, paymentStatus, preserveSubmissionDates }: PageBuilderModalProps) {
    const isStandalone = !submissionId;
    const isUnpaid = paymentStatus !== undefined && paymentStatus !== 'paid';

    const [savedPageId, setSavedPageId] = useState<string | null>(null);
    // True when the survey has another schedule that owns the airing window.
    // Treated exactly like preserveSubmissionDates, but derived from the data
    // instead of relying on the caller to pass the prop.
    const [hasOtherSchedules, setHasOtherSchedules] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        slug: '',
        title: '',
        banner_url: '',
        is_published: false,

        blocks: {} as any, // Tiptap JSON content
        custom_fields: [] as any[], // Array of { label, placeholder, type, required, options }
        publish_start_date: '',
        publish_end_date: '',
        criteria_responden: '',
        redirect_url: '',
    });

    // Unggah, galeri "recent", dan ketiga tab-nya kini milik <BannerPicker/>.

    useEffect(() => {
        if (isOpen) {
            setSavedPageId(null); // Reset for fresh modal session

            // Async helper: fetch criteria from DB if not provided via props
            const initFormData = async () => {
                let resolvedCriteria = submissionCriteria || '';

                // Self-fetch criteria from form_submissions if submissionId exists
                // but submissionCriteria prop was not passed by parent
                if (!resolvedCriteria && submissionId) {
                    try {
                        const { data: submission } = await supabase
                            .from('form_submissions')
                            .select('criteria_responden')
                            .eq('id', submissionId)
                            .single();
                        if (submission?.criteria_responden) {
                            resolvedCriteria = submission.criteria_responden;
                        }
                    } catch (e) {
                        console.warn('Failed to fetch submission criteria:', e);
                    }
                }

                // Does this survey have another schedule that owns the airing
                // window? If so the page's publish_* dates are managed by
                // cron_activate_extends and must not be rewritten from the
                // first schedule's period — doing that takes a running ad off
                // the air. Resolved here rather than trusted from a prop so
                // that every caller is protected, not just the ones that
                // remember to pass preserveSubmissionDates.
                let hasOther = false;
                if (submissionId) {
                    try {
                        // Filter `source_table` WAJIB: tanpa itu baris ordinal 1
                        // order ini sendiri ikut terhitung sebagai "jadwal lain",
                        // hasOther selalu true, dan tanggal halaman tidak pernah
                        // lagi disinkronkan.
                        const { data: others } = await supabase
                            .from('ad_schedules')
                            .select('id')
                            .eq('source_table', 'form_submissions_extend')
                            .eq('submission_id', submissionId)
                            .in('status', ['waiting_payment', 'paid', 'scheduled', 'live'])
                            .limit(1);
                        hasOther = !!(others && others.length > 0);
                    } catch (e) {
                        // Fail safe: assume there IS another schedule, so the
                        // worst case is leaving dates alone rather than
                        // clobbering a live window.
                        console.warn('Failed to check for other schedules; preserving dates:', e);
                        hasOther = true;
                    }
                }
                setHasOtherSchedules(hasOther);
                const preserveDates = preserveSubmissionDates || hasOther;

                if (initialData) {
                    setFormData({
                        slug: initialData.slug,
                        title: initialData.title,
                        banner_url: initialData.banner_url || '',
                        is_published: initialData.is_published,
                        blocks: initialData.blocks || {},
                        custom_fields: initialData.custom_fields || [],
                        // In extend context, keep the page's own (cron-managed) publish dates —
                        // do NOT pre-fill from the extend's window passed via submission*Date.
                        publish_start_date: preserveDates
                            ? (initialData.publish_start_date || '')
                            : (submissionStartDate ? submissionStartDate : (initialData.publish_start_date ? initialData.publish_start_date : '')),
                        publish_end_date: preserveDates
                            ? (initialData.publish_end_date || '')
                            : (submissionEndDate ? submissionEndDate : (initialData.publish_end_date ? initialData.publish_end_date : '')),
                        criteria_responden: resolvedCriteria || initialData.criteria_responden || '',
                        redirect_url: initialData.redirect_url || '',
                    });
                } else {
                    // Reset for new page, auto-fill from submission title if available
                    const autoTitle = submissionTitle || '';
                    const autoSlug = autoTitle ? generateSlug(autoTitle) : '';

                    setFormData({
                        slug: autoSlug,
                        title: autoTitle,
                        banner_url: '',
                        is_published: false,
                        blocks: !isStandalone ? defaultSurveiAdBlocks : {},
                        custom_fields: [],
                        publish_start_date: submissionStartDate ? submissionStartDate : '',
                        publish_end_date: submissionEndDate ? submissionEndDate : '',
                        criteria_responden: resolvedCriteria,
                        redirect_url: '',
                    });
                }
            };

            initFormData();
        }
    }, [isOpen, initialData, submissionTitle, submissionStartDate, submissionEndDate, submissionCriteria, submissionId, preserveSubmissionDates]);

    const handleSave = async (overrideStatus?: boolean) => {
        if (!formData.slug || !formData.title) {
            toast.error('Slug and Title are required');
            return;
        }

        setLoading(true);
        try {
            // Defense in depth: Kilat orders are distributed via push notification and
            // never use survey_pages (sql/42 blocks it at the trigger level). The Ads
            // Schedule page already filters Kilat out of its "Create Page" list, but
            // other callers of this modal should not be able to slip one through.
            if (submissionId) {
                const { data: sub } = await supabase
                    .from('form_submissions')
                    .select('distribution_type')
                    .eq('id', submissionId)
                    .maybeSingle();
                if (sub?.distribution_type === 'kilat') {
                    throw new Error('Order Kilat didistribusikan lewat push notification dan tidak memakai halaman iklan.');
                }
            }

            let isPublished = overrideStatus !== undefined ? overrideStatus : formData.is_published;

            // Auto-publish: If schedule is set and we're just saving (not explicitly unpublishing), set to Live (unless unpaid)
            if (overrideStatus === undefined && formData.publish_start_date && !isStandalone) {
                if (!isUnpaid) {
                    isPublished = true;
                }
            }

            // Every ad in this product starts and ends at 15:00 WIB (08:00 UTC).
            // So pin BOTH shapes of input to that instant, not just date-only
            // strings: a value that already carries a time used to be passed
            // through untouched, which is how rows ended up stored at 00:00 UTC
            // (07:00 WIB) — eight hours early, and overlapping their own extend.
            const toAiringInstant = (dateStr: string | null): string | null => {
                if (!dateStr) return null;
                // A date-only string is already a WIB calendar day; anything
                // with a time component is reduced to the WIB day it falls on.
                const ymd = dateStr.includes('T') ? toWibYmd(new Date(dateStr)) : dateStr;
                return toAiringStartIso(ymd);
            };

            const payload: any = {
                slug: formData.slug,
                title: formData.title,
                // banner_url + aturan pembersih requires_banner_update, satu tempat.
                ...bannerSavePatch(formData.banner_url),
                is_published: isPublished,

                blocks: formData.blocks,
                custom_fields: formData.custom_fields,
                updated_at: new Date().toISOString(),
                // Preserve is_extra_ad: use prop if provided, else keep existing value
                is_extra_ad: isExtraAd ?? initialData?.is_extra_ad ?? false,
                redirect_url: formData.redirect_url?.trim() || null,
            };

            if (preserveSubmissionDates || hasOtherSchedules) {
                // Another schedule owns the airing window; cron manages publish_*.
            } else {
                payload.publish_start_date = toAiringInstant(formData.publish_start_date) || null;
                payload.publish_end_date = toAiringInstant(formData.publish_end_date) || null;
            }

            // Only attach submission_id if it exists
            if (submissionId) {
                payload.submission_id = submissionId;
            } else {
                payload.submission_id = null;
            }

            const existingId = initialData?.id || savedPageId;

            // Update form_submissions criteria_responden if edited and related to a submission
            if (submissionId && formData.criteria_responden !== submissionCriteria) {
                const { error: criteriaError } = await supabase
                    .from('form_submissions')
                    .update({ criteria_responden: formData.criteria_responden })
                    .eq('id', submissionId);
                if (criteriaError) console.error('Failed to update submission criteria:', criteriaError);
            }

            if (existingId) {
                // Update
                const { error } = await supabase
                    .from('survey_pages')
                    .update(payload)
                    .eq('id', existingId);
                if (error) throw error;
                toast.success('Page updated successfully');
            } else {
                // Create
                const { data, error } = await supabase
                    .from('survey_pages')
                    .insert([payload])
                    .select('id')
                    .single();
                if (error) throw error;
                setSavedPageId(data.id);
                toast.success('Page created successfully');
            }

            // Sync schedule dates to form_submissions & update status.
            // Skipped in extend context (preserveSubmissionDates) so a content/banner edit
            // never overwrites the original period or the cron-managed publish_* window.
            if (!preserveSubmissionDates && !hasOtherSchedules && submissionId && formData.publish_start_date) {
                // Sync the SAME normalised instants written to survey_pages above.
                // Sending the raw form values here is what let form_submissions
                // drift to 00:00 UTC while its page sat at 08:00 UTC.
                const syncedStart = toAiringInstant(formData.publish_start_date);
                const syncedEnd = toAiringInstant(formData.publish_end_date);

                const { error: syncError } = await supabase
                    .from('form_submissions')
                    .update({
                        start_date: syncedStart,
                        end_date: syncedEnd,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', submissionId);
                if (syncError) console.warn('Failed to sync dates to form_submissions:', syncError.message);

                // Update status based on current date vs start_date
                if (isPublished) {
                    // ⚠️ Aturannya DIPINJAM, bukan ditulis ulang. Ini dulu salinan
                    // keempat dari "sudah selesai / sedang tayang / belum mulai",
                    // dan salinan-salinan itulah yang membuat dua layar bisa
                    // menyebut satu order dengan dua nama.
                    const newStatus = airingWindowState(
                        new Date(syncedStart!),
                        syncedEnd ? new Date(syncedEnd) : null,
                    );
                    await updateFormStatus(submissionId, newStatus);
                }
            }

            onSuccess();

            // Publish/Unpublish → close modal & refresh
            if (overrideStatus !== undefined) {
                onClose();
                window.location.reload();
            } else {
                // Save Draft → keep modal open, sync local state
                setFormData(prev => ({ ...prev, is_published: isPublished }));
            }
        } catch (error: any) {
            console.error('Error saving page:', error);
            toast.error(error.message || 'Failed to save page');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        const existingId = initialData?.id || savedPageId;
        if (!existingId) return;

        const confirmed = window.confirm('Are you sure you want to delete this draft page? This action cannot be undone.');
        if (!confirmed) return;

        setLoading(true);
        try {
            const { error } = await supabase
                .from('survey_pages')
                .delete()
                .eq('id', existingId);
            if (error) throw error;
            toast.success('Page deleted successfully');
            onSuccess();
            onClose();
        } catch (error: any) {
            console.error('Error deleting page:', error);
            toast.error(error.message || 'Failed to delete page');
        } finally {
            setLoading(false);
        }
    };

    const handleEndCampaign = async () => {
        const confirmed = window.confirm(
            'Apakah kamu yakin ingin menghentikan campaign ini?\n\nIklan akan langsung berhenti tayang dan status akan diubah menjadi Completed.'
        );
        if (!confirmed) return;

        setLoading(true);
        try {
            const now = new Date().toISOString();
            const existingId = initialData?.id || savedPageId;

            // 1. Update survey_pages: keep published but set end date to now (completed, not drafted)
            if (existingId) {
                const { error: pageError } = await supabase
                    .from('survey_pages')
                    .update({
                        is_published: true,
                        publish_end_date: now,
                        updated_at: now,
                    })
                    .eq('id', existingId);
                if (pageError) throw pageError;
            }

            // 2. Sync end_date to form_submissions and mark as completed
            if (submissionId) {
                await supabase
                    .from('form_submissions')
                    .update({ end_date: now, updated_at: now })
                    .eq('id', submissionId);

                await updateFormStatus(submissionId, 'completed');
            }

            toast.success('Campaign berhasil dihentikan.');
            onSuccess();
            onClose();
            window.location.reload();
        } catch (error: any) {
            console.error('Error ending campaign:', error);
            toast.error(error.message || 'Gagal menghentikan campaign');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent
                className="max-w-full w-screen h-[100dvh] flex flex-col p-0 overflow-hidden rounded-none border-0 !m-0 bg-slate-100/60 data-[state=closed]:!slide-out-to-bottom-full data-[state=open]:!slide-in-from-bottom-full"
                onInteractOutside={(e) => e.preventDefault()}
            >
                {/* Header */}
                <DialogHeader className="px-6 md:px-8 py-3.5 border-b border-slate-200 bg-white flex flex-row items-center justify-between shrink-0">
                    <DialogTitle className="text-sm font-bold text-slate-800 tracking-tight">
                        {initialData ? 'Edit Page' : 'Create New Page'}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-hidden flex flex-row w-full">
                    {/* Main Content (Left Pane Workspace Canvas) */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-10 flex justify-center bg-slate-100/60">
                        <div className="w-full max-w-3xl flex flex-col gap-6 bg-white p-6 sm:p-8 md:p-10 rounded-2xl border border-slate-200/80 shadow-xs h-fit">
                            {isUnpaid && (
                                <div className="bg-amber-50/90 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-xs flex items-start leading-relaxed">
                                    <div className="font-medium">
                                        ⚠️ Iklan ini belum lunas (Waiting Payment). Anda dapat menyimpan draf halaman, tetapi tidak dapat mem-publish-nya sampai pembayaran diselesaikan.
                                    </div>
                                </div>
                            )}

                            <div>
                                <Input
                                    value={formData.title}
                                    onChange={(e) => {
                                        const newTitle = e.target.value;
                                        setFormData({ ...formData, title: newTitle, slug: generateSlug(newTitle) });
                                    }}
                                    placeholder="Judul Halaman / Page Title..."
                                    className="text-base sm:text-lg font-bold text-slate-800 bg-white border border-slate-200 focus:border-blue-500 shadow-2xs px-3.5 py-2.5 h-11 rounded-xl transition-all placeholder:text-slate-300 placeholder:font-normal"
                                />
                            </div>

                            <div className="shrink-0">
                                <BlockEditor
                                    content={formData.blocks}
                                    onChange={(newContent) => setFormData({ ...formData, blocks: newContent })}
                                />
                            </div>

                            {/* Extra Questions */}
                            <div className="space-y-3 border-t border-slate-100 pt-5 mt-2">
                                <div className="flex items-center justify-between pb-1">
                                    <div>
                                        <Label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                                            Extra Questions ({formData.custom_fields.length})
                                        </Label>
                                        <p className="text-[11px] text-slate-400">Pertanyaan tambahan untuk responden sebelum mengisi kuesioner utama</p>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2.5 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg"
                                        onClick={() => setFormData({ ...formData, custom_fields: [...formData.custom_fields, { label: '', placeholder: '', type: 'text', required: false, options: '' }] })}
                                    >
                                        <Plus className="w-3.5 h-3.5 mr-1" /> Tambah Pertanyaan
                                    </Button>
                                </div>

                                {formData.custom_fields.length === 0 && (
                                    <div className="text-center py-6 text-xs text-slate-400 italic bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                                        Belum ada pertanyaan tambahan.
                                    </div>
                                )}

                                <div className="space-y-3">
                                    {formData.custom_fields.map((field, index) => (
                                        <div key={index} className="bg-slate-50/60 border border-slate-200/90 rounded-xl p-3.5 relative group shadow-2xs transition-all hover:border-slate-300">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 absolute right-2 top-2 text-slate-400 opacity-0 group-hover:opacity-100 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                onClick={() => {
                                                    const newFields = formData.custom_fields.filter((_, i) => i !== index);
                                                    setFormData({ ...formData, custom_fields: newFields });
                                                }}
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>

                                            <div className="space-y-2.5">
                                                <div className="pr-6">
                                                    <Input
                                                        value={field.label}
                                                        onChange={(e) => {
                                                            const newFields = [...formData.custom_fields];
                                                            newFields[index].label = e.target.value;
                                                            setFormData({ ...formData, custom_fields: newFields });
                                                        }}
                                                        placeholder="Tulis pertanyaan..."
                                                        className="h-8 text-xs font-semibold px-2.5 bg-white border-slate-200 hover:border-slate-300 focus:border-blue-500 rounded-lg shadow-2xs"
                                                    />
                                                </div>

                                                <div className="grid grid-cols-2 gap-2.5">
                                                    <Select
                                                        value={field.type}
                                                        onValueChange={(val) => {
                                                            const newFields = [...formData.custom_fields];
                                                            newFields[index].type = val;
                                                            setFormData({ ...formData, custom_fields: newFields });
                                                        }}
                                                    >
                                                        <SelectTrigger className="h-7 text-xs px-2.5 shadow-2xs border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition-colors rounded-lg">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="text" className="text-xs">Short Answer</SelectItem>
                                                            <SelectItem value="number" className="text-xs">Number</SelectItem>
                                                            <SelectItem value="textarea" className="text-xs">Long Answer</SelectItem>
                                                            <SelectItem value="select" className="text-xs">Dropdown</SelectItem>
                                                        </SelectContent>
                                                    </Select>

                                                    <div className="flex items-center space-x-2 pl-1">
                                                        <Checkbox
                                                            id={`required-${index}`}
                                                            className="w-3.5 h-3.5 rounded-[3px] border-slate-300 data-[state=checked]:bg-blue-600"
                                                            checked={field.required}
                                                            onCheckedChange={(checked) => {
                                                                const newFields = [...formData.custom_fields];
                                                                newFields[index].required = checked as boolean;
                                                                setFormData({ ...formData, custom_fields: newFields });
                                                            }}
                                                        />
                                                        <Label htmlFor={`required-${index}`} className="text-xs font-medium cursor-pointer text-slate-600">Wajib Diisi (Required)</Label>
                                                    </div>
                                                </div>

                                                {field.type === 'select' && (
                                                    <div className="space-y-1.5 pt-1">
                                                        <Input
                                                            value={field.options}
                                                            onChange={(e) => {
                                                                const newFields = [...formData.custom_fields];
                                                                newFields[index].options = e.target.value;
                                                                setFormData({ ...formData, custom_fields: newFields });
                                                            }}
                                                            placeholder="Pilihan 1, Pilihan 2, Pilihan 3 (pisahkan dengan koma)"
                                                            className="h-7 text-xs px-2.5 border-slate-200 shadow-2xs bg-white focus:bg-white rounded-lg"
                                                        />

                                                        {field.is_screening && (
                                                            <div className="bg-blue-50/70 border border-blue-100 rounded-lg p-2.5 mt-1 shadow-2xs">
                                                                <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wide mb-1.5 block">Jawaban Valid (Screening)</span>
                                                                <div className="flex flex-wrap gap-1.5">
                                                                    {(field.options || '').split(',').map((opt: string, i: number) => {
                                                                        const optVal = opt.trim();
                                                                        if (!optVal) return null;
                                                                        return (
                                                                            <div key={i} className="flex items-center space-x-1.5 bg-white px-2 py-0.5 rounded-md border border-blue-200 shadow-2xs transition-colors hover:border-blue-300">
                                                                                <Checkbox
                                                                                    id={`valid-${index}-${i}`}
                                                                                    className="w-3 h-3 rounded-[2px] bg-white border-blue-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                                                                    checked={(field.valid_options || []).includes(optVal)}
                                                                                    onCheckedChange={(checked) => {
                                                                                        const newFields = [...formData.custom_fields];
                                                                                        const currentValid = field.valid_options || [];
                                                                                        if (checked) {
                                                                                            newFields[index].valid_options = [...currentValid, optVal];
                                                                                        } else {
                                                                                            newFields[index].valid_options = currentValid.filter((v: string) => v !== optVal);
                                                                                        }
                                                                                        setFormData({ ...formData, custom_fields: newFields });
                                                                                    }}
                                                                                />
                                                                                <Label htmlFor={`valid-${index}-${i}`} className="text-xs cursor-pointer text-blue-900 font-medium leading-none">{optVal}</Label>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                <div className="flex items-center space-x-2 pt-1.5 mt-1 border-t border-slate-200/60 pl-0.5">
                                                    <Checkbox
                                                        id={`screening-${index}`}
                                                        className="w-3.5 h-3.5 rounded-[3px] border-slate-300 data-[state=checked]:bg-blue-600"
                                                        checked={field.is_screening || false}
                                                        onCheckedChange={(checked) => {
                                                            const newFields = [...formData.custom_fields];
                                                            newFields[index].is_screening = checked as boolean;
                                                            setFormData({ ...formData, custom_fields: newFields });
                                                        }}
                                                    />
                                                    <Label htmlFor={`screening-${index}`} className="text-xs font-medium cursor-pointer text-slate-500 hover:text-slate-700">
                                                        Jadikan pertanyaan screening kriteria
                                                    </Label>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Sidebar Settings (Right Pane) */}
                    <div className="w-[360px] lg:w-[380px] overflow-y-auto bg-white p-6 flex flex-col gap-6 flex-shrink-0 border-l border-slate-200 shadow-2xs">
                        {/* URL Config */}
                        <div className="space-y-2">
                            <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Page URL</Label>
                            <div className="flex rounded-lg shadow-2xs overflow-hidden border border-slate-200">
                                <span className="inline-flex items-center px-3 border-r border-slate-200 bg-slate-50 text-slate-500 text-xs font-mono">
                                    /pages/
                                </span>
                                <Input
                                    value={formData.slug}
                                    disabled
                                    className="flex-1 min-w-0 block w-full px-2.5 py-1.5 rounded-none bg-white text-slate-600 border-0 focus:ring-0 cursor-not-allowed text-xs h-8 font-mono"
                                    placeholder="auto-generated-slug"
                                />
                            </div>
                        </div>

                        {/* Redirect URL (only for standalone/announcement pages) */}
                        {isStandalone && (
                            <div className="space-y-2">
                                <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    Redirect URL
                                </Label>
                                <Input
                                    value={formData.redirect_url}
                                    onChange={(e) => setFormData({ ...formData, redirect_url: e.target.value })}
                                    placeholder="https://instagram.com/p/... (opsional)"
                                    className="h-8 text-xs bg-white border-slate-200 focus:border-blue-500 shadow-2xs rounded-lg"
                                />
                                {formData.redirect_url && (
                                    <p className="text-[11px] text-amber-600 font-medium leading-relaxed">
                                        ⚡ Klik "Lihat Selengkapnya" akan langsung redirect ke URL ini
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Banner Image */}
                        <div className="space-y-2">
                            <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Featured Banner</Label>
                            <BannerPicker
                                value={formData.banner_url}
                                onChange={(url) => setFormData(prev => ({ ...prev, banner_url: url }))}
                                active={isOpen}
                            />
                        </div>

                        {/* Campaign Summary Card (read-only from submission props) */}
                        {!isStandalone && submissionPrizePerWinner && submissionWinnerCount && (
                            <div className="space-y-2">
                                <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Campaign Rewards</Label>
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col space-y-2.5 shadow-2xs">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <Trophy className="w-3.5 h-3.5 text-blue-600" />
                                            <span className="text-xs font-medium text-slate-600">Total Hadiah</span>
                                        </div>
                                        <span className="text-xs font-bold text-slate-900">
                                            Rp {(submissionPrizePerWinner * submissionWinnerCount).toLocaleString('id-ID')}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <Users className="w-3.5 h-3.5 text-blue-600" />
                                            <span className="text-xs font-medium text-slate-600">Pemenang</span>
                                        </div>
                                        <span className="text-xs font-bold text-slate-900">
                                            {submissionWinnerCount} Orang
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Criteria Responden */}
                        {!isStandalone && (
                            <div className="space-y-2">
                                <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Kriteria Responden</Label>
                                <Textarea
                                    value={formData.criteria_responden || ''}
                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, criteria_responden: e.target.value })}
                                    placeholder="Masukkan kriteria responden untuk ditampilkan ke publik..."
                                    className="h-28 text-xs resize-none bg-white border-slate-200 focus:border-blue-500 shadow-2xs rounded-xl transition-all"
                                />
                            </div>
                        )}

                    </div>
                </div>

                <div className="px-6 md:px-8 py-3.5 border-t border-slate-200 bg-white flex items-center justify-between gap-4 mt-auto shrink-0 shadow-2xs">
                    {/* Left Side: Status + Schedule Capsule */}
                    <div className="flex items-center gap-2 flex-shrink min-w-0 mr-auto">
                        {/* Status Badge */}
                        {(() => {
                            const startDate = formData.publish_start_date ? normalizeScheduleDate(formData.publish_start_date) : null;
                            const isLive = formData.is_published && (isStandalone || !startDate || startDate <= new Date());
                            const isDraft = !formData.is_published;
                            if (isDraft) return (
                                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 bg-gray-200 text-gray-600 rounded-full flex-shrink-0">
                                    Draft
                                </span>
                            );
                            if (isLive) return (
                                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 bg-green-100 text-green-700 rounded-full flex-shrink-0">
                                    Live
                                </span>
                            );
                            return null; // Scheduled but not yet live → no badge
                        })()}

                        {/* Schedule Capsule - hidden for standalone */}
                        {!isStandalone && (
                            <div className="flex items-center p-1 bg-white border rounded-md shadow-sm overflow-hidden flex-shrink min-w-0 w-auto ml-2">
                                <div className="px-2 py-1 bg-gray-50 rounded border border-gray-100 mr-2 flex-shrink-0 hidden sm:block">
                                    <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">{formData.is_published ? 'Scheduled At' : 'Slot Reserved At'}</span>
                                </div>
                                <div className="flex items-center gap-2 px-1 text-[11px] font-medium text-gray-600 truncate min-w-0">
                                    <span className="truncate">
                                        {formData.publish_start_date
                                            ? normalizeScheduleDate(formData.publish_start_date).toLocaleString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                                            : 'Not Set'}
                                    </span>
                                    <span className="text-gray-300 mx-1 flex-shrink-0">to</span>
                                    <span className="truncate">
                                        {formData.publish_end_date
                                            ? normalizeScheduleDate(formData.publish_end_date).toLocaleString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                                            : 'Not Set'}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right Side: Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {(initialData?.slug || savedPageId) && (
                            <Button title="Preview Page" variant="outline" size="icon" onClick={() => window.open(publicPagePath(formData.slug), '_blank')} className="h-9 w-9 bg-white border-gray-200 text-gray-700 hover:bg-gray-50 shrink-0">
                                <Eye className="w-4 h-4" />
                            </Button>
                        )}

                        {formData.is_published ? (
                            <>
                                {/* Published/Scheduled page: End Campaign (live) or Change to Draft (not yet live) */}
                                {(() => {
                                    const startDate = formData.publish_start_date ? normalizeScheduleDate(formData.publish_start_date) : null;
                                    const isLive = formData.is_published && !isStandalone && startDate && startDate <= new Date();
                                    
                                    if (isLive) {
                                        return (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={handleEndCampaign}
                                                disabled={loading}
                                                className="h-9 text-sm border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 shrink-0 flex items-center gap-1.5"
                                            >
                                                <StopCircle className="w-4 h-4" />
                                                End Campaign
                                            </Button>
                                        );
                                    }
                                    return (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleSave(false)}
                                            disabled={loading}
                                            className="h-9 text-sm border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800 shrink-0"
                                        >
                                            {isStandalone ? 'Unpublish' : 'Change to Draft'}
                                        </Button>
                                    );
                                })()}

                                <div className="w-px h-6 bg-gray-200 mx-1 hidden sm:block"></div>

                                <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => handleSave(true)}
                                    disabled={loading}
                                    className="h-9 text-sm text-white shadow-sm font-medium px-6 shrink-0 bg-blue-600 hover:bg-blue-700"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                                    Update Page
                                </Button>
                            </>
                        ) : (
                            <>
                                {/* Draft page: Delete (destructive) + Save Draft (secondary) + Publish/Schedule (primary) */}
                                {(initialData?.id || savedPageId) && (
                                    <>
                                        <Button
                                            title="Delete Draft"
                                            onClick={handleDelete}
                                            disabled={loading}
                                            variant="outline"
                                            size="icon"
                                            className="h-9 w-9 border-red-200 text-red-500 hover:bg-red-50 hover:text-red-700 shrink-0"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                        <div className="w-px h-6 bg-gray-200 mx-1 hidden sm:block"></div>
                                    </>
                                )}

                                <Button
                                    title="Save as Draft"
                                    onClick={() => handleSave(false)}
                                    disabled={loading}
                                    variant="outline"
                                    size="sm"
                                    className="h-9 text-sm text-gray-700 hover:bg-gray-50 border-gray-200 shrink-0 flex items-center gap-1.5"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    <span className="hidden sm:inline">Save Draft</span>
                                </Button>

                                <div className="w-px h-6 bg-gray-200 mx-1 hidden sm:block"></div>

                                <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => handleSave(true)}
                                    disabled={loading || isUnpaid}
                                    className={`h-9 text-sm text-white shadow-sm font-medium px-6 shrink-0 ${!isStandalone && formData.publish_start_date && normalizeScheduleDate(formData.publish_start_date) > new Date()
                                        ? 'bg-blue-600 hover:bg-blue-700'
                                        : 'bg-green-600 hover:bg-green-700'
                                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : (
                                        <>
                                            {!isStandalone && formData.publish_start_date && normalizeScheduleDate(formData.publish_start_date) > new Date() ? (
                                                <><Calendar className="w-4 h-4 mr-1.5" /> Schedule</>
                                            ) : (
                                                'Publish Now'
                                            )}
                                        </>
                                    )}
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
