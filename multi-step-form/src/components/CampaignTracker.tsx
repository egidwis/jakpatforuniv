import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../utils/supabase';

export function CampaignTracker() {
    const { source } = useParams<{ source: string }>();

    useEffect(() => {
        const trackAndRedirect = async () => {
            try {
                if (source) {
                    // Coba catat data klik ke Supabase
                    await supabase.from('campaign_clicks').insert({
                        source: source,
                        campaign_name: 'jakpatforuniv_landing'
                    });
                }
            } catch (err) {
                console.error('Failed to log campaign click:', err);
            } finally {
                // Selalu redirect ke landing page terlepas dari hasil tracking
                window.location.replace('https://jakpatforuniv.com/');
            }
        };

        trackAndRedirect();
    }, [source]);

    // Mengembalikan blank screen karena ini akan sangat cepat memotong routing sebelum di redirect
    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
            <div className="flex flex-col items-center">
                <div className="w-8 h-8 border-4 border-blue-500 rounded-full animate-spin border-t-transparent mb-4"></div>
                <p className="text-gray-500 text-sm">Mengarahkan...</p>
            </div>
        </div>
    );
}
