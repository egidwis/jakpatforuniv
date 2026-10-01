import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  supabase, 
  fetchAllAISkills, 
  saveAISkill, 
  deleteAISkill, 
  toggleAISkillActive, 
  type AISkill 
} from '../../utils/supabase';
import { 
  Save, 
  Plus, 
  Trash2, 
  Edit2, 
  Loader2, 
  Check, 
  X, 
  RefreshCw, 
  BrainCircuit, 
  Sliders, 
  BookOpen, 
  Sparkles,
  Globe,
  AlertCircle,
  Tag,
  MousePointerClick,
  Lightbulb,
  FileText
} from 'lucide-react';
import MDEditor, { commands } from '@uiw/react-md-editor';
import { toast } from 'sonner';

interface FAQ {
  id: string;
  question: string;
  answer: string;
  is_active: boolean;
  sort_order: number;
}

type TabType = 'skills' | 'prompt' | 'faqs';

function formatSkillErrorMessage(err: any, form: Partial<AISkill>): string {
  const msg = (err?.message || (typeof err === 'string' ? err : '')).toLowerCase();
  const code = err?.code || '';

  if (code === '22001' || msg.includes('value too long for type character varying')) {
    if (msg.includes('100') || (form.tag_label && form.tag_label.trim().length > 100)) {
      return `Teks pada kolom "Label Tag" terlalu panjang (${form.tag_label?.trim().length || '>100'} karakter). Batas maksimal adalah 100 karakter. Mohon gunakan label ringkas.`;
    }
    if (msg.includes('150') || (form.name && form.name.trim().length > 150)) {
      return `Teks pada kolom "Nama Skill" terlalu panjang (${form.name?.trim().length || '>150'} karakter). Batas maksimal adalah 150 karakter.`;
    }
    if (msg.includes('50') || (form.tag && form.tag.trim().length > 50)) {
      return `Pilihan Kategori Intent terlalu panjang (maksimal 50 karakter).`;
    }
    return `Teks yang dimasukkan melebihi batas panjang karakter database (${err?.message || msg}). Mohon periksa kembali kolom Nama Skill atau Label Tag.`;
  }

  if (code === '23505' || msg.includes('duplicate key') || msg.includes('unique')) {
    return 'Skill dengan nama ini sudah terdaftar. Mohon gunakan nama skill lain.';
  }

  if (msg.includes('jwt') || msg.includes('auth') || code === 'pgrst301') {
    return 'Sesi login Anda telah berakhir. Silakan muat ulang (refresh) halaman dan login kembali.';
  }

  return err?.message ? `Gagal menyimpan: ${err.message}` : 'Terjadi kesalahan sistem saat menyimpan skill.';
}

