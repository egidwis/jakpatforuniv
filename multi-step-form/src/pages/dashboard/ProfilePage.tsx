import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { getOwnProfile, updateOwnProfile, isProfileComplete, type ResearcherProfile } from '@/utils/supabase';
import { ACADEMIC_STATUS_OPTIONS, DEPARTMENT_OPTIONS, UNIVERSITY_OPTIONS, REFERRAL_SOURCE_OPTIONS, collapseReferralSource, expandReferralSource } from '@/constants/biodata';
import { Button } from '@/components/ui/button';
import { Loader2, Menu, User, GraduationCap, Megaphone, Info } from 'lucide-react';
import { toast } from 'sonner';

const inputClass = 'w-full px-4 py-2.5 rounded-xl border border-gray-200 hover:border-gray-300 transition-all duration-200 bg-white';

/**
 * Halaman profil researcher (konsep 1 akun = 1 researcher).
 * Dua mode dalam satu komponen:
 * - Onboarding: profil belum lengkap (user Google / user lama) → wajib diisi
 *   sebelum bisa memasang survei (di-gate oleh RequireCompleteProfile).
 * - Edit: profil sudah lengkap → tempat mengubah biodata kapan saja.
 * Biodata ini menjadi sumber prefill order form & default Detail Invoice.
 */
