/**
 * Tab awal /pages. Bawaan "Survei Aktif" (keputusan 19 Nov 2026) — responden
 * datang untuk survei; 13+ pengumuman tetap satu ketukan. `?tab=` untuk tautan
 * langsung (pengumuman/announcement, semua/all, survei/survey).
 * Dihitung SEKALI setelah data pertama tiba (SurveyListingPage), supaya muat
 * ulang data tidak menimpa pilihan responden.
 */
export type CategoryFilter = 'all' | 'survey' | 'announcement';

const TAB_ALIASES: Record<string, CategoryFilter> = {
    pengumuman: 'announcement',
    announcement: 'announcement',
    semua: 'all',
    all: 'all',
    survei: 'survey',
    survey: 'survey',
};

export function initialListingFilter(
    counts: { all: number; survey: number; announcement: number },
    search: string,
): { filter: CategoryFilter; noSurveyNotice: boolean } {
    let requested: CategoryFilter | undefined;
    try {
        const tab = new URLSearchParams(search).get('tab');
        requested = tab ? TAB_ALIASES[tab.trim().toLowerCase()] : undefined;
    } catch {
        requested = undefined;
    }
    if (counts.all === 0) return { filter: 'all', noSurveyNotice: false };
    if (requested === 'all' || requested === 'announcement') return { filter: requested, noSurveyNotice: false };
    if (counts.survey === 0) return { filter: 'announcement', noSurveyNotice: true };
    return { filter: 'survey', noSurveyNotice: false };
}
