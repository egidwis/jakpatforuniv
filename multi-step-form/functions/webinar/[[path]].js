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
import { withSpaPrefetch } from './_spa-assets.js';

const CANONICAL_ORIGIN = SITE_URL;
const HOME_URL = 'https://jakpatforuniv.com/';
const LOGO_URL = `${SITE_URL}/favicon.webp`;
const NAV_LOGO_SRC = '/homepage/assets/images/logo-navbar.webp';

const e = escapeHtml;

const ICONS = {
  calendar: '<svg class="ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  clock: '<svg class="ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  user: '<svg class="ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  play: '<svg class="ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>',
  ticket: '<svg class="ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>',
  video: '<svg class="ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>',
  laptop: '<svg class="ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><line x1="2" y1="20" x2="22" y2="20"/></svg>',
  fileText: '<svg class="ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 13H8"/><path d="M16 17H8"/><path d="M16 13h-2"/></svg>',
  award: '<svg class="ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>',
  share: '<svg class="ico-sm" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
  check: '<svg class="check-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
  arrowRight: '<svg class="ico-sm" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
  arrowLeft: '<svg class="ico-sm" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>',
  alert: '<svg class="ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  calendarLg: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="m9 16 2 2 4-4"/></svg>',
};

const STYLE = `
:root{
  --jfu-blue:#1976D2;
  --jfu-blue-dark:#1256A8;
  --jfu-blue-soft:#EFF6FF;
  --jfu-blue-border:#BFDBFE;
  --jfu-amber-dark:#B45309;
  --jfu-amber-soft:#FEF3C7;
  --jfu-amber-border:#FCD34D;
  --jfu-ink:#0F172A;
  --jfu-slate-700:#334155;
  --jfu-slate-600:#475569;
  --jfu-slate-500:#64748B;
  --jfu-border:#E2E8F0;
  --jfu-surface:#F8FAFC;
  --jfu-white:#FFFFFF;
  --jfu-font:"Plus Jakarta Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;scrollbar-color:#CBD5E1 transparent;scrollbar-width:thin}
body{
  font-family:var(--jfu-font);
  color:var(--jfu-ink);
  background-color:var(--jfu-white);
  background-image:
    radial-gradient(ellipse 46% 360px at 14% 0%,rgba(219,234,254,.62) 0%,transparent 72%),
    radial-gradient(ellipse 42% 340px at 86% 2%,rgba(254,243,199,.52) 0%,transparent 72%),
    linear-gradient(180deg,#F8FAFC 0%,#FFFFFF 340px,#FFFFFF 100%);
  background-repeat:no-repeat;
  min-height:100vh;
  display:flex;
  flex-direction:column;
  line-height:1.55;
  -webkit-font-smoothing:antialiased;
  -moz-osx-font-smoothing:grayscale;
  caret-color:var(--jfu-blue);
  overflow-x:clip;
}
::selection{background:#DBEAFE;color:var(--jfu-ink)}
a{color:var(--jfu-blue);text-underline-offset:.2em}
img{max-width:100%;height:auto;display:block}
:focus-visible{outline:2px solid var(--jfu-blue);outline-offset:3px}
.skip-link{
  position:fixed;top:-100px;left:16px;z-index:200;
  background:var(--jfu-ink);color:var(--jfu-white);
  padding:10px 16px;border-radius:999px;font-size:.86rem;font-weight:700;text-decoration:none;
}
.skip-link:focus-visible{top:16px}

/* Floating Pill Navbar — identik dengan Landing Page */
.nav{
  position:fixed;top:18px;left:50%;transform:translateX(-50%);
  width:calc(100% - 48px);max-width:1140px;z-index:100;
  background:rgba(255,255,255,.52);
  backdrop-filter:blur(24px) saturate(180%);
  -webkit-backdrop-filter:blur(24px) saturate(180%);
  border:1px solid rgba(255,255,255,.72);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 10px 30px -10px rgba(15,23,42,.08),0 0 0 1px rgba(15,23,42,.05);
  border-radius:999px;padding:8px 10px 8px 20px;
  transition:box-shadow .25s cubic-bezier(.22,1,.36,1),background-color .25s cubic-bezier(.22,1,.36,1),border-color .25s ease;
}
.nav.scrolled{
  background:rgba(255,255,255,.82);
  border-color:rgba(255,255,255,.88);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.92),0 14px 34px -12px rgba(15,23,42,.12),0 0 0 1px rgba(15,23,42,.07);
}
.nav-container{display:flex;align-items:center;gap:14px}
.logo{
  display:inline-flex;align-items:center;gap:10px;
  font-weight:700;font-size:.98rem;color:var(--jfu-blue);
  text-decoration:none;margin-right:auto;letter-spacing:-.02em;white-space:nowrap;
}
.logo-image{height:28px;width:auto;display:block}
.site-nav{display:flex;align-items:center}
.nav-links{display:flex;align-items:center;gap:4px;list-style:none}
.nav-links a{
  display:inline-flex;align-items:center;
  text-decoration:none;font-size:.86rem;font-weight:500;color:var(--jfu-slate-600);
  padding:7px 13px;border-radius:999px;
  transition:background-color .2s ease,color .2s ease;white-space:nowrap;
}
.nav-links a:hover{color:var(--jfu-ink);background-color:rgba(241,245,249,.75)}
.nav-links a.active,.nav-links a[aria-current="page"]{
  background-color:rgba(241,245,249,.82);color:var(--jfu-ink);font-weight:600;
  box-shadow:inset 0 0 0 1px rgba(15,23,42,.08);
}
.nav-links li.only-mobile{display:none}
.nav-dashboard{
  background:rgba(255,255,255,.78);color:var(--jfu-ink);
  border:1px solid rgba(203,213,225,.9);
  box-shadow:0 1px 2px rgba(15,23,42,.04);
  text-decoration:none;font-size:.85rem;font-weight:600;
  padding:8px 18px;border-radius:999px;
  transition:background-color .2s ease,border-color .2s ease,color .2s ease,transform .2s ease;
  white-space:nowrap;
}
.nav-dashboard:hover{background:var(--jfu-blue-soft);color:var(--jfu-blue-dark);border-color:#93C5FD;transform:translateY(-1px)}
.hamburger{
  display:none;flex-direction:column;justify-content:center;gap:4px;
  min-inline-size:38px;min-block-size:38px;border-radius:999px;
  border:1px solid var(--jfu-border);background:var(--jfu-white);
  cursor:pointer;padding:0 10px;anchor-name:--menu-button;
}
.hamburger span{display:block;width:16px;height:2px;background:var(--jfu-ink);border-radius:2px;transition:transform .2s ease,opacity .2s ease}
.hamburger[aria-expanded="true"] span:nth-child(1){transform:translateY(6px) rotate(45deg)}
.hamburger[aria-expanded="true"] span:nth-child(2){opacity:0}
.hamburger[aria-expanded="true"] span:nth-child(3){transform:translateY(-6px) rotate(-45deg)}

@media (min-width:821px){
  .nav-links[popover]{position:static;inset:auto;display:flex;margin:0;padding:0;border:0;background:transparent;box-shadow:none;overflow:visible}
  .nav-links[popover]::backdrop{display:none}
}
/* Mobile Popover Menu */
@media (max-width:820px){
  .nav{top:12px;width:calc(100% - 24px);padding:8px 10px 8px 16px}
  .nav-dashboard{display:none}
  .hamburger{display:inline-flex;align-items:center}
  .nav-links{
    position:fixed;inset:auto;
    inset-block-start:4.5rem;
    inset-block-start:anchor(--menu-button bottom);
    inset-inline:12px;
    inline-size:auto;max-inline-size:calc(100dvw - 24px);
    max-block-size:calc(100dvh - 6rem);
    margin-block-start:10px;padding:14px;overflow:auto;
    flex-direction:column;align-items:stretch;gap:6px;
    background:rgba(255,255,255,.92);
    backdrop-filter:blur(24px) saturate(180%);
    -webkit-backdrop-filter:blur(24px) saturate(180%);
    border:1px solid var(--jfu-border);border-radius:24px;
    box-shadow:0 24px 48px -16px rgba(15,23,42,.18);
  }
  .nav-links[popover]:not(:is(:popover-open,.\:popover-open)):not(.is-open){display:none}
  .nav-links[popover]:is(:popover-open,.\:popover-open),.nav-links.is-open{display:flex}
  .nav-links li.only-mobile{display:block;margin-top:6px;padding-top:10px;border-top:1px solid #F1F5F9}
  .nav-links a{display:block;font-size:.95rem;font-weight:600;color:var(--jfu-ink);padding:11px 14px;border-radius:12px}
  .nav-links a.mobile-dash-link{
    background:rgba(255,255,255,.96);color:var(--jfu-ink);
    border:1px solid #CBD5E1;text-align:center;border-radius:999px;
  }
  .nav-links a.mobile-dash-link:hover{background:var(--jfu-blue-soft);color:var(--jfu-blue-dark);border-color:#93C5FD}
}
@media (prefers-reduced-motion:no-preference) and (max-width:820px){
  .nav-links[popover]{
    opacity:0;translate:0 -8px;
    transition:opacity .2s cubic-bezier(.22,1,.36,1),translate .2s cubic-bezier(.22,1,.36,1),display .2s,overlay .2s;
    transition-behavior:allow-discrete;
  }
  .nav-links[popover]:is(:popover-open,.\:popover-open){opacity:1;translate:0 0}
  @starting-style{.nav-links[popover]:is(:popover-open,.\:popover-open){opacity:0;translate:0 -8px}}
}
@media (forced-colors:active){
  .nav,.card,.hero-card,.tile,.side,.buybar{border:1px solid CanvasText}
  .nav-links a[aria-current="page"],.nav-links a.active{outline:2px solid Highlight}
}

/* Main Layout */
main{
  flex:1;width:100%;max-width:1168px;margin:0 auto;
  padding:94px 16px 56px;
}
.has-buybar main{padding-bottom:36px}

/* Hero Card Title (Listing Hero Section) */
.hero-body h1{
  font-size:clamp(1.45rem,2.6vw,2.05rem);font-weight:800;
  line-height:1.16;letter-spacing:-.035em;color:var(--jfu-ink);text-wrap:balance;
}
.sale-timer{
  display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;
  padding:10px 14px;border-radius:14px;
  background:#FFFBEB;border:1px solid #FDE68A;
  color:#92400E;font-size:.82rem;font-weight:600;
}
.sale-timer-label{display:inline-flex;align-items:center;gap:7px}
.sale-timer-label .ico{color:#D97706;margin-top:0}
.sale-timer-val{
  font-size:.92rem;font-weight:800;color:#78350F;
  font-variant-numeric:tabular-nums;letter-spacing:-.01em;
}

/* Shared Cards, Badges, Buttons & Icons */
.ico{width:16px;height:16px;flex-shrink:0;color:var(--jfu-blue);margin-top:2px}
.ico-sm{width:15px;height:15px;flex-shrink:0}
.card{
  background:var(--jfu-white);
  border:1.5px solid var(--jfu-border);
  border-radius:28px;
  box-shadow:0 18px 40px -22px rgba(15,23,42,.08);
}
.poster-frame{
  position:relative;overflow:hidden;border-radius:18px;
  background:linear-gradient(135deg,#EFF6FF 0%,#DBEAFE 100%);
  border:1px solid rgba(15,23,42,.06);
}
.poster{width:100%;aspect-ratio:16/9;object-fit:cover;display:block}
.poster-empty{
  width:100%;aspect-ratio:16/9;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;
  color:var(--jfu-blue-dark);font-weight:800;font-size:1rem;letter-spacing:-.02em;
  text-align:center;padding:24px;
  background:
    radial-gradient(circle at 20% 20%,rgba(255,255,255,.75),transparent 60%),
    linear-gradient(135deg,#EFF6FF 0%,#DBEAFE 100%);
}
.badge{
  display:inline-flex;align-items:center;gap:6px;
  font-size:.72rem;font-weight:800;letter-spacing:.03em;text-transform:uppercase;
  padding:5px 11px;border-radius:999px;line-height:1;width:fit-content;
}
.t-on_sale{background:#DCFCE7;color:#166534}
.t-on_sale::before{content:"";width:6px;height:6px;border-radius:999px;background:#16A34A}
.t-soon{background:#DBEAFE;color:#1E40AF}
.t-held{background:var(--jfu-amber-soft);color:var(--jfu-amber-dark)}
.t-ended{background:#F1F5F9;color:var(--jfu-slate-600)}

.muted{color:var(--jfu-slate-600)}
.meta{list-style:none;display:grid;gap:9px;font-size:.9rem;color:var(--jfu-slate-700)}
.meta li{display:flex;align-items:flex-start;gap:9px;line-height:1.45}

.price{font-size:1.55rem;font-weight:800;letter-spacing:-.03em;color:var(--jfu-ink);font-variant-numeric:tabular-nums;line-height:1.15}
.price small{display:block;font-size:.76rem;font-weight:500;color:var(--jfu-slate-500);letter-spacing:0;margin-top:3px}

.btn{
  display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;
  background:linear-gradient(135deg,var(--jfu-blue) 0%,var(--jfu-blue-dark) 100%);
  color:var(--jfu-white);text-decoration:none;font-family:inherit;
  font-weight:700;font-size:.94rem;padding:13px 22px;border-radius:999px;border:0;cursor:pointer;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 12px 26px -8px rgba(21,101,192,.45);
  transition:transform .2s cubic-bezier(.22,1,.36,1),box-shadow .2s cubic-bezier(.22,1,.36,1);
}
.btn:hover{transform:translateY(-1px);box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 16px 32px -8px rgba(21,101,192,.52)}
.btn-soft{
  background:rgba(255,255,255,.94);color:var(--jfu-ink);
  border:1px solid #CBD5E1;box-shadow:0 1px 2px rgba(15,23,42,.04);
}
.btn-soft:hover{background:var(--jfu-blue-soft);color:var(--jfu-blue-dark);border-color:#93C5FD;box-shadow:0 6px 18px -10px rgba(25,118,210,.25)}
.btn-disabled{background:#F1F5F9;color:var(--jfu-slate-600);box-shadow:none;cursor:default;pointer-events:none}

.note{font-size:.88rem;color:var(--jfu-slate-600);line-height:1.55}
.note-box{
  background:var(--jfu-surface);border:1px solid var(--jfu-border);
  border-radius:16px;padding:12px 14px;font-size:.86rem;color:var(--jfu-slate-700);line-height:1.5;
}
.note-box a{font-weight:700;color:var(--jfu-blue-dark);text-decoration:none}
.note-box a:hover{text-decoration:underline}

/* Featured Hero Card on /webinar */
.hero-card{
  background:linear-gradient(180deg,#F0F7FF 0%,#FFFFFF 48%);
  border:1.5px solid #93C5FD;border-radius:28px;
  padding:18px;
  box-shadow:0 22px 48px -24px rgba(25,118,210,.16);
  display:grid;gap:20px;
}
.hero-card>*,.grid>*{min-width:0}
.hero-card .poster-frame{border-radius:20px}
.hero-body{display:flex;flex-direction:column;gap:14px;padding:4px}
.hero-body h2{
  font-size:clamp(1.38rem,2.4vw,1.9rem);font-weight:800;
  line-height:1.2;letter-spacing:-.03em;color:var(--jfu-ink);text-wrap:balance;
}
.hero-summary{font-size:.95rem;color:var(--jfu-slate-600);line-height:1.58}
.hero-footer{
  margin-top:4px;padding-top:16px;border-top:1px solid rgba(203,213,225,.75);
  display:grid;gap:12px;
}
.hero-actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.hero-actions .btn{flex:1 1 180px}
.detail-link{
  display:inline-flex;align-items:center;justify-content:center;gap:6px;
  flex:1 1 140px;
  padding:12px 18px;border-radius:999px;
  font-size:.9rem;font-weight:700;color:var(--jfu-blue-dark);
  text-decoration:none;background:rgba(255,255,255,.94);border:1px solid #CBD5E1;
  transition:background-color .2s ease,border-color .2s ease,transform .2s ease;
}
.detail-link:hover{background:var(--jfu-blue-soft);border-color:#93C5FD;transform:translateY(-1px)}

/* Listing Sections & Tile Grid */
.catalog-section{margin-top:56px}
.section-bar{display:flex;align-items:center;justify-content:flex-start;gap:10px;margin-bottom:20px}
.section-bar h2{
  font-size:clamp(1.35rem,2.2vw,1.65rem);font-weight:800;
  letter-spacing:-.03em;line-height:1.2;color:var(--jfu-ink);
}
.section-count{
  font-size:.76rem;font-weight:700;color:var(--jfu-slate-600);
  background:#F1F5F9;border:1px solid var(--jfu-border);
  padding:3px 10px;border-radius:999px;font-variant-numeric:tabular-nums;
}
.grid{display:grid;gap:20px;grid-template-columns:1fr}
.tile{
  display:flex;flex-direction:column;gap:12px;height:100%;
  color:inherit;text-decoration:none;padding:16px;border-radius:24px;
  background:var(--jfu-white);border:1.5px solid var(--jfu-border);
  box-shadow:0 16px 36px -22px rgba(15,23,42,.08);
  transition:transform .28s cubic-bezier(.22,1,.36,1),border-color .22s ease,box-shadow .28s cubic-bezier(.22,1,.36,1);
}
.tile:hover{
  transform:translateY(-4px);border-color:#93C5FD;
  box-shadow:0 24px 48px -22px rgba(25,118,210,.18);
}
.tile .poster-frame{border-radius:16px}
.tile .poster{transition:transform .45s cubic-bezier(.22,1,.36,1)}
.tile:hover .poster{transform:scale(1.03)}
.tile-title{
  font-size:1.04rem;font-weight:800;line-height:1.35;
  letter-spacing:-.02em;color:var(--jfu-ink);text-wrap:balance;
}
.tile-meta{display:flex;align-items:center;gap:6px;font-size:.84rem;color:var(--jfu-slate-600)}
.tile-meta .ico{width:14px;height:14px;margin-top:0;color:var(--jfu-slate-500)}
.tile-foot{
  margin-top:auto;padding-top:12px;border-top:1px solid #F1F5F9;
  display:flex;align-items:center;justify-content:space-between;gap:10px;
}
.tile-price{font-size:1rem;font-weight:800;color:var(--jfu-ink);font-variant-numeric:tabular-nums}
.tile-more{
  display:inline-flex;align-items:center;gap:4px;
  font-size:.84rem;font-weight:700;color:var(--jfu-blue);
  transition:transform .2s cubic-bezier(.22,1,.36,1);
}
.tile:hover .tile-more{transform:translateX(3px)}

/* Empty / Error State Card */
.state-card{
  max-width:560px;margin:24px auto;padding:48px 28px;text-align:center;
  display:flex;flex-direction:column;align-items:center;gap:14px;
}
.state-icon{
  width:56px;height:56px;border-radius:18px;
  background:var(--jfu-blue-soft);color:var(--jfu-blue);
  border:1px solid var(--jfu-blue-border);
  display:flex;align-items:center;justify-content:center;
}
.state-card h1,.state-card h2{font-size:1.35rem;font-weight:800;letter-spacing:-.025em;color:var(--jfu-ink);text-wrap:balance}
.state-card .btn-soft{width:auto;margin-top:6px}

/* Detail Page Layout */
.back-row{margin-bottom:18px}
.back-link{
  display:inline-flex;align-items:center;gap:7px;
  font-size:.86rem;font-weight:600;color:var(--jfu-slate-600);
  text-decoration:none;padding:6px 12px 6px 8px;border-radius:999px;
  transition:color .2s ease,background-color .2s ease;
}
.back-link:hover{color:var(--jfu-ink);background:rgba(241,245,249,.9)}

.preview{
  background:var(--jfu-amber-soft);color:var(--jfu-amber-dark);
  border:1px solid var(--jfu-amber-border);
  border-radius:16px;padding:10px 16px;margin-bottom:18px;
  text-align:center;font-weight:700;font-size:.86rem;
}

.layout{display:grid;gap:24px}
.layout>*,.stack>*{min-width:0}
.stack{display:grid;gap:14px}
.stack>.badge{justify-self:start}

.editorial-card{overflow:hidden}
.editorial-media{padding:14px 14px 0}
.editorial-media .poster-frame{border-radius:20px}
.content{padding:20px 22px 26px}
.content h1{
  font-size:clamp(1.6rem,3vw,2.2rem);font-weight:800;
  line-height:1.15;letter-spacing:-.035em;color:var(--jfu-ink);
  text-wrap:balance;margin:10px 0 10px;
}
.detail-summary{font-size:1.02rem;color:var(--jfu-slate-600);line-height:1.6;max-width:62ch}
.speaker-mini-row{
  display:inline-flex;align-items:center;gap:10px;margin-top:16px;
  padding:6px 14px 6px 6px;border-radius:999px;
  background:var(--jfu-surface);border:1px solid var(--jfu-border);
  text-decoration:none;color:var(--jfu-ink);max-width:100%;
  transition:border-color .2s ease,background-color .2s ease;
}
.speaker-mini-row:hover{border-color:#93C5FD;background:var(--jfu-blue-soft)}
.speaker-mini-avatars{display:flex;align-items:center;flex-shrink:0}
.speaker-mini-avatars img,.speaker-mini-avatars .ph-sm{
  width:30px;height:30px;border-radius:999px;object-fit:cover;
  border:2px solid var(--jfu-white);background:#DBEAFE;color:#1E40AF;
  display:inline-flex;align-items:center;justify-content:center;
  font-size:.7rem;font-weight:800;
}
.speaker-mini-avatars>*+*{margin-left:-8px}
.speaker-mini-text{font-size:.84rem;color:var(--jfu-slate-600);line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.speaker-mini-text strong{color:var(--jfu-ink);font-weight:700}

.mobile-facts{
  margin-top:18px;padding:16px;border-radius:18px;
  background:var(--jfu-surface);border:1px solid var(--jfu-border);
  display:grid;gap:12px;
}
.content-section{margin-top:28px;padding-top:26px;border-top:1px solid #F1F5F9;scroll-margin-top:96px}
.content-section h2{
  font-size:1.18rem;font-weight:800;letter-spacing:-.025em;
  color:var(--jfu-ink);margin-bottom:14px;
}

.prose{max-width:66ch;color:var(--jfu-slate-700);font-size:.97rem;line-height:1.7}
.prose p{margin-bottom:13px}
.prose p:last-child{margin-bottom:0}
.prose h2{font-size:1.15rem;font-weight:800;color:var(--jfu-ink);margin:22px 0 8px;letter-spacing:-.02em}
.prose h3,.prose h4{font-size:1rem;font-weight:700;color:var(--jfu-ink);margin:16px 0 6px}
.prose ul,.prose ol{padding-left:20px;margin:0 0 14px;display:grid;gap:6px}
.prose blockquote{
  margin:16px 0;padding:14px 18px;border-radius:16px;
  background:var(--jfu-blue-soft);border:1px solid var(--jfu-blue-border);
  color:var(--jfu-ink);font-style:normal;
}
.prose hr{border:0;border-top:1px solid var(--jfu-border);margin:20px 0}
.prose img{border-radius:16px;margin:16px 0;border:1px solid var(--jfu-border)}

.speakers-list{display:grid;gap:14px}
.speaker{
  display:flex;gap:16px;align-items:center;
  padding:16px 18px;border-radius:20px;
  background:linear-gradient(180deg,#F8FAFC 0%,#FFFFFF 100%);
  border:1px solid var(--jfu-border);
}
.speaker>div{min-width:0}
.speaker img,.speaker .ph{
  width:64px;height:64px;border-radius:999px;object-fit:cover;flex-shrink:0;
  background:#DBEAFE;color:#1E40AF;display:flex;align-items:center;justify-content:center;
  font-weight:800;font-size:1.05rem;
  box-shadow:0 0 0 3px var(--jfu-white),0 0 0 4.5px rgba(25,118,210,.16);
}
.speaker-name{font-weight:800;color:var(--jfu-ink);font-size:1.04rem;letter-spacing:-.015em;line-height:1.3}
.speaker-title{font-size:.88rem;color:var(--jfu-slate-600);margin-top:3px;line-height:1.45}

.benefits{list-style:none;display:grid;gap:10px}
.benefits li{display:flex;align-items:center;gap:10px;font-size:.88rem;color:var(--jfu-slate-700);font-weight:600;line-height:1.35}
.benefit-ico{
  width:28px;height:28px;border-radius:10px;flex-shrink:0;
  background:var(--jfu-blue-soft);color:var(--jfu-blue);
  border:1px solid rgba(191,219,254,.8);
  display:inline-flex;align-items:center;justify-content:center;
}
.benefit-ico .ico{width:14px;height:14px;margin-top:0;color:var(--jfu-blue)}

.contact-note{margin-top:24px;padding-top:18px;border-top:1px solid #F1F5F9;font-size:.85rem;color:var(--jfu-slate-500)}
.contact-note a{color:var(--jfu-blue-dark);font-weight:600}

/* Sticky Purchase Sidebar */
.buy{
  padding:24px;
  background:linear-gradient(180deg,#F5F9FF 0%,#FFFFFF 38%);
  border-color:#93C5FD;
  box-shadow:0 22px 48px -24px rgba(25,118,210,.16);
}
.buy-top{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.seats-pill{
  display:inline-flex;align-items:center;gap:5px;
  font-size:.74rem;font-weight:700;color:var(--jfu-amber-dark);
  background:var(--jfu-amber-soft);border:1px solid #FDE68A;
  padding:4px 10px;border-radius:999px;font-variant-numeric:tabular-nums;
}
.seats-pill .ico{width:13px;height:13px;margin-top:0;color:var(--jfu-amber-dark)}
.buy-divider{height:1px;background:rgba(203,213,225,.75)}
.buy-subhead{font-size:.82rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--jfu-slate-500);margin-bottom:2px}
.share-btn{
  display:inline-flex;align-items:center;justify-content:center;gap:7px;width:100%;
  background:transparent;color:var(--jfu-slate-600);
  border:1px solid var(--jfu-border);border-radius:999px;
  padding:9px 14px;font-family:inherit;font-size:.84rem;font-weight:600;cursor:pointer;
  transition:background-color .2s ease,border-color .2s ease,color .2s ease;
}
.share-btn:hover{background:var(--jfu-surface);border-color:#CBD5E1;color:var(--jfu-ink)}
.share-btn.is-copied{background:#DCFCE7;border-color:#BBF7D0;color:#166534}
.countdown-box{
  padding:14px 16px;border-radius:16px;
  background:var(--jfu-blue-soft);border:1px solid var(--jfu-blue-border);
  display:grid;gap:4px;
}
.count{font-size:1.75rem;font-weight:800;color:var(--jfu-blue-dark);font-variant-numeric:tabular-nums;letter-spacing:-.02em;line-height:1.15}

/* In-app browser notice */
.inapp{
  display:none;background:#FFFBEB;border:1px solid var(--jfu-amber-border);
  border-radius:16px;padding:12px 14px;font-size:.84rem;color:#78350F;line-height:1.5;
}
.inapp-inner{display:flex;align-items:flex-start;gap:9px}
.inapp .ico{color:var(--jfu-amber-dark)}
.inapp button{
  background:var(--jfu-white);border:1px solid var(--jfu-amber-border);
  color:var(--jfu-amber-dark);font-family:inherit;font-weight:700;
  padding:2px 10px;border-radius:999px;cursor:pointer;font-size:.8rem;margin:0 2px;
}

/* Mobile Sticky Bottom Buy Bar */
.buybar{
  position:fixed;left:0;right:0;bottom:0;z-index:80;
  background:rgba(255,255,255,.92);
  backdrop-filter:blur(22px) saturate(180%);
  -webkit-backdrop-filter:blur(22px) saturate(180%);
  border-top:1px solid var(--jfu-border);
  border-radius:22px 22px 0 0;
  box-shadow:0 -12px 32px -12px rgba(15,23,42,.14);
  padding:12px 16px calc(12px + env(safe-area-inset-bottom));
}
.buy-row{display:flex;align-items:center;gap:14px;justify-content:space-between}
.buy-row-price{font-size:1.05rem;font-weight:800;color:var(--jfu-ink);font-variant-numeric:tabular-nums;white-space:nowrap}
.buy-row .btn{width:auto;flex:1;padding:12px 18px;font-size:.92rem}

/* Minimal Join Fallback */
.simple{max-width:460px;margin:auto;padding:48px 20px;width:100%}
.simple .card{padding:32px 26px;text-align:center;display:grid;gap:14px}
.simple .logo{margin:0 auto;justify-content:center}
.foot{text-align:center;margin-top:8px;font-size:.82rem;color:var(--jfu-slate-500)}

/* Unified Footer — identik dengan Landing Page */
.footer{padding:0 24px 48px;margin-top:auto}
.has-buybar .footer{padding-bottom:108px}
.footer-container{
  max-width:1120px;margin:0 auto;padding-top:24px;
  border-top:1px solid var(--jfu-border);
  display:flex;align-items:center;justify-content:space-between;gap:20px;
  font-size:.82rem;color:var(--jfu-slate-600);
}
.footer-brand{display:flex;align-items:center;gap:10px;font-weight:700;color:var(--jfu-ink);white-space:nowrap}
.footer-brand img{height:24px;width:auto}
.footer-links{display:flex;flex-wrap:wrap;gap:18px;justify-content:center}
.footer-links a{color:var(--jfu-slate-600);text-decoration:none;font-weight:600;transition:color .2s ease}
.footer-links a:hover{color:var(--jfu-ink)}

/* Responsive Breakpoints */
@media (min-width:640px){
  .grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (min-width:860px){
  main{padding:118px 24px 80px}
  .has-buybar main{padding-bottom:80px}
  .has-buybar .footer{padding-bottom:48px}
  .hero-card{grid-template-columns:1.18fr 1fr;gap:30px;padding:26px;align-items:center}
  .hero-actions .detail-link{flex:0 0 auto}
  .grid{grid-template-columns:repeat(3,minmax(0,1fr))}
  .layout{grid-template-columns:minmax(0,1fr) 364px;align-items:start;gap:28px}
  .side{position:sticky;top:96px}
  .buybar{display:none}
  .editorial-media{padding:20px 20px 0}
  .content{padding:28px 34px 34px}
  .content h1{margin-top:0}
  .only-sm{display:none}
}
@media (max-width:859px){
  .only-lg{display:none}
  .footer-container{flex-direction:column;text-align:center;gap:14px}
}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{transition-duration:.01ms!important;animation-duration:.01ms!important;scroll-behavior:auto!important}
}
`;

