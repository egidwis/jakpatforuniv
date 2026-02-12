import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase';
import { Card, CardContent, CardFooter, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Users, Trophy, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

export function SurveyListingPage() {
    const [pages, setPages] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadPages();
    }, []);

    const loadPages = async () => {
        try {
            const { data, error } = await supabase
                .from('survey_pages')
                .select('*')
                .eq('is_published', true)
                .order('created_at', { ascending: false });

            if (error) throw error;


            // Client-side filtering for schedule
            const now = new Date();
            const activePages = (data || []).filter(page => {
                const startDate = page.publish_start_date ? new Date(page.publish_start_date) : null;
                const endDate = page.publish_end_date ? new Date(page.publish_end_date) : null;

                // If scheduled in future, hide
                if (startDate && startDate > now) return false;
                // If ended, hide
                if (endDate && endDate < now) return false;

                return true;
            });

            setPages(activePages);
        } catch (error) {
            console.error('Error loading pages:', error);
        } finally {
            setLoading(false);
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
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 py-16 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
                <div className="text-center mb-16 space-y-4">
                    <div className="inline-block p-2 px-4 rounded-full bg-blue-100 text-blue-700 text-sm font-semibold mb-2">
                        🌟 Jakpat for University
                    </div>
                    <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                        Daftar Survei Terbaru
                    </h1>
                    <p className="max-w-2xl mx-auto text-lg md:text-xl text-gray-600 dark:text-gray-300 leading-relaxed">
                        Ikuti survei seru, bantu riset mahasiswa, dan
                        <span className="text-blue-600 font-bold"> menangkan hadiah menarik!</span> 🎁
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {pages.map((page) => (
                        <Card key={page.id} className="group flex flex-col overflow-hidden border-0 shadow-sm ring-1 ring-gray-200 hover:shadow-2xl hover:ring-2 hover:ring-blue-500/20 transition-all duration-300 transform hover:-translate-y-1 bg-white dark:bg-gray-800 rounded-2xl">
                            {/* Image Section */}
                            <div className="relative h-52 overflow-hidden bg-gray-100">
                                {page.banner_url ? (
                                    <img
                                        src={page.banner_url}
                                        alt={page.title}
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                    />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 text-gray-300">
                                        <Trophy className="w-12 h-12 mb-2 opacity-50" />
                                        <span className="text-sm font-medium">Jakpat Survei</span>
                                    </div>
                                )}

                                {/* Overlay Gradient */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-60" />

                                {/* Floating Badge - Reward */}
                                {page.rewards_amount && (
                                    <div className="absolute top-4 right-4 bg-yellow-400/90 backdrop-blur-sm text-yellow-950 font-bold px-3 py-1.5 rounded-full text-xs shadow-lg flex items-center gap-1 border border-yellow-200 animate-pulse">
                                        <span className="text-xs">💰</span>
                                        Rp {parseInt(page.rewards_amount).toLocaleString('id-ID')}
                                    </div>
                                )}
                            </div>

                            <CardContent className="flex-1 p-6 space-y-4">
                                <div className="space-y-2">
                                    <CardTitle className="text-xl font-bold line-clamp-2 text-gray-900 dark:text-white leading-tight min-h-[3.5rem] group-hover:text-blue-600 transition-colors">
                                        {page.title}
                                    </CardTitle>

                                    {/* Usage Stats or Meta */}
                                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 font-medium pt-2">
                                        <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md">
                                            <Trophy className="w-4 h-4" />
                                            <span>{page.rewards_count} Pemenang</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 bg-gray-100 text-gray-600 px-2.5 py-1 rounded-md">
                                            <Users className="w-4 h-4" />
                                            <span>{page.views_count || 0} views</span>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>

                            <CardFooter className="p-6 pt-0 mt-auto">
                                <Button asChild className="w-full h-11 text-base font-semibold shadow-lg shadow-blue-500/30 hover:shadow-blue-600/40 transition-all rounded-xl bg-blue-600 hover:bg-blue-700">
                                    <Link to={`/pages/${page.slug}`}>
                                        Ikuti Survei Sekarang
                                        <ExternalLink className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                                    </Link>
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}

                    {pages.length === 0 && (
                        <div className="col-span-full py-20 text-center">
                            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-50 text-blue-500 mb-6">
                                <Trophy className="w-10 h-10" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Belum Ada Survei Aktif</h3>
                            <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                                Coba cek lagi nanti ya! Kami sedang menyiapkan survei-survei seru lainnya untukmu.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
