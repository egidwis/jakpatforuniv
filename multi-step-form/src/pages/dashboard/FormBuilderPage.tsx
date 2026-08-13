import React, { useEffect, useState, useRef } from 'react';
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
  Table,
  Star,
  Calendar,
  Loader2,
  ExternalLink,
  Copy,
  CheckCircle2,
  FileText,
  Sparkles,
  Cloud,
  Send
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../../components/ui/dropdown-menu';
import { toast } from 'sonner';

export const FormBuilderPage: React.FC = () => {
  const { formId } = useParams<{ formId?: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(!!formId);
  const [saving, setSaving] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(true);

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

  const [autoSaveState, setAutoSaveState] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const isInitialLoad = useRef(true);

  useEffect(() => {
    if (formId) {
      loadForm(formId);
    }
  }, [formId]);

  // Debounced Auto-Save Draft on changes
  useEffect(() => {
    if (loading) return;

    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }

    setAutoSaveState('unsaved');
    const timer = setTimeout(() => {
      handleAutoSave();
    }, 1500);

    return () => clearTimeout(timer);
  }, [title, description, blocks]);

  const handleAutoSave = async () => {
    if (!user) return;
    try {
      setAutoSaveState('saving');
      const saved = await saveCustomForm(
        {
          id: formId,
          title,
          description,
          schema: blocks,
          status
        },
        user.id
      );

      if (!formId && saved?.id) {
        navigate(`/dashboard/forms/${saved.id}`, { replace: true });
      }

      setAutoSaveState('saved');
      setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      console.error('Auto save error:', err);
      setAutoSaveState('unsaved');
    }
  };

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
      options: type === 'multiple_choice' || type === 'checkbox' || type === 'matrix' ? ['Opsi 1', 'Opsi 2'] : undefined,
      rows: type === 'matrix' ? [
        { id: crypto.randomUUID(), label: 'Baris 1' },
        { id: crypto.randomUUID(), label: 'Baris 2' }
      ] : undefined,
      minScale: type === 'rating' ? 1 : undefined,
      maxScale: type === 'rating' ? 5 : undefined
    };
    setBlocks(prev => [...prev, newBlock]);
    setTimeout(() => {
      document.getElementById(`block-${newBlock.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
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
        const blockType = (act.block.type as QuestionType) || 'short_text';
        const newBlock: QuestionBlock = blockType === 'page_break'
          ? {
              id: crypto.randomUUID(),
              type: 'page_break',
              label: act.block.label || '',
              description: '',
              required: false
            }
          : {
              id: crypto.randomUUID(),
              type: blockType,
              label: act.block.label || 'Question Title',
              description: act.block.description || '',
              required: !!act.block.required,
              options: act.block.options || (blockType === 'multiple_choice' || blockType === 'checkbox' || blockType === 'matrix' ? ['Option 1', 'Option 2'] : undefined),
              rows: act.block.rows || (blockType === 'matrix' ? [{ id: crypto.randomUUID(), label: 'Baris 1' }, { id: crypto.randomUUID(), label: 'Baris 2' }] : undefined),
              maxScale: act.block.maxScale || 5,
              carryForwardFromBlockId: act.block.carryForwardFromBlockId,
              logicMatchMode: act.block.logicMatchMode,
              logicRules: act.block.logicRules as QuestionBlock['logicRules']
            };
        setBlocks(prev => {
          const next = [...prev];
          const insertAt = typeof act.index === 'number'
            ? Math.max(0, Math.min(act.index, next.length))
            : next.length;
          next.splice(insertAt, 0, newBlock);
          return next;
        });
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
            options: b.options || (b.type === 'multiple_choice' || b.type === 'checkbox' || b.type === 'matrix' ? ['Option 1', 'Option 2'] : undefined),
            rows: b.rows || (b.type === 'matrix' ? [{ id: crypto.randomUUID(), label: 'Baris 1' }, { id: crypto.randomUUID(), label: 'Baris 2' }] : undefined),
            maxScale: b.maxScale || 5,
            carryForwardFromBlockId: b.carryForwardFromBlockId,
            logicMatchMode: b.logicMatchMode,
            logicRules: b.logicRules as QuestionBlock['logicRules']
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
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Top Navbar Editor */}
      <header className="shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 shadow-sm z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
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

                {/* Auto Save Status Badge */}
                <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-2.5 py-0.5 rounded-full border border-gray-200 dark:border-gray-700">
                  {autoSaveState === 'saving' && (
                    <>
                      <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />
                      <span className="text-blue-600 dark:text-blue-400 font-semibold">Menyimpan...</span>
                    </>
                  )}
                  {autoSaveState === 'saved' && (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      <span className="text-gray-600 dark:text-gray-300 font-medium">
                        {lastSavedTime ? `Tersimpan (${lastSavedTime})` : 'Tersimpan'}
                      </span>
                    </>
                  )}
                  {autoSaveState === 'unsaved' && (
                    <>
                      <Cloud className="w-3 h-3 text-amber-500 animate-pulse" />
                      <span className="text-amber-600 dark:text-amber-400 font-medium">Ada perubahan</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Ask AI Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAiDrawerOpen(!isAiDrawerOpen)}
              className={`text-xs flex items-center gap-1.5 font-semibold transition-all ${
                isAiDrawerOpen
                  ? 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/50 dark:text-purple-200'
                  : 'text-purple-700 bg-purple-50 hover:bg-purple-100 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              Ask AI <span className="text-[9px] bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200 px-1 py-0.2 rounded font-bold">Beta</span>
            </Button>

            {status === 'published' ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() => handleSave('draft')}
                  className="text-xs text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                >
                  Unpublish
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`/f/${formId}?preview=true`, '_blank')}
                  className="text-xs text-gray-700 dark:text-gray-200 hidden sm:flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Preview
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-500/20 hidden sm:flex items-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" /> Sebar
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => formId && navigate(`/dashboard/submit?custom_form_id=${formId}`)}
                      className="cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5 mr-2" /> Sebar via Jakpat
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleCopyPublicLink} className="cursor-pointer">
                      {copiedLink ? (
                        <CheckCircle2 className="w-3.5 h-3.5 mr-2 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 mr-2" />
                      )}
                      {copiedLink ? 'Link Disalin!' : 'Copy Link Publik'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <>
                {formId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`/f/${formId}?preview=true`, '_blank')}
                    className="text-xs text-gray-700 dark:text-gray-200 hidden sm:flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Preview
                  </Button>
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
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-bold shadow-md shadow-indigo-500/20"
                >
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                  ) : (
                    <Globe className="w-3.5 h-3.5 mr-1" />
                  )}
                  Publish Form
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Body Area with Side-by-Side Flex Layout (Independent Scrolling Canvas) */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        {/* Editor Main Canvas (Independent Internal Scroll) */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 pb-24 h-full">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Form Header Card */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/80 dark:border-gray-700/80 shadow-xs overflow-hidden">
              <div className="h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
              <div className="p-6 space-y-4">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Judul Form / Survei..."
                  className="w-full text-2xl font-bold text-gray-900 dark:text-white bg-transparent border-b border-gray-200 dark:border-gray-700 focus:border-indigo-600 focus:outline-none pb-2 transition-all"
                />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Deskripsi atau instruksi untuk responden (opsional)..."
                  rows={2}
                  className="w-full text-sm text-gray-600 dark:text-gray-300 bg-transparent border-b border-dashed border-gray-200 dark:border-gray-700 focus:border-indigo-600 focus:outline-none resize-none transition-all"
                />
              </div>
            </div>

            {/* Question Blocks List */}
            <div className="space-y-2.5">
              {blocks.map((block, idx) => (
                <QuestionBlockEditor
                  key={block.id}
                  block={block}
                  index={idx}
                  totalBlocks={blocks.length}
                  allBlocks={blocks}
                  onChange={(updated) => handleUpdateBlock(idx, updated)}
                  onDelete={() => handleDeleteBlock(idx)}
                  onDuplicate={() => handleDuplicateBlock(idx)}
                  onMoveUp={() => handleMoveUp(idx)}
                  onMoveDown={() => handleMoveDown(idx)}
                />
              ))}
            </div>

            {/* Add Question Floating Glass Toolbar */}
            <div className="backdrop-blur-md bg-white/95 dark:bg-gray-800/95 rounded-2xl border border-gray-200/90 dark:border-gray-700/90 px-3 py-2.5 shadow-xl sticky bottom-6 z-20">
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mr-1 shrink-0">
                  Tambah:
                </span>
                {[
                  { type: 'short_text' as QuestionType, label: 'Short Text', icon: Type, hoverClass: 'hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20' },
                  { type: 'long_text' as QuestionType, label: 'Long Text', icon: AlignLeft, hoverClass: 'hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20' },
                  { type: 'multiple_choice' as QuestionType, label: 'Multiple Choice', icon: CircleDot, hoverClass: 'hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20' },
                  { type: 'checkbox' as QuestionType, label: 'Checkboxes', icon: CheckSquare, hoverClass: 'hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20' },
                  { type: 'rating' as QuestionType, label: 'Rating', icon: Star, hoverClass: 'hover:border-amber-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20' },
                  { type: 'date' as QuestionType, label: 'Date', icon: Calendar, hoverClass: 'hover:border-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20' },
                  { type: 'matrix' as QuestionType, label: 'Matrix', icon: Table, hoverClass: 'hover:border-cyan-400 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-900/20' }
                ].map(({ type, label, icon: Icon, hoverClass }) => (
                  <button
                    key={type}
                    type="button"
                    title={label}
                    onClick={() => handleAddQuestion(type)}
                    className={`group relative w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 transition-colors ${hoverClass}`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 text-white text-[10px] font-medium px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      {label}
                    </span>
                  </button>
                ))}
                <span className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />
                <button
                  type="button"
                  title="Page Break"
                  onClick={() => handleAddQuestion('page_break')}
                  className="group relative w-9 h-9 flex items-center justify-center rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 text-white text-[10px] font-medium px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    Page Break
                  </span>
                </button>
              </div>
            </div>
          </div>
        </main>

        {/* Ask AI Panel — bottom sheet on mobile/tablet (form stays peekable behind the dimmed backdrop), pinned side-by-side from lg: up */}
        {isAiDrawerOpen && (
          <>
            <div
              className="fixed inset-0 z-30 bg-black/40 lg:hidden"
              onClick={() => setIsAiDrawerOpen(false)}
            />
            <aside className="fixed bottom-0 inset-x-0 z-40 h-[80vh] rounded-t-2xl bg-white dark:bg-gray-800 flex flex-col shadow-2xl lg:static lg:inset-auto lg:z-20 lg:h-full lg:w-[350px] lg:shrink-0 lg:rounded-none lg:border-l lg:border-gray-200 lg:dark:border-gray-700 lg:shadow-sm">
              <div className="lg:hidden flex justify-center pt-2 pb-1 shrink-0">
                <div className="w-10 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
              </div>
              <FormAiAssistantDrawer
                isOpen={isAiDrawerOpen}
                onClose={() => setIsAiDrawerOpen(false)}
                formState={{ title, description, blocks }}
                onApplyActions={handleApplyAiActions}
              />
            </aside>
          </>
        )}
      </div>
    </div>
  );
};
