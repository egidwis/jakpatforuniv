import React, { useState } from 'react';
import {
  X,
  Target,
  Sparkles,
  ShoppingBag,
  Smartphone,
  FlaskConical,
  Trophy,
  CheckCircle2,
  Clock,
  Users,
  Link as LinkIcon,
  MessageSquare,
  HelpCircle,
  Loader2,
  Phone
} from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

interface CustomMissionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES = [
  {
    id: 'mystery_shopper',
    icon: ShoppingBag,
    title: 'Mystery Shopper / Kunjungan Toko & Booth',
    desc: 'Responden datang ke toko/booth fisik, coba produk/beli, lalu isi kuesioner review pengalaman.'
  },
  {
    id: 'app_testing',
    icon: Smartphone,
    title: 'App / Website Testing & Task Trial',
    desc: 'Responden coba registrasi/fitur di web atau prototipe Figma, lalu isi kuesioner SUS & bug report.'
  },
  {
    id: 'product_tasting',
    icon: FlaskConical,
    title: 'Product Tasting / Trial (Uji Coba Sampel)',
    desc: 'Responden mencoba sampel fisik (makanan, minuman, kosmetik) lalu isi kuesioner organoleptik.'
  },
  {
    id: 'pitch_validation',
    icon: Trophy,
    title: 'Validasi Ide Bisnis / Lomba (Survei Kilat)',
    desc: 'Responden target pasar isi survei konsep, uji harga (WTP), & analisis kompetitor untuk Pitch Deck/PKM.'
  },
  {
    id: 'other',
    icon: Sparkles,
    title: 'Kebutuhan Aksi / Survei Khusus Lainnya',
    desc: 'Jelaskan skenario riset atau aksi unik responden yang Anda butuhkan secara bebas.'
  }
];

const RESPONDENT_OPTIONS = [30, 50, 100, 200, 300, 500];

const DEADLINE_OPTIONS = [
  '< 12 Jam (Super Kilat)',
  '24 Jam (Ekspres)',
  '2-3 Hari (Standar)',
  'Fleksibel'
];

