import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../utils/supabase';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/Dialog";
import { Button } from "./ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Users, School, Share2, TrendingUp, DollarSign, Wallet, Clock, ShieldAlert, Target, Award, BookOpen, Link, Mail, Filter, Megaphone, Copy, ExternalLink, Calendar, RefreshCw, Activity, AlertCircle, BarChart3, Plus, Trash2, List } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, AreaChart, Area, Line, LineChart } from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
const DATE_RANGE_OPTIONS = [
  { label: '7 Hari', value: '7d' },
  { label: '30 Hari', value: '30d' },
  { label: '90 Hari', value: '90d' },
  { label: '1 Tahun', value: '365d' },
  { label: 'Semua', value: 'all' },
] as const;
type DateRange = typeof DATE_RANGE_OPTIONS[number]['value'];
type TabKey = 'revenue' | 'respondent' | 'platform' | 'campaign';
const REVIEW_STATUSES = new Set(['spam','approved','in_review','rejected','published','drafted','slot_reserved','waiting_payment','paid','scheduled','live','completed']);

const formatIDR = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);
function getStartDate(range: DateRange): string | null {
  if (range === 'all') return null;
  const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 365;
  const d = new Date(); d.setDate(d.getDate() - days); d.setHours(0,0,0,0); return d.toISOString();
}
function toWIBHourLabel(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false });
}

/** Paginated fetch: Supabase defaults to 1000 rows max. This loops until all rows are fetched. */
async function fetchAllRows(
  buildQuery: () => any,
  batchSize = 1000
): Promise<any[]> {
  let allData: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + batchSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allData = allData.concat(data);
    if (data.length < batchSize) break;
    from += batchSize;
  }
  return allData;
}

function EmptyState({ icon: Icon, message }: { icon: any; message: string }) {
  return (
    <div className="h-[240px] flex flex-col items-center justify-center text-gray-400 bg-gray-50/60 rounded-lg border border-dashed border-gray-200">
      <Icon className="w-8 h-8 text-gray-300 mb-2" />
      <p className="text-sm text-center px-4">{message}</p>
    </div>
  );
}
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-96 text-gray-500 space-y-4">
      <div className="p-4 bg-red-50 rounded-full"><AlertCircle className="h-8 w-8 text-red-500" /></div>
      <div className="text-center space-y-1">
        <p className="text-sm font-medium text-gray-900">Gagal Memuat Data</p>
        <p className="text-xs text-gray-500 max-w-xs">{message}</p>
      </div>
      <button onClick={onRetry} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors">
        <RefreshCw className="w-3.5 h-3.5" /> Coba Lagi
      </button>
    </div>
  );
}
function SkeletonCard({ children }: { children?: React.ReactNode }) {
  return <div className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">{children || <><div className="h-3 w-24 bg-gray-200 rounded mb-3"/><div className="h-8 w-32 bg-gray-200 rounded"/></>}</div>;
}
function SkeletonChart() {
  return <div className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse"><div className="h-4 w-32 bg-gray-200 rounded mb-4"/><div className="h-[260px] bg-gray-100 rounded"/></div>;
}

