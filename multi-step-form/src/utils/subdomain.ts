/**
 * Utility for parsing wildcard subdomains (e.g. budi.jakpatforuniv.com or budi.localhost:5173)
 */

const RESERVED_SUBDOMAINS = new Set([
  'www',
  'submit',
  'app',
  'api',
  'admin',
  'dashboard',
  'internal',
  'staging',
  'dev',
  'localhost'
]);

/**
 * Extracts username from the current hostname or query parameter
 * E.g. budi.jakpatforuniv.com -> 'budi'
 * E.g. budi.localhost:5173 -> 'budi'
 * E.g. submit.jakpatforuniv.com?user=budi -> 'budi'
 */
export function getSubdomainUsername(hostname: string = window.location.hostname): string | null {
  // Check URL query param override (useful for dev/testing)
  const urlParams = new URLSearchParams(window.location.search);
  const paramUser = urlParams.get('user') || urlParams.get('username');
  if (paramUser) {
    return paramUser.toLowerCase();
  }

  // Handle localhost vs production domain
  const parts = hostname.toLowerCase().split('.');

  // If localhost with subdomain (e.g. budi.localhost)
  if (hostname.includes('localhost')) {
    if (parts.length >= 2 && parts[0] !== 'localhost' && !RESERVED_SUBDOMAINS.has(parts[0])) {
      return parts[0];
    }
    return null;
  }

  // Production domain (e.g. budi.jakpatforuniv.com -> 3 parts)
  if (parts.length >= 3) {
    const subdomain = parts[0];
    if (!RESERVED_SUBDOMAINS.has(subdomain)) {
      return subdomain;
    }
  }

  return null;
}