export const CustomMissionModal: React.FC<CustomMissionModalProps> = ({
  isOpen,
  onClose
}) => {
  const { user } = useAuth();

  const [category, setCategory] = useState('mystery_shopper');
  const [customCategoryText, setCustomCategoryText] = useState('');
  const [targetRespondents, setTargetRespondents] = useState(50);
  const [targetDeadline, setTargetDeadline] = useState('< 24 Jam');
  const [criteriaNotes, setCriteriaNotes] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [contactName, setContactName] = useState(user?.user_metadata?.full_name || '');
  const [contactWhatsapp, setContactWhatsapp] = useState(user?.user_metadata?.phone || '');
  
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!contactName.trim()) {
      toast.error('Mohon isi nama lengkap pemohon.');
      return;
    }

    if (!contactWhatsapp.trim()) {
      toast.error('Mohon isi nomor WhatsApp aktif untuk dihubungi tim.');
      return;
    }

    if (category === 'other' && !customCategoryText.trim()) {
      toast.error('Mohon jelaskan jenis kebutuhan riset khusus Anda.');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        user_id: user?.id || null,
        category,
        category_custom: category === 'other' ? customCategoryText.trim() : null,
        target_respondents: targetRespondents,
        target_deadline: targetDeadline,
        criteria_notes: criteriaNotes.trim() || null,
        reference_url: referenceUrl.trim() || null,
        contact_name: contactName.trim(),
        contact_whatsapp: contactWhatsapp.trim(),
        contact_email: user?.email || null,
        status: 'pending',
        created_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('custom_mission_requests')
        .insert(payload);

      if (error) throw error;

      setIsSuccess(true);
      toast.success('Permintaan Misi & Aksi Khusus berhasil dikirim!');
    } catch (err: any) {
      console.error('[CustomMissionModal] Error submitting request:', err);
      toast.error('Gagal mengirim permintaan: ' + (err.message || 'Terjadi kesalahan'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetAndClose = () => {
    setIsSuccess(false);
    setCategory('mystery_shopper');
    setCustomCategoryText('');
    setCriteriaNotes('');
    setReferenceUrl('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-gray-100 shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-gray-100 bg-gradient-to-r from-blue-50/80 via-indigo-50/40 to-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-jfu-primary text-white flex items-center justify-center shadow-md shadow-jfu-primary/25 shrink-0">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-gray-900 leading-tight">
                Permintaan Misi &amp; Aksi Khusus
              </h2>
              <p className="text-xs text-gray-500">
                Pengerjaan tugas riil &amp; survei ekspres oleh responden terverifikasi Jakpat
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleResetAndClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        {isSuccess ? (
          <div className="p-8 text-center space-y-4 flex-1 flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 animate-in zoom-in-75 duration-300">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div className="max-w-md space-y-2">
              <h3 className="text-xl font-extrabold text-gray-900">
                Permintaan Berhasil Terkirim!
              </h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                Terima kasih, <strong>{contactName}</strong>! Kebutuhan riset dan tugas khususmu telah kami terima.
              </p>
              <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 text-xs text-indigo-900 text-left mt-3">
                <span className="font-bold block mb-1">⏱️ Apa langkah selanjutnya?</span>
                Tim Jakpat for Universities akan segera mereview kriteria responden dan menghubungi nomor WhatsApp Anda (<strong>{contactWhatsapp}</strong>) untuk konfirmasi ketersediaan panel &amp; estimasi penayangan.
              </div>
            </div>

            <div className="pt-4">
              <button
                type="button"
                onClick={handleResetAndClose}
                className="px-6 py-2.5 rounded-xl bg-gray-900 hover:bg-black text-white text-xs font-bold transition-all shadow-md cursor-pointer"
              >
                Tutup &amp; Kembali ke Dashboard
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-5 flex-1 text-xs">
            {/* 1. Pilih Kategori Aksi */}
            <div>
              <label className="block font-bold text-gray-900 text-xs mb-2">
                1. Pilih Jenis Misi / Aksi Responden yang Dibutuhkan <span className="text-red-500">*</span>
              </label>

              <div className="grid grid-cols-1 gap-2">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isSelected = category === cat.id;

                  return (
                    <div
                      key={cat.id}
                      onClick={() => setCategory(cat.id)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                        isSelected
                          ? 'border-jfu-primary bg-indigo-50/40 shadow-xs'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className={`mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-jfu-primary text-white' : 'bg-gray-100 text-gray-600'
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className={`font-bold text-xs ${isSelected ? 'text-jfu-primary' : 'text-gray-900'}`}>
                            {cat.title}
                          </span>
                          <input
                            type="radio"
                            name="category"
                            checked={isSelected}
                            onChange={() => setCategory(cat.id)}
                            className="w-3.5 h-3.5 text-jfu-primary"
                          />
                        </div>
                        <p className="text-gray-500 text-[11px] mt-0.5 leading-snug">
                          {cat.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Free Text Input if 'other' is selected */}
              {category === 'other' && (
                <div className="mt-2.5 p-3 rounded-xl bg-amber-50/60 border border-amber-200">
                  <label className="block font-bold text-amber-900 text-[11px] mb-1">
                    Jelaskan Kebutuhan Riset Khusus Anda <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={customCategoryText}
                    onChange={(e) => setCustomCategoryText(e.target.value)}
                    placeholder="Contoh: Responden diminta vote karya poster di festival kampus..."
                    className="w-full px-3 py-2 text-xs border border-amber-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                    required
                  />
                </div>
              )}
            </div>

            {/* 2. Target Responden & Deadline */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-gray-900 text-xs mb-1.5 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-indigo-600" />
                  <span>2. Target Jumlah Responden</span>
                </label>
                <select
                  value={targetRespondents}
                  onChange={(e) => setTargetRespondents(Number(e.target.value))}
                  className="w-full px-3 py-2.5 text-xs font-semibold border border-gray-200 rounded-xl bg-white focus:border-jfu-primary focus:outline-none"
                >
                  {RESPONDENT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt} Responden
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-900 text-xs mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Target Waktu Selesai</span>
                </label>
                <select
                  value={targetDeadline}
                  onChange={(e) => setTargetDeadline(e.target.value)}
                  className="w-full px-3 py-2.5 text-xs font-semibold border border-gray-200 rounded-xl bg-white focus:border-jfu-primary focus:outline-none"
                >
                  {DEADLINE_OPTIONS.map((dl) => (
                    <option key={dl} value={dl}>
                      {dl}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 3. Kriteria Responden & Skenario Aksi */}
            <div>
              <label className="block font-bold text-gray-900 text-xs mb-1.5 flex items-center justify-between">
                <span>3. Kriteria Khusus / Skenario Tugas Responden (Opsional)</span>
                <span className="text-[10px] text-gray-400 font-normal">Membantu proses screening panel</span>
              </label>
              <textarea
                rows={2}
                value={criteriaNotes}
                onChange={(e) => setCriteriaNotes(e.target.value)}
                placeholder="Contoh: Khusus domisili Surabaya, memiliki kendaraan bermotor, atau pengguna e-wallet aktif..."
                className="w-full p-3 text-xs leading-relaxed border border-gray-200 rounded-xl focus:border-jfu-primary focus:outline-none bg-slate-50/50 hover:bg-white text-gray-800 transition-all font-medium"
              />
            </div>

            {/* 4. Link Kuesioner / App / Figma (Opsional) */}
            <div>
              <label className="block font-bold text-gray-900 text-xs mb-1.5 flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5 text-indigo-600" />
                <span>4. Link Kuesioner / Prototype / Website (Opsional)</span>
              </label>
              <input
                type="url"
                value={referenceUrl}
                onChange={(e) => setReferenceUrl(e.target.value)}
                placeholder="https://forms.gle/... atau link Figma/website jika sudah ada"
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl bg-white focus:border-jfu-primary focus:outline-none font-medium"
              />
            </div>

            {/* 5. Data Kontak Pemohon */}
            <div className="pt-3 border-t border-gray-100">
              <label className="block font-bold text-gray-900 text-xs mb-2">
                5. Data Kontak Pemohon (Untuk Dihubungi Tim JFU) <span className="text-red-500">*</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">
                    Nama Lengkap <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Nama Anda"
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl bg-white focus:border-jfu-primary focus:outline-none font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1 flex items-center gap-1">
                    <Phone className="w-3 h-3 text-emerald-600" />
                    <span>Nomor WhatsApp Aktif</span>
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={contactWhatsapp}
                    onChange={(e) => setContactWhatsapp(e.target.value)}
                    placeholder="08123456789"
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl bg-white focus:border-jfu-primary focus:outline-none font-medium font-mono"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Footer Submit Button */}
            <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleResetAndClose}
                className="px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-colors cursor-pointer"
              >
                Batal
              </button>

              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 rounded-xl bg-jfu-primary hover:bg-jfu-primary/90 text-white font-bold text-xs shadow-md shadow-jfu-primary/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Mengirim Permintaan...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Ajukan Permintaan Misi Khusus</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
