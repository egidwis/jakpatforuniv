import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../utils/supabase';
import { formatIDR } from '@/utils/currency';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "./ui/button";
import { Users, DollarSign, Megaphone, Copy, RefreshCw, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { fetchRevenueData } from '../utils/analytics/fetchRevenueData';
import { buildRevenueAnalytics, UNRECORDED_CHANNEL } from '../utils/analytics/revenue';
import { fetchRespondentData } from '../utils/analytics/fetchRespondentData';
import { buildRespondentAnalytics, formatDuration, UNRECORDED_EWALLET } from '../utils/analytics/respondent';
import { fetchCampaignData } from '../utils/analytics/fetchCampaignData';
import { buildCampaignAnalytics } from '../utils/analytics/campaign';
import type {
  CampaignAnalytics,
  DateRange as RangeValue,
  RankedRow,
  RespondentAnalytics,
  RevenueAnalytics,
} from '../utils/analytics/types';
import { DateRangePicker } from './analytics/DateRangePicker';
import { DailyRevenueChart } from './analytics/DailyRevenueChart';
import { DailyRespondentsChart } from './analytics/DailyRespondentsChart';
import { DailyClicksChart } from './analytics/DailyClicksChart';
import { TimePatternCard } from './analytics/TimePatternCard';
import { StatTile } from './analytics/StatTile';
import { MeterCard } from './analytics/MeterCard';
import { RankedBarList } from './analytics/RankedBarList';
import { RankedTabsCard } from './analytics/RankedTabsCard';
import { SegmentCard } from './analytics/SegmentCard';
import { TogglePicker } from './analytics/TogglePicker';
import { VoucherCatalogCard } from './analytics/VoucherCatalogCard';
import { formatCount, formatDecimal, formatIDRCompact, formatPercent } from './analytics/format';
import { CHART, INK } from './analytics/palette';
import { nowWib } from '../utils/airing-window';

/**
 * Tab yang tersedia.
 *
 * `platform` DIHAPUS 2026-08-24. Ketiga kartunya mengukur hal yang datanya memang
 * tidak ada: "Lolos" menyaring `submission_status = 'published'` — nilai yang tidak
 * pernah ada di database, jadi angkanya kurang ~300 dari 995 order; Screening
 * Drop-off memakai `proof_url`, yang kurvanya adalah RILIS FITUR (0% Maret → 86,2%
 * Agustus), bukan hasil screening; dan Global CTR memakai `views_count`, penghitung
 * kumulatif seumur hidup yang mustahil dipotong per rentang. Satu-satunya angka
 * uniknya — jumlah spam — pindah ke kartu Konversi di tab Revenue.
 *
 * `?tab=platform` yang tersimpan di bookmark jatuh ke `revenue` lewat penjaga di
 * `TAB_KEYS` di bawah, bukan ke layar kosong.
 */
type TabKey = 'revenue' | 'respondent' | 'campaign';
const TAB_KEYS: TabKey[] = ['revenue', 'respondent', 'campaign'];

/**
 * Rentang bawaan tab Revenue: 7 hari kalender WIB yang berakhir hari ini.
 *
 * `to` EKSKLUSIF — 00:00 WIB hari BERIKUTNYA. Itu yang menutup off-by-one lama:
 * dulu window fetch mulai 8 hari lalu sementara sumbu chart dibangun 7 hari, jadi
 * revenue di hari paling awal masuk KPI tanpa punya batang.
 */
function wibMidnight(ymd: string, dayOffset = 0): Date {
  return new Date(new Date(`${ymd}T00:00:00.000Z`).getTime() - 7 * 3600_000 + dayOffset * 86_400_000);
}
function defaultRange(days = 7): RangeValue {
  const ymd = nowWib().ymd;
  return { from: wibMidnight(ymd, -(days - 1)), to: wibMidnight(ymd, 1) };
}
const YMD = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
function rangeToParam(r: RangeValue): string {
  // `to` disimpan sebagai tanggal INKLUSIF supaya URL-nya terbaca manusia.
  return `${YMD(r.from)}_${YMD(new Date(r.to.getTime() - 1))}`;
}
function rangeFromParam(raw: string | null): RangeValue | null {
  const m = raw?.match(/^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/);
  if (!m) return null;
  const from = wibMidnight(m[1]);
  const to = wibMidnight(m[2], 1);
  return to > from ? { from, to } : null;
}
function formatRangeLabel(r: RangeValue): string {
  const f = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short' });
  const last = new Date(r.to.getTime() - 1);
  const year = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', year: 'numeric' }).format(last);
  return `${f.format(r.from)} – ${f.format(last)} ${year}`;
}
/** Bucket loyalitas yang dihitung sebagai "responden setia". Label berasal dari sql/67. */
const LOYAL_BUCKET_NAMES = new Set(['10-24 survei', '25+ survei']);

/**
 * Nama baris dengan nilai terbesar — untuk `emphasizedName` pada deret ORDINAL.
 *
 * `RankedBarList` menyorot baris PERTAMA secara bawaan. Itu benar untuk daftar
 * yang sudah terurut menurun, tapi salah untuk bucket ordinal seperti "< 1 mnt …
 * > 10 mnt": barisnya sengaja tidak diurutkan menurut nilai, jadi baris pertama
 * cuma "ember paling kiri", bukan temuannya. Yang layak disorot adalah moda
 * distribusinya.
 */
function modalRowName(rows: RankedRow[]): string | undefined {
  if (rows.length === 0) return undefined;
  return rows.reduce((top, row) => (row.value > top.value ? row : top), rows[0]).name;
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
  return <div className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">{children || <><div className="h-3 w-24 bg-gray-200 rounded mb-3" /><div className="h-8 w-32 bg-gray-200 rounded" /></>}</div>;
}
function SkeletonChart() {
  return <div className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse"><div className="h-4 w-32 bg-gray-200 rounded mb-4" /><div className="h-[260px] bg-gray-100 rounded" /></div>;
}

export function AnalyticsDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as TabKey | null;
  const [activeTab, setActiveTab] = useState<TabKey>(tabFromUrl && TAB_KEYS.includes(tabFromUrl) ? tabFromUrl : 'revenue');
  const [range, setRange] = useState<RangeValue>(() => rangeFromParam(searchParams.get('range')) ?? defaultRange());

  /** Data tab Revenue. Terpisah dari `analytics` lama, yang kini hanya melayani tab lain. */
  const [revenueData, setRevenueData] = useState<Awaited<ReturnType<typeof fetchRevenueData>> | null>(null);
  const [revenueLoading, setRevenueLoading] = useState(true);
  const [revenueError, setRevenueError] = useState<string | null>(null);

  /** Data tab Responden. Satu RPC agregasi — lihat `fetchRespondentData`. */
  const [respondentData, setRespondentData] = useState<Awaited<ReturnType<typeof fetchRespondentData>> | null>(null);
  const [respondentLoading, setRespondentLoading] = useState(true);
  const [respondentError, setRespondentError] = useState<string | null>(null);

  /** Data tab Campaign. Klik + link; sisi voucher menumpang `revenueData`. */
  const [campaignData, setCampaignData] = useState<Awaited<ReturnType<typeof fetchCampaignData>> | null>(null);
  const [campaignLoading, setCampaignLoading] = useState(true);
  const [campaignError, setCampaignError] = useState<string | null>(null);

  /**
   * Salinan `campaign_links` yang bisa diubah tabel manajemen.
   *
   * Sengaja state tersendiri, bukan membaca `campaignData.links` langsung: membuat
   * dan menghapus link mengubah daftarnya seketika, dan memaksa refetch seluruh
   * dataset untuk satu baris berarti layar berkedip pada tiap aksi.
   */
  const [campaignLinks, setCampaignLinks] = useState<any[]>([]);

  /** Sakelar kartu voucher: peringkat menurut revenue, atau menurut pemakaian. */
  const [voucherMetric, setVoucherMetric] = useState<'revenue' | 'orders'>('revenue');

  const [linkSource, setLinkSource] = useState('instagram');
  const [linkDescription, setLinkDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    let dirty = false;
    if (activeTab !== searchParams.get('tab')) { next.set('tab', activeTab); dirty = true; }
    const rangeParam = rangeToParam(range);
    if (rangeParam !== searchParams.get('range')) { next.set('range', rangeParam); dirty = true; }
    // Rentangnya ikut di URL supaya layar yang sedang dilihat bisa dibagikan apa adanya.
    if (dirty) setSearchParams(next, { replace: true });
  }, [activeTab, range]);

  /**
   * Tab Revenue TIDAK menyentuh `page_respondents`.
   *
   * Dulu satu `fetchAllData()` menarik keempat tabel tiap kali periode berubah,
   * termasuk 120.546 baris responden (121 round-trip di mode "Semua") yang tab
   * ini tidak pernah pakai. Itu sebab teks loading "beberapa detik".
   */
  const loadRevenue = async (target: RangeValue) => {
    try {
      // Refetch menahan render sebelumnya (opacity turun), bukan kembali ke skeleton.
      setRevenueLoading(true); setRevenueError(null);
      setRevenueData(await fetchRevenueData(target));
    } catch (err: any) {
      console.error('Error fetching revenue data:', err);
      setRevenueError(err?.message || 'Terjadi kesalahan saat mengambil data revenue.');
    } finally { setRevenueLoading(false); }
  };

  useEffect(() => { loadRevenue(range); }, [range.from.getTime(), range.to.getTime()]);

  /**
   * Tab Responden juga TIDAK menyentuh `page_respondents` mentah lagi.
   *
   * Sebelumnya ia ikut `fetchAllData()`, yang memaginasi 122.929 baris — 26
   * round-trip untuk 30 hari, 123 untuk "Semua waktu". Sekarang satu POST ke
   * `get_respondent_analytics` (lihat sql/67) plus satu GET ringan ke
   * `form_submissions` untuk kartu Permintaan Customer.
   */
  const loadRespondents = async (target: RangeValue) => {
    try {
      setRespondentLoading(true); setRespondentError(null);
      setRespondentData(await fetchRespondentData(target));
    } catch (err: any) {
      console.error('Error fetching respondent data:', err);
      setRespondentError(err?.message || 'Terjadi kesalahan saat mengambil data responden.');
    } finally { setRespondentLoading(false); }
  };

  // Baru menarik data saat tabnya benar-benar dibuka; selama user bertahan di
  // Revenue, RPC ini tidak pernah dipanggil sama sekali.
  const onRespondentTab = activeTab === 'respondent';
  useEffect(() => {
    if (!onRespondentTab) return;
    loadRespondents(range);
  }, [onRespondentTab, range.from.getTime(), range.to.getTime()]);

  /**
   * Tab Campaign menumpang data tab Revenue untuk sisi vouchernya.
   *
   * `voucher_code` sudah ikut di `SUB_COLUMNS` milik `fetchRevenueData`, dan
   * `submissionsById` sudah dijamin menutupi setiap transaksi. Menariknya ulang
   * berarti dua sumber untuk satu angka — dan dua sumber selalu berakhir dengan
   * dua jawaban yang berbeda.
   */
  const loadCampaign = async (target: RangeValue) => {
    try {
      setCampaignLoading(true); setCampaignError(null);
      const data = await fetchCampaignData(target);
      setCampaignData(data);
      setCampaignLinks(data.links);
    } catch (err: any) {
      console.error('Error fetching campaign data:', err);
      setCampaignError(err?.message || 'Terjadi kesalahan saat mengambil data campaign.');
    } finally { setCampaignLoading(false); }
  };

  const onCampaignTab = activeTab === 'campaign';
  useEffect(() => {
    if (!onCampaignTab) return;
    loadCampaign(range);
  }, [onCampaignTab, range.from.getTime(), range.to.getTime()]);

  /**
   * Angka tab Revenue. Semua koreksi (status 'paid', normalisasi universitas,
   * transaksi uji, bucket WIB, hari parsial) hidup di `buildRevenueAnalytics`,
   * yang murni dan teruji — komponen di bawah tidak menghitung apa pun sendiri.
   */
  const revenue: RevenueAnalytics | null = useMemo(() => {
    if (!revenueData) return null;
    return buildRevenueAnalytics({
      range,
      transactions: revenueData.transactions,
      previousTransactions: revenueData.previousTransactions,
      submissionsInRange: revenueData.submissionsInRange,
      submissionsById: revenueData.submissionsById,
      firstPaidAtByCustomer: revenueData.firstPaidAtByCustomer,
    });
  }, [revenueData, range]);

  /**
   * Porsi revenue yang channel pembayarannya tidak tercatat, 0–1.
   *
   * Pencatatan `payment_channel` baru dimulai Juli 2026 — sebelum itu NULL semua
   * (Jan–Apr 100%, Mei 98,1%, Jun 76,9%, lalu Jul 1,6%). Pada rentang panjang seperti
   * "Semua waktu", baris "Tidak tercatat" jadi yang TERBESAR di kartu Metode
   * Pembayaran, dan tanpa keterangan ia terbaca seolah ada channel bernama itu yang
   * mendominasi. Footnote cakupannya dimunculkan hanya kalau porsinya memang berarti,
   * supaya di rentang pendek — tempat datanya sudah bersih — kartunya tidak berisik.
   */
  const unrecordedChannelShare = useMemo(
    () => revenue?.byPaymentChannel.find((row) => row.name === UNRECORDED_CHANNEL)?.share ?? 0,
    [revenue],
  );

  /**
   * Angka tab Responden. Semua koreksi (normalisasi `jakpat_id`, loyalitas
   * seumur hidup, cakupan `loi_seconds`) hidup di RPC + `buildRespondentAnalytics`,
   * yang murni dan teruji — komponen di bawah tidak menghitung apa pun sendiri.
   */
  const respondent: RespondentAnalytics | null = useMemo(() => {
    if (!respondentData) return null;
    return buildRespondentAnalytics({
      range,
      payload: respondentData.payload,
      submissions: respondentData.submissions,
    });
  }, [respondentData, range]);

  /**
   * Porsi responden aktif yang seumur hidup sudah mengerjakan 10+ survei, 0–1.
   *
   * Dicocokkan lewat NAMA bucket, bukan posisi: kalau suatu saat sql/67 menambah
   * atau memecah ember, mencocokkan indeks akan diam-diam menunjuk ember yang
   * salah, sedangkan nama yang tidak cocok hanya membuat angkanya nol dan
   * footnote-nya jatuh ke kalimat cadangan.
   */
  const loyalRespondentShare = useMemo(() => {
    if (!respondent) return 0;
    return respondent.loyalty
      .filter((row) => LOYAL_BUCKET_NAMES.has(row.name))
      .reduce((sum, row) => sum + row.share, 0);
  }, [respondent]);

  /**
   * Angka tab Campaign.
   *
   * Voucher datang dari `revenueData` (transaksi yang SUDAH lewat saringan lunas &
   * uji internal — lihat catatan di `campaign.ts`), klik dari `campaignData`. Kalau
   * salah satunya belum tiba, kartunya menunggu; keduanya dipicu oleh `range` yang
   * sama, jadi mereka tidak bisa menceritakan periode yang berbeda.
   */
  const campaign: CampaignAnalytics | null = useMemo(() => {
    if (!campaignData || !revenueData) return null;
    return buildCampaignAnalytics({
      range,
      transactions: revenueData.transactions,
      previousTransactions: revenueData.previousTransactions,
      submissionsById: revenueData.submissionsById,
      submissionsInRange: revenueData.submissionsInRange,
      previousSubmissionsInRange: campaignData.previousSubmissions,
      clicks: campaignData.clicks,
      previousClicks: campaignData.previousClicks,
      links: campaignData.links,
    });
  }, [campaignData, revenueData, range]);

  /** Pemakaian per kode di rentang ini — dipakai Katalog Voucher. Peta, bukan daftar. */
  const voucherUsageByCode = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of campaign?.voucher.byOrders ?? []) map.set(row.name, row.value);
    return map;
  }, [campaign]);

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
    return (
      <div className="space-y-4 animate-in fade-in duration-500">

        {/* TAB: REVENUE */}
        {activeTab === 'revenue' && (
          <div className="space-y-4 animate-in slide-in-from-bottom-2 fade-in duration-300">
            {revenueError ? (
              <ErrorState message={revenueError} onRetry={() => loadRevenue(range)} />
            ) : !revenue ? (
              <div className="grid gap-4 lg:grid-cols-3">
                <SkeletonChart /><SkeletonCard /><SkeletonCard />
              </div>
            ) : (
              /* `isRefetching` menahan render sebelumnya pada opacity turun; kembali ke
                 skeleton tiap ganti periode membuat layar melompat. */
              <div className={revenueLoading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
                <div
                  /* tanpa `grid-cols-1`: styles.css:766 mendefinisikannya dan dimuat setelah Tailwind, jadi ia mengalahkan SEMUA varian lg: — termasuk bentuk arbitrary-property. Container grid kosong memang sudah satu kolom. */
                  className="grid gap-4 lg:[grid-template-columns:2fr_1fr]"
                >
                  <DailyRevenueChart
                    data={revenue.daily}
                    rangeLabel={formatRangeLabel(range)}
                  />
                  {/* Rail KPI: SATU kartu ber-divider, bukan tiga div telanjang di atas
                      latar halaman. `auto-rows-min` menahan tile agar tidak melar dan
                      meninggalkan ratusan piksel kosong di antara angkanya. */}
                  {/* `lg:self-start`: tanpa ini kartu rail diregangkan setinggi kartu
                      grafik di sebelahnya, menyisakan ±sepertiga tinggi kartu berupa
                      ruang kosong DI DALAM border — terbaca seperti gagal render.
                      Kolom kedua yang lebih pendek itu wajar; kartu berongga tidak. */}
                  <Card className="shadow-sm border-gray-200 [display:grid] grid-cols-2 auto-rows-min divide-gray-100 lg:[grid-template-columns:minmax(0,1fr)] lg:divide-y lg:self-start">
                    {/*
                      Angka revenue pindah ke sini dari kartu grafik. Alasannya bukan
                      ruang: semua angka periode kini terbaca dalam SATU kolom, dari
                      yang paling ringkas ke yang paling rinci, alih-alih satu angka
                      besar berdiri sendiri di kartu sebelah.

                      `col-span-2 lg:col-span-1`: di mobile rail-nya grid 2 kolom, dan
                      lima tile berarti tile terakhir menyisakan sel kosong. Revenue
                      dibuat selebar penuh — ia memang headline-nya, dan sekaligus
                      membuat sisanya kembali genap 2×2.
                    */}
                    <StatTile
                      hero
                      className="col-span-2 p-4 lg:col-span-1"
                      label="Revenue masuk"
                      value={formatIDR(revenue.totalRevenue.current)}
                      delta={revenue.totalRevenue}
                      comparisonLabel="vs periode sebelumnya"
                    />
                    <StatTile
                      className="p-4"
                      label="Order lunas"
                      value={`${revenue.paidOrders.current}`}
                      delta={revenue.paidOrders}
                      comparisonLabel="vs periode sebelumnya"
                    />
                    <StatTile
                      className="p-4"
                      label="Customer bayar"
                      value={`${revenue.payingCustomers.current}`}
                      delta={revenue.payingCustomers}
                      deltaMode="absolute"
                      deltaUnit="customer"
                      comparisonLabel="vs periode sebelumnya"
                    />
                    <StatTile
                      className="p-4"
                      label="AOV"
                      value={formatIDR(revenue.aov.current)}
                      delta={revenue.aov}
                      comparisonLabel="vs periode sebelumnya"
                      caption="per order lunas"
                    />
                    <StatTile
                      className="p-4"
                      label="PPN 11% terkumpul"
                      value={formatIDR(revenue.ppn.ppn)}
                      caption={`subtotal ${formatIDR(revenue.ppn.subtotal)}`}
                    />
                  </Card>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  <MeterCard
                    title="Konversi Order → Lunas"
                    value={revenue.conversion.rate}
                    centerCaption="order jadi bayar"
                    /* Jumlah spam-nya DISEBUT, bukan cuma diklaim dikecualikan:
                       "spam tidak dihitung" adalah pernyataan yang tidak bisa
                       diperiksa pembaca kalau angkanya tidak ada di mana pun. Ini
                       satu-satunya angka yang diselamatkan dari tab Platform. */
                    footnote={`${revenue.conversion.ordersPaid} lunas · ${Math.max(
                      revenue.conversion.ordersIn - revenue.conversion.ordersPaid,
                      0,
                    )} belum · ${revenue.conversion.ordersIn} masuk${
                      revenue.conversion.spamOrders > 0
                        ? ` (${revenue.conversion.spamOrders} spam tidak dihitung)`
                        : ''
                    }`}
                  />
                  {/* `payment_channel` sudah ikut ter-fetch sejak dulu tapi tidak pernah
                      dibaca — kartu ini nol query baru. Footnote cakupannya WAJIB: lihat
                      catatan di `unrecordedChannelShare` di atas. */}
                  <RankedBarList
                    title="Metode Pembayaran"
                    subtitle={`${formatIDR(revenue.totalRevenue.current)} · ${revenue.paidOrders.current} order lunas`}
                    rows={revenue.byPaymentChannel}
                    contextOnlyNames={['Lainnya', UNRECORDED_CHANNEL]}
                    emphasis="hover-only"
                    valueFormatter={formatIDR}
                    footnote={
                      unrecordedChannelShare >= 0.1 ? (
                        <>
                          Channel pembayaran baru dicatat sejak Juli 2026 — transaksi sebelum
                          itu masuk ke &ldquo;{UNRECORDED_CHANNEL}&rdquo;, bukan hilang.
                        </>
                      ) : undefined
                    }
                  />
                  <SegmentCard segments={revenue.segments} emphasize="repeat" />
                </div>

                {/*
                  Tiga daftar peringkat dilebur jadi satu kartu bertab. Ketiganya
                  menjawab pertanyaan yang sama — SIAPA yang membelanjakan uangnya —
                  dengan tiga potongan berbeda, jadi berdampingan mereka cuma berebut
                  lebar: tiap daftar dapat sepertiga kolom dan batangnya jadi pita
                  tipis. Bertab, daftar yang tampil mendapat seluruh lebar kartu.

                  Kanal Akuisisi TIDAK ikut dilebur: ia menjawab dari MANA mereka
                  datang, pertanyaan yang berbeda, dan meleburnya akan menyembunyikan
                  satu-satunya kartu akuisisi di balik tab yang tak berhubungan.

                  Iramanya 2fr:1fr — sama persis dengan baris grafik di atas, supaya
                  tepi kanan kedua baris itu segaris dan halaman punya garis bantu
                  vertikal yang utuh.
                */}
                <div className="mt-4 grid gap-4 lg:[grid-template-columns:2fr_1fr]">
                  <RankedTabsCard
                    title="Peringkat Revenue"
                    ariaLabel="Pilih rincian peringkat revenue"
                    tabs={[
                      {
                        id: 'universitas',
                        label: 'Universitas',
                        rows: revenue.byUniversity,
                        subtitle: `${formatIDR(revenue.totalRevenue.current)} · ${formatRangeLabel(range)}`,
                        // Hanya benar untuk tab ini — jangan diangkat ke level kartu.
                        footnote:
                          'Nama sudah dinormalisasi — UNJ, UI dan BINUS masing-masing tersebar di beberapa ejaan di database.',
                        contextOnlyNames: ['Lainnya', 'Tidak Diketahui'],
                        valueFormatter: formatIDR,
                      },
                      {
                        id: 'jurusan',
                        label: 'Jurusan',
                        rows: revenue.byDepartment,
                        subtitle: `Berdasarkan revenue order lunas · ${formatRangeLabel(range)}`,
                        contextOnlyNames: ['Lainnya', 'Tidak Diketahui'],
                        valueFormatter: formatIDR,
                      },
                      {
                        id: 'customer',
                        label: 'Customer',
                        rows: revenue.byCustomer,
                        subtitle: `Total pembelanjaan tertinggi per customer · ${formatRangeLabel(range)}`,
                        contextOnlyNames: ['Lainnya', 'Tidak Diketahui'],
                        valueFormatter: formatIDR,
                      },
                    ]}
                  />
                  {/* `lg:self-start`: kanal biasanya cuma 3–4 baris, sementara kartu
                      peringkat di sebelahnya jauh lebih tinggi. Tanpa ini grid
                      meregangkannya sampai setinggi tetangganya dan menyisakan ±150px
                      kosong DI DALAM border — terbaca seperti gagal render. Kolom kedua
                      yang lebih pendek itu wajar; kartu berongga tidak. */}
                  <RankedBarList
                    className="lg:self-start"
                    title="Kanal Akuisisi"
                    subtitle="Sumber referensi order lunas"
                    rows={revenue.byReferral}
                    contextOnlyNames={['Lainnya', 'Organik', 'Tidak Diketahui']}
                    emphasis="hover-only"
                    valueFormatter={formatIDR}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: RESPONDENT */}
        {activeTab === 'respondent' && (
          <div className="space-y-4 animate-in slide-in-from-bottom-2 fade-in duration-300">
            {respondentError ? (
              <ErrorState message={respondentError} onRetry={() => loadRespondents(range)} />
            ) : !respondent ? (
              <div className="grid gap-4 lg:grid-cols-3">
                <SkeletonChart /><SkeletonCard /><SkeletonCard />
              </div>
            ) : (
              /* `respondentLoading` menahan render sebelumnya pada opacity turun;
                 kembali ke skeleton tiap ganti periode membuat layar melompat. */
              <div className={respondentLoading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
                {/* Irama 2fr:1fr — SAMA PERSIS dengan baris grafik tab Revenue, jadi
                    tepi kanan kedua tab segaris dan halamannya terbaca sebagai satu
                    dashboard, bukan dua yang kebetulan bertetangga.

                    Tanpa `grid-cols-1`: styles.css:766 mendefinisikannya dan dimuat
                    setelah Tailwind, jadi ia mengalahkan SEMUA varian lg: — termasuk
                    bentuk arbitrary-property. Container grid kosong memang sudah satu
                    kolom. */}
                <div className="grid gap-4 lg:[grid-template-columns:2fr_1fr]">
                  <DailyRespondentsChart
                    data={respondent.daily}
                    rangeLabel={formatRangeLabel(range)}
                    uniqueRespondents={respondent.respondents.current}
                    perSurveyRate={respondent.responsesPerSurvey.current}
                  />
                  {/* `lg:self-start`: tanpa ini kartu rail diregangkan setinggi kartu
                      grafik di sebelahnya dan menyisakan ratusan piksel kosong DI DALAM
                      border — terbaca seperti gagal render. */}
                  <Card className="shadow-sm border-gray-200 [display:grid] grid-cols-2 auto-rows-min divide-gray-100 lg:[grid-template-columns:minmax(0,1fr)] lg:divide-y lg:self-start">
                    {/* `col-span-2 lg:col-span-1`: di mobile rail-nya grid 2 kolom, dan
                        lima tile berarti tile terakhir menyisakan sel kosong. Respons
                        dibuat selebar penuh — ia memang headline-nya, dan sekaligus
                        membuat sisanya kembali genap 2×2. */}
                    <StatTile
                      hero
                      className="col-span-2 p-4 lg:col-span-1"
                      /* Bukan "Respons masuk" — kartu grafik di sebelahnya sudah berjudul
                         persis itu, dan dua judul identik bersebelahan terbaca seperti satu
                         kartu yang ter-render dua kali. */
                      label="Total respons"
                      value={formatCount(respondent.responses.current)}
                      delta={respondent.responses}
                      comparisonLabel="vs periode sebelumnya"
                    />
                    {/* ⚠️ Angka ini dihitung SEKALI atas seluruh rentang, bukan dijumlahkan
                        dari hari-harinya. Menjumlahkan responden unik harian menghasilkan
                        16.680 untuk rentang yang uniknya 9.337 (terukur produksi
                        2026-08-24). Kalau suatu saat angka ini terlihat mendekati Respons
                        di atasnya, yang rusak hampir pasti normalisasi identitasnya. */}
                    <StatTile
                      className="p-4"
                      label="Responden unik"
                      value={formatCount(respondent.respondents.current)}
                      delta={respondent.respondents}
                      comparisonLabel="vs periode sebelumnya"
                      caption={`identitas dinormalisasi · ${formatDecimal(
                        respondent.surveysPerRespondent.current,
                      )} survei per orang`}
                    />
                    {/*
                      Menggantikan tile "Survei / responden" (2,2).

                      Jumlah respons mentah TIDAK bisa dipakai sebagai patokan
                      "seberapa banyak responden yang kita dapat": ia ikut naik-turun
                      mengikuti berapa survei yang tayang, dan itu berayun antara 1 dan 5
                      survei per hari tayang (terukur 26 Jul - 25 Ags 2026; maks 6 dalam
                      90 hari, sesuai kuota 4 slot reguler + extra ad). Angka ini sudah
                      dibagi hari-survei, jadi ia yang boleh dibandingkan antar periode.

                      Rasio survei-per-orang tidak hilang — ia pindah ke caption tile
                      "Responden unik" di atas, tempat ia memang menjelaskan kenapa
                      respons lebih banyak daripada orang.
                    */}
                    <StatTile
                      className="p-4"
                      label="Respons/survei"
                      value={formatDecimal(respondent.responsesPerSurvey.current)}
                      delta={respondent.responsesPerSurvey}
                      comparisonLabel="vs periode sebelumnya"
                      caption={`per hari tayang · ${formatCount(respondent.surveyDays)} hari-survei`}
                    />
                    {/*
                      Median durasi & speeder sengaja TANPA baris delta.

                      `StatTile` mewarnai delta hijau/merah lewat `higherIsBetter`, dan
                      untuk median durasi tidak ada arah yang jelas baik — survei yang
                      lebih pendek bukan kabar buruk. Untuk speeder, persennya sendiri
                      sudah persen: "naik 12%" dari 15% ke 16,8% adalah perubahan
                      RELATIF yang hampir selalu dibaca sebagai poin persentase. Dua-
                      duanya diganti pembanding apa adanya di caption.
                    */}
                    <StatTile
                      className="p-4"
                      label="Median durasi"
                      value={respondent.loiMissingShare >= 1 ? '—' : formatDuration(respondent.medianLoi.current)}
                      caption={
                        respondent.medianLoi.previous > 0
                          ? `periode sebelumnya ${formatDuration(respondent.medianLoi.previous)}`
                          : 'belum ada pembanding'
                      }
                    />
                    <StatTile
                      className="p-4"
                      label="Speeder < 1 mnt"
                      value={respondent.loiMissingShare >= 1 ? '—' : formatPercent(respondent.speederShare.current, 1)}
                      caption={
                        respondent.speederShare.previous > 0
                          ? `periode sebelumnya ${formatPercent(respondent.speederShare.previous, 1)}`
                          : 'belum ada pembanding'
                      }
                    />
                  </Card>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  {/* Kartu utama tab ini. `emphasizedName` menunjuk bucket terbesar,
                      bukan baris pertama: deretnya ORDINAL, jadi "1 survei" ada di
                      kiri karena ia ember paling kiri, bukan karena ia temuannya. */}
                  <RankedBarList
                    title="Loyalitas Responden"
                    subtitle="Survei seumur hidup, dari responden yang aktif di rentang ini"
                    rows={respondent.loyalty}
                    emphasizedName={modalRowName(respondent.loyalty)}
                    valueFormatter={(v) => `${formatCount(v)} orang`}
                    footnote={
                      loyalRespondentShare > 0 ? (
                        <>
                          <strong className="font-semibold" style={{ color: INK.secondary }}>
                            {formatPercent(loyalRespondentShare, 1)}
                          </strong>{' '}
                          responden aktif periode ini sudah mengerjakan 10 survei atau lebih
                          seumur hidup. Dihitung lintas-waktu — bukan hanya survei di rentang
                          ini, yang akan membuat hampir semua orang tampak baru.
                        </>
                      ) : (
                        'Dihitung lintas-waktu — bukan hanya survei di rentang ini, yang akan membuat hampir semua orang tampak baru.'
                      )
                    }
                  />
                  {/* Yang disorot bucket speeder, bukan moda: di kartu durasi
                      pertanyaannya "seberapa banyak yang terlalu cepat", dan itu ember
                      yang punya konsekuensi pada kualitas data. */}
                  <RankedBarList
                    /* `lg:self-start`: Loyalitas di sebelah kiri punya lima baris plus
                       footnote panjang, jadi ia yang menentukan tinggi baris. Tanpa ini
                       kedua kartu yang lebih pendek diregangkan dan menyisakan 84 px dan
                       179 px kosong DI DALAM border — terbaca seperti gagal render.
                       Kolom yang lebih pendek itu wajar; kartu berongga tidak. */
                    className="lg:self-start"
                    title="Durasi Pengerjaan"
                    subtitle={
                      respondent.loiMissingShare >= 1
                        ? 'Belum ada durasi tercatat di rentang ini'
                        : `Median ${formatDuration(respondent.medianLoi.current)} · ${formatCount(
                            respondent.loi.reduce((sum, row) => sum + row.value, 0),
                          )} respons berdurasi`
                    }
                    rows={respondent.loi}
                    emphasizedName="< 1 mnt"
                    valueFormatter={(v) => `${formatCount(v)} respons`}
                    emptyMessage="Belum ada durasi tercatat pada rentang ini."
                    footnote={
                      respondent.loiMissingShare >= 0.1 ? (
                        <>
                          Durasi pengerjaan baru dicatat sejak Juli 2026 —{' '}
                          {formatCount(respondent.loiMissing)} respons di rentang ini (
                          {formatPercent(respondent.loiMissingShare, 0)}) tidak punya data durasi.
                          Median &amp; speeder di atas dihitung HANYA dari yang punya, bukan
                          dari nol.
                        </>
                      ) : undefined
                    }
                  />
                  <RankedBarList
                    className="lg:self-start"
                    title="E-Wallet"
                    subtitle="Tujuan pencairan insentif responden"
                    rows={respondent.ewallet}
                    contextOnlyNames={['Lainnya', UNRECORDED_EWALLET]}
                    emphasis="hover-only"
                    valueFormatter={(v) => `${formatCount(v)} respons`}
                  />
                </div>

                {/* Irama 2fr:1fr lagi, jadi baris ini bertepi-kanan sama dengan baris
                    grafik di atas dan halamannya punya garis bantu vertikal yang utuh. */}
                <div className="mt-4 grid gap-4 lg:[grid-template-columns:2fr_1fr]">
                  <TimePatternCard hourly={respondent.hourly} dow={respondent.dow} />
                  {/* Dua daftar ini menjawab pertanyaan yang sama — RESPONDEN SEPERTI
                      APA yang diminta customer — dengan dua potongan, jadi mereka satu
                      kartu bertab. `hover-only`: kartu satelit selebar sepertiga baris
                      tidak perlu ikut mengklaim aksen dari grafik di sebelahnya.

                      `lg:self-start` supaya kartu pendek ini tidak diregangkan setinggi
                      kartu Pola Waktu dan meninggalkan ruang kosong di dalam border. */}
                  <RankedTabsCard
                    className="lg:self-start"
                    title="Permintaan Customer"
                    ariaLabel="Pilih rincian permintaan customer"
                    emphasis="hover-only"
                    tabs={[
                      {
                        id: 'kriteria',
                        label: 'Kriteria',
                        rows: respondent.criteria,
                        subtitle: 'Kriteria target yang paling sering diminta',
                        valueFormatter: (v: number) => `${formatCount(v)} order`,
                        contextOnlyNames: ['Lainnya'],
                        footnote:
                          'Teks bebas dari customer, sudah dinormalisasi: "mahasiswa aktif" dan "mhs" dihitung satu kriteria.',
                        emptyMessage: 'Belum ada kriteria yang dicatat pada rentang ini.',
                      },
                      {
                        id: 'status',
                        label: 'Status',
                        rows: respondent.studentStatus,
                        subtitle: 'Status pendidikan yang diminta customer',
                        valueFormatter: (v: number) => `${formatCount(v)} order`,
                        contextOnlyNames: ['Lainnya', 'Tidak Diketahui'],
                        emptyMessage: 'Belum ada status pendidikan yang dicatat pada rentang ini.',
                      },
                    ]}
                  />
                </div>
              </div>
            )}
          </div>
        )}
        {/* TAB: CAMPAIGN */}
        {activeTab === 'campaign' && (
          <div className="space-y-4 animate-in slide-in-from-bottom-2 fade-in duration-300">
            {campaignError || revenueError ? (
              <ErrorState
                message={campaignError || revenueError || ''}
                onRetry={() => { loadCampaign(range); loadRevenue(range); }}
              />
            ) : !campaign ? (
              <div className="grid gap-4 lg:grid-cols-3">
                <SkeletonChart /><SkeletonCard /><SkeletonCard />
              </div>
            ) : (
              <div className={campaignLoading || revenueLoading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
                {/* Baris 1 — tiga kartu: peringkat voucher, rail KPI, katalog.
                    2fr:1fr:1fr supaya daftar peringkat (nama + batang) tetap
                    lega sementara dua kartu ringkas di sebelahnya berbagi sisa
                    lebar. Tanpa `grid-cols-1`: styles.css:766 mendeklarasikannya
                    setelah Tailwind dan mengalahkan SEMUA varian lg:, termasuk
                    bentuk arbitrary-property. */}
                <div className="grid gap-4 lg:[grid-template-columns:2fr_1fr_1fr]">
                  <RankedBarList
                    title="Voucher yang Menghasilkan"
                    subtitle={
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span>{formatRangeLabel(range)}</span>
                        <TogglePicker<'revenue' | 'orders'>
                          ariaLabel="Ukuran peringkat voucher"
                          value={voucherMetric}
                          onChange={setVoucherMetric}
                          options={[
                            { value: 'revenue', label: 'Revenue' },
                            { value: 'orders', label: 'Order' },
                          ]}
                        />
                      </span>
                    }
                    rows={voucherMetric === 'revenue' ? campaign.voucher.byRevenue : campaign.voucher.byOrders}
                    emphasis="hover-only"
                    showShare
                    valueFormatter={
                      voucherMetric === 'revenue'
                        ? (v: number) => formatIDRCompact(v, { decimals: 2 })
                        : (v: number) => `${formatCount(v)} order`
                    }
                    emptyMessage={
                      voucherMetric === 'revenue'
                        ? 'Belum ada order lunas ber-voucher pada rentang ini.'
                        : 'Belum ada order yang memakai voucher pada rentang ini.'
                    }
                    /* Ketikan ngawur TIDAK masuk peringkat — 31 "kode" palsu di sumbu
                       tidak menceritakan apa pun. Tapi besarnya derau tetap disebut:
                       39% isian kolom ini sepanjang masa bukan voucher. */
                    footnote={
                      campaign.voucher.unofficialEntries > 0 ? (
                        <>
                          {formatCount(campaign.voucher.unofficialEntries)} isian lain (
                          {formatCount(campaign.voucher.unofficialDistinct)} teks berbeda) tidak cocok
                          dengan kode mana pun di katalog — kolom voucher di form order menerima teks
                          bebas. Isian itu tidak dihitung di peringkat maupun di angka di sebelah.
                        </>
                      ) : undefined
                    }
                  />

                  <VoucherCatalogCard className="lg:self-start" usageByCode={voucherUsageByCode} />

                  {/* Rail KPI: SATU kartu ber-divider. `lg:self-start` menahannya agar
                      tidak diregangkan setinggi kartu peringkat di sebelahnya dan
                      meninggalkan ratusan piksel kosong di dalam border. */}
                  <Card className="shadow-sm border-gray-200 [display:grid] grid-cols-2 auto-rows-min divide-gray-100 lg:[grid-template-columns:minmax(0,1fr)] lg:divide-y lg:self-start">
                    <StatTile
                      hero
                      className="col-span-2 p-4 lg:col-span-1"
                      label="Revenue via voucher"
                      value={formatIDR(campaign.voucher.revenue.current)}
                      delta={campaign.voucher.revenue}
                      comparisonLabel="vs periode sebelumnya"
                    />
                    {/* `points`, BUKAN `percent`: nilainya sendiri sudah persen. 2,1% yang
                        naik ke 19,2% adalah kenaikan 17,1 POIN — "naik 814%" secara
                        teknis benar tapi tak seorang pun membacanya begitu. */}
                    <StatTile
                      className="p-4"
                      label="Porsi dari revenue"
                      value={formatPercent(campaign.voucher.revenueShare.current)}
                      delta={campaign.voucher.revenueShare}
                      deltaMode="points"
                      comparisonLabel="vs periode sebelumnya"
                    />
                    <StatTile
                      className="p-4"
                      label="Order pakai voucher"
                      value={formatCount(campaign.voucher.ordersUsing.current)}
                      delta={campaign.voucher.ordersUsing}
                      deltaMode="absolute"
                      deltaUnit="order"
                      comparisonLabel="vs periode sebelumnya"
                      caption="lunas maupun belum"
                    />
                    <StatTile
                      className="col-span-2 p-4 lg:col-span-1"
                      label="Kode terpakai"
                      value={`${formatCount(campaign.voucher.codesUsed)} dari ${formatCount(campaign.voucher.codesRegistered)}`}
                      caption="kode aktif yang terdaftar di katalog"
                    />
                  </Card>
                </div>

                {/* Baris 2 — klik campaign link & manajemen link, 1fr:1fr: keduanya
                    butuh lebar untuk grafik/tabelnya sendiri, tidak ada yang jelas
                    lebih dominan seperti baris 1. */}
                <div className="mt-4 grid gap-4 lg:[grid-template-columns:1fr_1fr]">
                  <DailyClicksChart
                    clicks={campaign.clicks}
                    rangeLabel={formatRangeLabel(range)}
                    isRefetching={campaignLoading}
                  />

                  {/* Manajemen link: fungsinya utuh, warnanya diseragamkan ke token
                      design system (dulu `text-blue-900`, `bg-blue-50/50`, `#10b981`,
                      `text-orange-700` — semuanya di luar palet yang sudah divalidasi). */}
                  <Card className="shadow-sm" style={{ borderColor: CHART.grid }}>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="text-base font-semibold" style={{ color: INK.primary }}>
                          Manajemen Campaign Link
                        </CardTitle>
                        <CardDescription className="mt-1 text-[13px]">
                          {formatCount(campaignLinks.length)} link · {formatCount(campaign.clicks.lifetimeTotal)} klik seumur hidup
                        </CardDescription>
                      </div>
                      <Dialog open={isLinkModalOpen} onOpenChange={setIsLinkModalOpen}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                            <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Buat Link Baru
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Buat Tracking Link Baru</DialogTitle>
                            <DialogDescription>Buat link pendek untuk campaign dan simpan ke daftar manajemen.</DialogDescription>
                          </DialogHeader>
                          <div className="flex flex-col gap-3 py-4">
                            <div className="space-y-1">
                              <label className="text-sm font-medium" htmlFor="campaign-source" style={{ color: INK.secondary }}>Source Name</label>
                              <input id="campaign-source" type="text" placeholder="Nama sumber unik (cth: instagram-bio)" className="w-full text-sm rounded-md border p-2.5 outline-none transition-all font-medium focus:ring-1" style={{ borderColor: CHART.grid, color: INK.primary }} value={linkSource} onChange={(e) => setLinkSource(e.target.value.replace(/\s+/g, '-').toLowerCase())} />
                            </div>
                            <div className="space-y-1">
                              <label className="text-sm font-medium" htmlFor="campaign-note" style={{ color: INK.secondary }}>Catatan (opsional)</label>
                              <input id="campaign-note" type="text" placeholder="cth: Promo Agustus 2026" className="w-full text-sm rounded-md border p-2.5 outline-none transition-all focus:ring-1" style={{ borderColor: CHART.grid, color: INK.secondary }} value={linkDescription} onChange={(e) => setLinkDescription(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleGenerateLink()} />
                            </div>
                            {generatedLink && (
                              <div className="p-3 rounded-lg border flex items-center justify-between gap-3 animate-in fade-in zoom-in-95 mt-2" style={{ borderColor: CHART.grid, backgroundColor: CHART.contextSoft }}>
                                <a href={generatedLink} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold hover:underline truncate" style={{ color: CHART.accent }}>{generatedLink}</a>
                                <button onClick={() => handleCopyLink(generatedLink)} className="p-2 bg-white rounded transition-colors shrink-0 border" style={{ borderColor: CHART.grid, color: CHART.accent }} title="Salin link" aria-label="Salin link"><Copy className="w-4 h-4" aria-hidden="true" /></button>
                              </div>
                            )}
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setIsLinkModalOpen(false)}>Batal</Button>
                            <Button onClick={handleGenerateLink} disabled={isGenerating || !linkSource.trim()}>
                              {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin mr-2" aria-hidden="true" /> : <Plus className="w-4 h-4 mr-2" aria-hidden="true" />} Simpan & Generate
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {/* Tabel lebar dapat scroll-nya SENDIRI; body halaman tidak pernah
                        ikut menggeser ke samping di 375px. */}
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[420px] border-collapse text-[13px]">
                        <caption className="sr-only">Daftar campaign link beserta total klik seumur hidup</caption>
                        <thead>
                          <tr style={{ color: INK.muted }}>
                            <th scope="col" className="py-2 text-left font-medium">Source</th>
                            <th scope="col" className="py-2 text-left font-medium">Catatan</th>
                            <th scope="col" className="py-2 text-right font-medium">Klik (seumur hidup)</th>
                            <th scope="col" className="py-2 text-right font-medium">Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {campaignLinks.length === 0 ? (
                            <tr style={{ borderTop: `1px solid ${CHART.grid}` }}>
                              <td colSpan={4} className="py-8 text-center" style={{ color: INK.muted }}>
                                Belum ada link yang dikelola.
                              </td>
                            </tr>
                          ) : (
                            campaignLinks.map((link: any) => (
                              <tr key={link.id} style={{ borderTop: `1px solid ${CHART.grid}` }}>
                                <th scope="row" className="py-2 text-left font-medium" style={{ color: INK.primary }}>{link.source_name}</th>
                                <td className="py-2" style={{ color: INK.secondary }}>{link.description || '—'}</td>
                                <td className="py-2 text-right font-semibold tabular-nums" style={{ color: INK.primary }}>{formatCount(link.click_count || 0)}</td>
                                <td className="py-2">
                                  <div className="flex items-center justify-end gap-1">
                                    <button onClick={() => handleCopyLink(`${window.location.origin}/c/${link.source_name}`)} className="p-1.5 rounded transition-colors hover:bg-gray-100" style={{ color: INK.muted }} title="Salin link" aria-label={`Salin link ${link.source_name}`}><Copy className="w-4 h-4" aria-hidden="true" /></button>
                                    <button onClick={() => handleDeleteLink(link.id)} className="p-1.5 rounded transition-colors hover:bg-gray-100" style={{ color: INK.muted }} title="Hapus dari daftar" aria-label={`Hapus link ${link.source_name}`}><Trash2 className="w-4 h-4" aria-hidden="true" /></button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-4 border-t pt-3 text-[12px] leading-snug" style={{ color: INK.muted, borderColor: CHART.grid }}>
                      Menghapus baris hanya mengeluarkannya dari daftar ini — riwayat kliknya tetap tersimpan.
                    </p>
                  </CardContent>
                  </Card>
                </div>

                {campaign.clicks.bySource.length > 0 && (
                  <div className="mt-4 grid gap-4 lg:[grid-template-columns:2fr_1fr]">
                    <RankedBarList
                      title="Klik per Sumber"
                      subtitle={`${formatCount(campaign.clicks.total.current)} klik · ${formatRangeLabel(range)}`}
                      rows={campaign.clicks.bySource}
                      emphasis="hover-only"
                      valueFormatter={(v: number) => `${formatCount(v)} klik`}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Tiga tab, tiga sumber data. Disatukan di sini supaya toolbar tidak menumbuhkan
  // rantai ternary yang harus diperbarui tiap kali satu tab dipindahkan.
  const activeTabBusy =
    activeTab === 'revenue'
      ? revenueLoading
      : activeTab === 'respondent'
        ? respondentLoading
        : campaignLoading || revenueLoading;
  const refreshActiveTab = () => {
    if (activeTab === 'revenue') return loadRevenue(range);
    if (activeTab === 'respondent') return loadRespondents(range);
    loadRevenue(range);
    return loadCampaign(range);
  };

  return (
    <div className="pb-10 relative">
      {/* Fixed Header Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 flex flex-col gap-4 shrink-0 sticky top-0 z-30 shadow-[0_4px_20px_rgb(0,0,0,0.05)] mb-4 -mx-4 sm:mx-0">
        {/* Top Row */}
        <div className="flex flex-row items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-600">Periode</span>
            {/* Satu baris filter men-scope SELURUH dashboard. Ketiga tab berbagi satu
                `range` — pindah tab tidak mengubah periode yang sedang dilihat.
                Preset lama ("7 Hari"/"30 Hari"/…) ikut mati bersama tab Platform:
                ia satu-satunya kontrol periode yang tersisa yang bukan rentang bebas. */}
            <DateRangePicker value={range} onChange={setRange} disabled={activeTabBusy} />
          </div>

          <Button
            onClick={refreshActiveTab}
            variant="outline"
            size="sm"
            disabled={activeTabBusy}
            className="h-9 w-9 p-0 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 border-gray-200"
            title="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 ${activeTabBusy ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="h-px bg-gray-100 w-full" />

        {/* Bottom Row */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-100/80 p-1 w-fit rounded-lg border border-slate-200/50">
          {([{ key: 'revenue' as TabKey, label: 'Revenue', icon: DollarSign }, { key: 'respondent' as TabKey, label: 'Respondents', icon: Users }, { key: 'campaign' as TabKey, label: 'Campaign', icon: Megaphone }]).map((t) => (
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