const UI_SCRIPT = `(function(){
var nav=document.querySelector(".nav");
if(nav){var onScroll=function(){nav.classList.toggle("scrolled",window.scrollY>24)};onScroll();window.addEventListener("scroll",onScroll,{passive:true})}
var btn=document.getElementById("nav-toggle"),menu=document.getElementById("site-menu");
if(btn&&menu){
  var hasPopover=Object.hasOwn(HTMLElement.prototype,"popover");
  var mq=window.matchMedia("(min-width: 821px)");
  var sync=function(){
    if(mq.matches){menu.removeAttribute("popover");menu.classList.remove("is-open");btn.setAttribute("aria-expanded","false")}
    else if(hasPopover){menu.setAttribute("popover","auto")}
  };
  sync();
  if(mq.addEventListener)mq.addEventListener("change",sync);
  if(hasPopover){
    menu.addEventListener("toggle",function(ev){btn.setAttribute("aria-expanded",ev.newState==="open"?"true":"false")});
  }else{
    btn.addEventListener("click",function(){var open=menu.classList.toggle("is-open");btn.setAttribute("aria-expanded",open?"true":"false")});
    document.addEventListener("click",function(ev){if(!menu.contains(ev.target)&&!btn.contains(ev.target)){menu.classList.remove("is-open");btn.setAttribute("aria-expanded","false")}});
    document.addEventListener("keydown",function(ev){if(ev.key==="Escape"&&menu.classList.contains("is-open")){menu.classList.remove("is-open");btn.setAttribute("aria-expanded","false");btn.focus()}});
  }
}
document.querySelectorAll("[data-share-btn]").forEach(function(sb){
  sb.addEventListener("click",function(){
    var label=sb.querySelector("[data-share-label]");
    var done=function(){
      sb.classList.add("is-copied");
      if(label)label.textContent="Link kelas tersalin";
      clearTimeout(sb._t);
      sb._t=setTimeout(function(){sb.classList.remove("is-copied");if(label)label.textContent="Bagikan kelas ini"},2200);
    };
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(location.href).then(done,done)}
    else{done()}
  });
});
})();`;