export function AnalyticsDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as TabKey | null;
  const [activeTab, setActiveTab] = useState<TabKey>(tabFromUrl && ['revenue','respondent','platform','campaign'].includes(tabFromUrl) ? tabFromUrl : 'revenue');
  const [dateRange, setDateRange] = useState<DateRange>('7d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [transactions, setTransactions] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [respondents, setRespondents] = useState<any[]>([]);
  const [surveyPages, setSurveyPages] = useState<any[]>([]);
  const [campaignLinks, setCampaignLinks] = useState<any[]>([]);

  const [linkSource, setLinkSource] = useState('instagram');
  const [linkDescription, setLinkDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [deptSortBy, setDeptSortBy] = useState<'revenue' | 'paidUsers'>('revenue');

  useEffect(() => {
    if (activeTab !== (searchParams.get('tab') as TabKey | null)) {
      const next = new URLSearchParams(searchParams); next.set('tab', activeTab); setSearchParams(next, { replace: true });
    }
  }, [activeTab]);

  const fetchAllData = async () => {
    try {
      setLoading(true); setError(null);
      const start = getStartDate(dateRange);
      const now = new Date().toISOString();

      // Paginated fetch for all tables that can exceed 1000 rows
      const buildTxQuery = () => { let q = supabase.from('transactions').select('*'); if (start) q = q.gte('created_at', start).lte('created_at', now); return q; };
      const buildSubQuery = () => { let q = supabase.from('form_submissions').select('id, auth_user_id, university, department, status, submission_status, payment_status, referral_source, email, winner_count, prize_per_winner, criteria_responden, created_at'); if (start) q = q.gte('created_at', start).lte('created_at', now); return q; };
      const buildRespQuery = () => { let q = supabase.from('page_respondents').select('id, page_id, proof_url, ewallet_provider, created_at, jakpat_id'); if (start) q = q.gte('created_at', start).lte('created_at', now); return q; };
      const buildLinksQuery = () => { return supabase.from('campaign_links').select('*').order('created_at', { ascending: false }); };

      // survey_pages is small, no pagination needed
      const { data: pageData, error: pageErr } = await supabase.from('survey_pages').select('id, views_count, submission_id');
      if (pageErr) throw pageErr;

      const [txData, subData, respData, linksData] = await Promise.all([
        fetchAllRows(buildTxQuery),
        fetchAllRows(buildSubQuery),
        fetchAllRows(buildRespQuery),
        fetchAllRows(buildLinksQuery)
      ]);

      setTransactions(txData); setSubmissions(subData); setRespondents(respData); setSurveyPages(pageData || []); setCampaignLinks(linksData);
    } catch (err: any) { console.error('Error fetching analytics data:', err); setError(err?.message || 'Terjadi kesalahan saat mengambil data.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAllData(); }, [dateRange]);

  const analytics = useMemo(() => {
    if (!submissions.length) return null;
    const completedTx = transactions.filter((t: any) => t.status === 'completed');
    const totalRevenue = completedTx.reduce((sum: number, t: any) => sum + t.amount, 0);
    // AOV = Total Revenue / Paid Submissions (not transaction count, since 1 tx can cover multiple submissions)
    const paidSubmissionIds = new Set(completedTx.map((t: any) => t.form_submission_id));
    const paidSubmissionCount = paidSubmissionIds.size;
    const aov = paidSubmissionCount > 0 ? Math.round(totalRevenue / paidSubmissionCount) : 0;

    const revenueByUnivMap: Record<string, number> = {};
    completedTx.forEach((tx: any) => {
      const sub = submissions.find((s: any) => s.id === tx.form_submission_id);
      if (sub) { const univName = sub.university?.trim() || 'Tidak Diketahui'; revenueByUnivMap[univName] = (revenueByUnivMap[univName] || 0) + tx.amount; }
    });
    const topSpendersData = Object.entries(revenueByUnivMap).map(([name, Total]) => ({ name, Total })).sort((a: any, b: any) => b.Total - a.Total).slice(0, 5);

    const revenueByCustomerMap: Record<string, { email: string; university: string; total: number; txCount: number }> = {};
    completedTx.forEach((tx: any) => {
      const sub = submissions.find((s: any) => s.id === tx.form_submission_id);
      if (sub) {
        // Use auth_user_id as primary grouping key; fall back to email for pre-Phase 1 data
        const key = sub.auth_user_id || sub.email?.trim().toLowerCase();
        if (!key) return;
        const displayEmail = sub.email?.trim().toLowerCase() || '-';
        if (!revenueByCustomerMap[key]) revenueByCustomerMap[key] = { email: displayEmail, university: sub.university?.trim() || '-', total: 0, txCount: 0 };
        revenueByCustomerMap[key].total += tx.amount;
        revenueByCustomerMap[key].txCount += 1;
      }
    });
    const topSpendersByEmail = Object.values(revenueByCustomerMap).sort((a: any, b: any) => b.total - a.total).slice(0, 5);



    const ewalletMap: Record<string, number> = {};
    respondents.forEach((r: any) => { if (r.proof_url) { const p = r.ewallet_provider?.toLowerCase().trim() || 'Lainnya'; ewalletMap[p] = (ewalletMap[p] || 0) + 1; } });
    const ewalletData = Object.entries(ewalletMap).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value })).sort((a: any, b: any) => b.value - a.value);

    const hourlyMap: Record<string, number> = {}; for (let i = 0; i < 24; i++) hourlyMap[`${i.toString().padStart(2, '0')}:00`] = 0;
    respondents.forEach((r: any) => { if (r.created_at) { const hour = toWIBHourLabel(r.created_at); hourlyMap[`${hour}:00`] = (hourlyMap[`${hour}:00`] || 0) + 1; } });
    const hourlyData = Object.entries(hourlyMap).map(([hour, count]) => ({ hour, Responden: count }));

    const jakpatIdMap: Record<string, Set<string>> = {};
    respondents.forEach((r: any) => { if (r.jakpat_id && r.page_id) { if (!jakpatIdMap[r.jakpat_id]) jakpatIdMap[r.jakpat_id] = new Set(); jakpatIdMap[r.jakpat_id].add(r.page_id); } });
    const uniqueRespondents = Object.keys(jakpatIdMap).length;
    const loyalRespondentsCount = Object.values(jakpatIdMap).filter((pages) => pages.size > 1).length;
    const retentionRate = uniqueRespondents > 0 ? (loyalRespondentsCount / uniqueRespondents) * 100 : 0;
    const totalRespondents = respondents.length;
    const completedRespondents = respondents.filter((r: any) => r.proof_url).length;
    const disqualifiedRespondents = totalRespondents - completedRespondents;

    const totalSubs = submissions.length;
    const spamSubs = submissions.filter((s: any) => (s.submission_status || s.status) === 'spam').length;
    const genuineSubs = submissions.filter((s: any) => { const st = s.submission_status || s.status; return st === 'approved' || st === 'published'; }).length;
    const rawApprovals = submissions.filter((s: any) => { const st = s.submission_status || s.status; return st === 'approved' || st === 'published' || s.payment_status === 'paid'; });
    const paidApprovals = rawApprovals.filter((s: any) => s.payment_status === 'paid').length;
    const unpaidApprovals = rawApprovals.length - paidApprovals;
    const totalViews = surveyPages.reduce((sum: number, sp: any) => sum + (sp.views_count || 0), 0);
    const globalConversionRate = totalViews > 0 ? ((completedRespondents / totalViews) * 100).toFixed(1) : '0.0';

    const demoDeptMap: Record<string, { count: number; revenue: number; paidUsers: number }> = {};
    const demoRefMap: Record<string, { count: number; revenue: number }> = {};
    submissions.forEach((sub: any) => {
      const dept = sub.department?.trim() || 'Lainnya'; const ref = sub.referral_source?.trim() || 'Organik';
      if (!demoDeptMap[dept]) demoDeptMap[dept] = { count: 0, revenue: 0, paidUsers: 0 }; if (!demoRefMap[ref]) demoRefMap[ref] = { count: 0, revenue: 0 };
      demoDeptMap[dept].count += 1; demoRefMap[ref].count += 1;
      // FIX: Sum ALL completed transactions per submission (not just .find() which returns only 1)
      const relatedTxs = completedTx.filter((t: any) => t.form_submission_id === sub.id && t.status === 'completed');
      if (relatedTxs.length > 0) {
        relatedTxs.forEach((tx: any) => { demoDeptMap[dept].revenue += tx.amount; demoRefMap[ref].revenue += tx.amount; });
        demoDeptMap[dept].paidUsers += 1; // Count as 1 paid user per submission
      }
    });
    const topDepartments = Object.entries(demoDeptMap).map(([name, data]) => ({ name, ...data })).sort((a: any, b: any) => b.revenue - a.revenue);
    const topReferrals = Object.entries(demoRefMap).map(([name, data]) => ({ name, ...data })).sort((a: any, b: any) => b.revenue - a.revenue);

    const demoStatusMap: Record<string, { count: number; revenue: number }> = {};
    submissions.forEach((sub: any) => {
      let statusLabel = 'Tidak Diketahui';
      if (sub.status && !REVIEW_STATUSES.has(sub.status)) statusLabel = sub.status.trim();
      if (!demoStatusMap[statusLabel]) demoStatusMap[statusLabel] = { count: 0, revenue: 0 };
      demoStatusMap[statusLabel].count += 1;
      const relTx = completedTx.find((t: any) => t.form_submission_id === sub.id);
      if (relTx) demoStatusMap[statusLabel].revenue += relTx.amount;
    });
    const topStudentStatuses = Object.entries(demoStatusMap).map(([name, data]) => ({ name, ...data })).sort((a: any, b: any) => b.revenue - a.revenue);

    const criteriaMap: Record<string, number> = {};
    const jabodtbkCities = ['jakarta','bogor','depok','tangerang','bekasi','jabodetabek','jabotabek','jadetabek'];
    const normalizeCriteria = (raw: string): string | null => {
      const s = raw.toLowerCase().trim(); if (s.length < 3) return null;
      const ageMatch = s.match(/(\d{2})/g);
      if (ageMatch && (s.includes('tahun') || s.includes('usia') || s.includes('umur') || s.includes('age'))) {
        const ages = ageMatch.map(Number).filter((a: number) => a >= 10 && a <= 99);
        if (ages.length > 0) { const minAge = Math.min(...ages); if (minAge <= 20) return 'Usia 17-20 tahun'; if (minAge <= 25) return 'Usia 21-25 tahun'; if (minAge <= 30) return 'Usia 26-30 tahun'; return 'Usia 31+ tahun'; }
      }
      if (s.includes('mahasiswa') || s.includes('kuliah') || s.includes('mhs')) return 'Mahasiswa';
      if (jabodtbkCities.some((city) => s.includes(city)) || s.includes('domisili jabo')) return 'Jabodetabek';
      if (s.includes('domisili') || s.includes('wilayah') || s.includes('daerah')) { const cleaned = s.replace(/domisili|wilayah|daerah|di|area/gi, '').trim(); if (cleaned.length > 2) return 'Domisili: ' + cleaned.charAt(0).toUpperCase() + cleaned.slice(1); return null; }
      return s.charAt(0).toUpperCase() + s.slice(1);
    };
    submissions.forEach((sub: any) => {
      if (sub.criteria_responden) { const parts = sub.criteria_responden.split(/[,;\n]+/); const seen = new Set<string>(); parts.forEach((part: string) => { const normalized = normalizeCriteria(part); if (normalized && !seen.has(normalized)) { seen.add(normalized); criteriaMap[normalized] = (criteriaMap[normalized] || 0) + 1; } }); }
    });
    const topCriteriaKeywords = Object.entries(criteriaMap).map(([name, count]) => ({ name, count })).sort((a: any, b: any) => b.count - a.count).slice(0, 8);

    const daysToInit = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : dateRange === '90d' ? 90 : 30;
    const dailyRevenueMap: Record<string, number> = {}; const dailySubmissionMap: Record<string, number> = {};
    for (let i = daysToInit - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const key = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }); dailyRevenueMap[key] = 0; dailySubmissionMap[key] = 0; }
    completedTx.forEach((tx: any) => { if (tx.created_at) { const key = new Date(tx.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }); if (dailyRevenueMap[key] !== undefined) dailyRevenueMap[key] += tx.amount; } });
    submissions.forEach((s: any) => { if (s.created_at) { const key = new Date(s.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }); if (dailySubmissionMap[key] !== undefined) dailySubmissionMap[key] += 1; } });
    const dailyTrendData = Object.keys(dailyRevenueMap).map((date) => ({ date, Revenue: dailyRevenueMap[date], Submissions: dailySubmissionMap[date] || 0 }));

    const topBarchartUniv = topSpendersData[0]?.name || '-';
    const topWallet = ewalletData[0]?.name || '-';
    const peakHour = Object.entries(hourlyMap).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || '-';

    // Campaign stats now come directly from campaign_links table (merged)
    const campaignStats = campaignLinks
      .filter((link: any) => (link.click_count || 0) > 0)
      .map((link: any) => ({ name: link.source_name, clicks: link.click_count || 0 }))
      .sort((a: any, b: any) => b.clicks - a.clicks);
    const totalCampaignClicks = campaignLinks.reduce((sum: number, link: any) => sum + (link.click_count || 0), 0);

    return { totalRevenue, aov, paidSubmissionCount, topSpendersData, ewalletData, hourlyData, uniqueRespondents, loyalRespondentsCount, retentionRate: retentionRate.toFixed(1), totalRespondents, completedRespondents, disqualifiedRespondents, totalSubs, spamSubs, genuineSubs, rawApprovalsCount: rawApprovals.length, paidApprovals, unpaidApprovals, totalViews, globalConversionRate, topDepartments, topReferrals, topStudentStatuses, topSpendersByEmail, topCriteriaKeywords, campaignStats, totalCampaignClicks, dailyTrendData, funFacts: { topBarchartUniv, topWallet, peakHour } };
  }, [transactions, submissions, respondents, surveyPages, campaignLinks, dateRange]);

  const handleGenerateLink = async () => { 
    const source = linkSource.trim().toLowerCase().replace(/\s+/g, '-'); 
    if (!source) return toast.error('Nama sumber tidak boleh kosong');
    
    setIsGenerating(true);
    try {
      const existing = campaignLinks.find(l => l.source_name === source);
      if (existing) {
        toast.info('Link untuk source ini sudah ada di daftar.');
        setGeneratedLink(`${window.location.origin}/c/${source}`);
        return;
      }
      
      const { data, error } = await supabase.from('campaign_links').insert({
        source_name: source,
        description: linkDescription.trim() || null
      }).select().single();

      if (error) throw error;
      
      setCampaignLinks([data, ...campaignLinks]);
      setGeneratedLink(`${window.location.origin}/c/${source}`);
      setLinkSource('');
      setLinkDescription('');
      setIsLinkModalOpen(false);
      toast.success('Campaign link berhasil dibuat dan disimpan!');
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal membuat link: ' + (err.message || 'Kesalahan sistem'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteLink = async (id: string) => {
    if (!confirm('Hapus link ini dari manajemen? (Data klik tidak akan terhapus)')) return;
    try {
      const { error } = await supabase.from('campaign_links').delete().eq('id', id);
      if (error) throw error;
      setCampaignLinks(campaignLinks.filter(l => l.id !== id));
      toast.success('Link dihapus dari tabel.');
    } catch (err: any) {
      toast.error('Gagal menghapus: ' + err.message);
    }
  };

  const handleCopyLink = (link?: string) => { 
    const target = link || generatedLink;
    if (!target) return; 
    navigator.clipboard.writeText(target); 
    toast.success('Link berhasil disalin!'); 
  };
  const handleTabChange = (tab: TabKey) => { setActiveTab(tab); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center h-[60vh] space-y-6 animate-in fade-in duration-300">
          <div className="p-4 bg-blue-50 rounded-full">
            <RefreshCw className="h-8 w-8 text-blue-500 animate-spin" />
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">
              Mengambil Data {DATE_RANGE_OPTIONS.find(d => d.value === dateRange)?.label}
            </h3>
            <p className="text-xs text-gray-500 max-w-xs">
              Proses ini mungkin memakan waktu beberapa detik karena mengambil jumlah data yang besar.
            </p>
          </div>
          <div className="w-64 h-2 bg-gray-100 rounded-full overflow-hidden relative">
            <div className="absolute top-0 bottom-0 left-0 bg-blue-500 rounded-full animate-[progress_1.5s_ease-in-out_infinite] w-full" style={{ animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}></div>
          </div>
        </div>
      );
    }
    if (error) return <ErrorState message={error} onRetry={fetchAllData} />;
    if (!analytics) return (
      <div className="flex flex-col items-center justify-center h-96 text-gray-500">
        <BarChart3 className="h-10 w-10 text-gray-300 mb-3" />
        <p className="text-sm font-medium">Belum ada data untuk ditampilkan.</p>
        <p className="text-xs text-gray-400 mt-1">Coba ubah rentang tanggal atau tunggu hingga data masuk.</p>
      </div>
    );

    return (
      <div className="space-y-4 animate-in fade-in duration-500">

        {/* Hero */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-lg p-3 shadow text-white mb-2 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <Award className="w-5 h-5 text-yellow-300" />
          <span className="font-bold text-xs uppercase tracking-wider text-blue-100">Insight {dateRange === 'all' ? 'Semua Waktu' : DATE_RANGE_OPTIONS.find((d) => d.value === dateRange)?.label}:</span>
        </div>
        <div className="grid grid-cols-3 w-full gap-2 lg:w-4/5">
          <div className="bg-white/10 rounded px-2.5 py-1.5 backdrop-blur-sm border border-white/10 flex flex-col justify-center">
            <span className="text-[9px] text-blue-200 uppercase tracking-widest truncate">Top Spender Univ</span>
            <span className="font-semibold text-xs md:text-sm truncate">{analytics.funFacts.topBarchartUniv}</span>
          </div>
          <div className="bg-white/10 rounded px-2.5 py-1.5 backdrop-blur-sm border border-white/10 flex flex-col justify-center">
            <span className="text-[9px] text-blue-200 uppercase tracking-widest truncate">E-Wallet Favorit</span>
            <span className="font-semibold text-xs md:text-sm truncate">{analytics.funFacts.topWallet} users</span>
          </div>
          <div className="bg-white/10 rounded px-2.5 py-1.5 backdrop-blur-sm border border-white/10 flex flex-col justify-center">
            <span className="text-[9px] text-blue-200 uppercase tracking-widest truncate">Peak Hour</span>
            <span className="font-semibold text-xs md:text-sm truncate">Pukul {analytics.funFacts.peakHour} WIB</span>
          </div>
        </div>
      </div>

      {/* TAB: REVENUE */}
      {activeTab === 'revenue' && (
        <div className="space-y-4 animate-in slide-in-from-bottom-2 fade-in duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-emerald-50 border-emerald-100 shadow-sm">
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-emerald-800 uppercase tracking-widest">Total Revenue</p>
                    <p className="text-2xl font-bold text-emerald-950">{formatIDR(analytics.totalRevenue)}</p>
                  </div>
                  <div className="p-2 bg-emerald-200/50 rounded-lg"><DollarSign className="w-5 h-5 text-emerald-700" /></div>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">AOV (Average Order)</p>
                    <p className="text-2xl font-bold text-gray-900">{formatIDR(analytics.aov)}</p>
                    <p className="text-[10px] text-gray-400">Rata-rata per {analytics.paidSubmissionCount} paid submission</p>
                  </div>
                  <div className="p-2 bg-blue-50 rounded-lg"><Wallet className="w-5 h-5 text-blue-600" /></div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Daily Trend */}
          <Card className="shadow-sm border-gray-200">
            <CardHeader className="pb-0 p-4">
              <CardTitle className="text-sm flex items-center gap-1.5"><Activity className="w-4 h-4 text-blue-500" /> Tren Harian</CardTitle>
              <CardDescription className="text-[10px] mt-0.5">Revenue &amp; Submissions harian</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              {analytics.dailyTrendData.some((d: any) => d.Revenue > 0 || d.Submissions > 0) ? (
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics.dailyTrendData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                      <defs><linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                      <XAxis dataKey="date" stroke="#9ca3af" fontSize={10} tickMargin={5} />
                      <YAxis yAxisId="left" tickFormatter={(v) => `${v / 1000000}M`} stroke="#9ca3af" fontSize={10} />
                      <YAxis yAxisId="right" orientation="right" stroke="#9ca3af" fontSize={10} allowDecimals={false} />
                      <RechartsTooltip formatter={(value: number, name: string) => name === 'Revenue' ? formatIDR(value) : `${value} submissions`} contentStyle={{ fontSize: '11px', borderRadius: '6px' }} />
                      <Area yAxisId="left" type="monotone" dataKey="Revenue" stroke="#10b981" fillOpacity={1} fill="url(#colorRevenue)" strokeWidth={2} />
                      <Line yAxisId="right" type="monotone" dataKey="Submissions" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : <EmptyState icon={Activity} message="Belum ada data tren untuk periode ini." />}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="shadow-sm border-gray-200">
              <CardHeader className="pb-0 p-4">
                <CardTitle className="text-sm flex items-center gap-1.5"><School className="w-4 h-4 text-blue-500" /> Top Spenders</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                {analytics.topSpendersData.length > 0 ? (
                  <div className="h-[260px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.topSpendersData} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f3f4f6" />
                        <XAxis type="number" tickFormatter={(v) => `${v / 1000000}M`} stroke="#9ca3af" fontSize={10} />
                        <YAxis dataKey="name" type="category" width={120} stroke="#9ca3af" fontSize={10} tick={{ fill: '#4b5563' }} />
                        <RechartsTooltip formatter={(v: number) => formatIDR(v)} cursor={{ fill: '#f3f4f6' }} contentStyle={{ fontSize: '11px', borderRadius: '6px' }} />
                        <Bar dataKey="Total" radius={[0, 3, 3, 0]} barSize={18}>{analytics.topSpendersData.map((_: any, index: number) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <EmptyState icon={School} message="Belum ada data revenue per universitas." />}
              </CardContent>
            </Card>

            <Card className="shadow-sm border-gray-200">
              <CardHeader className="pb-0 p-4">
                <CardTitle className="text-sm flex items-center gap-1.5"><Award className="w-4 h-4 text-amber-500" /> Top Individual Spenders</CardTitle>
                <CardDescription className="text-[10px] mt-0.5">Total pembelanjaan tertinggi per Customer</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                {analytics.topSpendersByEmail.length > 0 ? (
                  <div className="h-[260px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.topSpendersByEmail.slice(0,5).map((d: any) => ({ name: d.email.split('@')[0].length > 12 ? d.email.split('@')[0].slice(0,12) + '…' : d.email.split('@')[0], Total: d.total, fullEmail: d.email, orders: d.txCount }))} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f3f4f6" />
                        <XAxis type="number" tickFormatter={(v) => `${v / 1000000}M`} stroke="#9ca3af" fontSize={10} />
                        <YAxis dataKey="name" type="category" width={90} stroke="#9ca3af" fontSize={10} tick={{ fill: '#4b5563' }} />
                        <RechartsTooltip formatter={(v: number) => formatIDR(v)} labelFormatter={(_, payload: any) => { const p = payload?.[0]?.payload; return p ? `${p.fullEmail} - ${p.orders}x order` : ''; }} cursor={{ fill: '#f3f4f6' }} contentStyle={{ fontSize: '11px', borderRadius: '6px' }} />
                        <Bar dataKey="Total" fill="#f59e0b" radius={[0, 3, 3, 0]} barSize={18}>{analytics.topSpendersByEmail.slice(0,5).map((_: any, index: number) => <Cell key={`ind-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />)}</Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <EmptyState icon={Award} message="Belum ada data individual spender." />}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="shadow-sm border-gray-200">
              <CardHeader className="pb-0 p-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-1.5"><BookOpen className="w-4 h-4 text-indigo-500" /> Top Jurusan</CardTitle>
                  <div className="flex space-x-1 bg-gray-100 p-0.5 rounded-md shadow-inner border border-gray-200">
                    <button onClick={() => setDeptSortBy('revenue')} className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${deptSortBy === 'revenue' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>Revenue</button>
                    <button onClick={() => setDeptSortBy('paidUsers')} className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${deptSortBy === 'paidUsers' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>Paid Users</button>
                  </div>
                </div>
                <CardDescription className="text-[10px] mt-0.5">{deptSortBy === 'revenue' ? 'Diurutkan berdasarkan Revenue' : 'Diurutkan berdasarkan Paid Users'}</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                {analytics.topDepartments.length > 0 ? (
                  <div className="h-[280px] w-full mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[...analytics.topDepartments].sort((a: any, b: any) => b[deptSortBy] - a[deptSortBy]).slice(0,5).map((d: any) => ({ name: d.name.length > 15 ? d.name.slice(0,15) + '…' : d.name, Revenue: d.revenue, PaidUsers: d.paidUsers, fullName: d.name }))} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="name" stroke="#9ca3af" fontSize={10} tickMargin={5} angle={-25} textAnchor="end" height={60} />
                        <YAxis yAxisId="left" tickFormatter={(v) => `${v / 1000000}M`} stroke="#9ca3af" fontSize={10} />
                        <YAxis yAxisId="right" orientation="right" stroke="#9ca3af" fontSize={10} allowDecimals={false} />
                        <RechartsTooltip formatter={(value: number, name: string) => name === 'Revenue' ? formatIDR(value) : `${value} users`} labelFormatter={(_, payload: any) => payload?.[0]?.payload?.fullName || ''} cursor={{ fill: '#f3f4f6' }} contentStyle={{ fontSize: '11px', borderRadius: '6px' }} />
                        <Bar yAxisId="left" dataKey="Revenue" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={20} />
                        <Bar yAxisId="right" dataKey="PaidUsers" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <EmptyState icon={BookOpen} message="Belum ada data departemen." />}
              </CardContent>
            </Card>

            <Card className="shadow-sm border-gray-200">
              <CardHeader className="pb-0 p-4">
                <CardTitle className="text-sm flex items-center gap-1.5"><Users className="w-4 h-4 text-teal-500" /> Status Mahasiswa</CardTitle>
                <CardDescription className="text-[10px] mt-0.5">Berdasar Revenue</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                {analytics.topStudentStatuses.length > 0 ? (
                  <div className="h-[260px] w-full mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.topStudentStatuses.slice(0,5).map((d: any) => ({ name: d.name.length > 15 ? d.name.slice(0,15) + '…' : d.name, Revenue: d.revenue, fullName: d.name }))} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f3f4f6" />
                        <XAxis type="number" tickFormatter={(v) => `${v / 1000000}M`} stroke="#9ca3af" fontSize={10} />
                        <YAxis dataKey="name" type="category" width={110} stroke="#9ca3af" fontSize={10} tick={{ fill: '#4b5563' }} />
                        <RechartsTooltip formatter={(v: number) => formatIDR(v)} labelFormatter={(_, payload: any) => payload?.[0]?.payload?.fullName || ''} cursor={{ fill: '#f3f4f6' }} contentStyle={{ fontSize: '11px', borderRadius: '6px' }} />
                        <Bar dataKey="Revenue" fill="#14b8a6" radius={[0, 4, 4, 0]} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <EmptyState icon={Users} message="Belum ada data status pendidikan." />}
              </CardContent>
            </Card>

            <Card className="shadow-sm border-gray-200">
              <CardHeader className="pb-0 p-4">
                <CardTitle className="text-sm flex items-center gap-1.5"><Link className="w-4 h-4 text-pink-500" /> Kanal Akuisisi</CardTitle>
                <CardDescription className="text-[10px] mt-0.5">Sumber Referensi</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                {analytics.topReferrals.length > 0 ? (
                  <div className="h-[260px] w-full mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.topReferrals.slice(0,5).map((d: any) => ({ name: (d.name || 'Lainnya').length > 15 ? (d.name || 'Lainnya').slice(0,15) + '…' : d.name || 'Lainnya', Revenue: d.revenue, fullName: d.name || 'Lainnya' }))} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f3f4f6" />
                        <XAxis type="number" tickFormatter={(v) => `${v / 1000000}M`} stroke="#9ca3af" fontSize={10} />
                        <YAxis dataKey="name" type="category" width={110} stroke="#9ca3af" fontSize={10} tick={{ fill: '#4b5563' }} />
                        <RechartsTooltip formatter={(v: number) => formatIDR(v)} labelFormatter={(_, payload: any) => payload?.[0]?.payload?.fullName || ''} cursor={{ fill: '#f3f4f6' }} contentStyle={{ fontSize: '11px', borderRadius: '6px' }} />
                        <Bar dataKey="Revenue" fill="#ec4899" radius={[0, 4, 4, 0]} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <EmptyState icon={Link} message="Belum ada data kanal akuisisi." />}
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-sm border-gray-200">
            <CardHeader className="pb-0 p-4">
              <CardTitle className="text-sm flex items-center gap-1.5"><Filter className="w-4 h-4 text-violet-500" /> Top Kriteria Responden</CardTitle>
              <CardDescription className="text-[10px] mt-0.5">Kriteria target responden yang paling sering diminta oleh customer</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              {analytics.topCriteriaKeywords.length > 0 ? (
                <div className="h-[300px] w-full mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.topCriteriaKeywords} margin={{ top: 5, right: 10, left: -10, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                      <XAxis dataKey="name" stroke="#9ca3af" fontSize={9} tickMargin={5} angle={-35} textAnchor="end" height={80} />
                      <YAxis stroke="#9ca3af" fontSize={10} allowDecimals={false} />
                      <RechartsTooltip formatter={(v: number) => `${v} submissions`} cursor={{ fill: '#f3f4f6' }} contentStyle={{ fontSize: '11px', borderRadius: '6px' }} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={28}>{analytics.topCriteriaKeywords.map((_: any, index: number) => <Cell key={`crit-${index}`} fill={COLORS[(index + 4) % COLORS.length]} />)}</Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <EmptyState icon={Filter} message="Belum ada data kriteria responden." />}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB: RESPONDENT */}
      {activeTab === 'respondent' && (
        <div className="space-y-4 animate-in slide-in-from-bottom-2 fade-in duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="shadow-sm bg-blue-50/50"><CardContent className="p-4"><p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Unique Respondents</p><p className="text-2xl font-bold text-blue-950">{analytics.uniqueRespondents}</p></CardContent></Card>
            <Card className="shadow-sm bg-purple-50/50 border-purple-100"><CardContent className="p-4"><p className="text-[10px] font-semibold text-purple-700 uppercase tracking-widest">Loyal Respondents</p><p className="text-2xl font-bold text-purple-950">{analytics.loyalRespondentsCount} <span className="text-sm font-medium text-purple-700">users</span></p><p className="text-[10px] text-purple-600 mt-0.5">Mengikuti {'>'} 1 survei berbeda ({analytics.retentionRate}%)</p></CardContent></Card>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="shadow-sm border-gray-200">
              <CardHeader className="pb-0 p-4"><CardTitle className="text-sm flex items-center gap-1.5"><Clock className="w-4 h-4 text-indigo-500" /> Peak Trafik (WIB)</CardTitle></CardHeader>
              <CardContent className="p-4 pt-2">
                {analytics.hourlyData.some((d: any) => d.Responden > 0) ? (
                  <div className="h-[260px] w-full mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={analytics.hourlyData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis dataKey="hour" stroke="#9ca3af" fontSize={9} tickMargin={5} interval={2} />
                        <YAxis stroke="#9ca3af" fontSize={9} allowDecimals={false} />
                        <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ fontSize: '11px', borderRadius: '6px' }} />
                        <Line type="monotone" dataKey="Responden" stroke="#6366f1" strokeWidth={2} dot={{ r: 2, fill: '#6366f1' }} activeDot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : <EmptyState icon={Clock} message="Belum ada data trafik per jam." />}
              </CardContent>
            </Card>
            <Card className="shadow-sm border-gray-200">
              <CardHeader className="pb-0 p-4"><CardTitle className="text-sm flex items-center gap-1.5"><Wallet className="w-4 h-4 text-green-500" /> E-Wallet Dominasi</CardTitle></CardHeader>
              <CardContent className="p-4 pt-3">
                {analytics.ewalletData.length > 0 ? (
                  <div className="space-y-3">
                    {analytics.ewalletData.slice(0, 5).map((item: any, idx: number) => {
                      const percentage = Math.round((item.value / (analytics.completedRespondents || 1)) * 100);
                      return (
                        <div key={idx} className="group">
                          <div className="flex justify-between text-[11px] mb-1"><span className="font-medium text-gray-700">{item.name}</span><span className="text-gray-500 tabular-nums">{item.value} ({percentage}%)</span></div>
                          <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full bg-green-500 transition-all duration-500 ease-out" style={{ width: `${Math.min(percentage, 100)}%` }} /></div>
                        </div>
                      );
                    })}
                  </div>
                ) : <EmptyState icon={Wallet} message="Belum ada data e-wallet." />}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* TAB: PLATFORM */}
      {activeTab === 'platform' && (
        <div className="space-y-4 animate-in slide-in-from-bottom-2 fade-in duration-300">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="shadow-sm border-gray-200">
              <CardHeader className="bg-gray-50/50 border-b border-gray-100 p-4"><CardTitle className="text-sm flex items-center gap-1.5"><Target className="w-4 h-4 text-red-500" /> Lead Quality Funnel</CardTitle></CardHeader>
              <CardContent className="p-4 pt-5">
                <div className="space-y-4 relative before:absolute before:inset-0 before:ml-4 md:before:mx-auto before:h-full before:w-px before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
                  <div className="relative flex items-center group is-active text-sm">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-bold shadow shrink-0 z-10 md:absolute md:left-[50%] md:-ml-4">1</div>
                    <div className="w-[calc(100%-3rem)] ml-3 md:w-[calc(50%-1.5rem)] md:ml-0 p-3 rounded-lg border border-slate-200 bg-white">
                      <h4 className="font-semibold text-xs text-slate-900 mb-1">Spam vs Genuine</h4>
                      <div className="text-[11px] text-slate-500 flex justify-between"><span className="text-red-500 font-medium">{analytics.spamSubs} Tertolak</span><span className="text-emerald-600 font-medium">{analytics.genuineSubs} Lolos</span></div>
                    </div>
                  </div>
                  <div className="relative flex items-center group is-active text-sm md:flex-row-reverse">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 font-bold shadow shrink-0 z-10 md:absolute md:left-[50%] md:-ml-4">2</div>
                    <div className="w-[calc(100%-3rem)] ml-3 md:w-[calc(50%-1.5rem)] md:ml-0 md:mr-0 p-3 rounded-lg border border-blue-100 bg-blue-50/30">
                      <h4 className="font-semibold text-xs text-blue-900 mb-1">Conversion (Approvals)</h4>
                      <div className="text-[11px] text-blue-800 flex justify-between"><span className="text-orange-500">{analytics.unpaidApprovals} Drop</span><span className="font-bold text-emerald-700">{analytics.paidApprovals} Paid</span></div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className="space-y-4">
              <Card className="shadow-sm border-gray-200">
                <CardHeader className="pb-0 p-4"><CardTitle className="text-sm flex items-center gap-1.5"><ShieldAlert className="w-4 h-4 text-orange-500" /> Screening Drop-off</CardTitle></CardHeader>
                <CardContent className="p-4 pt-3">
                  {analytics.totalRespondents > 0 ? (
                    <>
                      <div className="flex justify-between mb-3 text-sm">
                        <span className="font-bold text-xl">{analytics.totalRespondents > 0 ? Math.round((analytics.disqualifiedRespondents / analytics.totalRespondents) * 100) : 0}%</span>
                        <span className="text-gray-500 text-xs text-right text-orange-600 font-medium">{analytics.disqualifiedRespondents} dari {analytics.totalRespondents}<br/>Gagal Lolos</span>
                      </div>
                      <div className="h-2 w-full bg-emerald-100 rounded-full overflow-hidden flex">
                        <div className="h-full bg-emerald-500" style={{ width: `${(analytics.completedRespondents / (analytics.totalRespondents || 1)) * 100}%` }} />
                        <div className="h-full bg-orange-400" style={{ width: `${(analytics.disqualifiedRespondents / (analytics.totalRespondents || 1)) * 100}%` }} />
                      </div>
                    </>
                  ) : <EmptyState icon={ShieldAlert} message="Belum ada data responden." />}
                </CardContent>
              </Card>
              <Card className="shadow-sm bg-slate-900 text-white">
                <CardContent className="p-4">
                  <p className="text-[10px] text-indigo-300 uppercase tracking-widest mb-1">Global CTR</p>
                  <p className="text-2xl font-bold">{analytics.globalConversionRate}%</p>
                  <p className="text-[10px] text-slate-400 mt-1">Rata-rata global untuk setiap {analytics.totalViews.toLocaleString()} views iklan menghasilkan penyelesaian valid.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* TAB: CAMPAIGN */}
      {activeTab === 'campaign' && (
        <div className="space-y-4 animate-in slide-in-from-bottom-2 fade-in duration-300">
          <div className="grid grid-cols-1 gap-4">
            <Card className="shadow-sm border-blue-100 bg-blue-50/30">
              <CardHeader className="pb-0 p-4"><CardTitle className="text-sm flex items-center gap-1.5"><TrendingUp className="w-4 h-4 text-blue-500" /> Total Clicks</CardTitle></CardHeader>
              <CardContent className="p-4 pt-2 flex flex-col justify-center">
                <p className="text-3xl font-bold text-blue-900 leading-none">{analytics.totalCampaignClicks}</p>
                <p className="text-[10px] text-blue-600 mt-2">Total klik dari semua tracking link redirector landing page.</p>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-sm border-gray-200">
            <CardHeader className="pb-0 p-4">
              <div className="flex flex-row justify-between items-center w-full">
                <CardTitle className="text-sm flex items-center gap-1.5 m-0"><List className="w-4 h-4 text-indigo-500" /> Manajemen Link Campaign</CardTitle>
                <Dialog open={isLinkModalOpen} onOpenChange={setIsLinkModalOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="h-8 gap-1.5 text-xs bg-purple-600 hover:bg-purple-700 m-0">
                      <Plus className="w-3.5 h-3.5" /> Buat Link Baru
                    </Button>
                  </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Buat Tracking Link Baru</DialogTitle>
                    <DialogDescription>Buat link pendek untuk campaign dan simpan ke daftar manajemen.</DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-3 py-4">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-700">Source Name</label>
                      <input type="text" placeholder="Nama sumber unik (cth: instagram-bio)" className="w-full text-sm rounded-md border border-gray-300 p-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium text-gray-700" value={linkSource} onChange={(e) => setLinkSource(e.target.value.replace(/\s+/g, '-').toLowerCase())} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-700">Catatan (opsional)</label>
                      <input type="text" placeholder="cth: Promo Mei 2024" className="w-full text-sm rounded-md border border-gray-300 p-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-gray-600" value={linkDescription} onChange={(e) => setLinkDescription(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleGenerateLink()} />
                    </div>
                    {generatedLink && (
                      <div className="p-3 bg-purple-50 border border-purple-100 rounded-lg flex items-center justify-between gap-3 animate-in fade-in zoom-in-95 mt-2">
                        <a href={generatedLink} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-purple-800 hover:underline truncate">{generatedLink}</a>
                        <button onClick={() => handleCopyLink(generatedLink)} className="p-1.5 bg-white text-purple-600 hover:bg-purple-600 hover:text-white rounded transition-colors shrink-0 border border-purple-200 shadow-sm" title="Copy link"><Copy className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsLinkModalOpen(false)}>Batal</Button>
                    <Button onClick={handleGenerateLink} disabled={isGenerating || !linkSource.trim()} className="bg-purple-600 hover:bg-purple-700 text-white">
                      {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />} Simpan & Generate
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <div className="rounded-md border mt-2">
                <Table>
                  <TableHeader className="bg-gray-50/50">
                    <TableRow>
                      <TableHead className="w-[180px]">Source Name</TableHead>
                      <TableHead>Catatan</TableHead>
                      <TableHead className="text-right">Total Klik</TableHead>
                      <TableHead className="text-center w-[120px]">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaignLinks.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-24 text-center text-gray-500">Belum ada link yang dikelola.</TableCell>
                      </TableRow>
                    ) : (
                      campaignLinks.map((link: any) => (
                        <TableRow key={link.id}>
                          <TableCell className="font-medium text-blue-700">{link.source_name}</TableCell>
                          <TableCell className="text-gray-500 text-xs">{link.description || '-'}</TableCell>
                          <TableCell className="text-right font-semibold">{link.click_count || 0}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => handleCopyLink(`${window.location.origin}/c/${link.source_name}`)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded" title="Copy Link"><Copy className="w-3.5 h-3.5" /></button>
                              <button onClick={() => handleDeleteLink(link.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Hapus"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-gray-200">
            <CardHeader className="pb-0 p-4"><CardTitle className="text-sm flex items-center gap-1.5"><ExternalLink className="w-4 h-4 text-emerald-500" /> Performa per Sumber Acuan (Semua Klik)</CardTitle></CardHeader>
            <CardContent className="p-4 pt-2">
              {analytics.campaignStats.length > 0 ? (
                <div className="h-[280px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.campaignStats} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                      <XAxis dataKey="name" stroke="#9ca3af" fontSize={11} tickMargin={10} angle={-20} textAnchor="end" height={50} />
                      <YAxis stroke="#9ca3af" fontSize={11} allowDecimals={false} />
                      <RechartsTooltip cursor={{ fill: '#f3f4f6' }} contentStyle={{ fontSize: '11px', borderRadius: '6px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Bar dataKey="clicks" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[240px] flex items-center justify-center text-gray-400 text-sm bg-gray-50 rounded-lg mt-2 border border-dashed border-gray-200">
                  <div className="text-center"><Megaphone className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p>Belum ada data klik. Buat dan bagikan link di atas!</p></div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
  };

  return (
    <div className="pb-10 relative">
      {/* Fixed Header Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 flex flex-col gap-4 shrink-0 sticky top-0 z-30 shadow-[0_4px_20px_rgb(0,0,0,0.05)] mb-4 -mx-4 sm:mx-0">
        {/* Top Row */}
        <div className="flex flex-row items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-600">Periode</span>
            <Select value={dateRange} onValueChange={(value) => setDateRange(value as DateRange)}>
              <SelectTrigger className="w-[140px] h-9 bg-gray-50/80 border-gray-200/50 text-sm font-medium focus:ring-0 focus:ring-offset-0">
                <SelectValue placeholder="Pilih Periode" />
              </SelectTrigger>
              <SelectContent>
                {DATE_RANGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Button
            onClick={fetchAllData}
            variant="outline"
            size="sm"
            disabled={loading}
            className="h-9 w-9 p-0 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 border-gray-200"
            title="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="h-px bg-gray-100 w-full" />

        {/* Bottom Row */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-100/80 p-1 w-fit rounded-lg border border-slate-200/50">
          {([{ key: 'revenue' as TabKey, label: 'Revenue', icon: DollarSign }, { key: 'respondent' as TabKey, label: 'Respondents', icon: Users }, { key: 'platform' as TabKey, label: 'Platform', icon: TrendingUp }, { key: 'campaign' as TabKey, label: 'Campaign', icon: Megaphone }]).map((t) => (
            <button key={t.key} onClick={() => handleTabChange(t.key)} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === t.key ? 'bg-white text-blue-600 shadow-sm ring-1 ring-slate-900/5' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'}`}>
              <t.icon className="w-4 h-4" />{t.label}
            </button>
          ))}
        </div>
      </div>
      
      {renderContent()}
    </div>
  );
}
