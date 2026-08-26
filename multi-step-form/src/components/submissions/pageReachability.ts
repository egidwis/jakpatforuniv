import { airingWindowState } from '@/utils/airing-window';
import type { ExistingPage } from './types';

// ─────────────────────────────────────────────────────────────
// Bisakah responden membuka halaman ini SEKARANG?
//
// Pertanyaan itu yang sebenarnya dijawab kolom `is_published` + `publish_*`,
// dan bukan pertanyaan yang dijawab sumbu penayangan jadwal. Tab Page dulu
// mencampur keduanya: ia mencetak chip `Draft / Scheduled / Live / Completed`
// dari jendela halaman, lalu memajangnya seolah itu status iklannya.
//
// Sumber kebenarannya gerbang di `pages/public/SurveyPage.tsx`:
//
//   .eq('is_published', true)                     → 'draft' kalau false
//   publish_start_date > now  → "belum dimulai"   → 'scheduled'
//   publish_end_date   < now  → "sudah berakhir"  → 'ended'
//   redirect_url terisi       → window.location   → 'redirect'
//
// Kalau gerbang itu berubah, IA BERUBAH DI SINI JUGA — `pageReachability.spec.ts`
// mengadu keduanya baris per baris.
// ─────────────────────────────────────────────────────────────

export type PageReachability =
    /** Belum ada baris halaman sama sekali. */
    | { state: 'none' }
    /** Ada, tapi `is_published = false`. `overdueSince` terisi kalau jendelanya
     *  sudah dibuka — inilah pekerjaan yang benar-benar terlambat. */
    | { state: 'draft'; overdueSince: Date | null }
    /** `redirect_url` terisi: isi halaman tidak pernah dilihat siapa pun. */
    | { state: 'redirect'; target: string }
    | { state: 'scheduled'; opensAt: Date }
    | { state: 'live' }
    | { state: 'ended'; closedAt: Date };

const dateOf = (v: string | null | undefined): Date | null => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
};

export function pageReachability(
    page: ExistingPage | undefined,
    now: Date = new Date(),
): PageReachability {
    if (!page) return { state: 'none' };

    const start = dateOf(page.publish_start_date);
    const end = dateOf(page.publish_end_date);

    // Draft menang atas segalanya: gerbangnya `.eq('is_published', true)`, jadi
    // jendela seindah apa pun tidak membuat halaman draft bisa dibuka.
    if (!page.is_published) {
        return { state: 'draft', overdueSince: start && start <= now ? start : null };
    }

    // Sesudah gerbang terbit, SEBELUM jendela: halaman yang mengalihkan memang
    // terjangkau, tapi yang dilihat responden bukan halaman ini.
    const redirect = (page.redirect_url || '').trim();
    if (redirect) return { state: 'redirect', target: redirect };

    switch (airingWindowState(start, end, now)) {
        case 'scheduled':
            // `airingWindowState` hanya mengembalikan 'scheduled' saat start ada.
            return { state: 'scheduled', opensAt: start! };
        case 'completed':
            return { state: 'ended', closedAt: end! };
        default:
            return { state: 'live' };
    }
}