const INAPP_SCRIPT = `(function(){var u=navigator.userAgent||"";if(!/Instagram|FBAN|FBAV|FB_IAB|Line\\/|TikTok|musical_ly|BytedanceWebview/i.test(u))return;
document.querySelectorAll(".inapp").forEach(function(b){b.style.display="block";var c=b.querySelector("button");if(c)c.onclick=function(){
var d=function(){c.textContent="Link tersalin"};if(navigator.clipboard)navigator.clipboard.writeText(location.href).then(d);else d()}})})();`;

function formatCountdown(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return `${d ? `${d} hari · ` : ''}${p(h)}:${p(m)}:${p(sec)}`;
}

function countdownScript(seconds, { reloadKey, selector = '[data-count]' }) {
  return `(function(){var left=${Number(seconds)},els=document.querySelectorAll(${JSON.stringify(selector)}),k=${JSON.stringify(reloadKey)};
function p(n){return String(n).padStart(2,"0")}function draw(){var d=Math.floor(left/86400),h=Math.floor(left%86400/3600),m=Math.floor(left%3600/60),s=left%60;
var txt=(d?d+" hari · ":"")+p(h)+":"+p(m)+":"+p(s);els.forEach(function(el){el.textContent=txt})}draw();var t=setInterval(function(){left--;if(left>0){draw();return}clearInterval(t);
if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,"1");location.reload()},1000)})();`;
}

