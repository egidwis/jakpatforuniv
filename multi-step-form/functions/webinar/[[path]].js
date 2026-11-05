/**
 * Halaman publik webinar, dirender server supaya preview link WA/IG terisi.
 *
 *   /webinar                     daftar: satu hero + bagian yang punya isi
 *   /webinar/<slug>              detail, juga ?pratinjau=<token> untuk draft
 *   /webinar/gabung/<join_token> link pribadi di e-tiket: ke Zoom saat ruang dibuka,
 *                                selain itu ke halaman tiket di dashboard
 *
 * Isi dan kalimat datang dari _view.js, sama dengan yang diterima dashboard.
 * meeting_url hanya dibaca di cabang gabung dan hanya keluar sebagai 302.
 * Teks di sini dilihat pembeli: jangan menyebut refund.
 */
import { resolveService, rest, JOIN_TOKEN_RE, SLUG_RE } from '../api/webinar/_server.js';
import { webinarPreviewOnly } from '../api/webinar/_access.js';
import {
  ADMIN_CONTACT, EMPTY_LISTING_TEXT, PUBLIC_EVENT_COLUMNS, SITE_URL,
  buildEventView, buildListing, joinWindow,
} from '../api/webinar/_view.js';
import { escapeHtml, renderBlocks } from './_render-blocks.js';

const CANONICAL_ORIGIN = 'https://jakpatforuniv.com';
const LOGO_URL = `${SITE_URL}/favicon.webp`;

const e = escapeHtml;

const STYLE = `
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1a1a1a;line-height:1.55;
background:linear-gradient(160deg,#eaf3ff 0%,#f8fafc 45%,#eef4ff 100%);min-height:100vh}
a{color:#1976d2}img{max-width:100%;height:auto;display:block}
.nav{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.78);backdrop-filter:blur(18px);border-bottom:1px solid rgba(15,23,42,.08)}
.nav-in{max-width:1120px;margin:0 auto;padding:10px 16px;display:flex;align-items:center;gap:16px}
.brand{display:flex;align-items:center;gap:8px;font-weight:700;color:#1976d2;text-decoration:none;margin-right:auto;font-size:15px}
.brand img{width:26px;height:26px}.nav a.link{color:#475569;text-decoration:none;font-weight:600;font-size:14px}
.nav a.cta{background:#1976d2;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:7px 14px;border-radius:10px}
.hide-sm{display:none}main{max-width:1120px;margin:0 auto;padding:20px 16px 120px}
.card{background:rgba(255,255,255,.78);backdrop-filter:blur(14px);border:1px solid rgba(15,23,42,.08);border-radius:20px;box-shadow:0 8px 30px rgba(15,23,42,.05)}
.poster{width:100%;aspect-ratio:16/9;object-fit:cover;background:#dbeafe;border-radius:16px}
.poster-empty{display:flex;align-items:center;justify-content:center;color:#1976d2;font-weight:700;font-size:15px;text-align:center;padding:16px}
h1{font-size:26px;line-height:1.25;margin:10px 0 8px;letter-spacing:-.01em}h2{font-size:19px;margin:0 0 10px}
.badge{display:inline-block;font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px}
.t-on_sale{background:#dcfce7;color:#166534}.t-soon{background:#dbeafe;color:#1e40af}.t-held{background:#fef3c7;color:#92400e}.t-ended{background:#f1f5f9;color:#475569}
.muted{color:#64748b}.meta{list-style:none;padding:0;margin:12px 0;display:grid;gap:4px;font-size:15px}
.price{font-size:22px;font-weight:800}.price small{display:block;font-size:12px;font-weight:500;color:#64748b}
.btn{display:block;text-align:center;background:#1976d2;color:#fff;text-decoration:none;font-weight:700;padding:13px 18px;border-radius:12px;border:0;font-size:16px;cursor:pointer;width:100%}
.btn-soft{background:#eff6ff;color:#1976d2}.note{font-size:14px;color:#475569;margin:0}
.hero{padding:14px}.hero-body{padding:8px 4px 4px}.hero h2{font-size:24px;line-height:1.25;margin:10px 0 6px}
section{margin-top:28px}.grid{display:grid;gap:14px}.tile{display:block;color:inherit;text-decoration:none;padding:12px}
.tile strong{display:block;margin-top:8px}.title-page{margin:4px 0 18px}.title-page p{margin:0}
.layout{display:grid;gap:16px}.content{padding:16px}.prose p{margin:0 0 12px}.prose img{border-radius:12px;margin:12px 0}
.prose h2{font-size:20px;margin:18px 0 8px}.prose h3,.prose h4{font-size:17px;margin:14px 0 6px}
.speaker{display:flex;gap:10px;align-items:center;margin-top:10px}.speaker img,.speaker .ph{width:44px;height:44px;border-radius:50%;object-fit:cover;background:#dbeafe}
.benefits{list-style:none;padding:0;margin:0;display:grid;gap:4px}.benefits li::before{content:"✓ ";color:#16a34a;font-weight:800}
.buy{padding:16px}.buybar{position:fixed;left:0;right:0;bottom:0;z-index:15;border-radius:18px 18px 0 0;padding:12px 16px calc(12px + env(safe-area-inset-bottom))}
.stack>.badge{justify-self:start}.layout>*,.stack>*{min-width:0}.buy-row{display:flex;align-items:center;gap:12px;justify-content:space-between}.buy-row .btn{width:auto;flex:1}.stack{display:grid;gap:10px}
.inapp{display:none;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:10px 12px;font-size:14px;margin-bottom:12px}
.inapp button{background:none;border:0;color:#1976d2;font-weight:700;padding:0;cursor:pointer;font-size:14px}
.preview{background:#fef3c7;color:#92400e;text-align:center;font-weight:700;padding:8px 12px;font-size:14px}
.count{font-size:30px;font-weight:800;color:#1976d2;font-variant-numeric:tabular-nums}.simple{max-width:440px;margin:0 auto;padding:32px 16px}
.simple .card{padding:22px;text-align:center}.simple .btn{margin-top:14px}.foot{text-align:center;margin-top:28px;font-size:13px;color:#64748b}
@media(min-width:800px){h1{font-size:34px}.hide-sm{display:inline}.nav-in{padding:12px 24px}main{padding:32px 24px 60px}
.hero{display:grid;grid-template-columns:1.15fr 1fr;gap:24px;padding:18px;align-items:center}.hero h2{font-size:30px}
.grid{grid-template-columns:repeat(3,1fr)}.layout{grid-template-columns:minmax(0,1fr) 340px;align-items:start}
.side{position:sticky;top:76px}.buybar{display:none}.content{padding:24px}}
@media(min-width:800px){.only-sm{display:none}}@media(max-width:799px){.only-lg{display:none}}
`;

