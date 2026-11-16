// JSON Tiptap → HTML dengan daftar izin. Node atau mark di luar daftar tetap
// menampilkan teksnya, supaya isi tidak hilang, tetapi tidak pernah menjadi tag.

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const safeHref = (href) => (/^(https?:|mailto:)/i.test(String(href ?? '').trim()) ? String(href).trim() : null);
const safeSrc = (src) => (/^https:\/\//i.test(String(src ?? '').trim()) ? String(src).trim() : null);

function renderText(node) {
  let html = escapeHtml(node.text);
  for (const mark of Array.isArray(node.marks) ? node.marks : []) {
    if (mark.type === 'bold') html = `<strong>${html}</strong>`;
    else if (mark.type === 'italic') html = `<em>${html}</em>`;
    else if (mark.type === 'strike') html = `<s>${html}</s>`;
    else if (mark.type === 'underline') html = `<u>${html}</u>`;
    else if (mark.type === 'link') {
      const href = safeHref(mark.attrs?.href);
      if (href) html = `<a href="${escapeHtml(href)}" rel="noopener noreferrer nofollow" target="_blank">${html}</a>`;
    }
  }
  return html;
}

const children = (node) => (Array.isArray(node.content) ? node.content.map(renderNode).join('') : '');

function renderNode(node) {
  if (!node || typeof node !== 'object') return '';
  switch (node.type) {
    case 'doc':
      return children(node);
    case 'text':
      return renderText(node);
    case 'paragraph':
      return `<p>${children(node)}</p>`;
    case 'heading': {
      // Judul acara sudah h1, jadi isi dimulai dari h2.
      const level = Math.min(Math.max(Number(node.attrs?.level) || 2, 2), 4);
      return `<h${level}>${children(node)}</h${level}>`;
    }
    case 'bulletList':
      return `<ul>${children(node)}</ul>`;
    case 'orderedList':
      return `<ol>${children(node)}</ol>`;
    case 'listItem':
      return `<li>${children(node)}</li>`;
    case 'blockquote':
      return `<blockquote>${children(node)}</blockquote>`;
    case 'horizontalRule':
      return '<hr>';
    case 'hardBreak':
      return '<br>';
    case 'image': {
      const src = safeSrc(node.attrs?.src);
      return src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(node.attrs?.alt)}" loading="lazy">` : '';
    }
    case 'codeBlock':
      return `<p>${children(node)}</p>`;
    default:
      return children(node);
  }
}

export function renderBlocks(doc) {
  return doc && typeof doc === 'object' ? renderNode(doc) : '';
}