function page({ title, description, image, canonicalPath, body, bodyClass = '', noindex = false, scripts = [], referrerNone = false }) {
  const canonical = `${CANONICAL_ORIGIN}${canonicalPath}`;
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(title)}</title><meta name="description" content="${e(description)}"><link rel="canonical" href="${e(canonical)}">
<link rel="icon" href="${LOGO_URL}">${noindex ? '<meta name="robots" content="noindex,nofollow">' : ''}${referrerNone ? '<meta name="referrer" content="no-referrer">' : ''}
<meta property="og:type" content="website"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}">
<meta property="og:url" content="${e(canonical)}">${image ? `<meta property="og:image" content="${e(image)}"><meta name="twitter:card" content="summary_large_image">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${STYLE}</style></head><body${bodyClass ? ` class="${e(bodyClass)}"` : ''}>${body}${scripts.map((s) => `<script>${s}</script>`).join('')}</body></html>`;
}

const navbar = ({ isListing = false } = {}) => `<a href="#konten-utama" class="skip-link">Langsung ke konten</a>
<header class="nav"><div class="nav-container">
<a href="${HOME_URL}" class="logo" aria-label="Beranda Jakpat for Universities"><img src="${NAV_LOGO_SRC}" alt="" class="logo-image" width="28" height="28"><span>Jakpat for Universities</span></a>
<nav class="site-nav" aria-label="Utama">
<button type="button" id="nav-toggle" class="hamburger" popovertarget="site-menu" popovertargetaction="toggle" aria-controls="site-menu" aria-expanded="false" aria-label="Menu"><span></span><span></span><span></span></button>
<ul id="site-menu" class="nav-links" popover="auto">
<li><a href="${HOME_URL}">Beranda</a></li>
<li><a href="/webinar" class="active"${isListing ? ' aria-current="page"' : ''}>Webinar</a></li>
<li><a href="${SITE_URL}/pages">Survei</a></li>
<li class="only-mobile"><a href="${SITE_URL}/login" class="mobile-dash-link">Login</a></li>
</ul>
</nav>
<a href="${SITE_URL}/login" class="nav-dashboard">Login</a>
</div></header>`;

