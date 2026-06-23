/**
 * Shared ordering / "is live" helpers for the survey-ad listing.
 *
 * Single source of truth used by the public web listing (SurveyListingPage) and
 * the admin "Live" tab (PublishPageManagement). The mobile API
 * (functions/api/surveys.js) lives in a separate build root, so it keeps an
 * in-sync COPY of adTypePriority/orderBand/compareDisplayOrder — parity by
 * construction.
 *
 * Ordering is a 3-band sort (see compareDisplayOrder):
 *   TOP    — new, not-yet-placed regular & announcement pages (display_order NULL)
 *   MIDDLE — pages an admin has placed via the Live tab (display_order 0..N-1)
 *   BOTTOM — new, not-yet-placed extra ads (display_order NULL)
 * So a freshly created regular/announcement surfaces at the top (admin won't miss
 * it), a new extra ad defaults to the bottom, and anything an admin drags + saves
 * wins absolutely — it moves into the MIDDLE band in the exact saved order,
 * including dragging a regular/announcement all the way below the extras (e.g. to
 * pilot/test a survey).
 */

export interface OrderablePage {
    created_at: string;
    display_order?: number | null;
    is_extra_ad?: boolean;
    submission_id?: string | null;
    is_published?: boolean;
    publish_start_date?: string | null;
    publish_end_date?: string | null;
}

/**
 * Type priority (lower = higher in the list):
 *   0 = regular ad (has submission_id, not extra)
 *   1 = extra ad   (has submission_id, extra)
 *   2 = announcement (no submission_id)
 * Used by compareDisplayOrder both to BAND unplaced pages (extra → bottom, regular
 * & announcement → top) and as the in-band tiebreak. Admins override any of this by
 * dragging — a saved display_order always wins.
 */
export function adTypePriority(p: OrderablePage): number {
    if (p.submission_id && !p.is_extra_ad) return 0;
    if (p.submission_id && p.is_extra_ad) return 1;
    return 2;
}

/**
 * Normalize a schedule date string for accurate time comparison.
 *
 * A date-only string (e.g. "2026-04-13") is parsed by JS as midnight UTC, which
 * equals 07:00 WIB — before the intended 15:00 WIB go-live time. Detect date-only
 * values and force 08:00 UTC (= 15:00 WIB), matching the go-live convention used
 * across surveys.js, SurveyListingPage and PageBuilderModal.
 */
export function normalizeScheduleDate(dateStr: string): Date {
    const d = new Date(dateStr);
    if (!dateStr.includes('T')) {
        d.setUTCHours(8, 0, 0, 0);
    }
    return d;
}

/**
 * Whether a page is currently live: published AND within its (optional) date window.
 * This is the exact set the mobile app displays.
 */
export function isLive(page: OrderablePage, nowMs: number = Date.now()): boolean {
    if (!page.is_published) return false;
    const now = new Date(nowMs);
    const start = page.publish_start_date ? normalizeScheduleDate(page.publish_start_date) : null;
    const end = page.publish_end_date ? normalizeScheduleDate(page.publish_end_date) : null;
    if (start && now < start) return false;
    if (end && now > end) return false;
    return true;
}

/**
 * Band of a page in the 3-band listing sort:
 *   0 = TOP    — unplaced (display_order NULL) regular or announcement
 *   1 = MIDDLE — placed (display_order set)
 *   2 = BOTTOM — unplaced (display_order NULL) extra ad
 */
function orderBand(p: OrderablePage): number {
    const placed = p.display_order !== null && p.display_order !== undefined;
    if (placed) return 1;
    return adTypePriority(p) === 1 ? 2 : 0; // unplaced extra → bottom, else top
}

/**
 * 3-band sort comparator (TOP → MIDDLE → BOTTOM; see orderBand). Within a band:
 *   - MIDDLE (placed): by display_order ascending — manual order wins.
 *   - any band tiebreak: default type priority (regular → extra → announcement),
 *     then created_at descending (newest first).
 *
 * Net effect: new regular/announcement pages surface at the top so an admin never
 * misses them; new extra ads default to the bottom; and once an admin drags + saves,
 * the item gets a display_order and lands in the MIDDLE band in exact saved order —
 * manual placement always wins, including dragging a regular/announcement below the
 * extras. (Caveat: a brand-new unplaced extra still renders below a placed-at-bottom
 * regular until the admin re-saves; self-healing.)
 */
export function compareDisplayOrder(a: OrderablePage, b: OrderablePage): number {
    const ba = orderBand(a);
    const bb = orderBand(b);
    if (ba !== bb) return ba - bb;

    // Same band. Placed items (MIDDLE) obey their manual display_order.
    const ao = a.display_order;
    const bo = b.display_order;
    if (ao !== null && ao !== undefined && bo !== null && bo !== undefined && ao !== bo) {
        return (ao as number) - (bo as number);
    }

    // Tiebreak: default type priority (regular → extra → announcement)...
    const ap = adTypePriority(a);
    const bp = adTypePriority(b);
    if (ap !== bp) return ap - bp;

    // ...then newest first.
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}
