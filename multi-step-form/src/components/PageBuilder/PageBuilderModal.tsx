import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
// import { Switch } from '@/components/ui/switch'; // Removed unused
import { BlockEditor } from './BlockEditor';
import { supabase } from '@/utils/supabase';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Eye, Save, Trash2, Plus, Upload, Check, Trophy, Users, Calendar } from 'lucide-react';
import imageCompression from 'browser-image-compression';

interface PageBuilderModalProps {
    isOpen: boolean;
    onClose: () => void;
    submissionId?: string; // Optional for standalone pages
    initialData?: any; // If editing existing page
    onSuccess: () => void;
    submissionTitle?: string; // Title from the submission for auto-fill
    submissionStartDate?: string;
    submissionEndDate?: string;
    submissionPrizePerWinner?: number;
    submissionWinnerCount?: number;
}

// Helper: generate slug from title
const generateSlug = (title: string): string => {
    return title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '') // remove special chars
        .replace(/\s+/g, '-')          // spaces to hyphens
        .replace(/-+/g, '-')           // collapse multiple hyphens
        .slice(0, 60);                 // max 60 chars
};

export function PageBuilderModal({ isOpen, onClose, submissionId, initialData, onSuccess, submissionTitle, submissionStartDate, submissionEndDate, submissionPrizePerWinner, submissionWinnerCount }: PageBuilderModalProps) {
    const isStandalone = !submissionId;

    const [savedPageId, setSavedPageId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        slug: '',
        title: '',
        banner_url: '',
        is_published: false,

        blocks: {} as any, // Tiptap JSON content
        custom_fields: [] as any[], // Array of { label, placeholder, type, required, options }
        publish_start_date: '',
        publish_end_date: '',
    });

    const [uploadingBanner, setUploadingBanner] = useState(false);
    const [recentBanners, setRecentBanners] = useState<string[]>([]);
    const [bannerTab, setBannerTab] = useState<'upload' | 'link' | 'library'>('upload');

    const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingBanner(true);
        try {
            const options = {
                maxSizeMB: 0.5,
                maxWidthOrHeight: 1280,
                useWebWorker: true,
            };
            const compressedFile = await imageCompression(file, options);
            const fileName = `banners/${Date.now()}-${file.name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9.-]/g, '')}`;

            const { error: uploadError } = await supabase.storage
                .from('page-uploads')
                .upload(fileName, compressedFile);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('page-uploads')
                .getPublicUrl(fileName);

            setFormData(prev => ({ ...prev, banner_url: publicUrl }));
            toast.success('Banner uploaded successfully');
        } catch (error: any) {
            console.error('Upload failed:', error);
            toast.error('Upload failed: ' + error.message);
        } finally {
            setUploadingBanner(false);
        }
    };

    const fetchRecentBanners = async () => {
        const { data } = await supabase
            .from('survey_pages')
            .select('banner_url')
            .not('banner_url', 'is', null)
            .neq('banner_url', '')
            .order('created_at', { ascending: false })
            .limit(50);

        if (data) {
            // Deduplicate
            const uniqueBanners = Array.from(new Set(data.map(d => d.banner_url).filter(Boolean)));
            setRecentBanners(uniqueBanners);
        }
    };

    useEffect(() => {
        if (isOpen) {
            setSavedPageId(null); // Reset for fresh modal session
            if (initialData) {
                setFormData({
                    slug: initialData.slug,
                    title: initialData.title,
                    banner_url: initialData.banner_url || '',
                    is_published: initialData.is_published,
                    blocks: initialData.blocks || {},
                    custom_fields: initialData.custom_fields || [],
                    publish_start_date: submissionStartDate ? submissionStartDate : (initialData.publish_start_date ? initialData.publish_start_date : ''),
                    publish_end_date: submissionEndDate ? submissionEndDate : (initialData.publish_end_date ? initialData.publish_end_date : ''),
                });
            } else {
                // Reset for new page, auto-fill from submission title if available
                const autoTitle = submissionTitle || '';
                const autoSlug = autoTitle ? generateSlug(autoTitle) : '';

                setFormData({
                    slug: autoSlug,
                    title: autoTitle,
                    banner_url: '',
                    is_published: false,
                    blocks: {},
                    custom_fields: [],
                    publish_start_date: submissionStartDate ? submissionStartDate : '',
                    publish_end_date: submissionEndDate ? submissionEndDate : '',
                });
            }
            if (isOpen) {
                fetchRecentBanners();
            }
        }
    }, [isOpen, initialData]);

    const handleSave = async (overrideStatus?: boolean) => {
        if (!formData.slug || !formData.title) {
            toast.error('Slug and Title are required');
            return;
        }

        setLoading(true);
        try {
            let isPublished = overrideStatus !== undefined ? overrideStatus : formData.is_published;

            // Auto-publish: If schedule is set and we're just saving (not explicitly unpublishing), set to Live
            if (overrideStatus === undefined && formData.publish_start_date && !isStandalone) {
                isPublished = true;
            }

            const payload: any = {
                slug: formData.slug,
                title: formData.title,
                banner_url: formData.banner_url,
                is_published: isPublished,
                publish_start_date: formData.publish_start_date || null,
                publish_end_date: formData.publish_end_date || null,

                blocks: formData.blocks,
                custom_fields: formData.custom_fields,
                updated_at: new Date().toISOString(),
            };

            // Only attach submission_id if it exists
            if (submissionId) {
                payload.submission_id = submissionId;
            } else {
                payload.submission_id = null;
            }

            const existingId = initialData?.id || savedPageId;

            if (existingId) {
                // Update
                const { error } = await supabase
                    .from('survey_pages')
                    .update(payload)
                    .eq('id', existingId);
                if (error) throw error;
                toast.success('Page updated successfully');
            } else {
                // Create
                const { data, error } = await supabase
                    .from('survey_pages')
                    .insert([payload])
                    .select('id')
                    .single();
                if (error) throw error;
                setSavedPageId(data.id);
                toast.success('Page created successfully');
            }
            onSuccess();

            // Publish/Unpublish → close modal & refresh
            if (overrideStatus !== undefined) {
                onClose();
            } else {
                // Save Draft → keep modal open, sync local state
                setFormData(prev => ({ ...prev, is_published: isPublished }));
            }
        } catch (error: any) {
            console.error('Error saving page:', error);
            toast.error(error.message || 'Failed to save page');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        const existingId = initialData?.id || savedPageId;
        if (!existingId) return;

        const confirmed = window.confirm('Are you sure you want to delete this draft page? This action cannot be undone.');
        if (!confirmed) return;

        setLoading(true);
        try {
            const { error } = await supabase
                .from('survey_pages')
                .delete()
                .eq('id', existingId);
            if (error) throw error;
            toast.success('Page deleted successfully');
            onSuccess();
            onClose();
        } catch (error: any) {
            console.error('Error deleting page:', error);
            toast.error(error.message || 'Failed to delete page');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent
                className="max-w-5xl h-[90vh] flex flex-col p-0 overflow-hidden"
                onInteractOutside={(e) => e.preventDefault()}
            >
                {/* Header */}
                <DialogHeader className="px-6 py-4 border-b">
                    <DialogTitle>{initialData ? 'Edit Page' : 'Create New Page'}</DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-hidden flex flex-row w-full">
                    {/* Main Content (Left Pane) */}
                    <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 bg-white">
                        <Input
                            value={formData.title}
                            onChange={(e) => {
                                const newTitle = e.target.value;
                                setFormData({ ...formData, title: newTitle, slug: generateSlug(newTitle) });
                            }}
                            placeholder="Page Title"
                            className="text-3xl font-bold bg-white border border-gray-200 focus:border-blue-500 shadow-sm px-3 h-auto py-2 rounded-lg transition-all"
                        />
                        <div className="flex-1 overflow-hidden min-h-[400px] flex flex-col">
                            <BlockEditor
                                content={formData.blocks}
                                onChange={(newContent) => setFormData({ ...formData, blocks: newContent })}
                            />
                        </div>
                    </div>

                    {/* Sidebar Settings (Right Pane) */}
                    <div className="w-[360px] overflow-y-auto bg-gray-50/50 p-5 flex flex-col gap-6 flex-shrink-0 border-l border-gray-100">
                        {/* URL Config */}
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Page URL</Label>
                            <div className="flex rounded-md shadow-sm">
                                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-100 text-gray-500 sm:text-xs">
                                    /pages/
                                </span>
                                <Input
                                    value={formData.slug}
                                    disabled
                                    className="flex-1 min-w-0 block w-full px-2 py-1.5 rounded-none rounded-r-md bg-white text-gray-500 border-gray-300 focus:ring-0 cursor-not-allowed sm:text-xs h-8"
                                    placeholder="auto-generated-slug"
                                />
                            </div>
                        </div>

                        {/* Banner Image */}
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Featured Banner</Label>
                            <div className="bg-white rounded-lg p-2.5 border border-gray-200 shadow-sm relative overflow-hidden group">
                                {!formData.banner_url ? (
                                    <div className="flex flex-col gap-2.5">
                                        <div className="flex bg-gray-100 p-1 rounded-md w-full">
                                            <button
                                                onClick={() => setBannerTab('upload')}
                                                className={`flex-1 flex items-center justify-center px-2 py-1 text-[10px] font-bold rounded transition-all ${bannerTab === 'upload' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                            >
                                                UPLOAD
                                            </button>
                                            <button
                                                onClick={() => setBannerTab('library')}
                                                className={`flex-1 flex items-center justify-center px-2 py-1 text-[10px] font-bold rounded transition-all ${bannerTab === 'library' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                            >
                                                RECENT
                                            </button>
                                            <button
                                                onClick={() => setBannerTab('link')}
                                                className={`flex-1 flex items-center justify-center px-2 py-1 text-[10px] font-bold rounded transition-all ${bannerTab === 'link' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                            >
                                                URL
                                            </button>
                                        </div>

                                        {bannerTab === 'upload' && (
                                            <div className="border border-dashed border-gray-300 rounded-md p-3 transition-colors hover:bg-gray-50 hover:border-blue-400 cursor-pointer relative bg-white flex flex-col items-center justify-center min-h-[80px]">
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleBannerUpload}
                                                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                                                    disabled={uploadingBanner}
                                                />
                                                {uploadingBanner ? (
                                                    <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                                                ) : (
                                                    <div className="flex flex-col items-center text-center">
                                                        <Upload className="w-4 h-4 text-gray-400 mb-1" />
                                                        <span className="text-[11px] font-medium text-gray-600">Click to Upload</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {bannerTab === 'library' && (
                                            <div className="grid grid-cols-2 gap-2 max-h-[140px] overflow-y-auto pr-1">
                                                {recentBanners.map((url, i) => (
                                                    <div
                                                        key={i}
                                                        onClick={() => setFormData(prev => ({ ...prev, banner_url: url }))}
                                                        className={`relative aspect-video rounded-md overflow-hidden cursor-pointer border transition-all ${formData.banner_url === url ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-200 hover:border-gray-300'}`}
                                                    >
                                                        <img src={url} alt={`Banner ${i}`} className="w-full h-full object-cover" />
                                                        {formData.banner_url === url && (
                                                            <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                                                                <div className="bg-blue-500 rounded-full p-0.5 shadow-sm">
                                                                    <Check className="w-3 h-3 text-white" />
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                                {recentBanners.length === 0 && (
                                                    <div className="col-span-2 text-center py-4 text-xs text-gray-500">
                                                        No recent banners.
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {bannerTab === 'link' && (
                                            <Input
                                                value={formData.banner_url}
                                                onChange={(e) => setFormData({ ...formData, banner_url: e.target.value })}
                                                placeholder="https://example.com/image.jpg"
                                                className="h-8 text-xs"
                                            />
                                        )}
                                    </div>
                                ) : (
                                    <>
                                        <img src={formData.banner_url} alt="Preview" className="w-full aspect-video object-cover rounded-md" />
                                        <button
                                            onClick={() => setFormData(prev => ({ ...prev, banner_url: '' }))}
                                            className="absolute top-3 right-3 bg-black/60 hover:bg-red-500 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-all shadow-sm backdrop-blur-sm"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Campaign Summary Card (read-only from submission props) */}
                        {!isStandalone && submissionPrizePerWinner && submissionWinnerCount && (
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Campaign Rewards</Label>
                                <div className="bg-white border border-blue-100/60 rounded-lg p-3 flex flex-col space-y-2 shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <Trophy className="w-3.5 h-3.5 text-blue-600" />
                                            <span className="text-xs font-medium text-gray-600">Total Prize</span>
                                        </div>
                                        <span className="text-sm font-bold text-gray-900">
                                            Rp {(submissionPrizePerWinner * submissionWinnerCount).toLocaleString('id-ID')}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <Users className="w-3.5 h-3.5 text-blue-600" />
                                            <span className="text-xs font-medium text-gray-600">Winners</span>
                                        </div>
                                        <span className="text-sm font-bold text-gray-900">
                                            {submissionWinnerCount}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Custom Fields */}
                        <div className="space-y-2 border-t border-gray-200/50 pt-3">
                            <div className="flex items-center justify-between pb-1">
                                <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Extra Questions ({formData.custom_fields.length})</Label>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-1.5 text-[10px] font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                    onClick={() => setFormData({ ...formData, custom_fields: [...formData.custom_fields, { label: '', placeholder: '', type: 'text', required: false, options: '' }] })}
                                >
                                    <Plus className="w-3 h-3 mr-1" /> ADD
                                </Button>
                            </div>

                            {formData.custom_fields.length === 0 && (
                                <div className="text-center py-4 text-xs text-gray-400 italic">
                                    No extra questions added.
                                </div>
                            )}

                            <div className="space-y-3">
                                {formData.custom_fields.map((field, index) => (
                                    <div key={index} className="bg-white border border-gray-200 rounded-lg p-2.5 relative group shadow-sm transition-all hover:border-gray-300">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-5 w-5 absolute right-1.5 top-1.5 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-600 hover:bg-red-50 rounded"
                                            onClick={() => {
                                                const newFields = formData.custom_fields.filter((_, i) => i !== index);
                                                setFormData({ ...formData, custom_fields: newFields });
                                            }}
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </Button>

                                        <div className="space-y-2">
                                            <div className="pr-5">
                                                <Input
                                                    value={field.label}
                                                    onChange={(e) => {
                                                        const newFields = [...formData.custom_fields];
                                                        newFields[index].label = e.target.value;
                                                        setFormData({ ...formData, custom_fields: newFields });
                                                    }}
                                                    placeholder="Question title"
                                                    className="h-6 text-xs font-semibold px-1.5 border-transparent hover:border-gray-200 focus:border-blue-500 rounded shadow-none"
                                                />
                                            </div>

                                            <div className="grid grid-cols-2 gap-2 pl-1.5">
                                                <Select
                                                    value={field.type}
                                                    onValueChange={(val) => {
                                                        const newFields = [...formData.custom_fields];
                                                        newFields[index].type = val;
                                                        setFormData({ ...formData, custom_fields: newFields });
                                                    }}
                                                >
                                                    <SelectTrigger className="h-6 text-[11px] px-2 shadow-sm border-gray-200 text-gray-700 bg-gray-50 hover:bg-gray-100 transition-colors">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="text" className="text-[11px]">Short Answer</SelectItem>
                                                        <SelectItem value="number" className="text-[11px]">Number</SelectItem>
                                                        <SelectItem value="textarea" className="text-[11px]">Long Answer</SelectItem>
                                                        <SelectItem value="select" className="text-[11px]">Dropdown</SelectItem>
                                                    </SelectContent>
                                                </Select>

                                                <div className="flex items-center space-x-1.5 pl-1">
                                                    <Checkbox
                                                        id={`required-${index}`}
                                                        className="w-3 h-3 rounded-[2px] border-gray-300 data-[state=checked]:bg-blue-600"
                                                        checked={field.required}
                                                        onCheckedChange={(checked) => {
                                                            const newFields = [...formData.custom_fields];
                                                            newFields[index].required = checked as boolean;
                                                            setFormData({ ...formData, custom_fields: newFields });
                                                        }}
                                                    />
                                                    <Label htmlFor={`required-${index}`} className="text-[10px] font-medium cursor-pointer text-gray-600">Required</Label>
                                                </div>
                                            </div>

                                            {field.type === 'select' && (
                                                <div className="space-y-1.5 pl-1.5 pt-1">
                                                    <Input
                                                        value={field.options}
                                                        onChange={(e) => {
                                                            const newFields = [...formData.custom_fields];
                                                            newFields[index].options = e.target.value;
                                                            setFormData({ ...formData, custom_fields: newFields });
                                                        }}
                                                        placeholder="Opt1, Opt2, Opt3"
                                                        className="h-6 text-[11px] px-2 border-gray-200 shadow-sm bg-gray-50 focus:bg-white"
                                                    />

                                                    {field.is_screening && (
                                                        <div className="bg-blue-50/50 border border-blue-100 rounded-md p-2 mt-1 shadow-sm">
                                                            <span className="text-[9px] font-bold text-blue-700 uppercase mb-1.5 block">Valid Answers (Screening)</span>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {(field.options || '').split(',').map((opt: string, i: number) => {
                                                                    const optVal = opt.trim();
                                                                    if (!optVal) return null;
                                                                    return (
                                                                        <div key={i} className="flex items-center space-x-1.5 bg-white px-1.5 py-0.5 rounded border border-blue-100 shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-colors hover:border-blue-300">
                                                                            <Checkbox
                                                                                id={`valid-${index}-${i}`}
                                                                                className="w-2.5 h-2.5 rounded-[2px] bg-white border-blue-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                                                                checked={(field.valid_options || []).includes(optVal)}
                                                                                onCheckedChange={(checked) => {
                                                                                    const newFields = [...formData.custom_fields];
                                                                                    const currentValid = field.valid_options || [];
                                                                                    if (checked) {
                                                                                        newFields[index].valid_options = [...currentValid, optVal];
                                                                                    } else {
                                                                                        newFields[index].valid_options = currentValid.filter((v: string) => v !== optVal);
                                                                                    }
                                                                                    setFormData({ ...formData, custom_fields: newFields });
                                                                                }}
                                                                            />
                                                                            <Label htmlFor={`valid-${index}-${i}`} className="text-[10px] cursor-pointer text-blue-900 font-medium leading-none mt-0.5">{optVal}</Label>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            <div className="flex items-center space-x-1.5 pt-1.5 mt-1 border-t border-gray-100 pl-1.5">
                                                <Checkbox
                                                    id={`screening-${index}`}
                                                    className="w-3 h-3 rounded-[2px] border-gray-300 data-[state=checked]:bg-blue-600"
                                                    checked={field.is_screening || false}
                                                    onCheckedChange={(checked) => {
                                                        const newFields = [...formData.custom_fields];
                                                        newFields[index].is_screening = checked as boolean;
                                                        setFormData({ ...formData, custom_fields: newFields });
                                                    }}
                                                />
                                                <Label htmlFor={`screening-${index}`} className="text-[10px] font-medium cursor-pointer text-gray-500 hover:text-gray-700">
                                                    Use as screening question
                                                </Label>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t bg-gray-50/80 backdrop-blur-sm flex items-center justify-between gap-4 mt-auto">
                    {/* Left Side: Status + Schedule Capsule */}
                    <div className="flex items-center gap-2 flex-shrink min-w-0 mr-auto">
                        {/* Status Badge */}
                        {(() => {
                            const startDate = formData.publish_start_date ? new Date(formData.publish_start_date) : null;
                            const isLive = formData.is_published && (isStandalone || !startDate || startDate <= new Date());
                            const isDraft = !formData.is_published;
                            if (isDraft) return (
                                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 bg-gray-200 text-gray-600 rounded-full flex-shrink-0">
                                    Draft
                                </span>
                            );
                            if (isLive) return (
                                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 bg-green-100 text-green-700 rounded-full flex-shrink-0">
                                    Live
                                </span>
                            );
                            return null; // Scheduled but not yet live → no badge
                        })()}

                        {/* Schedule Capsule - hidden for standalone */}
                        {!isStandalone && (
                            <div className="flex items-center p-1 bg-white border rounded-md shadow-sm overflow-hidden flex-shrink min-w-0 w-auto ml-2">
                                <div className="px-2 py-1 bg-gray-50 rounded border border-gray-100 mr-2 flex-shrink-0 hidden sm:block">
                                    <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Scheduled At</span>
                                </div>
                                <div className="flex items-center gap-2 px-1 text-[11px] font-medium text-gray-600 truncate min-w-0">
                                    <span className="truncate">
                                        {formData.publish_start_date
                                            ? new Date(formData.publish_start_date).toLocaleString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                                            : 'Not Set'}
                                    </span>
                                    <span className="text-gray-300 mx-1 flex-shrink-0">to</span>
                                    <span className="truncate">
                                        {formData.publish_end_date
                                            ? new Date(formData.publish_end_date).toLocaleString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                                            : 'Not Set'}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right Side: Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {(initialData?.slug || savedPageId) && (
                            <Button title="Preview Page" variant="outline" size="icon" onClick={() => window.open(`/pages/${formData.slug}`, '_blank')} className="h-9 w-9 bg-white border-gray-200 text-gray-700 hover:bg-gray-50 shrink-0">
                                <Eye className="w-4 h-4" />
                            </Button>
                        )}

                        {formData.is_published ? (
                            <>
                                {/* Published/Scheduled page: Change to Draft (secondary) + Update Page (primary) */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleSave(false)}
                                    disabled={loading}
                                    className="h-9 text-sm border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800 shrink-0"
                                >
                                    {isStandalone ? 'Unpublish' : 'Change to Draft'}
                                </Button>

                                <div className="w-px h-6 bg-gray-200 mx-1 hidden sm:block"></div>

                                <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => handleSave(true)}
                                    disabled={loading}
                                    className="h-9 text-sm text-white shadow-sm font-medium px-6 shrink-0 bg-blue-600 hover:bg-blue-700"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                                    Update Page
                                </Button>
                            </>
                        ) : (
                            <>
                                {/* Draft page: Delete (destructive) + Save Draft (secondary) + Publish/Schedule (primary) */}
                                {(initialData?.id || savedPageId) && (
                                    <>
                                        <Button
                                            title="Delete Draft"
                                            onClick={handleDelete}
                                            disabled={loading}
                                            variant="outline"
                                            size="icon"
                                            className="h-9 w-9 border-red-200 text-red-500 hover:bg-red-50 hover:text-red-700 shrink-0"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                        <div className="w-px h-6 bg-gray-200 mx-1 hidden sm:block"></div>
                                    </>
                                )}

                                <Button
                                    title="Save as Draft"
                                    onClick={() => handleSave(false)}
                                    disabled={loading}
                                    variant="outline"
                                    size="sm"
                                    className="h-9 text-sm text-gray-700 hover:bg-gray-50 border-gray-200 shrink-0 flex items-center gap-1.5"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    <span className="hidden sm:inline">Save Draft</span>
                                </Button>

                                <div className="w-px h-6 bg-gray-200 mx-1 hidden sm:block"></div>

                                <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => handleSave(true)}
                                    disabled={loading}
                                    className={`h-9 text-sm text-white shadow-sm font-medium px-6 shrink-0 ${!isStandalone && formData.publish_start_date && new Date(formData.publish_start_date) > new Date()
                                        ? 'bg-blue-600 hover:bg-blue-700'
                                        : 'bg-green-600 hover:bg-green-700'
                                        }`}
                                >
                                    {!isStandalone && formData.publish_start_date && new Date(formData.publish_start_date) > new Date() ? (
                                        <><Calendar className="w-4 h-4 mr-1.5" /> Schedule</>
                                    ) : (
                                        'Publish Now'
                                    )}
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
