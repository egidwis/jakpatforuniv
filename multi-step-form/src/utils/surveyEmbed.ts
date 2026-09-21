export interface SurveyEmbedInfo {
  isEmbeddable: boolean;
  embedUrl: string;
  originalUrl: string;
  reason?: string;
  isEditorUrl?: boolean;
}

// Known domains that strictly reject iframe embedding (X-Frame-Options: DENY / SAMEORIGIN)
const KNOWN_BLOCKED_DOMAINS = [
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'tiktok.com',
];

/**
 * Normalizes a survey URL and determines if it can be embedded in an iframe.
 * Used identically across respondent public pages and admin review dashboard.
 */
export function getSurveyEmbedInfo(rawUrl: string | null | undefined): SurveyEmbedInfo {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return {
      isEmbeddable: false,
      embedUrl: '',
      originalUrl: '',
      reason: 'Tautan kuesioner tidak tersedia atau kosong.',
    };
  }

  let normalizedUrl = rawUrl.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalizedUrl);
  } catch {
    return {
      isEmbeddable: false,
      embedUrl: normalizedUrl,
      originalUrl: rawUrl,
      reason: 'Format tautan kuesioner tidak valid.',
    };
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const pathname = parsedUrl.pathname.toLowerCase();

  // 1. Google Drive / Docs / Sheets (non-Forms)
  if (
    hostname === 'drive.google.com' ||
    (hostname.includes('docs.google.com') && !pathname.includes('/forms'))
  ) {
    return {
      isEmbeddable: false,
      embedUrl: normalizedUrl,
      originalUrl: rawUrl,
      reason: 'Tautan ini mengarah ke dokumen Google Drive/Docs, bukan halaman kuesioner publik.',
    };
  }

  // 2. Known blocked platforms (Social Media, etc.)
  if (KNOWN_BLOCKED_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
    return {
      isEmbeddable: false,
      embedUrl: normalizedUrl,
      originalUrl: rawUrl,
      reason: 'Platform penyedia tautan ini membatasi penyematan (embed) di dalam situs lain.',
    };
  }

  // 3. Google Forms: forms.gle shortlinks
  if (hostname === 'forms.gle' || hostname.endsWith('.forms.gle')) {
    // forms.gle redirects via 302 to docs.google.com/forms/d/e/.../viewform.
    // Modern browsers follow redirects seamlessly inside iframes.
    return {
      isEmbeddable: true,
      embedUrl: normalizedUrl,
      originalUrl: rawUrl,
    };
  }

  // 4. Google Forms: docs.google.com/forms
  if (hostname.includes('docs.google.com') && pathname.includes('/forms')) {
    // Check if it's an editor URL (/edit)
    const isEditor =
      pathname.includes('/edit') ||
      parsedUrl.searchParams.get('edit_requested') === 'true';

    if (isEditor) {
      return {
        isEmbeddable: false,
        isEditorUrl: true,
        embedUrl: normalizedUrl,
        originalUrl: rawUrl,
        reason:
          'Sistem keamanan Google membatasi preview untuk tautan editor (/edit). Buka form di tab baru atau gunakan tautan publik (/viewform).',
      };
    }

    // It's a viewform or published URL (/d/.../viewform or /d/e/.../viewform)
    // Append embedded=true to remove Google Forms header and make it clean inside iframe
    const embedUrlObj = new URL(normalizedUrl);
    embedUrlObj.searchParams.set('embedded', 'true');

    return {
      isEmbeddable: true,
      embedUrl: embedUrlObj.toString(),
      originalUrl: rawUrl,
    };
  }

  // 5. Default blocklist approach:
  // All other survey platforms (Microsoft Forms, Typeform, SurveyMonkey, Qualtrics, Tally, Fillout,
  // Jotform, SurveySparrow, campus domains like *.ac.id/*.edu, etc.) are treated as embeddable.
  return {
    isEmbeddable: true,
    embedUrl: normalizedUrl,
    originalUrl: rawUrl,
  };
}
