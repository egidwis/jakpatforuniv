import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * "Sudah hampir terlihat?" — untuk memuat banner /pages HANYA saat kartunya
 * mendekati layar. loading="lazy" bawaan terlalu rakus (Chrome memuat sampai
 * ±1.250–2.500 px di bawah layar): 5 banner berebut bandwidth dengan banner
 * pertama. ±300 px cukup untuk scroll biasa tanpa kosong lama.
 */
export const NEAR_VIEWPORT_MARGIN = '300px 0px';

export function observeNear(
    el: Element,
    onNear: () => void,
    IO: typeof IntersectionObserver | undefined = typeof IntersectionObserver === 'undefined' ? undefined : IntersectionObserver,
): () => void {
    if (!IO) {
        onNear();
        return () => {};
    }
    let fired = false;
    const io = new IO(
        (entries) => {
            if (fired || !entries.some((e) => e.isIntersecting)) return;
            fired = true;
            io.disconnect();
            onNear();
        },
        { rootMargin: NEAR_VIEWPORT_MARGIN },
    );
    io.observe(el);
    return () => io.disconnect();
}

const hasIO = () => typeof IntersectionObserver !== 'undefined';

/** `[ref, near]`. `eager` (atau browser tanpa IO) = langsung `near`. */
export function useNearViewport<T extends Element>(eager: boolean): [(el: T | null) => void, boolean] {
    const [near, setNear] = useState(() => eager || !hasIO());
    const [el, setEl] = useState<T | null>(null);
    const nearRef = useRef(near);
    nearRef.current = near;

    useEffect(() => {
        if (nearRef.current || !el) return;
        return observeNear(el, () => setNear(true));
    }, [el]);

    const ref = useCallback((node: T | null) => setEl(node), []);
    return [ref, near];
}