const INAPP_SCRIPT = `(function(){var u=navigator.userAgent||"";if(!/Instagram|FBAN|FBAV|FB_IAB|Line\\/|TikTok|musical_ly|BytedanceWebview/i.test(u))return;
document.querySelectorAll(".inapp").forEach(function(b){b.style.display="block";var c=b.querySelector("button");if(c)c.onclick=function(){
var d=function(){c.textContent="Link tersalin"};if(navigator.clipboard)navigator.clipboard.writeText(location.href).then(d);else d()}})})();`;

function countdownScript(seconds, { reloadKey }) {
  return `(function(){var left=${Number(seconds)},els=document.querySelectorAll("[data-count]"),k=${JSON.stringify(reloadKey)};
function p(n){return String(n).padStart(2,"0")}function draw(){var d=Math.floor(left/86400),h=Math.floor(left%86400/3600),m=Math.floor(left%3600/60),s=left%60;
var txt=(d?d+" hari ":"")+p(h)+":"+p(m)+":"+p(s);els.forEach(function(el){el.textContent=txt})}draw();var t=setInterval(function(){left--;if(left>0){draw();return}clearInterval(t);
if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,"1");location.reload()},1000)})();`;
}

function page({ title, description, image, canonicalPath, body, noindex = false, scripts = [], referrerNone = false }) {
  const canonical = `${CANONICAL_ORIGIN}${canonicalPath}`;
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(title)}</title><meta name="description" content="${e(description)}"><link rel="canonical" href="${e(canonical)}">
<link rel="icon" href="${LOGO_URL}">${noindex ? '<meta name="robots" content="noindex,nofollow">' : ''}${referrerNone ? '<meta name="referrer" content="no-referrer">' : ''}
<meta property="og:type" content="website"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}">
<meta property="og:url" content="${e(canonical)}">${image ? `<meta property="og:image" content="${e(image)}"><meta name="twitter:card" content="summary_large_image">` : ''}
<style>${STYLE}</style></head><body>${body}${scripts.map((s) => `<script>${s}</script>`).join('')}</body></html>`;
}

const navbar = () => `<header class="nav"><div class="nav-in">
<a class="brand" href="${CANONICAL_ORIGIN}/"><img src="${LOGO_URL}" alt="" width="26" height="26">Jakpat for Universities</a>
<a class="link hide-sm" href="${CANONICAL_ORIGIN}/">Beranda</a><a class="link hide-sm" href="/webinar">Webinar</a><a class="link hide-sm" href="${SITE_URL}/pages">Survei</a>
<a class="cta" href="${SITE_URL}/dashboard">Dashboard</a></div></header>`;

const inAppNotice = () => `<div class="inapp">Google tidak bisa dipakai di browser aplikasi ini. Buka di Chrome/Safari
<button type="button">Salin link</button>, atau masuk dengan email &amp; password.</div>`;

const posterTag = (view, className = 'poster') => (/^https:\/\//i.test(view.poster_url || '')
  ? `<img class="${className}" src="${e(view.poster_url)}" alt="${e(view.title)}" width="1280" height="720">`
  : `<div class="${className} poster-empty">${e(view.title)}</div>`);

const badge = (view) => `<span class="badge t-${e(view.tone)}">${e(view.badge)}</span>`;

const speakerLine = (view) => view.speakers.map((s) => [s?.name, s?.title].filter(Boolean).join(', ')).filter(Boolean).join(' · ');

const metaList = (view) => `<ul class="meta">
${view.schedule_label ? `<li>📅 ${e(view.schedule_label)}</li>` : ''}
${speakerLine(view) ? `<li>👤 ${e(speakerLine(view))}</li>` : ''}
${view.kind === 'replay' && view.recording_minutes ? `<li>▶ ${Number(view.recording_minutes)} menit</li>` : ''}
${view.seats_label ? `<li>🎟 ${e(view.seats_label)}</li>` : ''}</ul>`;

const priceBlock = (view) => (view.price_label
  ? `<div class="price">${e(view.price_label)}<small>sudah termasuk PPN 11%</small></div>` : '');

function renderListing(listing) {
  const { hero, upcoming, videos } = listing;
  if (!hero) {
    return `<div class="card simple-empty" style="padding:40px 20px;text-align:center"><h2>${e(EMPTY_LISTING_TEXT)}</h2></div>`;
  }
  const heroAction = hero.can_buy
    ? `<a class="btn" href="${e(hero.buy_url)}">${e(hero.buy_label)}</a>`
    : (hero.note ? `<p class="note">${e(hero.note)}</p>` : '');

  const tile = (v) => `<a class="card tile" href="${e(v.detail_url)}">${posterTag(v)}
