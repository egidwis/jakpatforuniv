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
import { Loader2, Eye, Save, Trash2, Plus, Image as ImageIcon, Upload, Link as LinkIcon, Check } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";

// Fix z-index for datepicker in modal
const datePickerStyle = `
  .react-datepicker-popper {
    z-index: 9999 !important;
  }
`;

interface PageBuilderModalProps {
    isOpen: boolean;
    onClose: () => void;
    submissionId: string;
    initialData?: any; // If editing existing page
    onSuccess: () => void;
}

export function PageBuilderModal({ isOpen, onClose, submissionId, initialData, onSuccess }: PageBuilderModalProps) {
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
                    publish_start_date: initialData.publish_start_date ? new Date(initialData.publish_start_date).toISOString().slice(0, 16) : '',
                    publish_end_date: initialData.publish_end_date ? new Date(initialData.publish_end_date).toISOString().slice(0, 16) : '',
                });
            } else {
                // Reset for new page
                setFormData({
                    slug: '',
                    title: '',
                    banner_url: '',
                    rewards_amount: '50000',
                    rewards_count: 5,
                    is_published: false,
                    blocks: {},
                    custom_fields: [],
                    publish_start_date: '',
                    publish_end_date: '',
                });
                // Auto-generate slug suggestion from submission if possible (would need submission title here)
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
            if (overrideStatus === undefined && formData.publish_start_date) {
                isPublished = true;
            }

            const payload = {
                submission_id: submissionId,
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

            if (initialData?.id) {
                // Update
                const { error } = await supabase
                    .from('survey_pages')
                    .update(payload)
                    .eq('id', initialData.id);
                if (error) throw error;
                toast.success('Page updated successfully');
            } else {
                // Create
                const { error } = await supabase
                    .from('survey_pages')
                    .insert([payload]);
                if (error) throw error;
                toast.success('Page created successfully');
            }
            onSuccess();
            onClose();
        } catch (error: any) {
            console.error('Error saving page:', error);
            toast.error(error.message || 'Failed to save page');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl h-[85vh] flex flex-col gap-0 overflow-hidden p-0">
                <DialogHeader className="px-6 py-4 border-b">
                    <DialogTitle>{initialData ? 'Edit Page' : 'Create New Page'}</DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label>Page Slug (URL)</Label>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500 text-sm">/pages/</span>
                                <Input
                                    value={formData.slug}
                                    onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                                    placeholder="my-awesome-survey"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Page Title</Label>
                            <Input
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                placeholder="Survey Title"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-6">
                        <div className="space-y-3 col-span-3 lg:col-span-1">
                            <Label>Banner Image</Label>

                            {/* Banner Tabs */}
                            <div className="flex bg-gray-100 p-1 rounded-lg mb-2">
                                <button
                                    onClick={() => setBannerTab('upload')}
                                    className={`flex-1 flex items-center justify-center py-1.5 text-xs font-medium rounded-md transition-all ${bannerTab === 'upload' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    <Upload className="w-3 h-3 mr-1.5" /> Upload
                                </button>
                                <button
                                    onClick={() => setBannerTab('library')}
                                    className={`flex-1 flex items-center justify-center py-1.5 text-xs font-medium rounded-md transition-all ${bannerTab === 'library' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    <ImageIcon className="w-3 h-3 mr-1.5" /> Recent
                                </button>
                                <button
                                    onClick={() => setBannerTab('link')}
                                    className={`flex-1 flex items-center justify-center py-1.5 text-xs font-medium rounded-md transition-all ${bannerTab === 'link' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    <LinkIcon className="w-3 h-3 mr-1.5" /> URL
                                </button>
                            </div>

                            {/* Content based on Tab */}
                            <div className="min-h-[100px] border rounded-lg p-3 bg-gray-50/50">
                                {bannerTab === 'upload' && (
                                    <div className="text-center">
                                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 transition-colors hover:bg-white hover:border-blue-400 cursor-pointer relative">
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
                                                    <Upload className="w-6 h-6 text-gray-400 mb-2" />
                                                    <span className="text-xs font-medium text-gray-700">Click to Upload</span>
                                                    <span className="text-[10px] text-gray-400 mt-1">Max 500KB (Auto-compressed)</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {bannerTab === 'library' && (
                                    <div className="grid grid-cols-3 gap-2 max-h-[120px] overflow-y-auto p-1">
                                        {recentBanners.map((url, i) => (
                                            <div
                                                key={i}
                                                onClick={() => setFormData(prev => ({ ...prev, banner_url: url }))}
                                                className={`relative aspect-video rounded-md overflow-hidden cursor-pointer border-2 transition-all ${formData.banner_url === url ? 'border-blue-500 ring-2 ring-blue-200' : 'border-transparent hover:border-gray-300'}`}
                                            >
                                                <img src={url} alt={`Banner ${i}`} className="w-full h-full object-cover" />
                                                {formData.banner_url === url && (
                                                    <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                                                        <Check className="w-4 h-4 text-white drop-shadow-md" />
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                        {recentBanners.length === 0 && (
                                            <div className="col-span-3 text-center py-4 text-xs text-gray-500">
                                                No recent banners found.
                                            </div>
                                        )}
                                    </div>
                                )}

                                {bannerTab === 'link' && (
                                    <div className="space-y-2">
                                        <Input
                                            value={formData.banner_url}
                                            onChange={(e) => setFormData({ ...formData, banner_url: e.target.value })}
                                            placeholder="https://example.com/image.jpg"
                                            className="text-xs"
                                        />
                                    </div>
                                )}

                                {/* Preview Section (if URL exists) */}
                                {formData.banner_url && (
                                    <div className="mt-3 pt-3 border-t">
                                        <Label className="text-[10px] text-gray-500 mb-1 block">Selected Banner:</Label>
                                        <div className="relative w-full h-24 rounded-md overflow-hidden bg-gray-200 group">
                                            <img src={formData.banner_url} alt="Preview" className="w-full h-full object-cover" />
                                            <button
                                                onClick={() => setFormData(prev => ({ ...prev, banner_url: '' }))}
                                                className="absolute top-1 right-1 bg-black/50 hover:bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                                title="Remove Banner"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Rewards Amount (Rp)</Label>
                            <Input
                                value={formData.rewards_amount}
                                onChange={(e) => setFormData({ ...formData, rewards_amount: e.target.value })}
                                placeholder="50000"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Number of Winners</Label>
                            <Input
                                type="number"
                                value={formData.rewards_count}
                                onChange={(e) => setFormData({ ...formData, rewards_count: parseInt(e.target.value) })}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Page Content</Label>
                        <div className="border rounded-lg min-h-[400px]">
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
                                        <div className="flex items-center space-x-2 pt-8">
                                            <Checkbox
                                                id={`required-${index}`}
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

                <div className="p-4 border-t bg-gray-50/80 backdrop-blur-sm flex flex-col xl:flex-row items-center justify-between gap-4">
                    {/* Left Side: Controls & Settings */}
                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto">



                        {/* Schedule Capsule */}
                        <div className="flex items-center p-1 bg-white border rounded-md shadow-sm w-full sm:w-auto">
                            <div className="px-2 py-1 bg-gray-50 rounded border border-gray-100 mr-2">
                                <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Schedule</span>
                            </div>
                            <div className="flex items-center gap-2 px-1 text-[11px] font-medium text-gray-600">
                                <style>{datePickerStyle}</style>
                                <DatePicker
                                    selected={formData.publish_start_date ? new Date(formData.publish_start_date) : null}
                                    onChange={(date: Date | null) => setFormData({ ...formData, publish_start_date: date ? date.toISOString() : '' })}
                                    showTimeSelect
                                    timeFormat="HH:mm"
                                    timeIntervals={15}
                                    dateFormat="dd/MM/yyyy HH:mm"
                                    placeholderText="Start Date"
                                    className="bg-transparent border-none p-0 focus:outline-none w-[110px] text-right cursor-pointer hover:text-blue-600 transition-colors"
                                />
                                <span className="text-gray-300 mx-1">to</span>
                                <DatePicker
                                    selected={formData.publish_end_date ? new Date(formData.publish_end_date) : null}
                                    onChange={(date: Date | null) => setFormData({ ...formData, publish_end_date: date ? date.toISOString() : '' })}
                                    showTimeSelect
                                    timeFormat="HH:mm"
                                    timeIntervals={15}
                                    dateFormat="dd/MM/yyyy HH:mm"
                                    placeholderText="End Date"
                                    minDate={formData.publish_start_date ? new Date(formData.publish_start_date) : undefined}
                                    className="bg-transparent border-none p-0 focus:outline-none w-[110px] cursor-pointer hover:text-blue-600 transition-colors"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Right Side: Actions */}
                    <div className="flex gap-2 w-full xl:w-auto justify-end border-t xl:border-t-0 pt-3 xl:pt-0">
                        <Button variant="ghost" onClick={onClose} size="sm" className="h-8 text-xs text-gray-500 hover:text-gray-900">Cancel</Button>
                        {initialData?.slug && (
                            <Button variant="outline" size="sm" onClick={() => window.open(`/pages/${formData.slug}`, '_blank')} className="h-8 text-xs bg-white">
                                <Eye className="w-3 h-3 mr-1.5" />
                                Preview
                            </Button>
                        )}

                        {formData.is_published ? (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleSave(false)}
                                disabled={loading}
                                className="h-8 text-xs bg-white border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300"
                            >
                                Unpublish
                            </Button>
                        ) : (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleSave(true)}
                                disabled={loading}
                                className="h-8 text-xs bg-white border-green-200 text-green-600 hover:bg-green-50 hover:text-green-700 hover:border-green-300"
                            >
                                Publish
                            </Button>
                        )}

                        <Button
                            onClick={() => handleSave()}
                            disabled={loading}
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs shadow-sm"
                        >
                            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                            Save Page
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
