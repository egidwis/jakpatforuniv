import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Loader2, Users, School, BookOpen, Share2 } from 'lucide-react';

interface DemographyStats {
    universities: Record<string, number>;
    departments: Record<string, number>;
    statuses: Record<string, number>;
    referrals: Record<string, number>;
    total: number;
}

export function DemographyPage() {
    const [stats, setStats] = useState<DemographyStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDemography();
    }, []);

    const fetchDemography = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('form_submissions')
                .select('university, department, status, referral_source');

            if (error) throw error;

            const newStats: DemographyStats = {
                universities: {},
                departments: {},
                statuses: {},
                referrals: {},
                total: data?.length || 0
            };

            data?.forEach(row => {
                // Normalize strings (trim, lowercase if needed, but display nicely)
                // Helper to count
                const count = (obj: Record<string, number>, key: string | null) => {
                    const k = key ? key.trim() : 'Tidak Diketahui';
                    obj[k] = (obj[k] || 0) + 1;
                };

                count(newStats.universities, row.university);
                count(newStats.departments, row.department);
                count(newStats.statuses, row.status);
                count(newStats.referrals, row.referral_source);
            });

            setStats(newStats);
        } catch (error) {
            console.error('Error fetching demography:', error);
        } finally {
            setLoading(false);
        }
    };

    const sortAndSlice = (obj: Record<string, number>, limit = 5) => {
        return Object.entries(obj)
            .sort(([, a], [, b]) => b - a)
            .slice(0, limit);
    };

    const StatList = ({
        data,
        total,
        icon: Icon,
        colorClass = "bg-blue-500",
        bgClass = "bg-blue-50"
    }: {
        data: Record<string, number>,
        total: number,
        icon: any,
        colorClass?: string,
        bgClass?: string
    }) => {
        const sorted = sortAndSlice(data, 8); // Show top 8

        return (
            <div className="space-y-4">
                {sorted.map(([label, count], idx) => {
                    const percentage = Math.round((count / total) * 100);
                    return (
                        <div key={idx} className="group">
                            <div className="flex justify-between text-sm mb-1.5">
                                <span className="font-medium text-gray-700 truncate pr-2" title={label}>
                                    {label}
                                </span>
                                <span className="text-gray-500 text-xs tabular-nums">
                                    {count} ({percentage}%)
                                </span>
                            </div>
                            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full ${colorClass} transition-all duration-500 ease-out`}
                                    style={{ width: `${percentage}%` }}
                                />
                            </div>
                        </div>
                    );
                })}
                {Object.keys(data).length === 0 && (
                    <p className="text-sm text-gray-400 italic">Belum ada data.</p>
                )}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <Loader2 className="h-8 w-8 animate-spin mb-2 text-primary" />
                <p>Mengolah data demografi...</p>
            </div>
        );
    }

    if (!stats) return null;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col gap-1">
                <h1 className="text-3xl font-bold tracking-tight text-gray-900">Demografi User</h1>
                <p className="text-muted-foreground">
                    Insight data responden berdasarkan {stats.total} total submisi.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                {/* Universitas */}
                <Card className="shadow-sm border-gray-200">
                    <CardHeader className="bg-blue-50/30 border-b border-gray-100 pb-4">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                                <School className="w-5 h-5" />
                            </div>
                            <div>
                                <CardTitle className="text-lg">Top Universitas</CardTitle>
                                <CardDescription>Asal kampus responden terbanyak</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <StatList
                            data={stats.universities}
                            total={stats.total}
                            icon={School}
                            colorClass="bg-blue-500"
                        />
                    </CardContent>
                </Card>

                {/* Status Mahasiswa */}
                <Card className="shadow-sm border-gray-200">
                    <CardHeader className="bg-emerald-50/30 border-b border-gray-100 pb-4">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                                <Users className="w-5 h-5" />
                            </div>
                            <div>
                                <CardTitle className="text-lg">Status Mahasiswa</CardTitle>
                                <CardDescription>Distribusi tingkat semester/status</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-6">
                        {/* Use a different layout for status? maybe Pie-like or just list is fine */}
                        <StatList
                            data={stats.statuses}
                            total={stats.total}
                            icon={Users}
                            colorClass="bg-emerald-500"
                        />
                    </CardContent>
                </Card>

                {/* Jurusan */}
                <Card className="shadow-sm border-gray-200">
                    <CardHeader className="bg-purple-50/30 border-b border-gray-100 pb-4">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                                <BookOpen className="w-5 h-5" />
                            </div>
                            <div>
                                <CardTitle className="text-lg">Jurusan / Departemen</CardTitle>
                                <CardDescription>Bidang studi mayoritas user</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <StatList
                            data={stats.departments}
                            total={stats.total}
                            icon={BookOpen}
                            colorClass="bg-purple-500"
                        />
                    </CardContent>
                </Card>

                {/* Referral Source */}
                <Card className="shadow-sm border-gray-200">
                    <CardHeader className="bg-orange-50/30 border-b border-gray-100 pb-4">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-orange-100 text-orange-600 rounded-lg">
                                <Share2 className="w-5 h-5" />
                            </div>
                            <div>
                                <CardTitle className="text-lg">Sumber Referensi</CardTitle>
                                <CardDescription>Dari mana mereka tahu Jakpat?</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <StatList
                            data={stats.referrals}
                            total={stats.total}
                            icon={Share2}
                            colorClass="bg-orange-500"
                        />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