const footer = () => `<footer class="footer"><div class="footer-container">
<div class="footer-brand"><img src="${NAV_LOGO_SRC}" alt="" width="24" height="24" loading="lazy"><span>Jakpat for Universities</span></div>
<nav class="footer-links" aria-label="Footer">
<a href="${HOME_URL}">Beranda</a>
<a href="/webinar">Kelas JFU</a>
<a href="${SITE_URL}/pages">Daftar Survei</a>
<a href="${SITE_URL}/privacy-policy">Kebijakan Privasi</a>
<a href="${SITE_URL}/terms-conditions">Syarat &amp; Ketentuan</a>
</nav>
<p>&copy; 2026 Jakpat for Universities.</p>
</div></footer>`;

const inAppNotice = () => `<div class="inapp"><div class="inapp-inner">${ICONS.alert}<div>Google tidak bisa dipakai di browser aplikasi ini. Buka di Chrome/Safari <button type="button">Salin link</button>, atau masuk dengan email &amp; password.</div></div></div>`;

const posterTag = (view, className = 'poster') => `<div class="poster-frame${className === 'poster detail-poster' ? ' detail-poster' : ''}">${/^https:\/\//i.test(view.poster_url || '')
  ? `<img class="poster" src="${e(view.poster_url)}" alt="${e(view.title)}" width="1280" height="720">`
  : `<div class="poster-empty">${ICONS.calendarLg}<span>${e(view.title)}</span></div>`}</div>`;