const MiminAISetup: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('skills');

  // Skills State
  const [skills, setSkills] = useState<AISkill[]>([]);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [isAddingSkill, setIsAddingSkill] = useState(false);
  const [skillForm, setSkillForm] = useState<Partial<AISkill>>({
    name: '',
    description: '',
    trigger_context: '',
    sop_instructions: '',
    tag: 'request',
    tag_label: 'Request Extend / Kuota',
    suggested_actions: [],
    is_active: true,
    sort_order: 1
  });
  const [savingSkill, setSavingSkill] = useState(false);

  // System Prompt State
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [promptSaved, setPromptSaved] = useState(false);

  // Legacy FAQ State
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [editingFaq, setEditingFaq] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<FAQ>>({});
  const [isAddingFaq, setIsAddingFaq] = useState(false);

  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch AI Skills
      const skillsData = await fetchAllAISkills();
      setSkills(skillsData);

      // 2. Fetch system prompt
      const { data: promptData } = await supabase
        .from('ai_settings')
        .select('value')
        .eq('key', 'system_prompt')
        .single();
      if (promptData) {
        setSystemPrompt(promptData.value);
      }

      // 3. Fetch FAQs
      const { data: faqData } = await supabase
        .from('ai_knowledge_base')
        .select('*')
        .order('sort_order', { ascending: true });
      if (faqData) {
        setFaqs(faqData);
      }
    } catch (err) {
      console.error("Error fetching AI setup data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Auto-Scrape URL State
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [scrapeSuccess, setScrapeSuccess] = useState(false);
  const [skillError, setSkillError] = useState<string | null>(null);

  // --- SKILL ACTIONS ---
  const handleOpenNewSkill = () => {
    setIsAddingSkill(true);
    setEditingSkillId(null);
    setScrapeUrl('');
    setScrapeError(null);
    setScrapeSuccess(false);
    setSkillError(null);
    setSkillForm({
      name: '',
      description: '',
      trigger_context: '',
      sop_instructions: '',
      tag: 'request',
      tag_label: 'Request Extend / Kuota',
      suggested_actions: [
        { label: '🚀 Cek Status & Extend', action: 'navigate', url: '/dashboard' }
      ],
      is_active: true,
      sort_order: (skills.length > 0 ? Math.max(...skills.map(s => s.sort_order || 0)) + 1 : 1)
    });
  };

  const handleEditSkill = (skill: AISkill) => {
    setIsAddingSkill(false);
    setEditingSkillId(skill.id);
    setScrapeUrl('');
    setScrapeError(null);
    setScrapeSuccess(false);
    setSkillError(null);
    setSkillForm({
      ...skill,
      suggested_actions: (skill.suggested_actions || []).map(a => {
        if (a.action === 'chat_prompt') {
          return { label: a.label, action: a.action, prompt: a.prompt || a.url || '', url: '' };
        }
        return { label: a.label, action: a.action, url: a.url || a.prompt || '', prompt: '' };
      })
    });
  };

  const handleScrapeUrl = async () => {
    if (!scrapeUrl.trim()) return;
    setIsScraping(true);
    setScrapeError(null);
    setScrapeSuccess(false);

    try {
      const res = await fetch('/api/scrape-knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: scrapeUrl.trim() })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Gagal mengekstrak materi dari website');
      }

      const { knowledge } = data;
      if (knowledge) {
        setSkillForm(prev => {
          const newName = prev.name?.trim() ? prev.name : (knowledge.title || prev.name);
          const newDesc = prev.description?.trim() ? prev.description : (knowledge.description || prev.description);
          const newTrigger = prev.trigger_context?.trim()
            ? `${prev.trigger_context}\n${knowledge.trigger_context || ''}`.trim()
            : (knowledge.trigger_context || prev.trigger_context);

          const hostname = new URL(scrapeUrl.trim()).hostname;
          const extractedHeader = `=== MATERI DISINKRONISASI DARI ${hostname} ===\n`;
          const newSop = prev.sop_instructions?.trim()
            ? `${prev.sop_instructions}\n\n${extractedHeader}${knowledge.sop_instructions}`.trim()
            : `${extractedHeader}${knowledge.sop_instructions}`.trim();

          return {
            ...prev,
            name: newName,
            description: newDesc,
            trigger_context: newTrigger,
            sop_instructions: newSop
          };
        });
        setScrapeSuccess(true);
      }
    } catch (err: any) {
      setScrapeError(err.message || 'Gagal memproses URL');
    } finally {
      setIsScraping(false);
    }
  };

  const handleAddActionField = () => {
    setSkillForm(prev => ({
      ...prev,
      suggested_actions: [
        ...(prev.suggested_actions || []),
        { label: '', action: 'navigate', url: '/dashboard', prompt: '' }
      ]
    }));
  };

  const handleRemoveActionField = (index: number) => {
    setSkillForm(prev => ({
      ...prev,
      suggested_actions: (prev.suggested_actions || []).filter((_, i) => i !== index)
    }));
  };

  const handleActionChange = (index: number, field: string, val: string) => {
    setSkillForm(prev => {
      const actions = [...(prev.suggested_actions || [])];
      const current = actions[index];
      if (!current) return prev;

      if (field === 'action') {
        const currentTarget = current.action === 'chat_prompt' ? (current.prompt || '') : (current.url || '');
        if (val === 'chat_prompt') {
          actions[index] = { ...current, action: val as any, prompt: currentTarget, url: '' };
        } else {
          actions[index] = { ...current, action: val as any, url: currentTarget, prompt: '' };
        }
      } else if (field === 'target') {
        if (current.action === 'chat_prompt') {
          actions[index] = { ...current, prompt: val, url: '' };
        } else {
          actions[index] = { ...current, url: val, prompt: '' };
        }
      } else {
        actions[index] = { ...current, [field]: val };
      }
      return { ...prev, suggested_actions: actions };
    });
  };

  const applySopTemplate = (type: 'pricing' | 'extend' | 'review') => {
    const templates = {
      pricing: `1. Tanyakan jumlah pertanyaan dan rencana lama tayang bila belum disebut peneliti.
2. Sebut tarif per hari untuk tier jumlah pertanyaannya beserta periodenya, PERSIS dari bagian TARIF IKLAN (OTOMATIS DARI SISTEM). Selisih terhadap harga normal disebut "Harga perkenalan" beserta tanggal berakhirnya — bukan diskon, voucher, atau "hemat".
3. Jelaskan bahwa tarif dikunci saat order dibuat (perpanjangan: saat dipesan; jadwal yang dipindah ke hari lain sebelum dibayar: saat dipindah), jadi memesan lebih awal mengamankan tarif periode ini.
4. Berikan simulasi: tarif per hari × jumlah hari + hadiah responden, ditambah PPN 11%.
5. Tawarkan konfirmasi pemesanan dan sediakan tombol aksi untuk menuju form pemesanan atau konsultasi WhatsApp.`,
      extend: `1. Awali dengan empati atas kekhawatiran peneliti jika jumlah responden belum memenuhi target menjelang batas jadwal selesai.
2. Analisis faktor penyebab secara objektif (misal: kriteria responden spesifik memerlukan waktu penetrasi lebih lama di panel).
3. Tawarkan opsi perpanjangan jadwal tayang (Extend) agar survei tetap aktif di feed responden. Biayanya = tarif per hari sesuai jumlah pertanyaan pada tanggal perpanjangan DIPESAN (lihat TARIF IKLAN) × jumlah hari + PPN 11%; angka pastinya tampil di halaman perpanjangan sebelum bayar.
4. Sediakan tombol aksi interaktif untuk langsung mengajukan perpanjangan atau menghubungi WhatsApp Admin.`,
      review: `1. Sambut ramah dan tanyakan ID survei atau email pemesan untuk memeriksa status kuesioner.
2. Jelaskan proses review kuesioner oleh tim QC Jakpat (memastikan kesesuaian target kriteria, logika alur pertanyaan, dan kelayakan link).
3. Informasikan estimasi waktu review (maksimal 1x24 jam kerja).
4. Sediakan tombol aksi untuk membuka Dashboard Survei atau hubungi CS jika mendesak.`
    };

    const text = templates[type];
    if (!skillForm.sop_instructions?.trim()) {
      setSkillForm(prev => ({ ...prev, sop_instructions: text }));
    } else {
      setSkillForm(prev => ({ ...prev, sop_instructions: prev.sop_instructions + '\n\n' + text }));
    }
    toast.success("Template SOP berhasil diterapkan!");
  };

  const addPresetAction = (preset: 'wa' | 'dashboard' | 'order' | 'extend') => {
    const presets = {
      wa: { label: '💬 Hubungi Admin CS', action: 'open_url' as const, url: 'https://wa.me/6281234567890?text=Halo%20Admin%20Jakpat', prompt: '' },
      dashboard: { label: '📊 Buka Dashboard Survei', action: 'navigate' as const, url: '/dashboard', prompt: '' },
      order: { label: '📝 Buat Survei Baru', action: 'navigate' as const, url: '/', prompt: '' },
      extend: { label: '⏱️ Ajukan Perpanjangan Slot', action: 'chat_prompt' as const, url: '', prompt: 'Saya ingin memperpanjang jadwal tayang survei saya' }
    };
    setSkillForm(prev => ({
      ...prev,
      suggested_actions: [...(prev.suggested_actions || []), presets[preset]]
    }));
    toast.success("Tombol aksi preset ditambahkan!");
  };

  const appendTriggerKeyword = (keyword: string) => {
    setSkillForm(prev => {
      const current = (prev.trigger_context || '').trim();
      const newText = current ? `${current}, ${keyword}` : keyword;
      return { ...prev, trigger_context: newText };
    });
  };

  const handleSaveSkill = async () => {
    setSkillError(null);

    if (!skillForm.name?.trim()) {
      const errText = "Kolom 'Nama Skill' wajib diisi!";
      setSkillError(errText);
      toast.error(errText);
      return;
    }

    if (!skillForm.trigger_context?.trim()) {
      const errText = "Kolom 'Trigger Context' (kapan skill aktif) wajib diisi!";
      setSkillError(errText);
      toast.error(errText);
      return;
    }

    if (!skillForm.sop_instructions?.trim()) {
      const errText = "Kolom 'Prosedur SOP / Langkah Berpikir AI' wajib diisi!";
      setSkillError(errText);
      toast.error(errText);
      return;
    }

    if ((skillForm.tag_label || '').trim().length > 100) {
      const errText = `Teks pada kolom 'Label Tag' terlalu panjang (${skillForm.tag_label?.trim().length} karakter). Maksimal 100 karakter!`;
      setSkillError(errText);
      toast.error(errText);
      return;
    }

    if ((skillForm.name || '').trim().length > 150) {
      const errText = `Teks pada kolom 'Nama Skill' terlalu panjang (${skillForm.name?.trim().length} karakter). Maksimal 150 karakter!`;
      setSkillError(errText);
      toast.error(errText);
      return;
    }

    setSavingSkill(true);
    try {
      const cleanedSkill = {
        ...skillForm,
        name: (skillForm.name || '').trim(),
        tag_label: (skillForm.tag_label || '').trim(),
        description: (skillForm.description || '').trim(),
        trigger_context: (skillForm.trigger_context || '').trim(),
        sop_instructions: (skillForm.sop_instructions || '').trim(),
        suggested_actions: (skillForm.suggested_actions || [])
          .filter(a => a.label?.trim())
          .map(a => {
            if (a.action === 'chat_prompt') {
              return { label: a.label.trim(), action: a.action, prompt: (a.prompt || a.url || '').trim() };
            }
            return { label: a.label.trim(), action: a.action, url: (a.url || a.prompt || '').trim() };
          })
      };

      const saved = await saveAISkill(cleanedSkill);
      if (saved) {
        if (isAddingSkill) {
          setSkills(prev => [...prev, saved]);
          toast.success("Skill baru berhasil ditambahkan!");
        } else {
          setSkills(prev => prev.map(s => s.id === saved.id ? saved : s));
          toast.success("Perubahan skill berhasil disimpan!");
        }
        setIsAddingSkill(false);
        setEditingSkillId(null);
      }
    } catch (err: any) {
      console.error('Error saving AI skill:', err);
      const friendlyMsg = formatSkillErrorMessage(err, skillForm);
      setSkillError(friendlyMsg);
      toast.error(friendlyMsg);
    } finally {
      setSavingSkill(false);
    }
  };

  const handleDeleteSkill = async (id: string) => {
    if (!window.confirm("Yakin ingin menghapus Skill ini?")) return;
    try {
      const success = await deleteAISkill(id);
      if (success) {
        setSkills(prev => prev.filter(s => s.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleSkill = async (id: string, currentStatus: boolean) => {
    try {
      const success = await toggleAISkillActive(id, currentStatus);
      if (success) {
        setSkills(prev => prev.map(s => s.id === id ? { ...s, is_active: !currentStatus } : s));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --- SYSTEM PROMPT ACTIONS ---
  const handleSavePrompt = async () => {
    setSavingPrompt(true);
    try {
      const { error } = await supabase
        .from('ai_settings')
        .upsert({ key: 'system_prompt', value: systemPrompt, updated_at: new Date().toISOString() });
        
      if (!error) {
        setPromptSaved(true);
        setTimeout(() => setPromptSaved(false), 3000);
      } else {
        alert("Gagal menyimpan System Prompt");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingPrompt(false);
    }
  };

  // --- FAQ ACTIONS ---
  const handleSaveFaq = async () => {
    if (!editForm.question || !editForm.answer) {
      alert("Pertanyaan dan Jawaban harus diisi!");
      return;
    }

    try {
      if (isAddingFaq) {
        const newOrder = faqs.length > 0 ? Math.max(...faqs.map(f => f.sort_order)) + 1 : 1;
        const { data, error } = await supabase
          .from('ai_knowledge_base')
          .insert({
            question: editForm.question,
            answer: editForm.answer,
            is_active: editForm.is_active ?? true,
            sort_order: newOrder
          })
          .select()
          .single();
          
        if (!error && data) {
          setFaqs([...faqs, data]);
        }
      } else if (editingFaq) {
        const { error } = await supabase
          .from('ai_knowledge_base')
          .update({
            question: editForm.question,
            answer: editForm.answer,
            is_active: editForm.is_active
          })
          .eq('id', editingFaq);
          
        if (!error) {
          setFaqs(faqs.map(f => f.id === editingFaq ? { ...f, ...editForm } as FAQ : f));
        }
      }
      
      setEditingFaq(null);
      setIsAddingFaq(false);
      setEditForm({});
    } catch (err) {
      console.error(err);
      alert("Gagal menyimpan FAQ");
    }
  };

  const handleDeleteFaq = async (id: string) => {
    if (!window.confirm("Yakin ingin menghapus FAQ ini?")) return;
    try {
      const { error } = await supabase
        .from('ai_knowledge_base')
        .delete()
        .eq('id', id);
      if (!error) {
        setFaqs(faqs.filter(f => f.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleFaqActive = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('ai_knowledge_base')
        .update({ is_active: !currentStatus })
        .eq('id', id);
      if (!error) {
        setFaqs(faqs.map(f => f.id === id ? { ...f, is_active: !currentStatus } : f));
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <BrainCircuit className="w-7 h-7 text-indigo-600" />
            Mimin AI Agentic Engine
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Kelola kapabilitas Agentic Skills, prosedur SOP, Dynamic Actions (CTAs), dan System Prompt untuk asisten virtual JFU.
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-xs transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('skills')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'skills'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Agentic Skills & SOPs ({skills.length})
        </button>
        <button
          onClick={() => setActiveTab('prompt')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'prompt'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Persona & System Prompt
        </button>
        <button
          onClick={() => setActiveTab('faqs')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'faqs'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Simple FAQs ({faqs.length})
        </button>
      </div>

      {/* TAB 1: AGENTIC SKILLS */}
      {activeTab === 'skills' && (
        <div className="space-y-6">
          {/* Top Bar */}
          <div className="flex items-center justify-between bg-indigo-50/50 border border-indigo-100 rounded-xl p-4">
            <div>
              <h2 className="text-sm font-bold text-indigo-900">Skills & Procedural SOPs</h2>
              <p className="text-xs text-indigo-700 mt-0.5">
                Mimin AI akan mengeksekusi SOP ini secara kontekstual saat percakapan user sesuai dengan Trigger Context.
              </p>
            </div>
            {!isAddingSkill && !editingSkillId && (
              <button
                onClick={handleOpenNewSkill}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 shadow-xs transition-all"
              >
                <Plus className="w-4 h-4" />
                Tambah Skill Baru
              </button>
            )}
          </div>

          {/* Add / Edit Skill Modal Popup */}
          {(isAddingSkill || editingSkillId) && createPortal(
            <div 
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-slate-950/40 backdrop-blur-xs animate-in fade-in duration-200 select-none sm:select-auto"
            >
              <div 
                className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
              >
                {/* Header (Sticky) */}
                <div className="p-5 px-6 bg-gradient-to-r from-indigo-50/90 via-purple-50/50 to-white border-b border-indigo-100 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm shrink-0">
                      <Sparkles className="w-5 h-5" />
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-indigo-950 text-base">
                          {isAddingSkill ? 'Tambah Skill & SOP Baru' : 'Edit Skill & SOP'}
                        </h3>
                        <span className="px-2 py-0.5 text-[10px] font-bold text-indigo-700 bg-indigo-100/80 border border-indigo-200 rounded-full">
                          Agentic AI Capability
                        </span>
                      </div>
                      <p className="text-xs text-indigo-700/80 mt-0.5">
                        Tentukan pemicu otomatis, aturan langkah berpikir SOP (Chain-of-Thought), dan tombol aksi mandiri untuk pengguna.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setIsAddingSkill(false); setEditingSkillId(null); setSkillError(null); }}
                    className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                    title="Tutup dialog"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Form Body (Scrollable) */}
                <div className="p-6 md:p-7 space-y-6 overflow-y-auto flex-1 bg-slate-50/50">
                  {/* Error Alert Banner */}
                  {skillError && (
                    <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-800 animate-in fade-in duration-200 shadow-2xs">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div className="flex-1 text-xs">
                        <strong className="font-bold block mb-0.5">Periksa Isian Form:</strong>
                        <p className="leading-relaxed">{skillError}</p>
                      </div>
                      <button 
                        type="button" 
                        onClick={() => setSkillError(null)}
                        className="text-rose-400 hover:text-rose-600 text-xs font-bold p-1 cursor-pointer"
                        title="Tutup pesan"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {/* Section 1: Identitas & Pemicu Otomatis */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
                    <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-100">
                        1
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-indigo-600" />
                          Identitas Skill & Pemicu AI (Trigger Context)
                        </h4>
                        <p className="text-[11px] text-slate-500">Tentukan nama, klasifikasi kategori, dan kalimat/keluhan user yang mengaktifkan SOP ini.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Nama Skill */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-xs font-semibold text-slate-800">
                            Nama Skill <span className="text-rose-500">*</span>
                          </label>
                          <span className={`text-[10px] ${(skillForm.name || '').length > 140 ? 'text-rose-600 font-bold' : 'text-slate-400'}`}>
                            {(skillForm.name || '').length}/150
                          </span>
                        </div>
                        <input
                          type="text"
                          maxLength={150}
                          value={skillForm.name || ''}
                          onChange={e => {
                            setSkillForm({ ...skillForm, name: e.target.value });
                            if (skillError) setSkillError(null);
                          }}
                          placeholder="Contoh: Diagnosa Responden Kurang & Upsell Extend"
                          className="w-full px-3.5 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400 shadow-2xs"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">Nama modul SOP yang dibaca oleh sistem AI internal.</p>
                      </div>

                      {/* Kategori Intent & Tag */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-xs font-semibold text-slate-800">
                            Kategori Intent & Tag Label
                          </label>
                          <span className={`text-[10px] ${(skillForm.tag_label || '').length > 90 ? 'text-rose-600 font-bold' : 'text-slate-400'}`}>
                            Tag: {(skillForm.tag_label || '').length}/100
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <select
                            value={skillForm.tag || 'request'}
                            onChange={e => setSkillForm({ ...skillForm, tag: e.target.value })}
                            className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-2xs"
                          >
                            <option value="request">🚀 Request / Upsell</option>
                            <option value="issue">🔴 Kendala / Issue</option>
                            <option value="feedback">💡 Saran / Feedback</option>
                            <option value="faq">💬 FAQ Umum</option>
                          </select>
                          <input
                            type="text"
                            maxLength={100}
                            value={skillForm.tag_label || ''}
                            onChange={e => {
                              setSkillForm({ ...skillForm, tag_label: e.target.value });
                              if (skillError) setSkillError(null);
                            }}
                            placeholder="Label tag, misal: Request Extend"
                            className={`px-3 py-2 text-xs bg-white border rounded-lg focus:ring-2 outline-none transition-all placeholder:text-slate-400 shadow-2xs ${
                              (skillForm.tag_label || '').length > 95
                                ? 'border-rose-300 focus:ring-rose-500/20 focus:border-rose-500'
                                : 'border-slate-200 focus:ring-indigo-500/20 focus:border-indigo-500'
                            }`}
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">Label ringkas untuk filter laporan & analitik obrolan.</p>
                      </div>
                    </div>

                    {/* Deskripsi Singkat */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                        Deskripsi Singkat Skill (Catatan Internal Tim)
                      </label>
                      <input
                        type="text"
                        value={skillForm.description || ''}
                        onChange={e => setSkillForm({ ...skillForm, description: e.target.value })}
                        placeholder="Contoh: Menangani keluhan responden sepi dan menawarkan slot extend perpanjangan jadwal"
                        className="w-full px-3.5 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400 shadow-2xs"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">Ringkasan tujuan skill untuk admin dashboard (tidak dibaca oleh pengguna).</p>
                    </div>

                    {/* Trigger Context */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-semibold text-slate-800">
                          Trigger Context (Kapan Skill Ini Harus Dipicu oleh AI?) <span className="text-rose-500">*</span>
                        </label>
                        <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                          Pemicu Otomatis AI
                        </span>
                      </div>
                      <textarea
                        rows={3}
                        value={skillForm.trigger_context || ''}
                        onChange={e => {
                          setSkillForm({ ...skillForm, trigger_context: e.target.value });
                          if (skillError) setSkillError(null);
                        }}
                        placeholder="Contoh: User bertanya atau mengeluh: respondennya sepi, lambat, belum mencapai target, kenapa kuesioner belum selesai, atau ingin menambah durasi penayangan."
                        className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all leading-relaxed placeholder:text-slate-400 shadow-2xs"
                      />
                      
                      {/* Keyword suggestion chips */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[10px] text-slate-400 font-medium">Sisipkan kata kunci pemicu:</span>
                        {[
                          'tarif/biaya',
                          'promo & diskon',
                          'responden sepi/kurang',
                          'perpanjang slot tayang',
                          'status review kuesioner',
                          'metode pembayaran'
                        ].map(kw => (
                          <button
                            key={kw}
                            type="button"
                            onClick={() => appendTriggerKeyword(kw)}
                            className="px-2 py-0.5 text-[10px] font-medium bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 rounded-md border border-slate-200 transition-colors cursor-pointer"
                          >
                            + {kw}
                          </button>
                        ))}
                      </div>

                      <div className="mt-1.5 p-2.5 bg-amber-50/60 border border-amber-200/70 rounded-lg flex items-start gap-2 text-[11px] text-amber-900">
                        <Lightbulb className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <span><strong>Tips Trigger:</strong> Tuliskan situasi spesifik atau kumpulan kata kunci yang sering dipakai user saat menghadapi kondisi ini.</span>
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Prosedur SOP / Langkah Berpikir AI */}
                  <div className="bg-white border border-indigo-200/90 rounded-xl p-5 shadow-2xs space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-indigo-100">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600 text-white text-xs font-bold shadow-2xs">
                          2
                        </span>
                        <div>
                          <h4 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                            Prosedur SOP & Panduan Berpikir AI <span className="text-rose-500">*</span>
                          </h4>
                          <p className="text-[11px] text-indigo-700/80">Langkah kerja berurutan (Chain-of-Thought) yang WAJIB dipatuhi AI dalam merespon obrolan user.</p>
                        </div>
                      </div>
                    </div>

                    {/* Auto-Extract Knowledge from URL Box */}
                    <div className="p-3.5 bg-gradient-to-r from-indigo-50/80 via-purple-50/50 to-slate-50 border border-indigo-100 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-1.5 text-xs font-bold text-indigo-950">
                          <Globe className="w-3.5 h-3.5 text-indigo-600" />
                          Tarik Materi Otomatis dari URL Web (Opsional)
                        </label>
                        <span className="text-[10px] font-semibold text-indigo-700 bg-white border border-indigo-200 px-2 py-0.5 rounded-full shadow-2xs">
                          ✨ AI Web Extractor
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <input
                            type="url"
                            value={scrapeUrl}
                            onChange={e => setScrapeUrl(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleScrapeUrl();
                              }
                            }}
                            placeholder="Tempel tautan URL web (misal: https://jakpat.net/pricing atau link artikel FAQ)..."
                            className="w-full pl-3.5 pr-8 py-2 text-xs bg-white border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none placeholder:text-slate-400"
                          />
                          {scrapeUrl && (
                            <button
                              type="button"
                              onClick={() => setScrapeUrl('')}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={handleScrapeUrl}
                          disabled={isScraping || !scrapeUrl.trim()}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all shrink-0 cursor-pointer active:scale-95"
                        >
                          {isScraping ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Mengekstrak...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Tarik & Ekstrak Web</span>
                            </>
                          )}
                        </button>
                      </div>
                      {scrapeError && (
                        <p className="text-[11px] text-rose-600 font-medium">⚠️ {scrapeError}</p>
                      )}
                      {scrapeSuccess && (
                        <p className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                          <Check className="w-3 h-3 text-emerald-600" />
                          Materi web berhasil diekstrak dan ditambahkan ke dalam kotak SOP di bawah!
                        </p>
                      )}
                      <p className="text-[10px] text-slate-500 leading-normal">
                        AI akan membaca isi halaman web dan otomatis merangkum poin penting, harga, dan ketentuan langsung ke dalam instruksi SOP.
                      </p>
                    </div>

                    {/* SOP Header with Quick Template buttons */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <label className="block text-xs font-semibold text-slate-800">
                          Instruksi Langkah Berpikir SOP (Chain-of-Thought)
                        </label>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] text-slate-400 font-medium">Template Cepat:</span>
                          <button
                            type="button"
                            onClick={() => applySopTemplate('pricing')}
                            className="px-2 py-1 text-[10px] font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-md border border-indigo-200 transition-all cursor-pointer"
                            title="Terapkan kerangka SOP untuk info tarif & promo"
                          >
                            🏷️ Tarif & Promo (1 Okt)
                          </button>
                          <button
                            type="button"
                            onClick={() => applySopTemplate('extend')}
                            className="px-2 py-1 text-[10px] font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-md border border-amber-200 transition-all cursor-pointer"
                            title="Terapkan kerangka SOP untuk keluhan responden & perpanjangan"
                          >
                            🛠️ Responden & Extend
                          </button>
                          <button
                            type="button"
                            onClick={() => applySopTemplate('review')}
                            className="px-2 py-1 text-[10px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-md border border-emerald-200 transition-all cursor-pointer"
                            title="Terapkan kerangka SOP untuk status review form"
                          >
                            📋 Review Form
                          </button>
                        </div>
                      </div>

                      {/* SOP Textarea */}
                      <textarea
                        rows={7}
                        value={skillForm.sop_instructions || ''}
                        onChange={e => {
                          setSkillForm({ ...skillForm, sop_instructions: e.target.value });
                          if (skillError) setSkillError(null);
                        }}
                        placeholder="1. Tunjukkan empati dan cek tanggal selesai jadwal survei user di ORDER CONTEXT.&#10;2. Berikan insight penyebab (misal: kriteria spesifik butuh waktu penetrasi).&#10;3. Tawarkan solusi konkrit: perpanjangan slot tayang (Extend) seharga Rp 50.000/hari tambahan.&#10;4. Sertakan action button untuk membuka perpanjangan."
                        className="w-full px-3.5 py-3 text-xs font-mono text-slate-800 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none leading-relaxed transition-all placeholder:text-slate-400 shadow-2xs"
                      />
                    </div>

                    {/* Best Practice Guidance Box */}
                    <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg text-[11px] text-slate-600 space-y-1">
                      <p className="font-semibold text-indigo-950 flex items-center gap-1.5">
                        <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                        Panduan Menulis SOP yang Efektif:
                      </p>
                      <ul className="list-disc list-inside space-y-0.5 text-slate-500 pl-1">
                        <li>Gunakan <strong>penomoran (1, 2, 3...)</strong> agar AI menjalankan langkah secara runtut (*Chain-of-Thought*).</li>
                        <li>Sertakan <strong>fakta pasti & angka riil</strong> (tarif, durasi jam kerja, aturan likert) agar AI tidak berhalusinasi.</li>
                        <li>Awali dengan <strong>empati</strong> dan tutup dengan <strong>solusi tindakan</strong> nyata bagi user.</li>
                      </ul>
                    </div>
                  </div>

                  {/* Section 3: Dynamic CTAs Builder */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-100">
                          3
                        </span>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                            <MousePointerClick className="w-3.5 h-3.5 text-indigo-600" />
                            Rekomendasi Tombol Aksi (Dynamic CTAs)
                          </h4>
                          <p className="text-[11px] text-slate-500">Tombol mandiri interaktif yang muncul di bawah obrolan agar user tinggal klik tanpa repot mengetik.</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddActionField}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-all cursor-pointer active:scale-95"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Tambah Tombol Aksi
                      </button>
                    </div>

                    {/* Presets bar for Action Buttons */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      <span className="text-[10px] text-slate-400 font-medium">Sisipkan tombol aksi cepat:</span>
                      <button
                        type="button"
                        onClick={() => addPresetAction('wa')}
                        className="px-2 py-1 text-[10px] font-medium bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md border border-emerald-200 transition-all cursor-pointer"
                      >
                        + 💬 WA Admin
                      </button>
                      <button
                        type="button"
                        onClick={() => addPresetAction('dashboard')}
                        className="px-2 py-1 text-[10px] font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-md border border-indigo-200 transition-all cursor-pointer"
                      >
                        + 📊 Buka Dashboard
                      </button>
                      <button
                        type="button"
                        onClick={() => addPresetAction('order')}
                        className="px-2 py-1 text-[10px] font-medium bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-md border border-purple-200 transition-all cursor-pointer"
                      >
                        + 📝 Buat Survei Baru
                      </button>
                      <button
                        type="button"
                        onClick={() => addPresetAction('extend')}
                        className="px-2 py-1 text-[10px] font-medium bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-md border border-amber-200 transition-all cursor-pointer"
                      >
                        + ⏱️ Perpanjang Slot
                      </button>
                    </div>

                    <div className="space-y-2.5">
                      {(skillForm.suggested_actions || []).length === 0 ? (
                        <div className="p-6 rounded-xl border border-dashed border-slate-200 text-center space-y-1.5 bg-slate-50/40">
                          <MousePointerClick className="w-6 h-6 text-slate-300 mx-auto" />
                          <p className="text-xs font-semibold text-slate-600">Belum ada tombol aksi</p>
                          <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                            Klik tombol <strong>"+ Tambah Tombol Aksi"</strong> di atas untuk membuat tautan cepat (misal: link pembayaran, buka dashboard, atau WhatsApp CS).
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            <span className="col-span-4">Label Tombol</span>
                            <span className="col-span-3">Jenis Tindakan</span>
                            <span className="col-span-4">Target (URL / Teks Prompt)</span>
                            <span className="col-span-1 text-center">Hapus</span>
                          </div>

                          {skillForm.suggested_actions?.map((act, idx) => (
                            <div 
                              key={idx} 
                              className="flex flex-col sm:grid sm:grid-cols-12 gap-2 p-2.5 rounded-xl bg-slate-50/80 border border-slate-200 items-center transition-all hover:bg-slate-50"
                            >
                              <div className="w-full sm:col-span-4">
                                <input
                                  type="text"
                                  value={act.label}
                                  onChange={e => handleActionChange(idx, 'label', e.target.value)}
                                  placeholder="Label tombol (misal: 🚀 Perpanjang Tayang)"
                                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20"
                                />
                              </div>
                              <div className="w-full sm:col-span-3">
                                <select
                                  value={act.action}
                                  onChange={e => handleActionChange(idx, 'action', e.target.value)}
                                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20"
                                >
                                  <option value="navigate">Pindah Halaman (navigate)</option>
                                  <option value="open_url">Buka Link Luar (open_url)</option>
                                  <option value="chat_prompt">Auto Kirim Chat (chat_prompt)</option>
                                </select>
                              </div>
                              <div className="w-full sm:col-span-4">
                                <input
                                  type="text"
                                  value={act.action === 'chat_prompt' ? (act.prompt ?? '') : (act.url ?? '')}
                                  onChange={e => handleActionChange(idx, 'target', e.target.value)}
                                  placeholder={
                                    act.action === 'chat_prompt'
                                      ? 'Pesan otomatis saat diklik...'
                                      : act.action === 'open_url'
                                        ? 'https://wa.me/... atau link web'
                                        : '/dashboard, /faq, /pricing'
                                  }
                                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20"
                                />
                              </div>
                              <div className="w-full sm:col-span-1 flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveActionField(idx)}
                                  className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  title="Hapus tombol aksi ini"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer Controls (Sticky) */}
                <div className="flex items-center justify-between p-4 px-6 border-t border-slate-200 bg-white shrink-0">
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-700 select-none">
                    <input
                      type="checkbox"
                      checked={skillForm.is_active ?? true}
                      onChange={e => setSkillForm({ ...skillForm, is_active: e.target.checked })}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span>Status Skill:</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      skillForm.is_active ?? true 
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                        : 'bg-slate-200 text-slate-600 border border-slate-300'
                    }`}>
                      {skillForm.is_active ?? true ? '🟢 Aktif Digunakan AI' : '⚪ Non-aktif (Arsip)'}
                    </span>
                  </label>

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => { setIsAddingSkill(false); setEditingSkillId(null); setSkillError(null); }}
                      className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveSkill}
                      disabled={savingSkill}
                      className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm disabled:opacity-50 transition-all cursor-pointer active:scale-95"
                    >
                      {savingSkill ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      <span>{savingSkill ? 'Menyimpan...' : 'Simpan Skill & SOP'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}

          {/* Skills List */}
          <div className="grid grid-cols-1 gap-4">
            {skills.map((skill) => (
              <div
                key={skill.id}
                className={`bg-white rounded-xl border transition-all p-5 shadow-xs ${
                  skill.is_active ? 'border-slate-200 hover:border-indigo-200' : 'border-slate-200 opacity-60 bg-slate-50/50'
                }`}
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center">
                        {skill.sort_order}
                      </span>
                      <h3 className="font-bold text-slate-900 text-sm">{skill.name}</h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {skill.tag_label || skill.tag}
                      </span>
                      {skill.is_active ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Aktif
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500">
                          Nonaktif
                        </span>
                      )}
                    </div>
                    {skill.description && (
                      <p className="text-xs text-slate-500 pl-8">{skill.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleToggleSkill(skill.id, skill.is_active)}
                      className={`text-xs px-2.5 py-1 rounded font-medium border transition-colors ${
                        skill.is_active 
                          ? 'border-slate-200 text-slate-600 hover:bg-slate-100' 
                          : 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                      }`}
                    >
                      {skill.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                    <button
                      onClick={() => handleEditSkill(skill)}
                      className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteSkill(skill.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Trigger Context Box */}
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 mb-3 text-xs space-y-1">
                  <div className="font-semibold text-slate-700 flex items-center gap-1.5 text-[11px]">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    Trigger Context:
                  </div>
                  <p className="text-slate-600 italic pl-5 leading-relaxed">
                    "{skill.trigger_context}"
                  </p>
                </div>

                {/* SOP Instructions */}
                <div className="text-xs text-slate-700 pl-1 mb-3">
                  <div className="font-semibold text-slate-800 mb-1">Langkah SOP:</div>
                  <pre className="text-xs text-slate-600 whitespace-pre-wrap font-sans bg-slate-50/50 p-2.5 rounded border border-slate-100 leading-relaxed">
                    {skill.sop_instructions}
                  </pre>
                </div>

                {/* Action CTAs */}
                {skill.suggested_actions && skill.suggested_actions.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-100">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">
                      Action Buttons:
                    </span>
                    {skill.suggested_actions.map((act, aIdx) => (
                      <span
                        key={aIdx}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100"
                      >
                        {act.label}
                        <span className="text-[10px] text-indigo-400 font-normal">
                          ({act.action})
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: SYSTEM PROMPT */}
      {activeTab === 'prompt' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">System Prompt (Persona Dasar)</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Instruksi global untuk mendefinisikan persona, nada bicara ramah mahasiswa, dan batasan umum AI.
              </p>
            </div>
            <button 
              onClick={handleSavePrompt}
              disabled={savingPrompt}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-xs"
            >
              {savingPrompt ? <Loader2 className="w-4 h-4 animate-spin" /> : promptSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {promptSaved ? 'Tersimpan!' : 'Simpan Prompt'}
            </button>
          </div>
          <div className="p-6" data-color-mode="light">
            <style>{`
              .w-md-editor-text-pre > code,
              .w-md-editor-text-input,
              .w-md-editor-text {
                color: #111827 !important;
                -webkit-text-fill-color: #111827 !important;
              }
            `}</style>
            <MDEditor
              value={systemPrompt}
              onChange={(val) => setSystemPrompt(val || '')}
              height={450}
              preview="edit"
              extraCommands={[]}
              className="w-full shadow-none border border-slate-200 overflow-hidden rounded-lg"
              commands={[
                commands.bold,
                commands.italic,
                commands.divider,
                commands.unorderedListCommand,
                commands.orderedListCommand
              ]}
            />
          </div>
        </div>
      )}

      {/* TAB 3: SIMPLE FAQS */}
      {activeTab === 'faqs' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Simple FAQs (Q&A Standar)</h2>
              <p className="text-xs text-slate-500 mt-0.5">Pertanyaan dan jawaban standar cepat untuk referensi tambahan Mimin AI.</p>
            </div>
            <button 
              onClick={() => {
                setIsAddingFaq(true);
                setEditingFaq(null);
                setEditForm({ is_active: true });
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-lg hover:bg-indigo-100 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Tambah FAQ
            </button>
          </div>

          <div className="p-6 space-y-4">
            {(isAddingFaq || editingFaq) && (
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-lg p-5 space-y-4">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-semibold text-indigo-900 text-sm">{isAddingFaq ? 'Tambah FAQ Baru' : 'Edit FAQ'}</h3>
                  <button onClick={() => { setIsAddingFaq(false); setEditingFaq(null); }} className="text-slate-400 hover:text-slate-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Pertanyaan (User)</label>
                  <input 
                    type="text" 
                    value={editForm.question || ''}
                    onChange={e => setEditForm({...editForm, question: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                    placeholder="Contoh: Berapa lama kuesioner tayang?"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Jawaban (Mimin AI)</label>
                  <textarea 
                    value={editForm.answer || ''}
                    onChange={e => setEditForm({...editForm, answer: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                    rows={3}
                    placeholder="Tulis jawaban lengkap..."
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button 
                    onClick={() => { setIsAddingFaq(false); setEditingFaq(null); }}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-md"
                  >
                    Batal
                  </button>
                  <button 
                    onClick={handleSaveFaq}
                    className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                  >
                    Simpan
                  </button>
                </div>
              </div>
            )}

            <div className="divide-y divide-slate-100">
              {faqs.map((faq) => (
                <div key={faq.id} className="py-3 flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-slate-900">{faq.question}</span>
                      <button 
                        onClick={() => toggleFaqActive(faq.id, faq.is_active)}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          faq.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {faq.is_active ? 'Aktif' : 'Nonaktif'}
                      </button>
                    </div>
                    <p className="text-xs text-slate-600">{faq.answer}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button 
                      onClick={() => {
                        setEditingFaq(faq.id);
                        setEditForm(faq);
                        setIsAddingFaq(false);
                      }}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 rounded"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => handleDeleteFaq(faq.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MiminAISetup;
