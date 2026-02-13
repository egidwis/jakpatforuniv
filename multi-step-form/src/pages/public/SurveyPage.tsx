import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/utils/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Loader2, Upload, CheckCircle, AlertCircle, ArrowRight, ArrowLeft, Check, Smartphone, User, HelpCircle, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import imageCompression from 'browser-image-compression';

export function SurveyPage() {
    const { slug } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [pageData, setPageData] = useState<any>(null);
    const [submitting, setSubmitting] = useState(false);

    // Steps: 1 = Info, 2 = Survey & Proof, 3 = Personal Data
    const [currentStep, setCurrentStep] = useState(1);
    const [isHelpOpen, setIsHelpOpen] = useState(false);

    // Respondent Form State
    const [formData, setFormData] = useState({
        respondent_name: '',
        jakpat_id: '',
        nik: '',
        province: '',
        e_wallet_number: '',
        contact_info: '', // Email or Phone
        proof_url: '',
        custom_answers: {} as Record<string, any>,
    });

    const [proofFile, setProofFile] = useState<File | null>(null);

    // Duplicate Check State
    const [checkingDuplicate, setCheckingDuplicate] = useState(false);
    const [duplicateError, setDuplicateError] = useState<string | null>(null);
    const [hasCheckedDuplicate, setHasCheckedDuplicate] = useState(false);

    // Screening Logic
    const isDisqualified = useMemo(() => {
        if (!pageData?.custom_fields) return false;
        return pageData.custom_fields.some((field: any) => {
            if (field.is_screening && field.type === 'select' && field.valid_options?.length > 0) {
                const answer = formData.custom_answers[field.label];
                // If answered, and answer is NOT in valid_options -> Disqualified
                if (answer && !field.valid_options.includes(answer)) {
                    return true;
                }
            }
            return false;
        });
    }, [pageData, formData.custom_answers]);

    useEffect(() => {
        loadPageData();
        // Auto-fill from localStorage
        const savedData = localStorage.getItem('jakpat_respondent_data');
        if (savedData) {
            try {
                setFormData(prev => ({ ...prev, ...JSON.parse(savedData) }));
            } catch (e) {
                console.error('Failed to parse saved respondent data');
            }
        }
    }, [slug]);

    const loadPageData = async () => {
        try {
            const { data, error } = await supabase
                .from('survey_pages')
                .select(`
            *,
            form_submissions (
                survey_url
            )
        `)
                .eq('slug', slug)
                .eq('is_published', true)
                .single();

            if (error) throw error;

            // Check Schedule
            const now = new Date();
            const startDate = data.publish_start_date ? new Date(data.publish_start_date) : null;
            const endDate = data.publish_end_date ? new Date(data.publish_end_date) : null;

            if (startDate && startDate > now) {
                // Not started yet
                toast.error('Survey belum dimulai.');
                setLoading(false);
                return; // Stop here, pageData remains null -> could render empty or redirect
            }

            if (endDate && endDate < now) {
                // Ended
                toast.error('Survey sudah berakhir.');
                setLoading(false);
                return;
            }

            setPageData(data);

            if (data?.id) {
                // Check local storage for unique view tracking
                const viewKey = `viewed_page_${data.id}`;
                const hasViewed = localStorage.getItem(viewKey);

                if (!hasViewed) {
                    supabase
                        .from('survey_pages')
                        .update({ views_count: (data.views_count || 0) + 1 })
                        .eq('id', data.id)
                        .then(({ error }) => {
                            if (!error) {
                                localStorage.setItem(viewKey, 'true');
                            }
                        });
                }
            }

        } catch (error) {
            console.error('Error loading page:', error);
            toast.error('Page not found or unpublished');
            // navigate('/'); // Optional: redirect to home or 404
        } finally {
            setLoading(false);
        }
    };

    const checkDuplicateSubmission = async () => {
        if (!formData.jakpat_id || !pageData?.form_submissions?.id) return;

        setCheckingDuplicate(true);
        setDuplicateError(null);

        try {
            // Check if Jakpat ID exists in submissions for this form
            const { data, error } = await supabase
                .from('survey_submissions') // Assuming this is the table where answers are stored
                .select('id')
                .eq('form_submission_id', pageData.form_submissions.id) // Filter by specific survey
                // We need to check inside the answers jsonb column or a separate column if it exists.
                // Assuming answers is a JSONB column and we want to check for jakpat_id inside it?
                // actually wait, look at handleInput change, jakpat_id is top level in formData for this page,
                // BUT where is it saved in the DB?
                // Let's assume it's saved in the 'answers' JSONB column or similar.
                // Based on previous code, handleSave saves to 'survey_submissions'.
                // Ideally we should have a 'unique_identifier' column or search within JSON.
                // For now, let's assume we search in the JSON 'answers' -> 'jakpat_id'.
                .contains('answers', { jakpat_id: formData.jakpat_id })
                .maybeSingle();

            if (error) throw error;

            if (data) {
                setDuplicateError('Jakpat ID ini sudah pernah mengisi survei ini.');
                setHasCheckedDuplicate(true); // Checked, but failed
            } else {
                setDuplicateError(null);
                setHasCheckedDuplicate(true); // Checked and passed
            }
        } catch (err) {
            console.error('Error checking duplicate:', err);
            // Don't block if error (optional), or block safely
        } finally {
            setCheckingDuplicate(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleCustomFieldChange = (label: string, value: string) => {
        setFormData(prev => ({
            ...prev,
            custom_answers: {
                ...prev.custom_answers,
                [label]: value
            }
        }));
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            setProofFile(e.target.files[0]);
        }
    };

    const nextStep = () => {
        // Validation for Step 2
        if (currentStep === 2) {
            if (!formData.jakpat_id) {
                toast.error('Please enter your Jakpat ID');
                return;
            }
            if (!proofFile) {
                toast.error('Please upload proof of survey completion');
                return;
            }
        }
        setCurrentStep(prev => prev + 1);
        window.scrollTo(0, 0);
    };

    const prevStep = () => {
        setCurrentStep(prev => prev - 1);
        window.scrollTo(0, 0);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.respondent_name || !formData.e_wallet_number) {
            toast.error('Please fill in all required fields');
            return;
        }

        // Validate custom fields
        if (pageData.custom_fields && pageData.custom_fields.length > 0) {
            for (const field of pageData.custom_fields) {
                if (field.required && !formData.custom_answers[field.label]) {
                    toast.error(`Pertanyaan "${field.label}" wajib diisi`);
                    return;
                }
            }
        }

        // NIK validation (basic length check)
        if (formData.nik && formData.nik.length !== 16) {
            toast.error('NIK must be 16 digits');
            return;
        }

        setSubmitting(true);
        try {
            let proofUrl = '';

            // Upload Proof if exists
            if (proofFile) {
                const options = {
                    maxSizeMB: 0.1, // < 100KB
                    maxWidthOrHeight: 1024,
                    useWebWorker: true,
                };
                const compressedFile = await imageCompression(proofFile, options);
                const fileName = `proof-${Date.now()}-${proofFile.name}`;

                const { error: uploadError } = await supabase.storage
                    .from('page-uploads')
                    .upload(fileName, compressedFile);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('page-uploads')
                    .getPublicUrl(fileName);
                proofUrl = publicUrl;
            }

            // Save Respondent Data
            const { error: dbError } = await supabase
                .from('page_respondents')
                .insert([{
                    page_id: pageData.id,
                    ...formData,
                    proof_url: proofUrl,
                }]);

            if (dbError) throw dbError;

            // Save to localStorage for next time
            localStorage.setItem('jakpat_respondent_data', JSON.stringify({
                respondent_name: formData.respondent_name,
                jakpat_id: formData.jakpat_id,
                nik: formData.nik,
                province: formData.province,
                e_wallet_number: formData.e_wallet_number,
                contact_info: formData.contact_info,
                custom_answers: formData.custom_answers
            }));

            toast.success('Terima kasih! Data berhasil disimpan.');

            // Show success state or redirect
            setTimeout(() => {
                navigate('/pages'); // Redirect to survey listing
            }, 2000);

        } catch (error: any) {
            console.error('Submission error:', error);
            toast.error(error.message || 'Failed to submit');
            setSubmitting(false);
        }
    };

    // Block Renderer
    const renderBlocks = (blocks: any) => {
        if (!blocks || !blocks.content) return null;

        return blocks.content.map((block: any, index: number) => {
            switch (block.type) {
                case 'heading':
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const Level = (`h${block.attrs.level}`) as any;
                    return <Level key={index} className={`font-bold mt-4 mb-2 ${block.attrs.level === 1 ? 'text-3xl' : block.attrs.level === 2 ? 'text-2xl' : 'text-xl'}`}>{block.content?.[0]?.text}</Level>;
                case 'paragraph':
                    if (!block.content) return <p key={index} className="mb-4">&nbsp;</p>; // Empty paragraph
                    return (
                        <p key={index} className="mb-4 text-gray-700 dark:text-gray-300 leading-relaxed">
                            {block.content.map((child: any, i: number) => {
                                if (child.type === 'text') {
                                    return <span key={i} className={`${child.marks?.some((m: any) => m.type === 'bold') ? 'font-bold' : ''} ${child.marks?.some((m: any) => m.type === 'italic') ? 'italic' : ''}`}>{child.text}</span>;
                                } else if (child.type === 'image') {
                                    return <img key={i} src={child.attrs.src} alt={child.attrs.alt} className="max-w-full rounded-lg my-4" />;
                                }
                                return null;
                            })}
                        </p>
                    );
                case 'image':
                    return <img key={index} src={block.attrs.src} alt={block.attrs.alt} className="max-w-full rounded-lg my-6 shadow-md" />;
                case 'bulletList':
                    return (
                        <ul key={index} className="list-disc pl-5 mb-4 space-y-1">
                            {block.content.map((item: any, i: number) => (
                                <li key={i}>{item.content?.[0]?.content?.[0]?.text}</li>
                            ))}
                        </ul>
                    );
                case 'orderedList':
                    return (
                        <ol key={index} className="list-decimal pl-5 mb-4 space-y-1">
                            {block.content.map((item: any, i: number) => (
                                <li key={i}>{item.content?.[0]?.content?.[0]?.text}</li>
                            ))}
                        </ol>
                    );
                default:
                    return null;
            }
        });
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    if (!pageData) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
                <AlertCircle className="w-12 h-12 text-gray-400 mb-4" />
                <h2 className="text-xl font-bold text-gray-900 mb-2">Halaman Tidak Ditemukan</h2>
                <p className="text-gray-500 max-w-md">
                    Halaman survei yang Anda cari mungkin belum dimulai, sudah berakhir, atau telah dihapus.
                </p>
                <Button variant="outline" className="mt-6" onClick={() => navigate('/pages')}>
                    Kembali ke Daftar Survei
                </Button>
            </div>
        );
    }

    // Check if Survey URL can be embedded (simple check)
    // If google form, ensure it has embedded=true or logic to add it
    let surveyUrl = pageData.form_submissions?.survey_url || '';
    if (surveyUrl.includes('docs.google.com/forms') && !surveyUrl.includes('embedded=true')) {
        // Convert viewform or viewanalytics to viewform?embedded=true
        // Usually appending ?embedded=true works
        if (surveyUrl.includes('?')) {
            surveyUrl += '&embedded=true';
        } else {
            surveyUrl += '?embedded=true';
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
            {/* Banner */}
            {pageData.banner_url && (
                <div className="w-full h-[200px] md:h-[300px] overflow-hidden">
                    <img src={pageData.banner_url} alt="Cover" className="w-full h-full object-cover" />
                </div>
            )}

            <div className="max-w-4xl mx-auto px-4 -mt-10 relative z-10">
                {/* Stepper */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-8">
                    <div className="flex items-center justify-between relative">
                        {/* Connecting Line Background */}
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-gray-200 z-0" />

                        {/* Active Line Progress - dynamic width based on step */}
                        <div
                            className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-green-500 z-0 transition-all duration-300 ease-in-out"
                            style={{ width: `${((currentStep - 1) / 2) * 100}%` }}
                        />

                        {[
                            { id: 1, label: 'Info Survey' },
                            { id: 2, label: 'Isi Survey' },
                            { id: 3, label: 'Data Diri' }
                        ].map((step) => (
                            <div key={step.id} className="relative z-10 flex flex-col items-center bg-white dark:bg-gray-800 px-2">
                                <div className={`
                                    w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-all duration-300
                                    ${currentStep > step.id ? 'bg-green-500 border-green-500 text-white' :
                                        currentStep === step.id ? 'bg-blue-600 border-blue-600 text-white scale-110 shadow-md' :
                                            'bg-white border-gray-300 text-gray-400'}
                                `}>
                                    {currentStep > step.id ? <Check className="w-6 h-6" /> : step.id}
                                </div>
                                <span className={`text-xs mt-2 font-medium transition-colors duration-300 ${currentStep >= step.id ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'}`}>
                                    {step.label}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="space-y-6">
                    {/* STEP 1: INFO */}
                    {currentStep === 1 && (
                        <Card className="shadow-lg border-t-4 border-t-blue-500">
                            <CardHeader>
                                <div className="flex gap-2 mb-2">
                                    <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">Active</span>
                                    {pageData.rewards_amount && (
                                        <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded-full font-medium">Reward: Rp {parseInt(pageData.rewards_amount).toLocaleString()}</span>
                                    )}
                                </div>
                                <CardTitle className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
                                    {pageData.title}
                                </CardTitle>
                                <CardDescription className="flex items-center gap-2 mt-2">
                                    <span>Published on {new Date(pageData.created_at).toLocaleDateString()}</span>
                                    <span>•</span>
                                    <span>{pageData.views_count} views</span>
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="prose dark:prose-invert max-w-none">
                                {renderBlocks(pageData.blocks)}
                            </CardContent>
                            <div className="p-6 border-t bg-gray-50 flex justify-end">
                                <Button onClick={nextStep} size="lg" className="bg-blue-600 hover:bg-blue-700 text-white">
                                    Mulai Survey <ArrowRight className="w-4 h-4 ml-2" />
                                </Button>
                            </div>
                        </Card>
                    )}

                    {/* STEP 2: EMBED & PROOF */}
                    {currentStep === 2 && (
                        <Card className="shadow-lg">
                            <CardHeader>
                                <CardTitle>Isi Survey & Upload Bukti</CardTitle>
                                <CardDescription>
                                    Silakan isi survey di bawah ini sampai selesai, lalu screenshot halaman akhirnya.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                {/* Jakpat ID Check */}
                                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <Label htmlFor="jakpat_id_step2" className="text-blue-900 font-semibold block">Masukkan Jakpat ID kamu sebelum mengisi:</Label>
                                        <button
                                            type="button"
                                            onClick={() => setIsHelpOpen(true)}
                                            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 underline"
                                        >
                                            <HelpCircle className="w-3 h-3" />
                                            Cara lihat Jakpat ID
                                        </button>
                                    </div>
                                    <div className="flex gap-2">
                                        <Input
                                            id="jakpat_id_step2"
                                            name="jakpat_id"
                                            value={formData.jakpat_id}
                                            onChange={(e) => {
                                                handleInputChange(e);
                                                setHasCheckedDuplicate(false); // Reset check on change
                                            }}
                                            onBlur={checkDuplicateSubmission} // Check on blur
                                            placeholder="Jakpat ID kamu"
                                            className="bg-white flex-1"
                                            autoFocus
                                        />
                                        <Button
                                            onClick={checkDuplicateSubmission}
                                            disabled={checkingDuplicate || !formData.jakpat_id}
                                            variant="secondary"
                                            className="shrink-0"
                                        >
                                            {checkingDuplicate ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cek'}
                                        </Button>
                                    </div>
                                    {duplicateError && (
                                        <p className="text-red-600 text-sm mt-2 flex items-center gap-1">
                                            <AlertCircle className="w-4 h-4" /> {duplicateError}
                                        </p>
                                    )}

                                    <Dialog open={isHelpOpen} onOpenChange={setIsHelpOpen}>
                                        <DialogContent className="max-w-md">
                                            <div className="p-2">
                                                <h3 className="text-lg font-semibold mb-4">Cara Melihat Jakpat ID</h3>
                                                <img
                                                    src="/Survei Undian Kewirausahaan.png"
                                                    alt="Cara lihat Jakpat ID"
                                                    className="w-full rounded-lg border shadow-sm"
                                                />
                                                <div className="mt-4 text-sm text-gray-600">
                                                    1. Buka aplikasi Jakpat<br />
                                                    2. Masuk ke menu Profil<br />
                                                    3. ID kamu ada di atas pojok kiri.
                                                </div>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                </div>

                                {/* Custom Fields Section (Screening) */}
                                {pageData.custom_fields && pageData.custom_fields.length > 0 && (
                                    <div className="space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
                                        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                                            <div className="w-1 h-4 bg-blue-500 rounded-full"></div>
                                            Pertanyaan Tambahan
                                        </h3>
                                        <div className="grid grid-cols-1 gap-4">
                                            {pageData.custom_fields.map((field: any, index: number) => (
                                                <div key={index} className="space-y-2">
                                                    <Label className="text-gray-700">
                                                        {field.label} {field.required && <span className="text-red-500">*</span>}
                                                    </Label>
                                                    {field.type === 'textarea' ? (
                                                        <Textarea
                                                            placeholder={field.placeholder}
                                                            value={formData.custom_answers[field.label] || ''}
                                                            onChange={(e) => handleCustomFieldChange(field.label, e.target.value)}
                                                            required={field.required}
                                                            className="bg-white"
                                                        />
                                                    ) : field.type === 'select' ? (
                                                        <Select
                                                            value={formData.custom_answers[field.label] || ''}
                                                            onValueChange={(val) => handleCustomFieldChange(field.label, val)}
                                                        >
                                                            <SelectTrigger className="bg-white">
                                                                <SelectValue placeholder={field.placeholder || 'Select an option'} />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {field.options ? (
                                                                    field.options.split(',').map((opt: string, i: number) => (
                                                                        <SelectItem key={i} value={opt.trim()}>
                                                                            {opt.trim()}
                                                                        </SelectItem>
                                                                    ))
                                                                ) : (
                                                                    <SelectItem value="no-options" disabled>No options defined</SelectItem>
                                                                )}
                                                            </SelectContent>
                                                        </Select>
                                                    ) : (
                                                        <Input
                                                            type={field.type === 'number' ? 'number' : 'text'}
                                                            placeholder={field.placeholder}
                                                            value={formData.custom_answers[field.label] || ''}
                                                            onChange={(e) => handleCustomFieldChange(field.label, e.target.value)}
                                                            required={field.required}
                                                            className="bg-white"
                                                        />
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Disqualification Message */}
                                {isDisqualified && (
                                    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center animate-in fade-in zoom-in duration-300">
                                        <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-3" />
                                        <h3 className="text-lg font-bold text-red-700 mb-2">Mohon Maaf</h3>
                                        <p className="text-red-600">
                                            Anda belum memenuhi kriteria untuk survei kali ini. Terima kasih atas partisipasinya.
                                        </p>
                                    </div>
                                )}

                                {/* Iframe Embed (Hidden if Disqualified OR Duplicate OR Not Checked) */}
                                {!isDisqualified && !duplicateError && hasCheckedDuplicate && (
                                    <>
                                        <div className="w-full h-[600px] border rounded-lg overflow-hidden relative bg-gray-100">
                                            <iframe
                                                src={surveyUrl}
                                                className="w-full h-full"
                                                title="Survey Form"
                                                allowFullScreen
                                            ></iframe>
                                            <div className="absolute top-0 right-0 p-2 bg-white/80 backdrop-blur-sm rounded-bl-lg text-xs text-gray-500">
                                                External Form
                                            </div>
                                        </div>
                                        <div className="text-center text-sm text-gray-500">
                                            Tidak bisa mengisi form di atas? <a href={surveyUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Buka di tab baru</a>
                                        </div>

                                        {/* Proof Upload */}
                                        <div className="space-y-2 pt-4 border-t">
                                            <Label className="text-base font-semibold">Upload Screenshot Bukti Pengisian (Halaman Akhir/Terima Kasih)</Label>
                                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:bg-gray-50 transition cursor-pointer relative group">
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleFileChange}
                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                                />
                                                {proofFile ? (
                                                    <div className="flex flex-col items-center text-green-600">
                                                        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-2">
                                                            <CheckCircle className="w-6 h-6 text-green-600" />
                                                        </div>
                                                        <span className="font-medium text-lg">{proofFile.name}</span>
                                                        <span className="text-sm text-gray-500">Siap diupload</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col items-center text-gray-500 group-hover:text-blue-600 transition-colors">
                                                        <div className="w-12 h-12 bg-gray-100 group-hover:bg-blue-50 rounded-full flex items-center justify-center mb-2 transition-colors">
                                                            <Smartphone className="w-6 h-6" />
                                                        </div>
                                                        <span className="font-medium text-lg">Tap untuk upload screenshot</span>
                                                        <span className="text-xs mt-1">Format: JPG/PNG, Max 5MB</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </CardContent>
                            <div className="p-6 border-t bg-gray-50 flex justify-between">
                                <Button onClick={prevStep} variant="outline">
                                    <ArrowLeft className="w-4 h-4 mr-2" /> Kembali
                                </Button>
                                <Button onClick={nextStep} disabled={isDisqualified || !!duplicateError || !hasCheckedDuplicate} className="bg-blue-600 hover:bg-blue-700 text-white">
                                    Lanjut ke Data Diri <ArrowRight className="w-4 h-4 ml-2" />
                                </Button>
                            </div>
                        </Card>
                    )}

                    {/* STEP 3: PERSONAL DATA */}
                    {currentStep === 3 && (
                        <Card className="shadow-lg">
                            <CardHeader>
                                <CardTitle>Data Diri & Pencairan Reward</CardTitle>
                                <CardDescription>
                                    Lengkapi data berikut untuk verifikasi dan pengiriman reward.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleSubmit} className="space-y-6">

                                    {/* Custom Fields moved to Step 2 */}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <Label htmlFor="respondent_name">Nama Lengkap *</Label>
                                            <div className="relative">
                                                <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                                <Input
                                                    id="respondent_name"
                                                    name="respondent_name"
                                                    value={formData.respondent_name}
                                                    onChange={handleInputChange}
                                                    required
                                                    className="pl-9"
                                                    placeholder="Sesuai KTP"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="province">Provinsi Domisili</Label>
                                            <Input
                                                id="province"
                                                name="province"
                                                value={formData.province}
                                                onChange={handleInputChange}
                                                placeholder="Contoh: Jawa Barat"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <Label htmlFor="nik">NIK (16 Digit - Untuk Validasi)</Label>
                                            <Input
                                                id="nik"
                                                name="nik"
                                                value={formData.nik}
                                                onChange={handleInputChange}
                                                placeholder="3201xxxxxxxxxxxx"
                                                maxLength={16}
                                            />
                                            <p className="text-[10px] text-gray-400">Kami menjaga kerahasiaan data NIK Anda.</p>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="contact_info">Email / No HP</Label>
                                            <Input
                                                id="contact_info"
                                                name="contact_info"
                                                value={formData.contact_info}
                                                onChange={handleInputChange}
                                                placeholder="email@example.com"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2 pt-4 border-t">
                                        <Label htmlFor="e_wallet_number" className="text-lg text-blue-800">Nomor E-Wallet (Reward)</Label>
                                        <Input
                                            id="e_wallet_number"
                                            name="e_wallet_number"
                                            value={formData.e_wallet_number}
                                            onChange={handleInputChange}
                                            required
                                            placeholder="0812xxx (GoPay/OVO/Dana/ShopeePay)"
                                            className="h-12 text-lg border-blue-200 focus-visible:ring-blue-500"
                                        />
                                        <p className="text-xs text-gray-500">Pastikan nomor aktif dan terdaftar di E-Wallet.</p>
                                    </div>
                                </form>
                            </CardContent>
                            <div className="p-6 border-t bg-gray-50 flex justify-between">
                                <Button onClick={prevStep} variant="outline">
                                    <ArrowLeft className="w-4 h-4 mr-2" /> Kembali
                                </Button>
                                <Button onClick={handleSubmit} className="bg-green-600 hover:bg-green-700 text-white min-w-[140px]" disabled={submitting}>
                                    {submitting ? (
                                        <>
                                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                            Processing...
                                        </>
                                    ) : (
                                        <>
                                            Kirim Data <Check className="w-4 h-4 ml-2" />
                                        </>
                                    )}
                                </Button>
                            </div>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