const badge = (view) => `<span class="badge t-${e(view.tone)}">${e(view.badge)}</span>`;

const speakerLine = (view) => view.speakers.map((s) => [s?.name, s?.title].filter(Boolean).join(', ')).filter(Boolean).join(' · ');

const initials = (name) => String(name || '')
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((w) => w[0].toUpperCase())
  .join('') || 'JP';

const metaList = (view) => `<ul class="meta">
${view.schedule_label ? `<li>${ICONS.calendar}<span>${e(view.schedule_label)}</span></li>` : ''}
${speakerLine(view) ? `<li>${ICONS.user}<span>${e(speakerLine(view))}</span></li>` : ''}
${view.kind === 'replay' && view.recording_minutes ? `<li>${ICONS.play}<span>${Number(view.recording_minutes)} menit</span></li>` : ''}
${view.seats_label ? `<li>${ICONS.ticket}<span>${e(view.seats_label)}</span></li>` : ''}</ul>`;

const priceBlock = (view) => (view.price_label
  ? `<div class="price">${e(view.price_label)}<small>sudah termasuk PPN 11%</small></div>` : '');

const salesCloseBanner = (view) => (view.state === 'on_sale' && view.seconds_until_close != null
  ? `<div class="sale-timer"><span class="sale-timer-label">${ICONS.clock}<span>Penjualan berakhir dalam</span></span><span class="sale-timer-val" data-count-close>${formatCountdown(view.seconds_until_close)}</span></div>`
  : '');

function renderListing(listing) {
  const { hero, upcoming, videos } = listing;
  if (!hero) {
    return `<div class="card state-card"><div class="state-icon">${ICONS.calendarLg}</div><h1>${e(EMPTY_LISTING_TEXT)}</h1><p class="note">Pantau halaman Kelas JFU ini atau jelajahi layanan distribusi survei Jakpat for Universities.</p><a class="btn btn-soft" href="${HOME_URL}">Kembali ke Beranda</a></div>`;
  }
  const heroAction = hero.can_buy
    ? `<a class="btn" href="${e(hero.buy_url)}">${e(hero.buy_label)}</a>`
    : (hero.note ? `<p class="note">${e(hero.note)}</p>` : '');

  const tile = (v) => {
    const subMeta = v.note && v.state !== 'on_sale'
      ? v.note
      : (v.kind === 'replay' && v.recording_minutes ? `${v.recording_minutes} menit` : (v.short_date ?? ''));
    const subIcon = v.kind === 'replay' ? ICONS.play : ICONS.calendar;
    return `<a class="tile" href="${e(v.detail_url)}">${posterTag(v)}
${badge(v)}<h3 class="tile-title">${e(v.title)}</h3>
${subMeta ? `<div class="tile-meta">${subIcon}<span>${e(subMeta)}</span></div>` : ''}
<div class="tile-foot">${v.price_label ? `<span class="tile-price">${e(v.price_label)}</span>` : '<span></span>'}<span class="tile-more">Lihat detail ${ICONS.arrowRight}</span></div></a>`;
  };

  return `<article class="hero-card">${posterTag(hero)}<div class="hero-body">${badge(hero)}<h1>${e(hero.title)}</h1>
${hero.summary ? `<p class="hero-summary">${e(hero.summary)}</p>` : ''}${metaList(hero)}${salesCloseBanner(hero)}<div class="hero-footer">${priceBlock(hero)}
${inAppNotice()}<div class="hero-actions">${heroAction}<a class="detail-link" href="${e(hero.detail_url)}">Lihat detail ${ICONS.arrowRight}</a></div></div></div></article>
${upcoming.length ? `<section class="catalog-section"><div class="section-bar"><h2>Kelas JFU berikutnya</h2><span class="section-count">${upcoming.length} sesi</span></div><div class="grid">${upcoming.map(tile).join('')}</div></section>` : ''}
${videos.length ? `<section class="catalog-section"><div class="section-bar"><h2>Video kelas</h2><span class="section-count">${videos.length} kelas</span></div><div class="grid">${videos.map(tile).join('')}</div></section>` : ''}`;
}

