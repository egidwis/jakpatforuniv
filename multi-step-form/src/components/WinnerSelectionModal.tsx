import { useState, useEffect, useMemo } from 'react';
import { supabase, getCdnUrl } from '@/utils/supabase';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Loader2,
    Trophy,
    Shuffle,
    Check,
    ExternalLink,
    ChevronDown,
    ChevronUp,
    AlertCircle,
    MapPin,
    Clock,
    ImageIcon,
    User,
} from 'lucide-react';
import { toast } from 'sonner';

interface MergedRespondent {
    respondent_id: string;
    jakpat_id: string;
    proof_url: string | null;
    ewallet_provider: string | null;
    e_wallet_number: string | null;
    custom_answers: any;
    submitted_at: string;
    // Masterdata
    ktp_name: string | null;
    display_name: string | null;
    email: string | null;
    city: string | null;
    province: string | null;
    phone_number_gift: string | null;
    last_redeem_at: string | null;
    // Computed
    is_eligible: boolean;
    ineligible_reasons: string[];
}

interface ExistingWinner {
    id: string;
    jakpat_id: string;
    respondent_name: string | null;
    reward_amount: number | null;
    reward_status: string;
    ewallet_provider: string | null;
    e_wallet_number: string | null;
    selected_at: string;
    notes: string | null;
}

interface WinnerSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    pageId: string;
    pageTitle: string;
    rewardAmount: number;
    rewardCount: number;
}

