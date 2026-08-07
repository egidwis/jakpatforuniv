import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import type { QuestionBlock, QuestionType } from '../../utils/customForms';
import {
  getCustomFormById,
  saveCustomForm
} from '../../utils/customForms';
import { QuestionBlockEditor } from '../../components/form-builder/QuestionBlockEditor';
import { FormAiAssistantDrawer } from '../../components/form-builder/FormAiAssistantDrawer';
import type { AiAction } from '../../utils/formAiAgent';
import {
  ArrowLeft,
  Save,
  Globe,
  Type,
  AlignLeft,
  CircleDot,
  CheckSquare,
  Star,
  Calendar,
  Loader2,
  ExternalLink,
  Copy,
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';

export const FormBuilderPage: React.FC = () => {
  const { formId } = useParams<{ formId?: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(!!formId);
  const [saving, setSaving] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);

  const [title, setTitle] = useState('Untitled Form');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [blocks, setBlocks] = useState<QuestionBlock[]>([
    {
      id: crypto.randomUUID(),
      type: 'short_text',
      label: 'Sample Question 1',
      description: '',
      required: true
    }
  ]);

  useEffect(() => {
    if (formId) {
      loadForm(formId);
    }
  }, [formId]);

  const loadForm = async (id: string) => {
    try {
      setLoading(true);
      const form = await getCustomFormById(id);
      if (form) {
        setTitle(form.title || 'Untitled Form');
        setDescription(form.description || '');
        setStatus(form.status === 'published' ? 'published' : 'draft');
        setBlocks(form.schema && form.schema.length > 0 ? form.schema : []);
      } else {
        toast.error('Form not found');
        navigate('/dashboard/forms');
      }
    } catch (err) {
      toast.error('Failed to load form');
    } finally {
      setLoading(false);
    }
  };

  const handleAddQuestion = (type: QuestionType) => {
    const newBlock: QuestionBlock = {
      id: crypto.randomUUID(),
      type,
      label: type === 'multiple_choice' || type === 'checkbox' ? 'Choose an option' : 'Enter question title...',
      description: '',
      required: false,
      options: type === 'multiple_choice' || type === 'checkbox' ? ['Option 1', 'Option 2'] : undefined,
      minScale: type === 'rating' ? 1 : undefined,
      maxScale: type === 'rating' ? 5 : undefined
    };
    setBlocks(prev => [...prev, newBlock]);
  };

  const handleUpdateBlock = (index: number, updatedBlock: QuestionBlock) => {
    setBlocks(prev => {
      const next = [...prev];
      next[index] = updatedBlock;
      return next;
    });
  };

  const handleDeleteBlock = (index: number) => {
    setBlocks(prev => prev.filter((_, i) => i !== index));
  };

  const handleDuplicateBlock = (index: number) => {
    const target = blocks[index];
    const duplicated: QuestionBlock = {
      ...target,
      id: crypto.randomUUID(),
      label: `${target.label} (Copy)`
    };
    setBlocks(prev => {
      const next = [...prev];
      next.splice(index + 1, 0, duplicated);
      return next;
    });
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setBlocks(prev => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const handleMoveDown = (index: number) => {
    if (index === blocks.length - 1) return;
    setBlocks(prev => {
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const handleSave = async (targetStatus: 'draft' | 'published') => {
    if (!user) {
      toast.error('Authentication required');
      return;
    }

    if (!title.trim()) {
      toast.error('Form title is required');
      return;
    }

    try {
      setSaving(true);
      const savedForm = await saveCustomForm(
        {
          id: formId,
          title: title.trim(),
          description: description.trim(),
          schema: blocks,
          status: targetStatus
        },
        user.id
      );

      setStatus(savedForm.status === 'published' ? 'published' : 'draft');
      toast.success(
        targetStatus === 'published' ? 'Form Published successfully!' : 'Form saved as Draft'
      );

      if (!formId) {
        navigate(`/dashboard/forms/${savedForm.id}/edit`, { replace: true });
      }
    } catch (err) {
      toast.error('Failed to save form');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyPublicLink = () => {
    if (!formId) return;
    const origin = window.location.origin;
    const url = `${origin}/f/${formId}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    toast.success('Public link copied to clipboard!');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleApplyAiActions = (actions: AiAction[]) => {
    actions.forEach((act) => {
      if (act.type === 'SET_TITLE' && act.value) {
        setTitle(act.value);
      } else if (act.type === 'SET_DESCRIPTION' && act.value) {
        setDescription(act.value);
      } else if (act.type === 'ADD_BLOCK' && act.block) {
        const newBlock: QuestionBlock = {
          id: crypto.randomUUID(),
          type: (act.block.type as QuestionType) || 'short_text',
          label: act.block.label || 'Question Title',
          description: act.block.description || '',
          required: !!act.block.required,
          options: act.block.options || (act.block.type === 'multiple_choice' || act.block.type === 'checkbox' ? ['Option 1', 'Option 2'] : undefined),
          maxScale: act.block.maxScale || 5
        };
        setBlocks(prev => [...prev, newBlock]);
      } else if (act.type === 'REMOVE_BLOCK' && typeof act.index === 'number') {
        setBlocks(prev => prev.filter((_, i) => i !== act.index));
      } else if (act.type === 'UPDATE_BLOCK' && typeof act.index === 'number' && act.block) {
        setBlocks(prev => {
          const next = [...prev];
          if (next[act.index!]) {
            next[act.index!] = { ...next[act.index!], ...act.block };
          }
          return next;
        });
      } else if (act.type === 'REPLACE_ALL') {
        if (act.value) setTitle(act.value);
        if (act.description) setDescription(act.description);
        if (Array.isArray(act.blocks)) {
          const newBlocks: QuestionBlock[] = act.blocks.map(b => ({
            id: crypto.randomUUID(),
            type: (b.type as QuestionType) || 'short_text',
            label: b.label || 'Question Title',
            description: b.description || '',
            required: !!b.required,
            options: b.options || (b.type === 'multiple_choice' || b.type === 'checkbox' ? ['Option 1', 'Option 2'] : undefined),
            maxScale: b.maxScale || 5
          }));
          setBlocks(newBlocks);
        }
      }
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
        <p className="text-sm text-gray-500">Memuat editor form...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
      {/* Top Navbar Editor */}
      <header className="sticky top-0 z-30 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/dashboard/forms')}
              className="h-9 w-9 p-0"
              title="Back to Forms List"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-gray-900 dark:text-white truncate">
                {title || 'Untitled Form'}
              </h1>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    status === 'published'
                      ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                      : 'bg-amber-50 text-amber-600 border border-amber-200'
                  }`}
                >
                  {status === 'published' ? 'Published' : 'Draft'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Ask AI Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAiDrawerOpen(true)}
              className="text-xs text-purple-700 bg-purple-50 hover:bg-purple-100 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800 flex items-center gap-1.5 font-semibold"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              Ask AI <span className="text-[9px] bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200 px-1 py-0.2 rounded font-bold">Beta</span>
            </Button>

            {formId && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyPublicLink}
                  className="text-xs text-gray-700 dark:text-gray-200 hidden sm:flex items-center gap-1.5"
                >
                  {copiedLink ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  Copy Link
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`/f/${formId}`, '_blank')}
                  className="text-xs text-gray-700 dark:text-gray-200 hidden sm:flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Preview
                </Button>
              </>
            )}

            <Button
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => handleSave('draft')}
              className="text-xs text-gray-700 dark:text-gray-200"
            >
              <Save className="w-3.5 h-3.5 mr-1" /> Simpan Draft
            </Button>

            <Button
              size="sm"
              disabled={saving}
              onClick={() => handleSave('published')}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
              ) : (
                <Globe className="w-3.5 h-3.5 mr-1" />
              )}
              Publish Form
            </Button>
          </div>
        </div>
      </header>

      {/* Editor Body */}
      <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6 mt-4">
        {/* Form Header Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-t-8 border-t-blue-600 border-x border-b border-gray-200 dark:border-gray-700 p-6 shadow-sm space-y-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Judul Form / Survei..."
            className="w-full text-2xl font-bold text-gray-900 dark:text-white bg-transparent border-b border-gray-200 dark:border-gray-700 focus:border-blue-600 focus:outline-none pb-2"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Deskripsi atau instruksi untuk responden (opsional)..."
            rows={2}
            className="w-full text-sm text-gray-600 dark:text-gray-300 bg-transparent border-b border-dashed border-gray-200 dark:border-gray-700 focus:border-blue-600 focus:outline-none resize-none"
          />
        </div>

        {/* Question Blocks List */}
        <div className="space-y-4">
          {blocks.map((block, idx) => (
            <QuestionBlockEditor
              key={block.id}
              block={block}
              index={idx}
              totalBlocks={blocks.length}
              onChange={(updated) => handleUpdateBlock(idx, updated)}
              onDelete={() => handleDeleteBlock(idx)}
              onDuplicate={() => handleDuplicateBlock(idx)}
              onMoveUp={() => handleMoveUp(idx)}
              onMoveDown={() => handleMoveDown(idx)}
            />
          ))}
        </div>

        {/* Add Question Floating Toolbar */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 shadow-md sticky bottom-6 z-20">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 text-center">
            Tambah Pertanyaan:
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAddQuestion('short_text')}
              className="text-xs text-gray-700 dark:text-gray-200 hover:border-blue-500 hover:text-blue-600"
            >
              <Type className="w-3.5 h-3.5 mr-1 text-blue-500" /> Short Text
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAddQuestion('long_text')}
              className="text-xs text-gray-700 dark:text-gray-200 hover:border-indigo-500 hover:text-indigo-600"
            >
              <AlignLeft className="w-3.5 h-3.5 mr-1 text-indigo-500" /> Long Text
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAddQuestion('multiple_choice')}
              className="text-xs text-gray-700 dark:text-gray-200 hover:border-emerald-500 hover:text-emerald-600"
            >
              <CircleDot className="w-3.5 h-3.5 mr-1 text-emerald-500" /> Multiple Choice
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAddQuestion('checkbox')}
              className="text-xs text-gray-700 dark:text-gray-200 hover:border-purple-500 hover:text-purple-600"
            >
              <CheckSquare className="w-3.5 h-3.5 mr-1 text-purple-500" /> Checkboxes
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAddQuestion('rating')}
              className="text-xs text-gray-700 dark:text-gray-200 hover:border-amber-500 hover:text-amber-600"
            >
              <Star className="w-3.5 h-3.5 mr-1 text-amber-500" /> Rating
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAddQuestion('date')}
              className="text-xs text-gray-700 dark:text-gray-200 hover:border-rose-500 hover:text-rose-600"
            >
              <Calendar className="w-3.5 h-3.5 mr-1 text-rose-500" /> Date
            </Button>
          </div>
        </div>
      </main>

      {/* Ask AI Assistant Side Panel */}
      <FormAiAssistantDrawer
        isOpen={isAiDrawerOpen}
        onClose={() => setIsAiDrawerOpen(false)}
        formState={{ title, description, blocks }}
        onApplyActions={handleApplyAiActions}
      />
    </div>
  );
};