/**
 * Penghubung Video kelas ↔ webinar (Iterasi 7, sql/137). Masing-masing satu kueri
 * kecil, hanya bila perlu:
 * - halaman Video kelas bersumber: judul webinar asalnya (bila masih terbit), untuk
 *   catatan pemegang tiket;
 * - halaman webinar yang sudah mulai: Video kelas terbit yang menunjuk ke acara itu.
 */
async function loadLinks(sb, event, now = Date.now()) {
  if (event.offer_kind === 'replay' && event.source_event_id) {
    const [source] = (await rest(sb, `webinar_events?id=eq.${event.source_event_id}&status=eq.published&select=title`, {}, 'SELECT webinar_events (webinar asal)')) || [];
    return { sourceTitle: source?.title ?? null };
  }
  if (event.offer_kind === 'live' && event.status === 'published' && event.starts_at && now >= Date.parse(event.starts_at)) {
    const [video] = (await rest(sb, `webinar_events?source_event_id=eq.${event.id}&status=eq.published&select=slug`, {}, 'SELECT webinar_events (Video kelas)')) || [];
    return { videoSlug: video?.slug ?? null };
  }
  return {};
}

function benefitIcon(label) {
  const low = String(label || '').toLowerCase();
  if (low.includes('zoom') || low.includes('live')) return ICONS.video;
  if (low.includes('slide') || low.includes('ppt') || low.includes('materi')) return ICONS.fileText;
  if (low.includes('rekaman') || low.includes('video')) return ICONS.play;
  if (low.includes('sertifikat')) return ICONS.award;
  return ICONS.check;
}

const benefitsList = (benefits) => `<ul class="benefits">${benefits.map((b) => `<li><span class="benefit-ico">${benefitIcon(b)}</span><span>${e(b)}</span></li>`).join('')}</ul>`;

const shareButton = () => `<button type="button" class="share-btn" data-share-btn>${ICONS.share}<span data-share-label>Bagikan kelas ini</span></button>`;

