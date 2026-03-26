import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase, getCdnUrl } from '@/utils/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Loader2, CheckCircle, AlertCircle, ArrowRight, ArrowLeft, Check, Smartphone, HelpCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import imageCompression from 'browser-image-compression';

export function SurveyPage() {
    const { slug } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [pageData, setPageData] = useState<any>(null);
    const [submitting, setSubmitting] = useState(false);

    // Steps: 1 = Info, 2 = Screening (ID + Qs), 3 = Survey & Proof, 4 = Personal Data
    const [currentStep, setCurrentStep] = useState(1);
    const [isHelpOpen, setIsHelpOpen] = useState(false);

    // Respondent Form State
    const [formData, setFormData] = useState({
        respondent_name: '',
        jakpat_id: '',
        nik: '',
        alamat: '',
        email: '',
        ewallet_provider: 'gopay', // Default e-wallet
        e_wallet_number: '',
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
                survey_url,
                start_date,
                end_date,
                prize_per_winner,
                winner_count
            )
        `)
                .eq('slug', slug)
                .eq('is_published', true)
                .single();

            if (error) throw error;

            // Check Schedule from survey_pages table (publish_start_date / publish_end_date)
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
                        .rpc('increment_page_view', { page_id: data.id })
                        .then(({ error }) => {
                            if (!error) {
                                localStorage.setItem(viewKey, 'true');
                            } else {
                                console.error('Error incrementing view count:', error);
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

    const checkDuplicateSubmission = async (idToCheck = formData.jakpat_id) => {
        if (!idToCheck || !pageData?.id) return;

        const cleanId = idToCheck.trim();

        setCheckingDuplicate(true);
        setDuplicateError(null);

        try {
            // Check if Jakpat ID exists in page_respondents
            const { count, error } = await supabase
                .from('page_respondents')
                .select('id', { count: 'exact', head: true })
                .eq('page_id', pageData.id)
                .eq('jakpat_id', cleanId);

            if (error) throw error;

            if (count && count > 0) {
                setDuplicateError('Jakpat ID ini sudah pernah mengisi survei ini.');
                setHasCheckedDuplicate(true);
            } else {
                setDuplicateError(null);
                setHasCheckedDuplicate(true);
            }
        } catch (err) {
            console.error('Error checking duplicate:', err);
        } finally {
            setCheckingDuplicate(false);
        }
    };

    // Auto-check duplicate with debounce
    useEffect(() => {
        const timer = setTimeout(() => {
            if (formData.jakpat_id) {
                checkDuplicateSubmission(formData.jakpat_id);
            } else {
                setHasCheckedDuplicate(false);
                setDuplicateError(null);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [formData.jakpat_id, pageData?.id]);

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
        // Validation for Step 2 (Screening)
        if (currentStep === 2) {
            if (!formData.jakpat_id) {
                toast.error('Please enter your Jakpat ID');
                return;
            }
            if (duplicateError) {
                toast.error(duplicateError);
                return;
            }

            // Validate required custom fields (screening)
            if (pageData.custom_fields && pageData.custom_fields.length > 0) {
                for (const field of pageData.custom_fields) {
                    if (field.required && !formData.custom_answers[field.label]) {
                        toast.error(`Pertanyaan "${field.label}" wajib diisi`);
                        return;
                    }
                }
            }

            // If Disqualified, handle "Submit" behavior (End Survey)
            if (isDisqualified) {
                handleDisqualifiedSubmission();
                return;
            }
        }

        // Validation for Step 3 (Embed & Proof)
        if (currentStep === 3) {
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

    const handleDisqualifiedSubmission = async () => {
        setSubmitting(true);
        try {
            const { error } = await supabase
                .from('page_respondents')
                .insert([{
                    page_id: pageData.id,
                    jakpat_id: formData.jakpat_id.trim(),
                    custom_answers: formData.custom_answers,
                    // Other fields left null as they didn't reach that step
                }]);

            if (error) throw error;

            toast.success('Terima kasih sudah mengisi survey ini ya 😊');
            setTimeout(() => {
                // Close WebView with fallbacks instead of navigating to /pages
                try {
                    if ((window as any).ReactNativeWebView) {
                        (window as any).ReactNativeWebView.postMessage(JSON.stringify({ action: 'close' }));
                        return;
                    }
                } catch (e) { }
                try { window.close(); } catch (e) { }
                setTimeout(() => { window.location.href = 'jakpat://close'; }, 300);
                setTimeout(() => { if (!document.hidden) window.history.back(); }, 800);
            }, 2000);

        } catch (error) {
            console.error('Error saving disqualified submission:', error);
            // Even if error, maybe redirect? user shouldn't be blocked.
            // But let's show error for now.
            toast.error('Gagal menyimpan data. Silakan coba lagi.');
            setSubmitting(false);
        }
    };

    const [ewalletErrors, setEwalletErrors] = useState({ provider: false, number: false });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const errors = {
            provider: !formData.ewallet_provider,
            number: !formData.e_wallet_number
        };
        
        setEwalletErrors(errors);

        // We only check for ewallet fields since respondent_name was moved to the master profile
        if (errors.provider || errors.number) {
            toast.error('Pastikan provider e-wallet dan nomor handphone telah diisi');
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

        // NIK validation (basic length check) if filled
        if (formData.nik && formData.nik.length !== 16) {
            toast.error('NIK must be 16 digits');
            return;
        }

        setSubmitting(true);
        try {
            // Re-check duplicate before inserting (safety net)
            const cleanJakpatId = formData.jakpat_id.trim();
            const { count: dupCount, error: dupError } = await supabase
                .from('page_respondents')
                .select('id', { count: 'exact', head: true })
                .eq('page_id', pageData.id)
                .eq('jakpat_id', cleanJakpatId);

            if (dupError) throw dupError;
            if (dupCount && dupCount > 0) {
                toast.error('Jakpat ID ini sudah pernah mengisi survei ini.');
                setSubmitting(false);
                return;
            }

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
                    jakpat_id: cleanJakpatId,
                    e_wallet_number: formData.e_wallet_number,
                    ewallet_provider: formData.ewallet_provider,
                    custom_answers: formData.custom_answers,
                    proof_url: proofUrl
                }]);

            if (dbError) throw dbError;

            // Save to localStorage for next time
            localStorage.setItem('jakpat_respondent_data', JSON.stringify({
                jakpat_id: formData.jakpat_id,
                ewallet_provider: formData.ewallet_provider,
                e_wallet_number: formData.e_wallet_number,
                custom_answers: formData.custom_answers
            }));

            toast.success('Terima kasih! Data berhasil disimpan.');

            // Show success state or redirect
            setTimeout(() => {
                window.location.href = '/survey-success.html'; // Redirect to standalone success page suitable for WebView
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
                                let element: React.ReactNode = null;

                                if (child.type === 'text') {
                                    element = <span key={i} className={`${child.marks?.some((m: any) => m.type === 'bold') ? 'font-bold' : ''} ${child.marks?.some((m: any) => m.type === 'italic') ? 'italic' : ''}`}>{child.text}</span>;
                                } else if (child.type === 'image') {
                                    element = <img key={i} src={child.attrs.src} alt={child.attrs.alt} className="max-w-full rounded-lg my-4" />;
                                }

                                // Check for link mark
                                const linkMark = child.marks?.find((m: any) => m.type === 'link');
                                if (linkMark && element) {
                                    return (
                                        <a key={i} href={linkMark.attrs.href} target={linkMark.attrs.target || '_blank'} rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">
                                            {element}
                                        </a>
                                    );
                                }

                                return element;
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
                <Button variant="outline" className="mt-6" onClick={() => {
                    // Try to close WebView with fallbacks (respondents access via app WebView)
                    try {
                        if ((window as any).ReactNativeWebView) {
                            (window as any).ReactNativeWebView.postMessage(JSON.stringify({ action: 'close' }));
                            return;
                        }
                    } catch (e) { }
                    try { window.close(); } catch (e) { }
                    setTimeout(() => { window.location.href = 'jakpat://close'; }, 300);
                    setTimeout(() => { if (!document.hidden) window.history.back(); }, 800);
                }}>
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

    const checkEmbeddable = (url: string) => {
        try {
            const domain = new URL(url).hostname.toLowerCase();
            const embeddableDomains = [
                'docs.google.com',
                'forms.gle',
                'typeform.com',
                'surveymonkey.com',
                'forms.office.com',
                'qualtrics.com',
                'tally.so',
                'fillout.com'
            ];
            return embeddableDomains.some(d => domain.includes(d));
        } catch (e) {
            return false;
        }
    };

    const isEmbeddable = checkEmbeddable(surveyUrl);

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
            {/* Banner */}
            {pageData.banner_url && (
                <div className="relative aspect-[2.5/1] w-full overflow-hidden bg-gray-100 dark:bg-gray-800">
                    <img src={getCdnUrl(pageData.banner_url)} alt="Cover" className="w-full h-full object-cover" />
                </div>
            )}

            <div className="max-w-4xl mx-auto px-0 sm:px-4 -mt-4 sm:-mt-10 relative z-10 w-full">
                {/* Stepper (Hidden for now as per request) */}
                {/* <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-8">
                    <div className="flex items-center justify-between relative">
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-gray-200 z-0" />

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
                                    ${isDisqualified && step.id === 3 ? 'opacity-30' : ''}
                                `}>
                                    {currentStep > step.id ? <Check className="w-6 h-6" /> : step.id}
                                </div>
                                <span className={`text-xs mt-2 font-medium transition-colors duration-300 ${currentStep >= step.id ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'} ${isDisqualified && step.id === 3 ? 'opacity-30' : ''}`}>
                                    {step.label}
                                </span>
                            </div>
                        ))}
                    </div>
                </div> */}

                <div className="space-y-6">
                    {/* STEP 1: INFO */}
                    {currentStep === 1 && (
                        <Card className="shadow-none sm:shadow-lg border-x-0 border-b-0 border-t-4 border-t-blue-500 rounded-none sm:rounded-xl">
                            <CardHeader className="px-4 py-5 md:p-6">
                                <div className="flex gap-2 mb-2">
                                    {pageData.submission_id ? (
                                        <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">Survei Undian</span>
                                    ) : (
                                        <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full font-medium">Announcement</span>
                                    )}
                                    <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">Active</span>
                                    {pageData.submission_id && pageData.form_submissions?.prize_per_winner && pageData.form_submissions?.winner_count && (
                                        <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded-full font-medium">Total Reward: Rp {(pageData.form_submissions.prize_per_winner * pageData.form_submissions.winner_count).toLocaleString('id-ID')}</span>
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
                            <CardContent className="px-4 pb-6 md:px-6 md:pb-6 prose dark:prose-invert max-w-none">
                                {renderBlocks(pageData.blocks)}
                            </CardContent>
                            {pageData.submission_id && (
                                <div className="p-6 border-t bg-gray-50 flex justify-end">
                                    <Button onClick={nextStep} size="lg" className="bg-blue-600 hover:bg-blue-700 text-white">
                                        Mulai Survey <ArrowRight className="w-4 h-4 ml-2" />
                                    </Button>
                                </div>
                            )}
                        </Card>
                    )}

                    {/* STEP 2: SCREENING (ID & Questions) */}
                    {currentStep === 2 && (
                        <Card className="shadow-none sm:shadow-lg border-0 sm:border rounded-none sm:rounded-xl">
                            <CardHeader className="px-4 pt-5 pb-2 md:px-6 md:pt-6 md:pb-2">
                                <CardTitle>Screening</CardTitle>
                                <CardDescription>
                                    Mohon lengkapi data berikut sebelum melanjutkan ke pengisian survei.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="px-4 pt-4 pb-6 md:px-6 md:pb-6 space-y-6">
                                {/* Jakpat ID Check */}
                                <div className="bg-blue-50 border-y sm:border border-blue-100 -mx-4 sm:mx-0 sm:rounded-lg p-4 sm:p-5">
                                    <div className="flex flex-col items-start gap-1.5 mb-3">
                                        <Label htmlFor="jakpat_id_step2" className="text-blue-900 font-semibold block leading-tight">Jakpat ID</Label>
                                        <button
                                            type="button"
                                            onClick={() => setIsHelpOpen(true)}
                                            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 underline"
                                        >
                                            <HelpCircle className="w-3 h-3" />
                                            Cara lihat Jakpat ID
                                        </button>
                                    </div>
                                    <div className="relative">
                                        <Input
                                            id="jakpat_id_step2"
                                            name="jakpat_id"
                                            value={formData.jakpat_id}
                                            onChange={handleInputChange}
                                            placeholder="Jakpat ID kamu (min. 3 karakter)"
                                            className="bg-white pr-10" // Add padding right for loader
                                            autoFocus
                                        />
                                        {checkingDuplicate && (
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                                            </div>
                                        )}
                                    </div>
                                    {duplicateError && (
                                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mt-3 animate-in fade-in slide-in-from-top-2">
                                            <div className="flex items-start gap-3">
                                                <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5 shrink-0" />
                                                <div className="flex-1">
                                                    <h4 className="font-semibold text-orange-900 text-sm">Jakpat ID ini sudah pernah mengisi survei ini.</h4>
                                                    <p className="text-orange-800 text-sm mt-1 mb-3">
                                                        Kamu bisa cek survei Jakpat yang lainnya untuk mendapatkan reward.
                                                    </p>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="border-orange-300 text-orange-800 hover:bg-orange-100 hover:text-orange-900 h-8 text-xs bg-white"
                                                        onClick={() => {
                                                            // Try to close WebView with fallbacks
                                                            try {
                                                                if ((window as any).ReactNativeWebView) {
                                                                    (window as any).ReactNativeWebView.postMessage(JSON.stringify({ action: 'close' }));
                                                                    return;
                                                                }
                                                            } catch (e) { }
                                                            try { window.close(); } catch (e) { }
                                                            setTimeout(() => { window.location.href = 'jakpat://close'; }, 300);
                                                            setTimeout(() => { if (!document.hidden) window.history.back(); }, 800);
                                                        }}
                                                    >
                                                        Explore Survei Lainnya <ArrowRight className="w-3 h-3 ml-1.5" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
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
                                    <div className={`space-y-4 p-4 sm:p-5 -mx-4 sm:mx-0 bg-gray-50 border-y sm:border border-gray-100 sm:rounded-lg transition-opacity duration-300 ${(!hasCheckedDuplicate || !!duplicateError || checkingDuplicate) ? 'opacity-50 pointer-events-none' : ''}`}>
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
                                                            disabled={!hasCheckedDuplicate || !!duplicateError || checkingDuplicate}
                                                        />
                                                    ) : field.type === 'select' ? (
                                                        <div className="space-y-3 mt-2">
                                                            {field.options ? (
                                                                field.options.split(',').map((opt: string, i: number) => {
                                                                    const optionValue = opt.trim();
                                                                    const isSelected = formData.custom_answers[field.label] === optionValue;
                                                                    const isDisabled = !hasCheckedDuplicate || !!duplicateError || checkingDuplicate;
                                                                    return (
                                                                        <label
                                                                            key={i}
                                                                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${isSelected ? 'border-blue-500 bg-blue-50/50' : 'border-gray-200 bg-white hover:border-blue-300'} ${isDisabled ? 'opacity-50 pointer-events-none' : ''}`}
                                                                        >
                                                                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${isSelected ? 'border-blue-600' : 'border-gray-300'}`}>
                                                                                {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />}
                                                                            </div>
                                                                            <input
                                                                                type="radio"
                                                                                name={field.label}
                                                                                value={optionValue}
                                                                                checked={isSelected}
                                                                                onChange={() => handleCustomFieldChange(field.label, optionValue)}
                                                                                disabled={isDisabled}
                                                                                className="sr-only"
                                                                            />
                                                                            <span className={`text-sm ${isSelected ? 'text-blue-900 font-medium' : 'text-gray-700'}`}>
                                                                                {optionValue}
                                                                            </span>
                                                                        </label>
                                                                    );
                                                                })
                                                            ) : (
                                                                <div className="text-sm text-gray-500 italic">No options defined</div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <Input
                                                            type={field.type === 'number' ? 'number' : 'text'}
                                                            placeholder={field.placeholder}
                                                            value={formData.custom_answers[field.label] || ''}
                                                            onChange={(e) => handleCustomFieldChange(field.label, e.target.value)}
                                                            required={field.required}
                                                            className="bg-white"
                                                            disabled={!hasCheckedDuplicate || !!duplicateError || checkingDuplicate}
                                                        />
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Button Logic: Hidden until valid */}
                                {/* Button Logic: Hidden until valid */}
                                {(!duplicateError && hasCheckedDuplicate && formData.jakpat_id &&
                                    (!pageData.custom_fields || pageData.custom_fields.every((f: any) =>
                                        (!f.required && !f.is_screening) || (formData.custom_answers[f.label] && formData.custom_answers[f.label].trim() !== '')
                                    ))) && (
                                        <div className="p-6 border-t bg-gray-50 flex justify-between animate-in fade-in slide-in-from-bottom-2 duration-300">
                                            <Button onClick={prevStep} variant="outline" disabled={submitting}>
                                                <ArrowLeft className="w-4 h-4 mr-2" /> Kembali
                                            </Button>
                                            <Button onClick={nextStep} className="bg-blue-600 hover:bg-blue-700 text-white" disabled={submitting}>
                                                {submitting ? (
                                                    <>
                                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                        Menyimpan...
                                                    </>
                                                ) : (
                                                    isDisqualified ? 'Selesai' : <>Lanjut <ArrowRight className="w-4 h-4 ml-2" /></>
                                                )}
                                            </Button>
                                        </div>
                                    )}
                            </CardContent>
                        </Card>
                    )}

                    {/* STEP 3: EMBED & PROOF */}
                    {currentStep === 3 && (
                        <Card className="shadow-none sm:shadow-lg border-0 sm:border rounded-none sm:rounded-xl">
                            <CardHeader className="px-4 py-5 md:p-6">
                                <CardTitle>Isi Survey & Upload Bukti</CardTitle>
                                <CardDescription>
                                    Silakan isi survey di bawah ini sampai selesai, lalu screenshot halaman akhirnya.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="px-4 pb-6 md:px-6 md:pb-6 space-y-6">
                                {/* Iframe Embed or External Link */}
                                {isEmbeddable ? (
                                    <>
                                        <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg p-4 text-sm flex gap-3 items-start shadow-sm">
                                            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                                            <p className="text-blue-900/90 leading-relaxed">
                                                Jika form di bawah ini tampak kosong atau error, silakan{' '}
                                                <a href={surveyUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-700 hover:text-blue-800 hover:underline flex items-center inline-flex gap-1" style={{ display: 'inline-flex' }}>
                                                    Buka Survei di Layar Penuh <ExternalLink className="w-3 h-3" />
                                                </a>{' '}
                                                untuk mengisinya secara aman.
                                            </p>
                                        </div>

                                        <div className="-mx-4 sm:mx-0 w-auto sm:w-full h-[75vh] min-h-[500px] sm:h-[600px] border-y sm:border rounded-none sm:rounded-lg overflow-hidden relative bg-gray-100">
                                            <iframe
                                                src={surveyUrl}
                                                className="w-full h-full"
                                                title="Survey Form"
                                                allowFullScreen
                                            ></iframe>
                                            <div className="absolute top-0 right-0 p-2 bg-white/80 backdrop-blur-sm rounded-bl-lg text-xs font-medium text-gray-500 flex items-center gap-1 shadow-sm">
                                                External Form
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="border border-dashed border-gray-300 rounded-2xl bg-gray-50 p-8 sm:p-12 text-center flex flex-col items-center justify-center">
                                        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-6 shadow-sm ring-4 ring-white">
                                            <ExternalLink className="w-8 h-8 ml-1" />
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-900 mb-2">Buka Survei di Tab Baru</h3>
                                        <p className="text-gray-500 max-w-sm mx-auto mb-6 text-sm leading-relaxed">
                                            Sistem keamanan dari penyedia survei ini mengharuskan pengisian dilakukan di halaman utamanya. Silakan klik tombol di bawah untuk memulai.
                                        </p>
                                        <Button asChild size="lg" className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto px-8 shadow-md font-semibold">
                                            <a href={surveyUrl} target="_blank" rel="noopener noreferrer">
                                                Lanjutkan ke Survei <ExternalLink className="w-4 h-4 ml-2" />
                                            </a>
                                        </Button>
                                    </div>
                                )}

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
                            </CardContent>
                            <div className="p-6 border-t bg-gray-50 flex justify-between">
                                <Button onClick={prevStep} variant="outline">
                                    <ArrowLeft className="w-4 h-4 mr-2" /> Kembali
                                </Button>
                                <Button onClick={nextStep} className="bg-blue-600 hover:bg-blue-700 text-white">
                                    Lanjut <ArrowRight className="w-4 h-4 ml-2" />
                                </Button>
                            </div>
                        </Card>
                    )}

                    {/* STEP 4: PERSONAL DATA */}
                    {currentStep === 4 && (
                        <Card className="shadow-lg">
                            <CardHeader>
                                <CardTitle>Data Diri Hadiah Undian</CardTitle>
                                <CardDescription>
                                    Lengkapi data berikut untuk verifikasi dan pengiriman reward.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleSubmit} className="space-y-6">

                                    <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-5 mb-6">
                                        <p className="text-sm text-blue-900 leading-relaxed mb-4">
                                            Penentuan pemenang undian kini disesuaikan dengan <strong>Profil Jakpat</strong> kamu, lho!
                                        </p>
                                        <p className="text-sm text-blue-900 leading-relaxed mb-4">
                                            Pastikan kamu sudah mengisi atau memperbarui <strong>“Survey Tentang Kamu”</strong> di menu Survey agar data dirimu selalu <em>up-to-date</em>.
                                        </p>

                                        {/* Survey Banner Guidance Image */}
                                        <div className="w-full bg-white rounded-lg overflow-hidden flex items-center justify-center border border-gray-200 relative group">
                                            <img src="/survey-tentang-kamu-guide.png" alt="Panduan Survey Tentang Kamu" className="w-full h-auto object-contain" />
                                        </div>
                                    </div>

                                    <div className="space-y-4 pt-4 border-t">
                                        <div className="space-y-3">
                                            <Label className="text-sm font-medium">
                                                Pilih E-Wallet Reward
                                                {ewalletErrors.provider && <span className="text-red-500 ml-1 text-xs">* Wajib dipilih</span>}
                                            </Label>
                                            <div className="grid grid-cols-2 gap-3">
                                                <label className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${formData.ewallet_provider === 'gopay' ? 'border-blue-500 bg-blue-50/50 text-blue-800 font-medium' : ewalletErrors.provider ? 'border-red-400 bg-red-50/30' : 'border-gray-200 bg-white hover:border-blue-200'}`}>
                                                    <input
                                                        type="radio"
                                                        name="ewallet_provider"
                                                        value="gopay"
                                                        checked={formData.ewallet_provider === 'gopay'}
                                                        onChange={(e) => {
                                                            setFormData(prev => ({ ...prev, ewallet_provider: e.target.value }));
                                                            if (ewalletErrors.provider) setEwalletErrors(prev => ({ ...prev, provider: false }));
                                                        }}
                                                        className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                                                    />
                                                    GoPay
                                                </label>
                                                <label className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${formData.ewallet_provider === 'dana' ? 'border-blue-500 bg-blue-50/50 text-blue-800 font-medium' : ewalletErrors.provider ? 'border-red-400 bg-red-50/30' : 'border-gray-200 bg-white hover:border-blue-200'}`}>
                                                    <input
                                                        type="radio"
                                                        name="ewallet_provider"
                                                        value="dana"
                                                        checked={formData.ewallet_provider === 'dana'}
                                                        onChange={(e) => {
                                                            setFormData(prev => ({ ...prev, ewallet_provider: e.target.value }));
                                                            if (ewalletErrors.provider) setEwalletErrors(prev => ({ ...prev, provider: false }));
                                                        }}
                                                        className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                                                    />
                                                    DANA
                                                </label>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="e_wallet_number" className="text-sm font-medium">
                                                Nomor Handphone E-Wallet
                                                {ewalletErrors.number && <span className="text-red-500 ml-1 text-xs">* Wajib diisi</span>}
                                            </Label>
                                            <Input
                                                id="e_wallet_number"
                                                name="e_wallet_number"
                                                value={formData.e_wallet_number}
                                                onChange={(e) => {
                                                    handleInputChange(e);
                                                    if (ewalletErrors.number) setEwalletErrors(prev => ({ ...prev, number: false }));
                                                }}
                                                required
                                                type="tel"
                                                placeholder={`Contoh: 0812xxxxxxxx`}
                                                className={`h-12 text-lg placeholder:text-gray-300 ${ewalletErrors.number ? 'border-red-400 focus-visible:ring-red-500' : 'border-blue-200 focus-visible:ring-blue-500'}`}
                                            />
                                            <p className="text-xs text-gray-500">Pastikan nomor aktif dan terdaftar di E-Wallet pilihanmu.</p>
                                        </div>
                                    </div>
                                </form>
                            </CardContent>
                            <div className="p-6 border-t bg-gray-50 flex justify-between">
                                <Button onClick={prevStep} variant="outline">
                                    <ArrowLeft className="w-4 h-4 mr-2" /> Kembali
                                </Button>
                                <Button onClick={handleSubmit} className="bg-green-600 hover:bg-green-700 text-white min-w-[100px]" disabled={submitting}>
                                    {submitting ? (
                                        <>
                                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                            Processing...
                                        </>
                                    ) : (
                                        <>
                                            Submit <Check className="w-4 h-4 ml-2" />
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
