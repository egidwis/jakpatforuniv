export interface ShortlinkResult {
  isShortlink: boolean;
  originalUrl: string;
  expandedUrl?: string;
  platform?: string;
  wasExpanded?: boolean;
}

// Known Google shortlink domains
const GOOGLE_SHORTLINK_DOMAINS = [
  'forms.gle',
  'goo.gl',
  'g.co'
];

// Check if URL is a known shortlink
export function isShortlink(url: string): boolean {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    return GOOGLE_SHORTLINK_DOMAINS.includes(urlObj.hostname);
  } catch {
    // If URL parsing fails, check string patterns
    return GOOGLE_SHORTLINK_DOMAINS.some(domain => url.includes(domain));
  }
}

// Expand shortlink to get the full URL using server-side proxy
export async function expandShortlink(url: string): Promise<ShortlinkResult> {
  const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
  
  const result: ShortlinkResult = {
    isShortlink: isShortlink(url),
    originalUrl: normalizedUrl
  };

  if (!result.isShortlink) {
    return result;
  }

  try {
    console.log('[Frontend] Sending request to server-side proxy for:', normalizedUrl);
    
    // Use server-side proxy to expand shortlink - no CORS issues!
    const response = await fetch('/expand-shortlink', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url: normalizedUrl })
    });

    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    const data = await response.json();
    console.log('[Frontend] Server response:', data);

    if (data.success) {
      result.expandedUrl = data.expandedUrl;
      result.platform = data.platform;
      result.wasExpanded = data.wasExpanded;
      return result;
    } else {
      throw new Error(data.error || 'Server-side expansion failed');
    }

  } catch (error) {
    console.warn('[Frontend] Failed to expand shortlink via server:', error);
    
    // Fallback: For known shortlinks, still provide the shortlink for extraction
    if (normalizedUrl.includes('forms.gle')) {
      result.expandedUrl = normalizedUrl;
      result.platform = 'Google Forms';
      result.wasExpanded = false;
      return result;
    }
  }

  return result;
}

// Validate if expanded URL is a valid Google Form
export function isValidGoogleForm(url: string): boolean {
  return url.includes('docs.google.com/forms') || 
         url.includes('forms.google.com') ||
         url.includes('forms.gle');
}

// Extract form ID from Google Form URL
export function extractFormId(url: string): string | null {
  const patterns = [
    /\/forms\/d\/([a-zA-Z0-9-_]+)/,
    /\/forms\/d\/e\/([a-zA-Z0-9-_]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}