function renderDetail(event, { preview, sourceTitle = null, videoSlug = null }) {
  const view = buildEventView(event);
  const description = view.summary || `${view.title} — Kelas JFU | Jakpat for Universities`;
  const canBuy = view.can_buy && !preview;
  const action = canBuy
    ? `<a class="btn" href="${e(view.buy_url)}">${e(view.buy_label)}</a>`
    : (preview && view.can_buy ? '<span class="btn btn-disabled" aria-disabled="true">Tombol beli mati di pratinjau</span>' : '');

  const statusBlock = view.state === 'coming_soon' && view.seconds_until_open != null
    ? `<div class="countdown-box"><p class="note">${e(view.note)}</p><div class="count" data-count></div></div>`
    : (view.note ? `<p class="note">${e(view.note)}</p>` : '');
  const closeBlock = salesCloseBanner(view);

  const speakers = view.speakers.map((s) => `<div class="speaker">
${/^https:\/\//i.test(s?.photo_url || '') ? `<img src="${e(s.photo_url)}" alt="" width="64" height="64" loading="lazy">` : `<div class="ph" aria-hidden="true">${e(initials(s?.name))}</div>`}
<div><div class="speaker-name">${e(s?.name)}</div>${s?.title ? `<div class="speaker-title">${e(s.title)}</div>` : ''}</div></div>`).join('');

  const speakerNames = view.speakers.map((s) => s?.name).filter(Boolean).join(', ');
  const speakerMini = view.speakers.length
    ? `<a class="speaker-mini-row" href="#pembicara"><span class="speaker-mini-avatars" aria-hidden="true">${view.speakers.slice(0, 3).map((s) => (/^https:\/\//i.test(s?.photo_url || '')
      ? `<img src="${e(s.photo_url)}" alt="" width="30" height="30" loading="lazy">`
      : `<span class="ph-sm">${e(initials(s?.name))}</span>`)).join('')}</span><span class="speaker-mini-text">Bersama <strong>${e(speakerNames)}</strong></span></a>`
    : '';

  // Rancangan A2 (3 Nov): di HP info acara ada di bawah judul dan tombol di bar bawah;
  // di desktop info acara + tombol pindah ke kartu kanan yang ikut di-scroll.
  const [dateLine, timeLine] = (view.schedule_label || '').split(' · ');
  // C19 (Fase 5B): Video kelas menyebut durasi rekaman, bukan jam live.
  const replayFacts = view.kind === 'replay'
    ? `<li>${ICONS.play}<span>Video kelas${view.recording_minutes ? ` · ▶ ${Number(view.recording_minutes)} menit` : ''}</span></li>
<li>${ICONS.laptop}<span>Tonton kapan saja di menu Webinar</span></li>`
    : '';
  const desktopFacts = `<ul class="meta">
${dateLine ? `<li>${ICONS.calendar}<span>${e(dateLine)}</span></li>` : ''}${timeLine ? `<li>${ICONS.clock}<span>${e(timeLine)}</span></li>` : ''}
${view.kind === 'live' ? `<li>${ICONS.video}<span>Online via Zoom</span></li>` : ''}${replayFacts}</ul>`;
  const mobileFacts = `<ul class="meta">
${dateLine ? `<li>${ICONS.calendar}<span>${e(dateLine)}</span></li>` : ''}${timeLine ? `<li>${ICONS.clock}<span>${e(timeLine)}</span></li>` : ''}
${view.kind === 'live' ? `<li>${ICONS.video}<span>Online via Zoom</span></li>` : ''}${replayFacts}
${view.seats_label ? `<li>${ICONS.ticket}<span>${e(view.seats_label)}</span></li>` : ''}</ul>`;
  const seatsPill = view.seats_label
    ? `<span class="seats-pill">${ICONS.ticket}<span>${e(view.seats_label)}</span></span>`
    : '';
  // Tiket: rekaman sudah termasuk; sesudah acara mulai, tunjuk Video kelasnya bila ada.
  // Video kelas dari webinar: pemegang tiket webinar itu tidak perlu membeli lagi.
  const liveNote = videoSlug
    ? `<div class="note-box">Rekaman acara ini tersedia sebagai Video kelas. <a href="/webinar/${e(videoSlug)}">Lihat Video kelas →</a></div>`
    : '<div class="note-box">Tidak bisa hadir? Tiket sudah termasuk rekaman.</div>';
  const replayNote = view.kind === 'live'
    ? liveNote
    : (sourceTitle
      ? `<div class="note-box">Sudah ikut webinar “${e(sourceTitle)}”? Rekamannya sudah ada di tiketmu di menu Webinar, tidak perlu membeli lagi.</div>`
      : '');
  const prose = renderBlocks(event.description_blocks);
  const hasBuybar = Boolean(action || view.note);

  const body = `${navbar()}<main id="konten-utama">
${preview ? '<div class="preview">Pratinjau — belum tentu terlihat publik</div>' : ''}
<div class="back-row"><a class="back-link" href="/webinar">${ICONS.arrowLeft}<span>Semua Kelas JFU</span></a></div>
<div class="layout">
<article class="card editorial-card">
<div class="editorial-media">${posterTag(view)}</div>
<div class="content"><div class="only-sm" style="margin-bottom:8px">${badge(view)}</div><h1>${e(view.title)}</h1>
${view.summary ? `<p class="detail-summary">${e(view.summary)}</p>` : ''}
${speakerMini}
<div class="only-sm mobile-facts">${mobileFacts}${closeBlock}${statusBlock}<div class="buy-divider"></div><p class="buy-subhead">Yang kamu dapat</p>${benefitsList(view.benefits)}${shareButton()}</div>
${prose ? `<div class="content-section"><h2>Tentang kelas ini</h2><div class="prose">${prose}</div></div>` : ''}
${speakers ? `<div class="content-section" id="pembicara"><h2>Pembicara</h2><div class="speakers-list">${speakers}</div></div>` : ''}
${replayNote ? `<div class="only-sm" style="margin-top:20px">${replayNote}</div>` : ''}
<p class="contact-note">Ada kendala? Hubungi admin di <a href="mailto:${ADMIN_CONTACT}">${ADMIN_CONTACT}</a>.</p></div></article>
<aside class="side card buy only-lg"><div class="stack"><div class="buy-top">${badge(view)}${seatsPill}</div>${priceBlock(view)}${closeBlock}<div class="buy-divider"></div>${desktopFacts}${statusBlock}${inAppNotice()}${action}<div class="buy-divider"></div><h2 class="buy-subhead">Yang kamu dapat</h2>${benefitsList(view.benefits)}${replayNote}${shareButton()}</div></aside></div></main>
${footer()}
${hasBuybar ? `<div class="buybar">${inAppNotice()}${action
    ? `<div class="buy-row">${view.price_label ? `<span class="buy-row-price">${e(view.price_label)}</span>` : ''}${action}</div>`
    : `<p class="note" style="text-align:center">${e(view.note)}</p>`}</div>` : ''}`;

  return page({
    title: `${view.title} | Kelas JFU — Jakpat for Universities`,
    description,
    image: /^https:\/\//i.test(view.poster_url || '') ? view.poster_url : null,
    canonicalPath: `/webinar/${view.slug}`,
    bodyClass: hasBuybar ? 'has-buybar' : '',
    noindex: preview || event.is_test || event.status !== 'published',
    body,
    scripts: [
      UI_SCRIPT,
      INAPP_SCRIPT,
      ...(view.state === 'coming_soon' && view.seconds_until_open != null
        ? [countdownScript(view.seconds_until_open, { reloadKey: `webinar-open-${view.slug}` })]
        : []),
      ...(view.state === 'on_sale' && view.seconds_until_close != null
        ? [countdownScript(view.seconds_until_close, { reloadKey: `webinar-close-${view.slug}`, selector: '[data-count-close]' })]
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
    body: `<main class="simple"><div class="card"><a class="logo" href="${HOME_URL}"><img src="${NAV_LOGO_SRC}" alt="" class="logo-image" width="28" height="28"><span>Jakpat for Universities</span></a>${inner}
<p class="foot">Ada kendala? <a href="mailto:${ADMIN_CONTACT}">${ADMIN_CONTACT}</a></p></div></main>`,
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
  title: 'Halaman tidak ditemukan | Kelas JFU — Jakpat for Universities',
  description: 'Halaman tidak ditemukan',
  canonicalPath: '/webinar',
  noindex: true,
  body: `${navbar()}<main id="konten-utama"><div class="card state-card"><div class="state-icon">${ICONS.calendarLg}</div><h1>Halaman tidak ditemukan</h1>
<p class="note">Tautan Kelas JFU yang kamu buka mungkin sudah berubah atau tidak tersedia lagi.</p>
<a class="btn btn-soft" href="/webinar">Lihat Kelas JFU lainnya</a></div></main>${footer()}`,
  scripts: [UI_SCRIPT],
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

// Halaman bertombol beli diberi prefetch JS/CSS SPA — lihat _spa-assets.js.
export async function onRequest(context) {
  const response = await handleWebinar(context);
  try {
    return await withSpaPrefetch(response, context.env, context.request);
  } catch {
    return response;
  }
}

async function handleWebinar({ request, env, params }) {
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
        title: 'Kelas JFU | Jakpat for Universities',
        description: 'Belajar riset langsung dari praktisinya lewat Kelas JFU — sesi live dan video kelas dari Jakpat for Universities.',
        image: listing.hero?.poster_url && /^https:\/\//i.test(listing.hero.poster_url) ? listing.hero.poster_url : null,
        canonicalPath: '/webinar',
        body: `${navbar({ isListing: true })}<main id="konten-utama">${renderListing(listing)}</main>${footer()}`,
        scripts: [
          UI_SCRIPT,
          INAPP_SCRIPT,
          ...(listing.hero?.state === 'on_sale' && listing.hero?.seconds_until_close != null
            ? [countdownScript(listing.hero.seconds_until_close, { reloadKey: `webinar-close-${listing.hero.slug}`, selector: '[data-count-close]' })]
            : []),
        ],
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
    return html(renderDetail(event, { preview, ...(await loadLinks(sb, event)) }));
  } catch (err) {
    console.error('[webinar page]', err);
    return html(page({
      title: 'Kelas JFU | Jakpat for Universities',
      description: 'Kelas JFU — Jakpat for Universities',
      canonicalPath: '/webinar',
      noindex: true,
      body: `${navbar()}<main id="konten-utama"><div class="card state-card"><div class="state-icon">${ICONS.alert}</div><h1>Halaman belum bisa dimuat</h1><p class="note">Coba muat ulang beberapa saat lagi.</p><a class="btn btn-soft" href="/webinar">Muat ulang</a></div></main>${footer()}`,
      scripts: [UI_SCRIPT],
    }), 503);
  }
}