<div style="margin-top:10px">${badge(v)}</div><strong>${e(v.title)}</strong>
<span class="muted">${e(v.note && v.state !== 'on_sale' ? v.note : (v.kind === 'replay' && v.recording_minutes ? `${v.recording_minutes} menit` : (v.short_date ?? '')))}</span>
${v.price_label ? `<div style="font-weight:700;margin-top:4px">${e(v.price_label)}</div>` : ''}</a>`;

  return `<article class="card hero">${posterTag(hero)}<div class="hero-body">${badge(hero)}<h2>${e(hero.title)}</h2>
${hero.summary ? `<p class="muted" style="margin:0">${e(hero.summary)}</p>` : ''}${metaList(hero)}<div class="stack">${priceBlock(hero)}
${inAppNotice()}${heroAction}<a href="${e(hero.detail_url)}" style="text-align:center;font-weight:600">Lihat detail →</a></div></div></article>
${upcoming.length ? `<section><h2>Webinar berikutnya</h2><div class="grid">${upcoming.map(tile).join('')}</div></section>` : ''}
${videos.length ? `<section><h2>Video kelas</h2><div class="grid">${videos.map(tile).join('')}</div></section>` : ''}`;
}

function renderDetail(event, { preview }) {
  const view = buildEventView(event);
  const description = view.summary || `${view.title} — webinar Jakpat for Universities`;
  const canBuy = view.can_buy && !preview;
  const action = canBuy
    ? `<a class="btn" href="${e(view.buy_url)}">${e(view.buy_label)}</a>`
    : (preview && view.can_buy ? '<a class="btn btn-soft">Tombol beli mati di pratinjau</a>' : '');

  const statusBlock = view.state === 'coming_soon' && view.seconds_until_open != null
    ? `<p class="note">${e(view.note)}</p><div class="count" data-count></div>`
    : (view.note ? `<p class="note">${e(view.note)}</p>` : '');

  const speakers = view.speakers.map((s) => `<div class="speaker">
