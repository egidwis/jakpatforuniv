import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../utils/supabase';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Loader2, Users, School, Share2, TrendingUp, DollarSign, Wallet, Clock, ShieldAlert, Target, Award, BookOpen, Link, Mail, Filter, Megaphone, Copy, ExternalLink, Calendar, RefreshCw, Activity, AlertCircle, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, AreaChart, Area, Line } from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
const DATE_RANGE_OPTIONS = [
  { label: '7 Hari', value: '7d' },
  { label: '30 Hari', value: '30d' },
  { label: '90 Hari', value: '90d' },
  { label: 'Semua', value: 'all' },
] as const;
type DateRange = typeof DATE_RANGE_OPTIONS[number]['value'];
type TabKey = 'revenue' | 'respondent' | 'platform' | 'campaign';
const REVIEW_STATUSES = new Set(['spam','approved','in_review','rejected','published','drafted','slot_reserved','waiting_payment','paid','scheduled','live','completed']);

const formatIDR = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);
function getStartDate(range: DateRange): string | null {
  if (range === 'all') return null;
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const d = new Date(); d.setDate(d.getDate() - days); d.setHours(0,0,0,0); return d.toISOString();
}
function toWIBHourLabel(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false });
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
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [transactions, setTransactions] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [respondents, setRespondents] = useState<any[]>([]);
  const [surveyPages, setSurveyPages] = useState<any[]>([]);
  const [campaignClicks, setCampaignClicks] = useState<any[]>([]);

  const [linkSource, setLinkSource] = useState('instagram');
  const [generatedLink, setGeneratedLink] = useState('');
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
      const txQuery = supabase.from('transactions').select('*');
      const subQuery = supabase.from('form_submissions').select('id, university, department, status, submission_status, payment_status, referral_source, email, winner_count, prize_per_winner, criteria_responden, created_at');
      const respQuery = supabase.from('page_respondents').select('id, page_id, proof_url, ewallet_provider, created_at, jakpat_id');
      const pageQuery = supabase.from('survey_pages').select('id, views_count, submission_id');
      const clicksQuery = supabase.from('campaign_clicks').select('*');
      if (start) {
        txQuery.gte('created_at', start).lte('created_at', now);
        subQuery.gte('created_at', start).lte('created_at', now);
        respQuery.gte('created_at', start).lte('created_at', now);
        clicksQuery.gte('created_at', start).lte('created_at', now);
      }
      const [{ data: txData, error: txErr }, { data: subData, error: subErr }, { data: respData, error: respErr }, { data: pageData, error: pageErr }, { data: clicksData, error: clicksErr }] = await Promise.all([txQuery, subQuery, respQuery, pageQuery, clicksQuery]);
      const firstError = txErr || subErr || respErr || pageErr || clicksErr;
      if (firstError) throw firstError;
      setTransactions(txData || []); setSubmissions(subData || []); setRespondents(respData || []); setSurveyPages(pageData || []); setCampaignClicks(clicksData || []);
    } catch (err: any) { console.error('Error fetching analytics data:', err); setError(err?.message || 'Terjadi kesalahan saat mengambil data.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAllData(); }, [dateRange]);

  const analytics = useMemo(() => {
    if (!submissions.length) return null;
    const completedTx = transactions.filter((t: any) => t.status === 'completed');
    const totalRevenue = completedTx.reduce((sum: number, t: any) => sum + t.amount, 0);
    const aov = completedTx.length > 0 ? Math.round(totalRevenue / completedTx.length) : 0;

    const revenueByUnivMap: Record<string, number> = {};
    completedTx.forEach((tx: any) => {
      const sub = submissions.find((s: any) => s.id === tx.form_submission_id);
      if (sub) { const univName = sub.university?.trim() || 'Tidak Diketahui'; revenueByUnivMap[univName] = (revenueByUnivMap[univName] || 0) + tx.amount; }
    });
    const topSpendersData = Object.entries(revenueByUnivMap).map(([name, Total]) => ({ name, Total })).sort((a: any, b: any) => b.Total - a.Total).slice(0, 5);

    const revenueByEmailMap: Record<string, { email: string; university: string; total: number; txCount: number }> = {};
    completedTx.forEach((tx: any) => {
      const sub = submissions.find((s: any) => s.id === tx.form_submission_id);
      if (sub && sub.email) { const email = sub.email.trim().toLowerCase(); if (!revenueByEmailMap[email]) revenueByEmailMap[email] = { email, university: sub.university?.trim() || '-', total: 0, txCount: 0 }; revenueByEmailMap[email].total += tx.amount; revenueByEmailMap[email].txCount += 1; }
    });
    const topSpendersByEmail = Object.values(revenueByEmailMap).sort((a: any, b: any) => b.total - a.total).slice(0, 5);

    const catMap: Record<string, number> = {};
    completedTx.forEach((t: any) => {
      try { if (t.note?.startsWith('{')) { const parsed = JSON.parse(t.note); if (parsed.items && Array.isArray(parsed.items)) { parsed.items.forEach((item: any) => { const cat = item.category || 'Lainnya'; const price = (item.price || 0) * (item.qty || 1); catMap[cat] = (catMap[cat] || 0) + price; }); return; } } catMap['Lainnya'] = (catMap['Lainnya'] || 0) + t.amount; } catch (e) { catMap['Lainnya'] = (catMap['Lainnya'] || 0) + t.amount; }
    });
    const revenueCategories = Object.entries(catMap).map(([name, value]) => ({ name, value }));

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
    const dailyRevenueMap: Record<string, number> = {}; const dailyRespondentMap: Record<string, number> = {};
    for (let i = daysToInit - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const key = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }); dailyRevenueMap[key] = 0; dailyRespondentMap[key] = 0; }
    completedTx.forEach((tx: any) => { if (tx.created_at) { const key = new Date(tx.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }); if (dailyRevenueMap[key] !== undefined) dailyRevenueMap[key] += tx.amount; } });
    respondents.forEach((r: any) => { if (r.created_at) { const key = new Date(r.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }); if (dailyRespondentMap[key] !== undefined) dailyRespondentMap[key] += 1; } });
    const dailyTrendData = Object.keys(dailyRevenueMap).map((date) => ({ date, Revenue: dailyRevenueMap[date], Respondents: dailyRespondentMap[date] || 0 }));

    const topBarchartUniv = topSpendersData[0]?.name || '-';
    const topWallet = ewalletData[0]?.name || '-';
    const peakHour = Object.entries(hourlyMap).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || '-';

    const campaignSourcesMap: Record<string, number> = {};
    campaignClicks.forEach((click: any) => { const src = click.source?.toLowerCase().trim() || 'unknown'; campaignSourcesMap[src] = (campaignSourcesMap[src] || 0) + 1; });
    const campaignStats = Object.entries(campaignSourcesMap).map(([name, clicks]) => ({ name, clicks })).sort((a: any, b: any) => b.clicks - a.clicks);
    const totalCampaignClicks = campaignClicks.length;

    return { totalRevenue, aov, topSpendersData, revenueCategories, ewalletData, hourlyData, uniqueRespondents, loyalRespondentsCount, retentionRate: retentionRate.toFixed(1), totalRespondents, completedRespondents, disqualifiedRespondents, totalSubs, spamSubs, genuineSubs, rawApprovalsCount: rawApprovals.length, paidApprovals, unpaidApprovals, totalViews, globalConversionRate, topDepartments, topReferrals, topStudentStatuses, topSpendersByEmail, topCriteriaKeywords, campaignStats, totalCampaignClicks, dailyTrendData, funFacts: { topBarchartUniv, topWallet, peakHour } };
  }, [transactions, submissions, respondents, surveyPages, campaignClicks, dateRange]);

  const handleGenerateLink = () => { const source = linkSource.trim() || 'organic'; setGeneratedLink(`${window.location.origin}/c/${source}`); };
  const handleCopyLink = () => { if (!generatedLink) return; navigator.clipboard.writeText(generatedLink); toast.success('Link berhasil disalin!'); };
  const handleTabChange = (tab: TabKey) => { setActiveTab(tab); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  if (loading) {
    return (
      <div className="space-y-4 pb-10 animate-in fade-in duration-300">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-lg p-3 shadow mb-2 h-20 animate-pulse" />
        <div className="flex items-center justify-between">
          <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
          <div className="h-8 w-64 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><SkeletonCard /><SkeletonCard /></div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4"><SkeletonChart /><SkeletonChart /></div>
        <SkeletonChart />
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
    <div className="space-y-4 animate-in fade-in duration-500 pb-10">
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

      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-md w-fit shadow-inner border border-gray-200">
          {DATE_RANGE_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => setDateRange(opt.value)} className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${dateRange === opt.value ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50'}`}>{opt.label}</button>
          ))}
        </div>
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-md w-fit shadow-inner border border-gray-200">
          {([{ key: 'revenue' as TabKey, label: 'Revenue', icon: DollarSign }, { key: 'respondent' as TabKey, label: 'Respondents', icon: Users }, { key: 'platform' as TabKey, label: 'Platform', icon: TrendingUp }, { key: 'campaign' as TabKey, label: 'Campaign', icon: Megaphone }]).map((t) => (
            <button key={t.key} onClick={() => handleTabChange(t.key)} className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${activeTab === t.key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50'}`}>
              <div className="flex items-center gap-1.5"><t.icon className="w-3.5 h-3.5" />{t.label}</div>
            </button>
          ))}
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
                    <p className="text-[10px] text-gray-400">Rata-rata transaksi</p>
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
              <CardDescription className="text-[10px] mt-0.5">Revenue &amp; Partisipasi harian</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              {analytics.dailyTrendData.some((d: any) => d.Revenue > 0 || d.Respondents > 0) ? (
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics.dailyTrendData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                      <defs><linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                      <XAxis dataKey="date" stroke="#9ca3af" fontSize={10} tickMargin={5} />
                      <YAxis yAxisId="left" tickFormatter={(v) => `${v / 1000000}M`} stroke="#9ca3af" fontSize={10} />
                      <YAxis yAxisId="right" orientation="right" stroke="#9ca3af" fontSize={10} allowDecimals={false} />
                      <RechartsTooltip formatter={(value: number, name: string) => name === 'Revenue' ? formatIDR(value) : `${value} responden`} contentStyle={{ fontSize: '11px', borderRadius: '6px' }} />
                      <Area yAxisId="left" type="monotone" dataKey="Revenue" stroke="#10b981" fillOpacity={1} fill="url(#colorRevenue)" strokeWidth={2} />
                      <Line yAxisId="right" type="monotone" dataKey="Respondents" stroke="#3b82f6" strokeWidth={2} dot={false} />
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
                <CardTitle className="text-sm flex items-center gap-1.5"><Share2 className="w-4 h-4 text-purple-500" /> Revenue Flow</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-2 flex justify-center items-center">
                {analytics.revenueCategories.length > 0 ? (
                  <div className="h-[260px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={analytics.revenueCategories} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">{analytics.revenueCategories.map((_: any, index: number) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Pie>
                        <RechartsTooltip formatter={(v: number) => formatIDR(v)} contentStyle={{ fontSize: '11px', borderRadius: '6px' }} />
                        <Legend verticalAlign="bottom" height={24} iconSize={8} wrapperStyle={{ fontSize: '10px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : <EmptyState icon={Share2} message="Belum ada data kategori revenue." />}
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
                        <Legend wrapperStyle={{ fontSize: '10px' }} iconSize={8} />
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

            <Card className="shadow-sm border-gray-200">
              <CardHeader className="pb-0 p-4">
                <CardTitle className="text-sm flex items-center gap-1.5"><Mail className="w-4 h-4 text-amber-500" /> Top Individual Spenders</CardTitle>
                <CardDescription className="text-[10px] mt-0.5">Total pembelanjaan tertinggi per Email</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                {analytics.topSpendersByEmail.length > 0 ? (
                  <div className="h-[260px] w-full mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.topSpendersByEmail.slice(0,5).map((d: any) => ({ name: d.email.split('@')[0].length > 12 ? d.email.split('@')[0].slice(0,12) + '…' : d.email.split('@')[0], Total: d.total, fullEmail: d.email, orders: d.txCount }))} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f3f4f6" />
                        <XAxis type="number" tickFormatter={(v) => `${v / 1000000}M`} stroke="#9ca3af" fontSize={10} />
                        <YAxis dataKey="name" type="category" width={90} stroke="#9ca3af" fontSize={10} tick={{ fill: '#4b5563' }} />
                        <RechartsTooltip formatter={(v: number) => formatIDR(v)} labelFormatter={(_, payload: any) => { const p = payload?.[0]?.payload; return p ? `${p.fullEmail} - ${p.orders}x order` : ''; }} cursor={{ fill: '#f3f4f6' }} contentStyle={{ fontSize: '11px', borderRadius: '6px' }} />
                        <Bar dataKey="Total" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <EmptyState icon={Mail} message="Belum ada data individual spender." />}
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
                <div className="h-[280px] w-full mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.topCriteriaKeywords} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f3f4f6" />
                      <XAxis type="number" stroke="#9ca3af" fontSize={10} allowDecimals={false} />
                      <YAxis dataKey="name" type="category" width={150} stroke="#9ca3af" fontSize={10} tick={{ fill: '#4b5563' }} />
                      <RechartsTooltip formatter={(v: number) => `${v} submissions`} cursor={{ fill: '#f3f4f6' }} contentStyle={{ fontSize: '11px', borderRadius: '6px' }} />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={18}>{analytics.topCriteriaKeywords.map((_: any, index: number) => <Cell key={`crit-${index}`} fill={COLORS[(index + 4) % COLORS.length]} />)}</Bar>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="shadow-sm bg-blue-50/50"><CardContent className="p-4"><p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Unique Respondents</p><p className="text-2xl font-bold text-blue-950">{analytics.uniqueRespondents}</p></CardContent></Card>
            <Card className="shadow-sm bg-purple-50/50 border-purple-100"><CardContent className="p-4"><p className="text-[10px] font-semibold text-purple-700 uppercase tracking-widest">Loyal Respondents</p><p className="text-2xl font-bold text-purple-950">{analytics.loyalRespondentsCount} <span className="text-sm font-medium text-purple-700">users</span></p><p className="text-[10px] text-purple-600 mt-0.5">Mengikuti {'>'} 1 survei berbeda ({analytics.retentionRate}%)</p></CardContent></Card>
            <Card className="shadow-sm bg-emerald-50/50"><CardContent className="p-4"><p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Total Partisipasi</p><p className="text-2xl font-bold text-emerald-950">{analytics.totalRespondents}</p><p className="text-[10px] text-gray-500 mt-0.5">{analytics.completedRespondents} berhasil lolos screening</p></CardContent></Card>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="shadow-sm border-gray-200">
              <CardHeader className="pb-0 p-4"><CardTitle className="text-sm flex items-center gap-1.5"><Clock className="w-4 h-4 text-indigo-500" /> Peak Trafik (WIB)</CardTitle></CardHeader>
              <CardContent className="p-4 pt-2">
                {analytics.hourlyData.some((d: any) => d.Responden > 0) ? (
                  <div className="h-[260px] w-full mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.hourlyData} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis dataKey="hour" stroke="#9ca3af" fontSize={9} tickMargin={5} interval={2} />
                        <YAxis stroke="#9ca3af" fontSize={9} allowDecimals={false} />
                        <RechartsTooltip cursor={{ fill: '#f3f4f6' }} contentStyle={{ fontSize: '11px', borderRadius: '6px' }} />
                        <Bar dataKey="Responden" fill="#6366f1" radius={[3, 3, 0, 0]} />
                      </BarChart>
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="shadow-sm border-blue-100 bg-blue-50/30">
              <CardHeader className="pb-0 p-4"><CardTitle className="text-sm flex items-center gap-1.5"><TrendingUp className="w-4 h-4 text-blue-500" /> Total Clicks</CardTitle></CardHeader>
              <CardContent className="p-4 pt-2 flex flex-col justify-center">
                <p className="text-3xl font-bold text-blue-900 leading-none">{analytics.totalCampaignClicks}</p>
                <p className="text-[10px] text-blue-600 mt-2">Total klik dari semua tracking link redirector landing page.</p>
              </CardContent>
            </Card>
            <Card className="col-span-1 lg:col-span-2 shadow-sm border-gray-200">
              <CardHeader className="pb-0 p-4">
                <CardTitle className="text-sm flex items-center gap-1.5"><Link className="w-4 h-4 text-purple-500" /> Generate Tracking Link</CardTitle>
                <CardDescription className="text-xs mt-0.5 text-gray-500">Buat link pendek untuk dibagikan ke sosmed/email yang akan tercatat sebelum otomatis redirect ke Landing Page.</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-3 space-y-3">
                <div className="flex items-center gap-2">
                  <input type="text" placeholder="Nama sumber (cth: instagram-bio)" className="flex-1 text-sm rounded-md border border-gray-300 p-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium text-gray-700" value={linkSource} onChange={(e) => setLinkSource(e.target.value.replace(/\s+/g, '-').toLowerCase())} onKeyDown={(e) => e.key === 'Enter' && handleGenerateLink()} />
                  <button onClick={handleGenerateLink} className="bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-2 rounded-md font-medium transition-colors">Generate</button>
                </div>
                {generatedLink && (
                  <div className="p-3 bg-purple-50 border border-purple-100 rounded-lg flex items-center justify-between gap-3 animate-in fade-in zoom-in-95">
                    <a href={generatedLink} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-purple-800 hover:underline truncate">{generatedLink}</a>
                    <button onClick={handleCopyLink} className="p-1.5 bg-white text-purple-600 hover:bg-purple-600 hover:text-white rounded transition-colors shrink-0 border border-purple-200 shadow-sm" title="Copy link"><Copy className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          <Card className="shadow-sm border-gray-200">
            <CardHeader className="pb-0 p-4"><CardTitle className="text-sm flex items-center gap-1.5"><ExternalLink className="w-4 h-4 text-emerald-500" /> Performa per Sumber Acuan (Source)</CardTitle></CardHeader>
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
}
