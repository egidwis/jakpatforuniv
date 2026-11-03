import { useState } from 'react';
import { isInAppBrowser } from '@/utils/inAppBrowser';

/** Hanya muncul di browser bawaan Instagram, TikTok, Facebook, atau LINE. */
export function InAppBrowserNotice() {
    const [copied, setCopied] = useState(false);
    if (typeof navigator === 'undefined' || !isInAppBrowser(navigator.userAgent)) return null;

    const copy = async () => {
        await navigator.clipboard?.writeText(window.location.href).catch(() => undefined);
        setCopied(true);
    };

    return (
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-3.5 py-2.5 text-sm text-orange-900">
            Google tidak bisa dipakai di browser aplikasi ini. Buka di Chrome/Safari{' '}
            <button type="button" onClick={copy} className="font-semibold text-jfu-primary underline">
                {copied ? 'Link tersalin' : 'Salin link'}
            </button>
            , atau masuk dengan email &amp; password.
        </div>
    );
}