export function WinnerSelectionModal({
    isOpen,
    onClose,
    pageId,
    pageTitle,
    rewardAmount,
    rewardCount,
}: WinnerSelectionModalProps) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [respondents, setRespondents] = useState<MergedRespondent[]>([]);
    const [existingWinners, setExistingWinners] = useState<ExistingWinner[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showNotEligible, setShowNotEligible] = useState(false);
    const [criteria, setCriteria] = useState<string>('');

    // Fetch all data
    useEffect(() => {
        if (isOpen && pageId) {
            fetchData();
        }
    }, [isOpen, pageId]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch respondents
            const { data: prData, error: prError } = await supabase
                .from('page_respondents')
                .select('*')
                .eq('page_id', pageId)
                .order('created_at', { ascending: true });

            if (prError) throw prError;

            // 2. Fetch masterdata for all jakpat_ids
            const jakpatIds = (prData || []).map((r: any) => r.jakpat_id);
            let masterdataMap: Record<string, any> = {};

            if (jakpatIds.length > 0) {
                const { data: mdData } = await supabase
                    .from('respondents-masterdata')
                    .select('*')
                    .in('jakpat_id', jakpatIds);

                if (mdData) {
                    mdData.forEach((m: any) => {
                        masterdataMap[m.jakpat_id] = m;
                    });
                }
            }

            // 3. Fetch recent winners (last 6 months) across ALL surveys
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

            const { data: recentWinners } = await supabase
                .from('survey_winners')
                .select('jakpat_id, selected_at, page_id')
                .gte('selected_at', sixMonthsAgo.toISOString());

            const recentWinnerIds = new Set(
                (recentWinners || [])
                    .filter((w: any) => w.page_id !== pageId) // Exclude current survey
                    .map((w: any) => w.jakpat_id)
            );

            // 4. Fetch existing winners for THIS survey
            const { data: existingData } = await supabase
                .from('survey_winners')
                .select('*')
                .eq('page_id', pageId)
                .order('selected_at', { ascending: true });

            setExistingWinners(existingData || []);

            // 5. Fetch criteria from form_submissions
            const { data: pageData } = await supabase
                .from('survey_pages')
                .select('submission_id, form_submissions(criteria_responden)')
                .eq('id', pageId)
                .single();

            if (pageData?.form_submissions) {
                setCriteria((pageData.form_submissions as any).criteria_responden || '');
            }

            // 6. Merge and categorize
            const merged: MergedRespondent[] = (prData || []).map((pr: any) => {
                const md = masterdataMap[pr.jakpat_id] || {};
                const reasons: string[] = [];

                // Check eligibility
                const hasProof = !!pr.proof_url;
                if (!hasProof) reasons.push('Tidak upload bukti (proof)');

                const isRecentWinner = recentWinnerIds.has(pr.jakpat_id);
                if (isRecentWinner) reasons.push('Sudah menang dalam 6 bulan terakhir');

                // Check last_redeem_at from masterdata
                if (md.last_redeem_at) {
                    try {
                        const redeemDate = new Date(md.last_redeem_at);
                        if (!isNaN(redeemDate.getTime()) && redeemDate > sixMonthsAgo) {
                            if (!isRecentWinner) { // avoid duplicate reason
                                reasons.push(`Terakhir redeem: ${md.last_redeem_at}`);
                            }
                        }
                    } catch {
                        // ignore parse error
                    }
                }

                return {
                    respondent_id: pr.id,
                    jakpat_id: pr.jakpat_id,
                    proof_url: pr.proof_url,
                    ewallet_provider: pr.ewallet_provider,
                    e_wallet_number: pr.e_wallet_number,
                    custom_answers: pr.custom_answers,
                    submitted_at: pr.created_at,
                    ktp_name: md.ktp_name || null,
                    display_name: md.display_name || null,
                    email: md.email || null,
                    city: md.city || null,
                    province: md.province || null,
                    phone_number_gift: md.phone_number_gift || null,
                    last_redeem_at: md.last_redeem_at || null,
                    is_eligible: reasons.length === 0,
                    ineligible_reasons: reasons,
                };
            });

            setRespondents(merged);
        } catch (error: any) {
            console.error('Error fetching data:', error);
            toast.error('Gagal memuat data responden');
        } finally {
            setLoading(false);
        }
    };

    // Split eligible / not eligible
    const eligible = useMemo(() => respondents.filter(r => r.is_eligible), [respondents]);
    const notEligible = useMemo(() => respondents.filter(r => !r.is_eligible), [respondents]);

    // Already selected as winners for this survey?
    const hasExistingWinners = existingWinners.length > 0;

    // Toggle checkbox
    const toggleSelect = (jakpatId: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(jakpatId)) {
                next.delete(jakpatId);
            } else {
                next.add(jakpatId);
            }
            return next;
        });
    };

    // Random pick
    const handleRandomPick = () => {
        const count = Math.min(rewardCount, eligible.length);
        const shuffled = [...eligible].sort(() => Math.random() - 0.5);
        const picked = shuffled.slice(0, count);
        setSelectedIds(new Set(picked.map(p => p.jakpat_id)));
        toast.success(`${count} responden dipilih secara random`);
    };

    // Confirm winners
    const handleConfirmWinners = async () => {
        if (selectedIds.size === 0) {
            toast.error('Pilih minimal 1 pemenang');
            return;
        }

        setSaving(true);
        try {
            const winners = respondents
                .filter(r => selectedIds.has(r.jakpat_id))
                .map(r => ({
                    page_id: pageId,
                    jakpat_id: r.jakpat_id,
                    respondent_name: r.ktp_name || r.display_name || r.jakpat_id,
                    reward_amount: rewardAmount,
                    reward_status: 'selected',
                    ewallet_provider: r.ewallet_provider,
                    e_wallet_number: r.e_wallet_number,
                    selected_by: 'product@jakpat.net',
                }));

            const { error } = await supabase
                .from('survey_winners')
                .insert(winners);

            if (error) throw error;

            toast.success(`${winners.length} pemenang berhasil disimpan! 🎉`);
            setSelectedIds(new Set());
            fetchData(); // Refresh to show winner list view
        } catch (error: any) {
            console.error('Error saving winners:', error);
            if (error.code === '23505') {
                toast.error('Beberapa responden sudah terpilih sebagai pemenang');
            } else {
                toast.error('Gagal menyimpan pemenang');
            }
        } finally {
            setSaving(false);
        }
    };

    // Update winner status
    const updateWinnerStatus = async (winnerId: string, newStatus: string) => {
        try {
            const { error } = await supabase
                .from('survey_winners')
                .update({ reward_status: newStatus })
                .eq('id', winnerId);

            if (error) throw error;

            setExistingWinners(prev =>
                prev.map(w => w.id === winnerId ? { ...w, reward_status: newStatus } : w)
            );
            toast.success(`Status diperbarui ke "${newStatus}"`);
        } catch {
            toast.error('Gagal update status');
        }
    };

    // Reset winners (delete all for this survey)
    const [confirmReset, setConfirmReset] = useState(false);
    const handleResetWinners = async () => {
        try {
            const { error } = await supabase
                .from('survey_winners')
                .delete()
                .eq('page_id', pageId);

            if (error) throw error;

            toast.success('Pemenang direset, bisa pilih ulang');
            setConfirmReset(false);
            fetchData();
        } catch {
            toast.error('Gagal reset pemenang');
        }
    };

    const statusColors: Record<string, string> = {
        selected: 'bg-blue-50 text-blue-700 border-blue-200',
        contacted: 'bg-yellow-50 text-yellow-700 border-yellow-200',
        sent: 'bg-purple-50 text-purple-700 border-purple-200',
        confirmed: 'bg-green-50 text-green-700 border-green-200',
    };

    const statusOptions = ['selected', 'contacted', 'sent', 'confirmed'];

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <div className="flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-yellow-500" />
                        <DialogTitle>Pilih Pemenang</DialogTitle>
                    </div>
                    <DialogDescription>
                        <span className="font-medium text-foreground">{pageTitle}</span>
                        <span className="mx-2">•</span>
                        Reward: Rp {(rewardAmount || 0).toLocaleString('id-ID')} × {rewardCount} pemenang
                    </DialogDescription>
                </DialogHeader>

                {/* Criteria Info */}
                {criteria && (
                    <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 text-xs text-blue-800">
                        <span className="font-semibold">Criteria Responden:</span> {criteria}
                    </div>
                )}

                {loading ? (
                    <div className="flex h-60 items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                    </div>
                ) : hasExistingWinners ? (
                    /* ===== WINNER LIST VIEW (already selected) ===== */
                    <div className="flex-1 overflow-auto space-y-4">
                        {/* Summary */}
                        <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                            <div className="flex items-center gap-2 text-green-800 text-sm">
                                <Check className="w-4 h-4" />
                                <span><strong>{existingWinners.length}</strong> pemenang sudah dipilih</span>
                            </div>
                            {!confirmReset ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs border-green-300 text-green-800 hover:bg-green-100 bg-white"
                                    onClick={() => setConfirmReset(true)}
                                >
                                    Reset & Pilih Ulang
                                </Button>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-red-600">Yakin reset?</span>
                                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setConfirmReset(false)}>Batal</Button>
                                    <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={handleResetWinners}>Ya, Reset</Button>
                                </div>
                            )}
                        </div>

                        {/* Winner Table */}
                        <div className="border rounded-lg overflow-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="text-xs">Jakpat ID</TableHead>
                                        <TableHead className="text-xs">Nama</TableHead>
                                        <TableHead className="text-xs">E-Wallet</TableHead>
                                        <TableHead className="text-xs">Reward</TableHead>
                                        <TableHead className="text-xs">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {existingWinners.map(w => (
                                        <TableRow key={w.id}>
                                            <TableCell>
                                                <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{w.jakpat_id}</span>
                                            </TableCell>
                                            <TableCell className="text-sm">{w.respondent_name || '—'}</TableCell>
                                            <TableCell className="text-xs">
                                                {w.e_wallet_number ? (
                                                    <div className="flex items-center gap-1">
                                                        <span className="font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] capitalize">{w.ewallet_provider}</span>
                                                        <span className="font-mono">{w.e_wallet_number}</span>
                                                    </div>
                                                ) : '—'}
                                            </TableCell>
                                            <TableCell className="text-sm font-medium">
                                                Rp {(w.reward_amount || 0).toLocaleString('id-ID')}
                                            </TableCell>
                                            <TableCell>
                                                <select
                                                    value={w.reward_status}
                                                    onChange={(e) => updateWinnerStatus(w.id, e.target.value)}
                                                    className={`text-xs font-medium px-2 py-1 rounded-full border cursor-pointer ${statusColors[w.reward_status] || 'bg-gray-50 text-gray-700 border-gray-200'}`}
                                                >
                                                    {statusOptions.map(s => (
                                                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                                                    ))}
                                                </select>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                ) : (
                    /* ===== SELECTION VIEW ===== */
                    <div className="flex-1 overflow-auto space-y-4">
                        {/* Summary Bar */}
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-gray-50 rounded-lg p-3 text-center border">
                                <div className="text-2xl font-bold text-gray-900">{respondents.length}</div>
                                <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Total Responden</div>
                            </div>
                            <div className="bg-green-50 rounded-lg p-3 text-center border border-green-100">
                                <div className="text-2xl font-bold text-green-700">{eligible.length}</div>
                                <div className="text-[10px] text-green-600 uppercase tracking-wider font-semibold">Eligible</div>
                            </div>
                            <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-100">
                                <div className="text-2xl font-bold text-blue-700">{selectedIds.size} / {rewardCount}</div>
                                <div className="text-[10px] text-blue-600 uppercase tracking-wider font-semibold">Dipilih</div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                            <Button
                                onClick={handleRandomPick}
                                variant="outline"
                                size="sm"
                                className="text-xs"
                                disabled={eligible.length === 0}
                            >
                                <Shuffle className="w-3.5 h-3.5 mr-1.5" />
                                Random Pick {Math.min(rewardCount, eligible.length)} Pemenang
                            </Button>
                            {selectedIds.size > 0 && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs text-gray-500"
                                    onClick={() => setSelectedIds(new Set())}
                                >
                                    Clear Selection
                                </Button>
                            )}
                        </div>

                        {/* Eligible Table */}
                        <div className="border rounded-lg overflow-auto max-h-[340px]">
                            <Table>
                                <TableHeader className="sticky top-0 bg-white z-10">
                                    <TableRow>
                                        <TableHead className="w-10 text-xs"></TableHead>
                                        <TableHead className="text-xs">Jakpat ID</TableHead>
                                        <TableHead className="text-xs"><User className="w-3 h-3 inline mr-1" />Nama</TableHead>
                                        <TableHead className="text-xs"><MapPin className="w-3 h-3 inline mr-1" />Lokasi</TableHead>
                                        <TableHead className="text-xs">E-Wallet</TableHead>
                                        <TableHead className="text-xs text-right"><ImageIcon className="w-3 h-3 inline mr-1" />Proof</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {eligible.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-8 text-gray-400">
                                                Tidak ada responden yang eligible
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        eligible.map(r => (
                                            <TableRow
                                                key={r.respondent_id}
                                                className={`cursor-pointer transition-colors ${selectedIds.has(r.jakpat_id) ? 'bg-blue-50/60' : 'hover:bg-gray-50'}`}
                                                onClick={() => toggleSelect(r.jakpat_id)}
                                            >
                                                <TableCell className="text-center">
                                                    <Checkbox
                                                        checked={selectedIds.has(r.jakpat_id)}
                                                        onCheckedChange={() => toggleSelect(r.jakpat_id)}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{r.jakpat_id}</span>
                                                </TableCell>
                                                <TableCell className="text-sm">
                                                    {r.ktp_name || r.display_name || <span className="text-gray-400 italic text-xs">Not in masterdata</span>}
                                                </TableCell>
                                                <TableCell className="text-xs text-gray-600">
                                                    {r.city || r.province ? (
                                                        <span>{[r.city, r.province].filter(Boolean).join(', ')}</span>
                                                    ) : (
                                                        <span className="text-gray-300">—</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {r.e_wallet_number ? (
                                                        <div className="flex items-center gap-1">
                                                            <span className="font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] capitalize border border-blue-100">{r.ewallet_provider}</span>
                                                            <span className="font-mono text-gray-600">{r.e_wallet_number}</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-gray-300">—</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {r.proof_url && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 w-7 p-0"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                window.open(getCdnUrl(r.proof_url!), '_blank');
                                                            }}
                                                        >
                                                            <ExternalLink className="h-3.5 w-3.5 text-blue-600" />
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        {/* Not Eligible Section (Collapsible) */}
                        {notEligible.length > 0 && (
                            <div className="border rounded-lg overflow-hidden">
                                <button
                                    onClick={() => setShowNotEligible(!showNotEligible)}
                                    className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-sm text-gray-600"
                                >
                                    <div className="flex items-center gap-2">
                                        <AlertCircle className="w-4 h-4 text-orange-500" />
                                        <span>Not Eligible ({notEligible.length})</span>
                                    </div>
                                    {showNotEligible ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>
                                {showNotEligible && (
                                    <div className="divide-y">
                                        {notEligible.map(r => (
                                            <div key={r.respondent_id} className="flex items-center justify-between px-4 py-2 text-xs">
                                                <div className="flex items-center gap-3">
                                                    <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{r.jakpat_id}</span>
                                                    <span className="text-gray-500">{r.ktp_name || r.display_name || '—'}</span>
                                                </div>
                                                <div className="flex flex-col items-end gap-0.5">
                                                    {r.ineligible_reasons.map((reason, i) => (
                                                        <span key={i} className="text-orange-600 flex items-center gap-1">
                                                            {reason.includes('bukti') && <ImageIcon className="w-3 h-3" />}
                                                            {reason.includes('menang') && <Clock className="w-3 h-3" />}
                                                            {reason.includes('redeem') && <Clock className="w-3 h-3" />}
                                                            {reason}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Footer */}
                <div className="flex justify-between items-center pt-4 border-t mt-auto">
                    <Button variant="outline" onClick={onClose}>Tutup</Button>
                    {!hasExistingWinners && !loading && (
                        <Button
                            onClick={handleConfirmWinners}
                            disabled={selectedIds.size === 0 || saving}
                            className="bg-green-600 hover:bg-green-700 text-white"
                        >
                            {saving ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Menyimpan...</>
                            ) : (
                                <><Trophy className="w-4 h-4 mr-2" /> Confirm {selectedIds.size} Pemenang</>
                            )}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
