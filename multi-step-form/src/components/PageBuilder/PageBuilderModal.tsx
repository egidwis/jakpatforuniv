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
import { Loader2, Eye, Save, Trash2, Plus, Image as ImageIcon, Upload, Link as LinkIcon, Check, Trophy, Users, Calendar } from 'lucide-react';
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

export function PageBuilderModal({ isOpen, onClose, submissionId, initialData, onSuccess, submissionTitle, submissionStartDate, submissionEndDate }: PageBuilderModalProps) {
    const isStandalone = !submissionId;

    const [savedPageId, setSavedPageId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        slug: '',
        title: '',
        banner_url: '',
        rewards_amount: '',
        rewards_count: 5,
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
                    rewards_amount: initialData.rewards_amount || '',
                    rewards_count: initialData.rewards_count || 5,
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
                    rewards_amount: '50000',
                    rewards_count: 5,
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
                rewards_amount: formData.rewards_amount,
                rewards_count: formData.rewards_count,
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

                <div className="flex-1 overflow-y-auto p-6 pb-0 flex flex-col gap-8">
                    {/* General Settings */}
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-lg font-medium text-gray-900">General Information</h3>
                            <p className="text-sm text-gray-500">Set up the basic details for your survey page.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Page Title</Label>
                                    <Input
                                        value={formData.title}
                                        onChange={(e) => {
                                            const newTitle = e.target.value;
                                            setFormData({ ...formData, title: newTitle, slug: generateSlug(newTitle) });
                                        }}
                                        placeholder="e.g. Survey Kepuasan Pelanggan 2026"
                                        className="h-11"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Page URL Configuration</Label>
                                    <div className="flex rounded-md shadow-sm">
                                        <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
                                            /pages/
                                        </span>
                                        <Input
                                            value={formData.slug}
                                            disabled
                                            className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md bg-gray-50 text-gray-500 border-gray-300 focus:ring-0 cursor-not-allowed sm:text-sm h-11"
                                            placeholder="auto-generated-slug"
                                        />
                                    </div>
                                    <p className="text-[11px] text-gray-400">URL is automatically generated from the title to ensure consistency.</p>
                                </div>
                            </div>

                            {/* Campaign Summary Card - hidden for standalone announcements */}
                            {!isStandalone && (
                                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100/60 rounded-xl p-5 flex flex-col justify-center space-y-4 shadow-sm">
                                    <div>
                                        <h4 className="text-sm font-semibold text-blue-900 mb-1">Campaign Rewards Info</h4>
                                        <p className="text-[11px] text-blue-600/80">Configured via submission dashboard</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-white/80 backdrop-blur-sm rounded-lg p-3 border border-blue-100/50 shadow-sm flex flex-col justify-between">
                                            <div className="flex items-center gap-1.5 mb-2">
                                                <Trophy className="w-3.5 h-3.5 text-blue-600" />
                                                <Label className="text-[10px] font-bold text-blue-800 uppercase tracking-wider">Total Prize Pool</Label>
                                            </div>
                                            <div className="text-lg font-bold text-gray-900 leading-none">
                                                {formData.rewards_amount ? `Rp ${parseInt(formData.rewards_amount.toString()).toLocaleString('id-ID')}` : '-'}
                                            </div>
                                        </div>
                                        <div className="bg-white/80 backdrop-blur-sm rounded-lg p-3 border border-blue-100/50 shadow-sm flex flex-col justify-between">
                                            <div className="flex items-center gap-1.5 mb-2">
                                                <Users className="w-3.5 h-3.5 text-blue-600" />
                                                <Label className="text-[10px] font-bold text-blue-800 uppercase tracking-wider">Expected Winners</Label>
                                            </div>
                                            <div className="text-lg font-bold text-gray-900 leading-none">
                                                {formData.rewards_count} <span className="text-sm font-medium text-gray-500">People</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <hr className="border-gray-100" />

                    {/* Banner Image */}
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-lg font-medium text-gray-900">Featured Banner</h3>
                            <p className="text-sm text-gray-500">Upload a compelling image to increase click-through rates.</p>
                        </div>

                        <div className="max-w-2xl bg-gray-50/50 rounded-xl p-4 border border-gray-100">
                            {!formData.banner_url ? (
                                <>
                                    {/* Banner Tabs */}
                                    <div className="flex bg-gray-100 p-1 rounded-lg mb-4 w-max">
                                        <button
                                            onClick={() => setBannerTab('upload')}
                                            className={`flex items-center justify-center px-4 py-1.5 text-xs font-medium rounded-md transition-all ${bannerTab === 'upload' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            <Upload className="w-3 h-3 mr-1.5" /> Upload
                                        </button>
                                        <button
                                            onClick={() => setBannerTab('library')}
                                            className={`flex items-center justify-center px-4 py-1.5 text-xs font-medium rounded-md transition-all ${bannerTab === 'library' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            <ImageIcon className="w-3 h-3 mr-1.5" /> Recent
                                        </button>
                                        <button
                                            onClick={() => setBannerTab('link')}
                                            className={`flex items-center justify-center px-4 py-1.5 text-xs font-medium rounded-md transition-all ${bannerTab === 'link' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            <LinkIcon className="w-3 h-3 mr-1.5" /> URL
                                        </button>
                                    </div>

                                    {/* Content based on Tab */}
                                    <div className="min-h-[100px]">
                                        {bannerTab === 'upload' && (
                                            <div className="text-center">
                                                <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 transition-colors hover:bg-white hover:border-blue-400 cursor-pointer relative bg-white">
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={handleBannerUpload}
                                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                                                        disabled={uploadingBanner}
                                                    />
                                                    {uploadingBanner ? (
                                                        <div className="flex flex-col items-center">
                                                            <Loader2 className="w-6 h-6 animate-spin text-blue-500 mb-2" />
                                                            <span className="text-xs text-gray-500">Compressing & Uploading...</span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col items-center">
                                                            <div className="bg-blue-50 p-3 rounded-full mb-3">
                                                                <Upload className="w-6 h-6 text-blue-500" />
                                                            </div>
                                                            <span className="text-sm font-medium text-gray-700">Click to Upload Banner</span>
                                                            <span className="text-xs text-gray-400 mt-1">PNG, JPG up to 500KB (Auto-compressed)</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {bannerTab === 'library' && (
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-h-[140px] overflow-y-auto p-1">
                                                {recentBanners.map((url, i) => (
                                                    <div
                                                        key={i}
                                                        onClick={() => setFormData(prev => ({ ...prev, banner_url: url }))}
                                                        className={`relative aspect-video rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${formData.banner_url === url ? 'border-blue-500 ring-2 ring-blue-200' : 'border-transparent hover:border-gray-300'}`}
                                                    >
                                                        <img src={url} alt={`Banner ${i}`} className="w-full h-full object-cover bg-gray-100" />
                                                        {formData.banner_url === url && (
                                                            <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                                                                <div className="bg-blue-500 rounded-full p-1 shadow-sm">
                                                                    <Check className="w-4 h-4 text-white" />
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                                {recentBanners.length === 0 && (
                                                    <div className="col-span-full text-center py-6 text-sm text-gray-500 bg-white rounded-lg border border-dashed">
                                                        No recent banners found.
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {bannerTab === 'link' && (
                                            <div className="space-y-2 bg-white rounded-lg p-1">
                                                <Input
                                                    value={formData.banner_url}
                                                    onChange={(e) => setFormData({ ...formData, banner_url: e.target.value })}
                                                    placeholder="https://example.com/image.jpg"
                                                    className="h-11 border-gray-200"
                                                />
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="pt-2">
                                    <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Selected Banner Preview</Label>
                                    <div className="relative w-full max-w-sm h-32 rounded-lg overflow-hidden bg-gray-200 group border border-gray-200 shadow-sm">
                                        <img src={formData.banner_url} alt="Preview" className="w-full h-full object-cover" />
                                        <button
                                            onClick={() => setFormData(prev => ({ ...prev, banner_url: '' }))}
                                            className="absolute top-2 right-2 bg-black/60 hover:bg-red-500 text-white p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-all shadow-sm backdrop-blur-sm"
                                            title="Remove Banner"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <hr className="border-gray-100" />

                    {/* Content Editor */}
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-lg font-medium text-gray-900">Page Content</h3>
                            <p className="text-sm text-gray-500">Write the details, instructions, or terms for your survey.</p>
                        </div>
                        <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm min-h-[400px]">
                            <BlockEditor
                                content={formData.blocks}
                                onChange={(newContent) => setFormData({ ...formData, blocks: newContent })}
                            />
                        </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t">
                        <div className="flex items-center justify-between">
                            <Label className="text-base font-semibold">Custom Fields (Additional Questions)</Label>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setFormData({ ...formData, custom_fields: [...formData.custom_fields, { label: '', placeholder: '', type: 'text', required: false, options: '' }] })}
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Add Field
                            </Button>
                        </div>

                        {formData.custom_fields.length === 0 && (
                            <div className="text-center p-6 border-2 border-dashed rounded-lg bg-gray-50 text-gray-500 text-sm">
                                No custom fields added. Click "Add Field" to ask additional questions to respondents.
                            </div>
                        )}

                        <div className="space-y-4">
                            {formData.custom_fields.map((field, index) => (
                                <div key={index} className="flex gap-4 items-start p-4 bg-gray-50 rounded-lg border">
                                    <div className="flex-1 grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-xs text-gray-500">Field Label (Question)</Label>
                                            <Input
                                                value={field.label}
                                                onChange={(e) => {
                                                    const newFields = [...formData.custom_fields];
                                                    newFields[index].label = e.target.value;
                                                    setFormData({ ...formData, custom_fields: newFields });
                                                }}
                                                placeholder="e.g. Usia"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs text-gray-500">Placeholder</Label>
                                            <Input
                                                value={field.placeholder}
                                                onChange={(e) => {
                                                    const newFields = [...formData.custom_fields];
                                                    newFields[index].placeholder = e.target.value;
                                                    setFormData({ ...formData, custom_fields: newFields });
                                                }}
                                                placeholder="e.g. Masukkan usia anda"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs text-gray-500">Type</Label>
                                            <Select
                                                value={field.type}
                                                onValueChange={(val) => {
                                                    const newFields = [...formData.custom_fields];
                                                    newFields[index].type = val;
                                                    setFormData({ ...formData, custom_fields: newFields });
                                                }}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="text">Text (Short Answer)</SelectItem>
                                                    <SelectItem value="number">Number</SelectItem>
                                                    <SelectItem value="textarea">Text Area (Long Answer)</SelectItem>
                                                    <SelectItem value="select">Multiple Choice (Dropdown)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        {field.type === 'select' && (
                                            <div className="space-y-2 col-span-2">
                                                <Label className="text-xs text-gray-500">Options (Separated by comma)</Label>
                                                <Input
                                                    value={field.options}
                                                    onChange={(e) => {
                                                        const newFields = [...formData.custom_fields];
                                                        newFields[index].options = e.target.value;
                                                        setFormData({ ...formData, custom_fields: newFields });
                                                    }}
                                                    placeholder="Option 1, Option 2, Option 3"
                                                />
                                            </div>
                                        )}
                                        <div className="flex flex-col space-y-4 pt-4 col-span-2">
                                            <div className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`screening-${index}`}
                                                    className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                                    checked={field.is_screening || false}
                                                    onCheckedChange={(checked) => {
                                                        const newFields = [...formData.custom_fields];
                                                        newFields[index].is_screening = checked as boolean;
                                                        setFormData({ ...formData, custom_fields: newFields });
                                                    }}
                                                />
                                                <Label htmlFor={`screening-${index}`} className="text-sm font-normal">
                                                    Is Screening Question?
                                                </Label>
                                            </div>

                                            {field.is_screening && field.type === 'select' && (
                                                <div className="space-y-2 border-l-2 border-blue-200 pl-4 py-2 bg-blue-50/50 rounded-r-md">
                                                    <Label className="text-xs font-semibold text-blue-800">Valid Options (Responden Lolos)</Label>
                                                    <p className="text-[10px] text-gray-500 mb-2">Check options that allow respondent to proceed.</p>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {(field.options || '').split(',').map((opt: string, i: number) => {
                                                            const optVal = opt.trim();
                                                            if (!optVal) return null;
                                                            return (
                                                                <div key={i} className="flex items-center space-x-2">
                                                                    <Checkbox
                                                                        id={`valid-${index}-${i}`}
                                                                        className="bg-white data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
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
                                                                    <Label htmlFor={`valid-${index}-${i}`} className="text-xs cursor-pointer">{optVal}</Label>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`required-${index}`}
                                                    className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                                    checked={field.required}
                                                    onCheckedChange={(checked) => {
                                                        const newFields = [...formData.custom_fields];
                                                        newFields[index].required = checked as boolean;
                                                        setFormData({ ...formData, custom_fields: newFields });
                                                    }}
                                                />
                                                <Label htmlFor={`required-${index}`} className="text-sm font-normal">Required</Label>
                                            </div>
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-red-500 hover:text-red-700 hover:bg-red-50 mt-1"
                                        onClick={() => {
                                            const newFields = formData.custom_fields.filter((_, i) => i !== index);
                                            setFormData({ ...formData, custom_fields: newFields });
                                        }}
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </Button>
                                </div>
                            ))}
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
