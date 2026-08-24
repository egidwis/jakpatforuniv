import { useState, useEffect, useCallback } from 'react';
import {
  Target,
  Search,
  Filter,
  RefreshCw,
  MessageCircle,
  ExternalLink,
  Clock,
  Users,
  CheckCircle2,
  AlertCircle,
  ShoppingBag,
  Smartphone,
  FlaskConical,
  Trophy,
  Sparkles,
  ChevronDown,
  Phone,
  Calendar,
  FileText,
  Edit3
} from 'lucide-react';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';

export interface CustomMissionRequest {
  id: string;
  user_id: string | null;
  category: string;
  category_custom: string | null;
  target_respondents: number;
  target_deadline: string;
  criteria_notes: string | null;
  reference_url: string | null;
  contact_name: string;
  contact_whatsapp: string;
  contact_email: string | null;
  status: 'pending' | 'contacted' | 'in_progress' | 'completed' | 'cancelled';
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

const CATEGORY_MAP: Record<string, { title: string; icon: any; color: string }> = {
  mystery_shopper: {
    title: 'Mystery Shopper / Toko',
    icon: ShoppingBag,
    color: 'bg-pink-50 text-pink-700 border-pink-200'
  },
  app_testing: {
    title: 'App / Web Testing',
    icon: Smartphone,
    color: 'bg-blue-50 text-blue-700 border-blue-200'
  },
  product_tasting: {
    title: 'Product Tasting / Sampel',
    icon: FlaskConical,
    color: 'bg-amber-50 text-amber-700 border-amber-200'
  },
  pitch_validation: {
    title: 'Validasi Lomba / Bisnis',
    icon: Trophy,
    color: 'bg-purple-50 text-purple-700 border-purple-200'
  },
  other: {
    title: 'Kebutuhan Khusus',
    icon: Sparkles,
    color: 'bg-gray-100 text-gray-700 border-gray-300'
  }
};

const STATUS_MAP: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: '🟡 Menunggu Follow-Up', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800' },
  contacted: { label: '🔵 Sudah Dihubungi', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-800' },
  in_progress: { label: '🟣 Sedang Berjalan', bg: 'bg-purple-50 border-purple-200', text: 'text-purple-800' },
  completed: { label: '🟢 Selesai', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800' },
  cancelled: { label: '⚪ Dibatalkan', bg: 'bg-gray-100 border-gray-200', text: 'text-gray-600' }
};

export function CustomMissionRequestsPage() {
  const [requests, setRequests] = useState<CustomMissionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('custom_mission_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests((data as CustomMissionRequest[]) || []);
    } catch (err: any) {
      console.error('Error loading mission requests:', err);
      toast.error('Gagal memuat daftar permintaan misi khusus.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleUpdateStatus = async (id: string, newStatus: CustomMissionRequest['status']) => {
    setUpdatingId(id);
    try {
      const { error } = await supabase
        .from('custom_mission_requests')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      setRequests(prev =>
        prev.map(r => (r.id === id ? { ...r, status: newStatus } : r))
      );
      toast.success(`Status berhasil diubah menjadi: ${STATUS_MAP[newStatus]?.label || newStatus}`);
    } catch (err: any) {
      console.error('Error updating status:', err);
      toast.error('Gagal mengubah status: ' + err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleOpenWhatsApp = (req: CustomMissionRequest) => {
    let cleanPhone = req.contact_whatsapp.replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '62' + cleanPhone.slice(1);
    } else if (!cleanPhone.startsWith('62')) {
      cleanPhone = '62' + cleanPhone;
    }

    const catLabel = req.category === 'other'
      ? (req.category_custom || 'Kebutuhan Khusus')
      : (CATEGORY_MAP[req.category]?.title || req.category);

    const message = `Halo Kak ${req.contact_name}, salam dari Tim Jakpat for Universities! 👋\n\nKami telah menerima pengajuan misi *${catLabel}* (${req.target_respondents} responden, target ${req.target_deadline}).\n\nApakah detail brief tugas dan bukti (evidence) yang harus dikirim responden sudah siap untuk kami bantu publish ke panel? Terima kasih! 🙏`;

    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  // Filtered requests
  const filtered = requests.filter(r => {
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !searchQuery ||
      r.contact_name?.toLowerCase().includes(q) ||
      r.contact_whatsapp?.toLowerCase().includes(q) ||
      r.criteria_notes?.toLowerCase().includes(q) ||
      r.category_custom?.toLowerCase().includes(q);

    return matchesStatus && matchesSearch;
  });

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const inProgressCount = requests.filter(r => r.status === 'in_progress' || r.status === 'contacted').length;
  const completedCount = requests.filter(r => r.status === 'completed').length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-jfu-primary text-white flex items-center justify-center shadow-md shadow-jfu-primary/20 shrink-0">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-gray-900">
                Permintaan Misi &amp; Aksi Khusus
              </h1>
              <p className="text-xs text-gray-500">
                Manajemen lead dan order aksi responden nyata (Mystery shopping, App testing, Tasting produk, &amp; Lomba)
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchRequests}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 text-xs font-bold shadow-2xs hover:bg-gray-50 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-2xs">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Total Permintaan</span>
          <p className="text-2xl font-black text-gray-900 mt-0.5">{requests.length}</p>
        </div>

        <div className="bg-amber-50/70 rounded-2xl border border-amber-200/80 p-4 shadow-2xs">
          <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">🟡 Menunggu Follow-Up</span>
          <p className="text-2xl font-black text-amber-900 mt-0.5">{pendingCount}</p>
        </div>

        <div className="bg-blue-50/70 rounded-2xl border border-blue-200/80 p-4 shadow-2xs">
          <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wider">🔵 Sedang Diproses</span>
          <p className="text-2xl font-black text-blue-900 mt-0.5">{inProgressCount}</p>
        </div>

        <div className="bg-emerald-50/70 rounded-2xl border border-emerald-200/80 p-4 shadow-2xs">
          <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">🟢 Selesai / Deal</span>
          <p className="text-2xl font-black text-emerald-900 mt-0.5">{completedCount}</p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white rounded-2xl border border-gray-200 p-3 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Status Filters */}
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          {[
            { id: 'all', label: 'Semua Status' },
            { id: 'pending', label: '🟡 Pending' },
            { id: 'contacted', label: '🔵 Dihubungi' },
            { id: 'in_progress', label: '🟣 Berjalan' },
            { id: 'completed', label: '🟢 Selesai' }
          ].map(st => (
            <button
              key={st.id}
              onClick={() => setStatusFilter(st.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                statusFilter === st.id
                  ? 'bg-jfu-primary text-white shadow-xs'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama, WhatsApp, kriteria..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-gray-200 text-xs bg-gray-50 focus:bg-white focus:border-jfu-primary focus:outline-none font-medium"
          />
        </div>
      </div>

      {/* Table List */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400 text-xs flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-jfu-primary" />
            <span>Memuat data permintaan...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500 text-xs space-y-2">
            <Target className="w-8 h-8 text-gray-300 mx-auto" />
            <p className="font-bold">Belum ada permintaan yang sesuai filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200 text-gray-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Tanggal</th>
                  <th className="py-3 px-4">Pemohon</th>
                  <th className="py-3 px-4">Jenis Misi</th>
                  <th className="py-3 px-4">Responden &amp; Target</th>
                  <th className="py-3 px-4">Brief / Evidence / Link</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Aksi Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(req => {
                  const cat = CATEGORY_MAP[req.category] || CATEGORY_MAP.other;
                  const CatIcon = cat.icon;
                  const st = STATUS_MAP[req.status] || STATUS_MAP.pending;

                  return (
                    <tr key={req.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Tanggal */}
                      <td className="py-3.5 px-4 text-gray-500 whitespace-nowrap">
                        <div className="font-medium">
                          {new Date(req.created_at).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </div>
                        <div className="text-[10px] text-gray-400">
                          {new Date(req.created_at).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })} WIB
                        </div>
                      </td>

                      {/* Pemohon */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-gray-900">{req.contact_name}</div>
                        <div className="text-gray-500 font-mono text-[11px] flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-emerald-600" />
                          <span>{req.contact_whatsapp}</span>
                        </div>
                        {req.contact_email && (
                          <div className="text-[10px] text-gray-400 truncate max-w-[140px]">
                            {req.contact_email}
                          </div>
                        )}
                      </td>

                      {/* Jenis Misi */}
                      <td className="py-3.5 px-4">
                        <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold border ${cat.color}`}>
                          <CatIcon className="w-3 h-3" />
                          <span>{req.category === 'other' ? (req.category_custom || 'Khusus') : cat.title}</span>
                        </div>
                      </td>

                      {/* Responden & Target */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-gray-900">
                          {req.target_respondents} Responden
                        </div>
                        <div className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3 text-indigo-500" />
                          <span>{req.target_deadline}</span>
                        </div>
                      </td>

                      {/* Kriteria / Link */}
                      <td className="py-3.5 px-4 max-w-xs">
                        {req.criteria_notes ? (
                          <p className="text-[11px] text-gray-700 line-clamp-2 leading-relaxed">
                            {req.criteria_notes}
                          </p>
                        ) : (
                          <span className="text-gray-400 italic text-[11px]">Tanpa kriteria khusus</span>
                        )}

                        {req.reference_url && (
                          <a
                            href={req.reference_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-jfu-primary hover:underline font-bold mt-1"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Buka Link Referensi</span>
                          </a>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <select
                          value={req.status}
                          disabled={updatingId === req.id}
                          onChange={(e) => handleUpdateStatus(req.id, e.target.value as any)}
                          className={`px-2.5 py-1 text-[11px] font-bold rounded-xl border focus:outline-none cursor-pointer ${st.bg} ${st.text}`}
                        >
                          <option value="pending">🟡 Menunggu Follow-Up</option>
                          <option value="contacted">🔵 Sudah Dihubungi</option>
                          <option value="in_progress">🟣 Sedang Berjalan</option>
                          <option value="completed">🟢 Selesai / Deal</option>
                          <option value="cancelled">⚪ Dibatalkan</option>
                        </select>
                      </td>

                      {/* Aksi Admin */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenWhatsApp(req)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-xs transition-all cursor-pointer"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>Chat WhatsApp</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