${/^https:\/\//i.test(s?.photo_url || '') ? `<img src="${e(s.photo_url)}" alt="" width="44" height="44" loading="lazy">` : '<div class="ph"></div>'}
<div><strong>${e(s?.name)}</strong>${s?.title ? `<div class="muted" style="font-size:14px">${e(s.title)}</div>` : ''}</div></div>`).join('');

  // Rancangan A2 (3 Nov): di HP info acara ada di bawah judul dan tombol di bar bawah;
  // di desktop info acara + tombol pindah ke kartu kanan yang ikut di-scroll.
  const [dateLine, timeLine] = (view.schedule_label || '').split(' · ');
  const facts = `<ul class="meta">
${dateLine ? `<li>📅 ${e(dateLine)}</li>` : ''}${timeLine ? `<li>🕖 ${e(timeLine)}</li>` : ''}
${view.kind === 'live' ? '<li>💻 Online via Zoom</li>' : ''}
${view.kind === 'replay' && view.recording_minutes ? `<li>▶ ${Number(view.recording_minutes)} menit</li>` : ''}
${view.seats_label ? `<li>🎟 ${e(view.seats_label)}</li>` : ''}</ul>`;
  const replayNote = view.kind === 'live' ? '<p class="note">Tidak bisa hadir? Tiket sudah termasuk rekaman.</p>' : '';
  const prose = renderBlocks(event.description_blocks);

  const body = `${preview ? '<div class="preview">Pratinjau — belum tentu terlihat publik</div>' : ''}${navbar()}<main><div class="layout"><div class="stack" style="gap:16px">
${posterTag(view)}<div class="content card"><div class="only-sm">${badge(view)}</div><h1>${e(view.title)}</h1>
${view.summary ? `<p class="muted" style="margin:0 0 8px">${e(view.summary)}</p>` : ''}
<div class="only-sm">${facts}${statusBlock}</div>
${prose ? `<h2 style="margin-top:20px">Tentang webinar ini</h2><div class="prose">${prose}</div>` : ''}
${speakers ? `<h2 style="margin-top:20px">Pembicara</h2>${speakers}` : ''}
<h2 style="margin-top:20px">Yang kamu dapat</h2><ul class="benefits">${view.benefits.map((b) => `<li>${e(b)}</li>`).join('')}</ul>
<div class="only-sm" style="margin-top:12px">${replayNote}</div>
<p class="note" style="margin-top:12px">Ada kendala? Hubungi admin di <a href="mailto:${ADMIN_CONTACT}">${ADMIN_CONTACT}</a>.</p></div></div>
<aside class="side card buy only-lg"><div class="stack">${badge(view)}${priceBlock(view)}${facts}${statusBlock}${inAppNotice()}${action}${replayNote}</div></aside></div></main>
${(action || view.note) ? `<div class="buybar card">${inAppNotice()}${action
    ? `<div class="buy-row">${view.price_label ? `<strong>${e(view.price_label)}</strong>` : ''}${action}</div>`
    : `<p class="note">${e(view.note)}</p>`}</div>` : ''}`;

  return page({
    title: `${view.title} | Jakpat for Universities`,
    description,
    image: /^https:\/\//i.test(view.poster_url || '') ? view.poster_url : null,
    canonicalPath: `/webinar/${view.slug}`,
    noindex: preview || event.is_test || event.status !== 'published',
    body,
    scripts: [
      INAPP_SCRIPT,
      ...(view.state === 'coming_soon' && view.seconds_until_open != null
        ? [countdownScript(view.seconds_until_open, { reloadKey: `webinar-open-${view.slug}` })]
        : []),
    ],
  });
}

function joinPage({ title, inner, scripts = [] }) {
  return page({
    title: `${title} | Jakpat for Universities`,
    description: 'Link gabung webinar Jakpat for Universities',
    canonicalPath: '/webinar',
    noindex: true,
    referrerNone: true,
    scripts,
    body: `<div class="simple"><div class="card"><a class="brand" style="justify-content:center;margin-bottom:12px" href="${CANONICAL_ORIGIN}/"><img src="${LOGO_URL}" alt="" width="26" height="26">Jakpat for Universities</a>${inner}
<p class="foot">Ada kendala? <a href="mailto:${ADMIN_CONTACT}">${ADMIN_CONTACT}</a></p></div></div>`,
  });
}

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
const html = (body, status = 200, extra = {}) => new Response(body, { status, headers: { ...HTML_HEADERS, ...extra } });

const JOIN_HEADERS = { 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' };

const notFound = () => html(page({
  title: 'Halaman tidak ditemukan | Jakpat for Universities',
  description: 'Halaman tidak ditemukan',
  canonicalPath: '/webinar',
  noindex: true,
  body: `${navbar()}<main><div class="card" style="padding:40px 20px;text-align:center"><h2>Halaman tidak ditemukan</h2>
<p><a href="/webinar">Lihat webinar lainnya</a></p></div></main>`,
}), 404);

/**
 * Link gabung tidak punya tampilan sendiri: halaman tiket di dashboard yang menampilkan
 * hitung mundur, kalender, dan keadaan tiket. Hanya selama ruang dibuka link ini langsung
 * ke Zoom tanpa login, supaya peserta yang membuka email menjelang acara tidak tertahan.
 */
async function handleJoin(sb, token, now = Date.now()) {
  const unknown = () => html(joinPage({ title: 'Tiket', inner: '<p>Link tidak dikenali.</p>' }), 404, JOIN_HEADERS);
  if (!JOIN_TOKEN_RE.test(token)) return unknown();

  const [order] = await rest(sb, `webinar_orders?join_token=eq.${token}&select=id,status,kind,event_id`, {}, 'SELECT webinar_orders (gabung)');
  if (!order) return unknown();

  const redirect = (location) => new Response(null, {
    status: 302,
    headers: { Location: location, 'Cache-Control': 'no-store', ...JOIN_HEADERS },
  });
  const ticketPage = () => redirect(`${SITE_URL}/dashboard/webinar/tiket/${order.id}`);
  if (order.status !== 'paid' || order.kind !== 'live') return ticketPage();

  const [event] = await rest(
    sb,
    `webinar_events?id=eq.${order.event_id}&select=status,starts_at,duration_minutes,meeting_url`,
    {},
    'SELECT webinar_events (gabung)'
  );
  if (!event || event.status === 'cancelled') return ticketPage();

  if (joinWindow(event, now)?.phase === 'open' && /^https:\/\//i.test(event.meeting_url || '')) {
    return redirect(event.meeting_url);
  }
  return ticketPage();
}

export async function onRequest({ request, env, params }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const segments = Array.isArray(params?.path) ? params.path : (params?.path ? [params.path] : []);

  try {
    const sb = resolveService(env);

    if (segments[0] === 'gabung') {
      return segments.length === 2 ? await handleJoin(sb, segments[1]) : notFound();
    }

    // Masa uji (functions/api/webinar/_access.js): daftar publik belum ada.
    if (segments.length === 0 && webinarPreviewOnly(env, request)) return notFound();

    if (segments.length === 0) {
      const rows = await rest(
        sb,
        `webinar_events?status=eq.published&is_listed=eq.true&select=${PUBLIC_EVENT_COLUMNS}`,
        {},
        'SELECT webinar_events (daftar)'
      );
      const listing = buildListing(rows || []);
      return html(page({
        title: 'Webinar & Kelas | Jakpat for Universities',
        description: 'Belajar riset langsung dari praktisinya, lewat webinar dan video kelas Jakpat for Universities.',
        image: listing.hero?.poster_url && /^https:\/\//i.test(listing.hero.poster_url) ? listing.hero.poster_url : null,
        canonicalPath: '/webinar',
        body: `${navbar()}<main><div class="title-page"><h1>Webinar &amp; Kelas</h1><p class="muted">Belajar riset langsung dari praktisinya</p></div>${renderListing(listing)}</main>`,
        scripts: [INAPP_SCRIPT],
      }));
    }

    if (segments.length !== 1 || !SLUG_RE.test(segments[0])) return notFound();

    const token = new URL(request.url).searchParams.get('pratinjau');
    const previewFilter = token && /^[0-9a-f]{32}$/.test(token) ? `&preview_token=eq.${token}` : '';
    const [event] = await rest(
      sb,
      `webinar_events?slug=eq.${segments[0]}${previewFilter}&select=${PUBLIC_EVENT_COLUMNS}`,
      {},
      'SELECT webinar_events (detail)'
    );
    if (!event) return notFound();
    const preview = previewFilter !== '';
    if (event.status === 'draft' && !preview) return notFound();
    // Masa uji: hanya acara uji (atau link pratinjau) yang punya halaman.
    if (webinarPreviewOnly(env, request) && !event.is_test && !preview) return notFound();
    return html(renderDetail(event, { preview }));
  } catch (err) {
    console.error('[webinar page]', err);
    return html(page({
      title: 'Webinar | Jakpat for Universities',
      description: 'Webinar Jakpat for Universities',
      canonicalPath: '/webinar',
      noindex: true,
      body: `${navbar()}<main><div class="card" style="padding:40px 20px;text-align:center"><h2>Halaman belum bisa dimuat</h2><p>Coba muat ulang beberapa saat lagi.</p></div></main>`,
    }), 503);
  }
}
