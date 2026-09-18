import React, { useState, useEffect } from 'react';
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
  ExternalLink, 
  Tag, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';
import MDEditor, { commands } from '@uiw/react-md-editor';

interface FAQ {
  id: string;
  question: string;
  answer: string;
  is_active: boolean;
  sort_order: number;
}

type TabType = 'skills' | 'prompt' | 'faqs';

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

  // --- SKILL ACTIONS ---
  const handleOpenNewSkill = () => {
    setIsAddingSkill(true);
    setEditingSkillId(null);
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
    setSkillForm({
      ...skill,
      suggested_actions: skill.suggested_actions || []
    });
  };

  const handleAddActionField = () => {
    setSkillForm(prev => ({
      ...prev,
      suggested_actions: [
        ...(prev.suggested_actions || []),
        { label: 'Tombol Aksi Baru', action: 'navigate', url: '/dashboard' }
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
      actions[index] = { ...actions[index], [field]: val };
      return { ...prev, suggested_actions: actions };
    });
  };

  const handleSaveSkill = async () => {
    if (!skillForm.name || !skillForm.trigger_context || !skillForm.sop_instructions) {
      alert("Nama Skill, Trigger Context, dan SOP Prosedur wajib diisi!");
      return;
    }

    setSavingSkill(true);
    try {
      const saved = await saveAISkill(skillForm);
      if (saved) {
        if (isAddingSkill) {
          setSkills(prev => [...prev, saved]);
        } else {
          setSkills(prev => prev.map(s => s.id === saved.id ? saved : s));
        }
        setIsAddingSkill(false);
        setEditingSkillId(null);
      }
    } catch (err) {
      console.error(err);
      alert("Gagal menyimpan AI Skill");
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

          {/* Add / Edit Skill Drawer / Form */}
          {(isAddingSkill || editingSkillId) && (
            <div className="bg-white rounded-xl shadow-sm border border-indigo-200 overflow-hidden">
              <div className="p-5 bg-indigo-50/70 border-b border-indigo-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-indigo-950 text-base flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    {isAddingSkill ? 'Tambah Skill & SOP Baru' : 'Edit Skill & SOP'}
                  </h3>
                  <p className="text-xs text-indigo-700 mt-0.5">
                    Tentukan nama, trigger kapan skill ini aktif, langkah berpikir SOP, dan tombol aksi yang dihasilkan.
                  </p>
                </div>
                <button
                  onClick={() => { setIsAddingSkill(false); setEditingSkillId(null); }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nama Skill <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={skillForm.name || ''}
                      onChange={e => setSkillForm({ ...skillForm, name: e.target.value })}
                      placeholder="Contoh: Diagnosa Responden Kurang & Upsell Extend"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Kategori Intent & Tag
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={skillForm.tag || 'request'}
                        onChange={e => setSkillForm({ ...skillForm, tag: e.target.value })}
                        className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                      >
                        <option value="request">🚀 Request / Upsell</option>
                        <option value="issue">🔴 Kendala / Issue</option>
                        <option value="feedback">💡 Saran / Feedback</option>
                        <option value="faq">💬 FAQ Umum</option>
                      </select>
                      <input
                        type="text"
                        value={skillForm.tag_label || ''}
                        onChange={e => setSkillForm({ ...skillForm, tag_label: e.target.value })}
                        placeholder="Label tag, misal: Request Extend"
                        className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Deskripsi Singkat Skill
                  </label>
                  <input
                    type="text"
                    value={skillForm.description || ''}
                    onChange={e => setSkillForm({ ...skillForm, description: e.target.value })}
                    placeholder="Contoh: Menangani keluhan responden sepi dan menawarkan slot extend"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Trigger Context (Kapan Skill Ini Harus Dipicu oleh AI?) <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    value={skillForm.trigger_context || ''}
                    onChange={e => setSkillForm({ ...skillForm, trigger_context: e.target.value })}
                    placeholder="Contoh: Ketika user mengeluh respondennya sepi, lambat, progres kuesioner belum selesai, atau ingin menambah durasi penayangan."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                  />
                  <p className="text-[11px] text-slate-400 mt-0.5">Jelaskan situasi atau kata-kata kunci user yang mengaktifkan skill ini.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Prosedur SOP / Langkah Berpikir AI <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={4}
                    value={skillForm.sop_instructions || ''}
                    onChange={e => setSkillForm({ ...skillForm, sop_instructions: e.target.value })}
                    placeholder="1. Tunjukkan empati dan cek tanggal selesai jadwal order user.&#10;2. Jelaskan potensi penyebab (misal: kriteria demografi spesifik).&#10;3. Tawarkan opsi extend perpanjangan seharga Rp 50.000/hari tambahan.&#10;4. Sertakan action button untuk membuka perpanjangan."
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                  />
                  <p className="text-[11px] text-slate-400 mt-0.5">Tulis instruksi langkah demi langkah yang harus dipatuhi AI dalam merespon.</p>
                </div>

                {/* Dynamic Actions (CTAs) Builder */}
                <div className="border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-semibold text-slate-700">
                      Rekomendasi Tombol Aksi (Dynamic CTAs)
                    </label>
                    <button
                      type="button"
                      onClick={handleAddActionField}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Tambah Tombol Aksi
                    </button>
                  </div>

                  <div className="space-y-2">
                    {(skillForm.suggested_actions || []).length === 0 ? (
                      <div className="p-3 rounded-lg border border-dashed border-slate-200 text-center text-xs text-slate-400">
                        Belum ada tombol aksi. Klik "+ Tambah Tombol Aksi" untuk menambahkan CTA yang akan muncul di chat.
                      </div>
                    ) : (
                      skillForm.suggested_actions?.map((act, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
                          <input
                            type="text"
                            value={act.label}
                            onChange={e => handleActionChange(idx, 'label', e.target.value)}
                            placeholder="Label tombol (misal: 🚀 Perpanjang Tayang)"
                            className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded outline-none"
                          />
                          <select
                            value={act.action}
                            onChange={e => handleActionChange(idx, 'action', e.target.value)}
                            className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded outline-none"
                          >
                            <option value="navigate">Pindah Halaman (navigate)</option>
                            <option value="open_url">Buka Link Eksternal (open_url)</option>
                            <option value="chat_prompt">Auto Kirim Chat (chat_prompt)</option>
                          </select>
                          <input
                            type="text"
                            value={act.url || act.prompt || ''}
                            onChange={e => handleActionChange(idx, act.action === 'chat_prompt' ? 'prompt' : 'url', e.target.value)}
                            placeholder={act.action === 'chat_prompt' ? 'Teks prompt...' : '/dashboard atau https://wa.me/...'}
                            className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveActionField(idx)}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={skillForm.is_active ?? true}
                      onChange={e => setSkillForm({ ...skillForm, is_active: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    Status Skill Aktif
                  </label>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { setIsAddingSkill(false); setEditingSkillId(null); }}
                      className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveSkill}
                      disabled={savingSkill}
                      className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 shadow-xs disabled:opacity-50"
                    >
                      {savingSkill ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Simpan Skill
                    </button>
                  </div>
                </div>
              </div>
            </div>
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