export function ProfilePage() {
    const { user } = useAuth();
    const { toggleSidebar } = useOutletContext<{ toggleSidebar: () => void }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const nextPath = searchParams.get('next');

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isOnboarding, setIsOnboarding] = useState(false);

    const [fullName, setFullName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [university, setUniversity] = useState('');
    const [department, setDepartment] = useState('');
    const [status, setStatus] = useState('');
    const [referralSource, setReferralSource] = useState('');
    const [referralSourceOther, setReferralSourceOther] = useState('');

    useEffect(() => {
        const load = async () => {
            const profile: ResearcherProfile | null = await getOwnProfile();
            setIsOnboarding(!isProfileComplete(profile));
            if (profile) {
                setFullName(profile.full_name || user?.user_metadata?.full_name || '');
                setPhoneNumber(profile.phone_number || '');
                setUniversity(profile.university || '');
                setDepartment(profile.department || '');
                setStatus(profile.status || '');
                const ref = expandReferralSource(profile.referral_source);
                setReferralSource(ref.source);
                setReferralSourceOther(ref.other);
            } else {
                setFullName(user?.user_metadata?.full_name || '');
            }
            setLoading(false);
        };
        load();
    }, [user]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fullName.trim()) { toast.error('Mohon isi nama lengkap Anda'); return; }
        if (!phoneNumber.trim() || phoneNumber.trim().length < 10) { toast.error('Mohon isi nomor telepon yang valid (min. 10 digit)'); return; }
        if (!university.trim()) { toast.error('Mohon isi universitas/institusi Anda'); return; }
        if (!department.trim()) { toast.error('Mohon pilih jurusan Anda'); return; }
        if (!status) { toast.error('Mohon pilih status akademik Anda'); return; }

        try {
            setSaving(true);
            await updateOwnProfile({
                full_name: fullName.trim(),
                phone_number: phoneNumber.trim(),
                university: university.trim(),
                department: department.trim(),
                status,
                referral_source: referralSource
                    ? collapseReferralSource(referralSource, referralSourceOther)
                    : null,
            });
            toast.success('Profil berhasil disimpan');
            if (nextPath) {
                navigate(nextPath, { replace: true });
            } else {
                setIsOnboarding(false);
            }
        } catch (error: any) {
            console.error('Error saving profile:', error);
            toast.error(error.message || 'Gagal menyimpan profil');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto px-6 py-8">
            {/* Mobile header */}
            <div className="flex items-center gap-3 mb-6 md:hidden">
                <Button variant="ghost" size="icon" onClick={toggleSidebar} className="-ml-2 h-9 w-9">
                    <Menu className="w-5 h-5 text-gray-700" />
                </Button>
                <span className="text-sm font-semibold text-gray-700">Profil</span>
            </div>

            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">
                    {isOnboarding ? 'Lengkapi Profil Anda' : 'Profil Researcher'}
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                    {isOnboarding
                        ? 'Sebelum memasang survei, lengkapi biodata researcher Anda terlebih dahulu. Cukup sekali — order berikutnya tidak akan menanyakannya lagi.'
                        : 'Biodata ini dipakai sebagai identitas researcher dan default detail invoice di setiap order.'}
                </p>
            </div>

            {isOnboarding && (
                <div className="flex items-start gap-2 mb-6 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                    <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-blue-700">
                        1 akun = 1 researcher. Detail invoice per order tetap bisa diubah saat checkout tanpa mengubah profil ini.
                    </p>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                {/* Kontak */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 145, 255, 0.1)', color: '#0091ff' }}>
                            <User size={18} />
                        </div>
                        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Data Diri</h3>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label htmlFor="fullName" className="text-sm font-medium text-gray-700">Nama Lengkap <span className="text-red-500">*</span></label>
                            <input id="fullName" type="text" className={inputClass} value={fullName}
                                onChange={(e) => setFullName(e.target.value)} placeholder="Nama lengkap Anda" />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="phoneNumber" className="text-sm font-medium text-gray-700">No Telepon <span className="text-red-500">*</span></label>
                            <input id="phoneNumber" type="tel" className={inputClass} value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value)} placeholder="08xxxxxxxxxx" />
                        </div>
                    </div>
                </div>

                {/* Akademik */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
                            <GraduationCap size={18} />
                        </div>
                        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Informasi Akademik</h3>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label htmlFor="university" className="text-sm font-medium text-gray-700">Universitas <span className="text-red-500">*</span></label>
                            <input id="university" type="text" list="university-options" className={inputClass} value={university}
                                onChange={(e) => setUniversity(e.target.value)} placeholder="Ketik atau pilih universitas" />
                            <datalist id="university-options">
                                {UNIVERSITY_OPTIONS.map(opt => <option key={opt} value={opt} />)}
                            </datalist>
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="department" className="text-sm font-medium text-gray-700">Jurusan <span className="text-red-500">*</span></label>
                            <input id="department" type="text" list="department-options" className={inputClass} value={department}
                                onChange={(e) => setDepartment(e.target.value)} placeholder="Ketik atau pilih jurusan" />
                            <datalist id="department-options">
                                {DEPARTMENT_OPTIONS.map(opt => <option key={opt} value={opt} />)}
                            </datalist>
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <label htmlFor="status" className="text-sm font-medium text-gray-700">Status Akademik <span className="text-red-500">*</span></label>
                            <select id="status" className={`${inputClass} appearance-none`} value={status}
                                onChange={(e) => setStatus(e.target.value)}>
                                <option value="">Pilih status akademik Anda saat ini</option>
                                {ACADEMIC_STATUS_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Referral */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600">
                            <Megaphone size={18} />
                        </div>
                        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Dari Mana Anda Mengetahui Kami?</h3>
                    </div>
                    <div className="p-6 space-y-4">
                        <select className={`${inputClass} appearance-none`} value={referralSource}
                            onChange={(e) => { setReferralSource(e.target.value); if (e.target.value !== 'Lainnya') setReferralSourceOther(''); }}>
                            <option value="">Pilih salah satu (opsional)</option>
                            {REFERRAL_SOURCE_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                        {referralSource === 'Lainnya' && (
                            <input type="text" className={inputClass} value={referralSourceOther}
                                onChange={(e) => setReferralSourceOther(e.target.value)} placeholder="Sebutkan sumbernya" />
                        )}
                    </div>
                </div>

                <div className="flex justify-end pt-2">
                    <button
                        type="submit"
                        disabled={saving}
                        className="px-6 py-2.5 rounded-xl text-white font-medium shadow-md hover:shadow-lg transition-all duration-200 flex items-center gap-2 disabled:opacity-60"
                        style={{ background: 'linear-gradient(135deg, #0091ff 0%, #0077cc 100%)' }}
                    >
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        {isOnboarding && nextPath ? 'Simpan & Lanjut Pasang Survei →' : 'Simpan Profil'}
                    </button>
                </div>
            </form>
        </div>
    );
}
