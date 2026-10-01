/**
 * Satu pintu untuk klik tautan dari chat Mimin (CTA dan Generative UI).
 * Tanpa ini `mailto:` jatuh ke React Router (`navigate('mailto:...')`)
 * atau ke `window.open` yang di banyak browser tidak membuka klien email.
 */

export function looksLikeEmailAddress(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('http') || trimmed.startsWith('/') || trimmed.startsWith('mailto:') || trimmed.startsWith('tel:')) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+(?:[?#].*)?$/.test(trimmed.split('?')[0]);
}

export function toMailtoHref(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.toLowerCase().startsWith('mailto:')) return trimmed;
  if (looksLikeEmailAddress(trimmed)) return `mailto:${trimmed}`;
  return trimmed;
}

export function openChatHref(raw: string, navigate: (to: string) => void): void {
  let target = (raw || '').trim();
  if (!target) return;

  if (target.startsWith('http://') || target.startsWith('https://')) {
    try {
      const parsed = new URL(target);
      if (
        parsed.hostname.includes('jakpatforuniv.com') ||
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1'
      ) {
        target = parsed.pathname + parsed.search + parsed.hash;
      }
    } catch {
      // URL rusak: biarkan apa adanya, cabang di bawah yang menangani.
    }
  }

  const mailto = toMailtoHref(target);
  if (mailto.toLowerCase().startsWith('mailto:') || target.toLowerCase().startsWith('tel:')) {
    window.location.href = mailto.toLowerCase().startsWith('mailto:') ? mailto : target;
    return;
  }

  if (target.startsWith('/')) {
    navigate(target);
    return;
  }

  if (target.startsWith('http://') || target.startsWith('https://')) {
    window.open(target, '_blank', 'noopener,noreferrer');
    return;
  }

  navigate(target);
}
