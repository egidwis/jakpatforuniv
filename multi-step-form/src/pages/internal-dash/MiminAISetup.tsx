import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { Save, Plus, Trash2, Edit2, Loader2, Check, X, RefreshCw, Eye, Edit } from 'lucide-react';
import MDEditor, { commands } from '@uiw/react-md-editor';

interface FAQ {
  id: string;
  question: string;
  answer: string;
  is_active: boolean;
  sort_order: number;
}

const MiminAISetup: React.FC = () => {
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [promptSaved, setPromptSaved] = useState(false);
  
  const [editingFaq, setEditingFaq] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<FAQ>>({});
  const [isAddingNew, setIsAddingNew] = useState(false);

  const fetchKnowledge = async () => {
    setLoading(true);
    try {
      // Fetch system prompt
      const { data: promptData, error: promptError } = await supabase
        .from('ai_settings')
        .select('value')
        .eq('key', 'system_prompt')
        .single();
        
      if (!promptError && promptData) {
        setSystemPrompt(promptData.value);
      }

      // Fetch FAQs
      const { data: faqData, error: faqError } = await supabase
        .from('ai_knowledge_base')
        .select('*')
        .order('sort_order', { ascending: true });
        
      if (!faqError && faqData) {
        setFaqs(faqData);
      }
    } catch (err) {
      console.error("Error fetching knowledge base:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKnowledge();
  }, []);

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

  const handleSaveFaq = async () => {
    if (!editForm.question || !editForm.answer) {
      alert("Pertanyaan dan Jawaban harus diisi!");
      return;
    }

    try {
      if (isAddingNew) {
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
      setIsAddingNew(false);
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
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mimin AI Setup</h1>
        <p className="text-sm text-gray-500 mt-1">
          Atur instruksi dasar (System Prompt) dan Knowledge Base (FAQ) untuk asisten virtual JFU.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">System Prompt (Instruksi Dasar)</h2>
            <p className="text-xs text-gray-500 mt-1">Instruksi ini akan mendefinisikan persona dan aturan utama AI.</p>
          </div>
          <button 
            onClick={handleSavePrompt}
            disabled={savingPrompt}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
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
            className="w-full shadow-none border border-gray-200 overflow-hidden rounded-lg"
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

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Knowledge Base (FAQ)</h2>
            <p className="text-xs text-gray-500 mt-1">Data spesifik yang digunakan Mimin AI untuk menjawab pertanyaan user.</p>
          </div>
          <button 
            onClick={() => {
              setIsAddingNew(true);
              setEditingFaq(null);
              setEditForm({ is_active: true });
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-100 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Tambah FAQ
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Add / Edit Form */}
          {(isAddingNew || editingFaq) && (
            <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-5 space-y-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-medium text-blue-900">{isAddingNew ? 'Tambah FAQ Baru' : 'Edit FAQ'}</h3>
                <button onClick={() => { setIsAddingNew(false); setEditingFaq(null); }} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Pertanyaan (User)</label>
                <input 
                  type="text" 
                  value={editForm.question || ''}
                  onChange={e => setEditForm({...editForm, question: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Contoh: Berapa lama waktu survei?"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Jawaban (Mimin AI)</label>
                <textarea 
                  value={editForm.answer || ''}
                  onChange={e => setEditForm({...editForm, answer: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm h-24 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Contoh: Biasanya memakan waktu 1-3 hari kerja..."
                />
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id="isActiveToggle"
                  checked={editForm.is_active !== false}
                  onChange={e => setEditForm({...editForm, is_active: e.target.checked})}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="isActiveToggle" className="text-sm text-gray-700">Aktif (Gunakan dalam prompt)</label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button 
                  onClick={() => { setIsAddingNew(false); setEditingFaq(null); }}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Batal
                </button>
                <button 
                  onClick={handleSaveFaq}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Simpan
                </button>
              </div>
            </div>
          )}

          {/* List of FAQs */}
          <div className="space-y-3">
            {faqs.map((faq, idx) => (
              <div key={faq.id} className={`border rounded-lg p-4 transition-colors ${faq.is_active ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-bold text-gray-400 mt-0.5 w-4">{idx + 1}.</span>
                      <h4 className="font-medium text-gray-900 text-sm leading-tight">{faq.question}</h4>
                    </div>
                    <div className="flex items-start gap-2 pl-6">
                      <span className="text-xs font-bold text-blue-400 mt-0.5">A:</span>
                      <p className="text-gray-600 text-sm">{faq.answer}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button 
                      onClick={() => toggleFaqActive(faq.id, faq.is_active)}
                      className={`px-2 py-1 text-xs font-medium rounded-md ${faq.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                    >
                      {faq.is_active ? 'Aktif' : 'Nonaktif'}
                    </button>
                    <button 
                      onClick={() => {
                        setEditingFaq(faq.id);
                        setIsAddingNew(false);
                        setEditForm(faq);
                      }}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDeleteFaq(faq.id)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-md"
                      title="Hapus"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            
            {faqs.length === 0 && !loading && (
              <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-xl">
                <p className="text-gray-500 text-sm">Belum ada Knowledge Base.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MiminAISetup;
