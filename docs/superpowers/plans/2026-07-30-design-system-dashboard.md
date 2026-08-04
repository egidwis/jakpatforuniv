# Design-System Dashboard JFU — Implementation Plan (struktur Relate, nilai JFU)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> ## ⬜ BELUM DIEKSEKUSI — masih berlaku penuh
> Ditulis 2026-07-30, belum satu task pun dijalankan. **Bersinggungan dengan
> Phase 3**: keduanya menyentuh dashboard dan keduanya akan hidup di branch
> `feat/dashboard-soft-dna-navbar`. Baca "Hubungan dengan rencana lain" di
> [`README.md`](README.md) sebelum mengeksekusi salah satunya.

**Goal:** Mengganti resep "Soft DNA" yang di-copy-paste manual dengan design-token system terpusat (struktur mengikuti referensi "Relate" di DESIGN.md, nilai warna tetap brand JFU), sekaligus membereskan akar masalah cascade `styles.css` legacy.

**Architecture:** Entry CSS dipecah tiga (`base.css` berisi `@tailwind base` + var shadcn untuk admin; `tokens.css` berisi custom properties `--jfu-*`; `utilities.css` berisi `@tailwind components/utilities` yang di-import PALING AKHIR di `main.tsx` sehingga utility Tailwind selalu menang cascade). Token dipetakan ke Tailwind lewat `theme.extend` (warna semantik, type scale ber-tracking negatif, radius 2-tier, shadow). Primitives (`Button`/`Chip`/`Card`) jadi satu-satunya sumber recipe; komponen dashboard & publik di-sweep dari hex hardcoded ke token.

**Tech Stack:** Vite + React 18 + Tailwind v3 + cva/tailwind-merge (sudah terpasang) + @fontsource.

## Global Constraints

- Warna brand TETAP `#1976D2` / `#42A5F5` / `#1565C0` — BUKAN `#145aff` milik Relate. Keputusan user final.
- Font seluruh React app → **Inter** 400/500/600 self-hosted via @fontsource. Landing page statis (`public/homepage/`) TIDAK disentuh — tetap Plus Jakarta Sans; drift ini disadari & diterima user.
- **Retheme, bukan redesign**: layout/density dashboard v4 (kartu order besar, mobile-first) dan CTA primer filled-gradient pill DIPERTAHANKAN. Ghost-outline pill hanya jadi varian sekunder BARU.
- Admin (`/internal-dash`) TIDAK di-restyle — hanya boleh berubah lewat efek samping yang disebut eksplisit di plan ini (var shadcn jadi valid, primitives di-theme), dan wajib smoke-test.
- Semua copy (i18n `translations.ts`) tidak berubah.
- Semua path relatif ke `multi-step-form/` kecuali ditulis penuh.
- Setiap task diakhiri commit sendiri; app harus tetap bisa `npm run build` hijau di setiap commit.
- Setelah seluruh task selesai: `python -m graphify update .` (pakai `.venv/bin/python` — aturan CLAUDE.md project).

---

## Context (kenapa perubahan ini)

Eksplorasi 2026-07-30 menemukan:

1. **"Soft DNA" bukan sistem.** Nilai visual landing page (kartu putih, border `rgba(25,118,210,0.06–0.12)`, shadow `0 8px 32px rgba(0,0,0,0.06)`, radius 20px) diketik ulang di tiap call site. Yang terkodifikasi di `tailwind.config.js` cuma `colors.jfu` (5 warna) + `shadow-card`/`shadow-glow`.
2. **Hex tersebar inline**: 35× `text-[#1a1a1a]`, 10× `[#666]`, 1× `[#888]`/`[#555]`/`[#444]`/`[#3c4043]`; inline `style={{borderRadius:'20px'}}` di `StatusPage.tsx:327,420,455` dengan komentar "borderRadius inline karena .rounded-lg legacy styles.css menang di cascade".
3. **EMPAT palet status duplikat**: `src/lib/status-tokens.ts` (admin), `src/utils/extend-ui.ts:5-15` (`EXTEND_STATUS_STYLES`), `src/components/ui/chip.tsx:13-21` (varian Chip), dan inline di `ReviewPhase.tsx:34-58` (`getReviewChip` — rose/gray/emerald, melewati Chip).
4. **Recipe CTA di-copy-paste 3×**: `ctaRoyal`+`ctaButtonClass` di `ReviewPhase.tsx:26-27`, `SchedulePhase.tsx:209-212` (+`ctaSoftRose`/`ctaSoftAmber`), dan inline di `GoogleDriveImportSimple.tsx:439`.
5. **Akar cascade**: `@tailwind base/components/utilities` hidup di `src/components/InternalDashboard.css:1-4` (stylesheet admin!), ditarik via `App.tsx:7 → InternalDashboard.tsx:27`. `App.tsx:27` meng-import `./styles.css` (3.118 baris legacy) SETELAHNYA → blok redefinisi utility `styles.css:760-1009` (`.flex`, `.grid{gap:1.5rem}`, `.rounded-lg{var(--radius)}`, dst. — ~50 nama) menang cascade atas Tailwind. Sudah ada ≥8 file dengan workaround defensif.
6. **Tiga blok `:root` bersaing**: `InternalDashboard.css:6-53` (shadcn HSL triple, format `222.2 47.4% 11.2%`), `styles.css:27-42` (nama var SAMA tapi format hex — load belakangan → menang → `hsl(#000000)` invalid → property di-drop di admin), `styles.css:44-56` (dark theme, mati — `App.tsx:134-138` force-light).
7. **Font terbelah**: `/dashboard` pakai Plus Jakarta Sans (@fontsource, `main.tsx:7-11`, dipakai HANYA di `DashboardLayout.tsx` via `font-jakarta`); sisanya Inter dari CDN Google Fonts (`index.html:9-11`) + `body` rule `styles.css:71`.

Keputusan desain diambil bersama user (lihat Global Constraints). Referensi struktur token: dokumen DESIGN.md "Relate — Style Reference" (disimpan user; ringkasan peran token ada di Task 2).

---

### Task 1: Restrukturisasi entry CSS — flip cascade

Ini perubahan paling load-bearing: Vite meng-emit CSS sesuai urutan module graph, jadi urutan import di `main.tsx` ADALAH cascade-nya.

**Files:**
- Create: `src/styles/base.css`
- Create: `src/styles/utilities.css`
- Modify: `src/components/InternalDashboard.css` (hapus baris 1-54: direktif `@tailwind` + blok `@layer base` shadcn)
- Modify: `src/main.tsx` (urutan import)
- Modify: `src/App.tsx:27` (hapus `import './styles.css';`)

**Interfaces:**
- Produces: `styles/base.css` (satu-satunya `@tailwind base` + satu-satunya definisi `--background/--foreground/--primary/…/--radius` format HSL); `styles/utilities.css` (satu-satunya `@tailwind components` + `@tailwind utilities`, selalu terakhir di bundle). Task 3 bergantung pada urutan ini; Task 2 menambah `tokens.css` di antara keduanya.

- [ ] **Step 1: Buat `src/styles/base.css`**

Isi: `@tailwind base;` lalu blok `@layer base` dipindah **verbatim** dari `InternalDashboard.css:6-53` (blok `:root, [data-radix-portal] { --background: 0 0% 100%; … --radius: 0.5rem; }` dan blok `.dark, [data-theme="dark"] { … }`). Penting: `@layer base` HARUS sefile dengan `@tailwind base` — Tailwind v3 error kalau `@layer` yatim.

```css
/* Entry Tailwind base + variabel shadcn (dipakai admin /internal-dash).
   HARUS di-import PERTAMA di main.tsx — lihat urutan cascade di sana. */
@tailwind base;

@layer base {
  :root,
  [data-radix-portal] {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

  .dark,
  [data-theme="dark"] {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
}
```

(Blok dark dipertahankan verbatim walau App force-light — inert, dan mencegah beda perilaku kalau force-light suatu saat dicabut.)

- [ ] **Step 2: Buat `src/styles/utilities.css`**

```css
/* Utility Tailwind. HARUS di-import TERAKHIR di main.tsx (setelah App.tsx)
   supaya menang cascade atas styles.css legacy & CSS komponen mana pun.
   Jangan pernah menambah rule lain di file ini. */
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 3: Pangkas `src/components/InternalDashboard.css`**

Hapus baris 1-54 (komentar header, 3 direktif `@tailwind`, seluruh blok `@layer base`). File sekarang mulai dari komentar `/* Global styles for Radix UI portals … */`. Sisanya (portal hacks `!important`, `[data-radix-portal]` dst.) TIDAK diubah dan tetap di-import oleh `InternalDashboard.tsx`.

Cek tidak ada `@layer` yatim tersisa: `grep -n "@layer" src/components/InternalDashboard.css` → harus 0 hasil.

- [ ] **Step 4: Rewire `src/main.tsx`**

```tsx
// Import patch URL terlebih dahulu sebelum komponen lain
import './utils/axios-patch'

import { createRoot } from 'react-dom/client'
// Font DNA JFU (Plus Jakarta Sans, sama dengan landing page) — self-hosted
// via @fontsource (tanpa CDN), dimuat sebelum CSS agar @font-face tersedia.
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import '@fontsource/plus-jakarta-sans/800.css'
// ===== URUTAN CSS = CASCADE (Vite emit sesuai module graph) =====
import './styles/base.css'      // 1. @tailwind base + var shadcn (admin)
import './index.css'            // 2. keyframes
import './styles.css'           // 3. legacy — pindahan dari App.tsx
import App from './App.tsx'     // 4. CSS komponen (InternalDashboard.css, dll.)
import './styles/utilities.css' // 5. @tailwind components+utilities — TERAKHIR, menang
import { LanguageProvider } from './i18n/LanguageContext'

// Hapus StrictMode untuk menghindari double rendering
createRoot(document.getElementById('root')!).render(
  <LanguageProvider>
    <App />
  </LanguageProvider>
)
```

(Font Jakarta masih di sini — diganti Inter di Task 4, bukan sekarang; satu perubahan berisiko per commit.)

- [ ] **Step 5: Hapus `import './styles.css';` dari `src/App.tsx:27`**

- [ ] **Step 6: Verifikasi build & cascade**

```bash
cd multi-step-form && npm run build
grep -rn "@tailwind" src/
```
Expected: build hijau; `@tailwind` hanya di `src/styles/base.css` (1×) dan `src/styles/utilities.css` (2×). Lalu di CSS hasil build (`dist/assets/index-*.css`): posisi byte `.hidden{display:none}` harus SETELAH `.flex{display:flex}` versi legacy — cek cepat:
```bash
CSSFILE=$(ls dist/assets/index-*.css); python3 -c "
import sys; css=open('$CSSFILE').read()
print('legacy .flex at', css.find('.flex{display:flex}'))
print('last .hidden at', css.rfind('.hidden{display:none}'))"
```
Expected: index `.hidden` terakhir > index `.flex` legacy.

- [ ] **Step 7: Smoke visual cepat**

`npm run dev` → buka `/dashboard` (kartu order tampak normal), `/login`, `/internal-dash` (warna admin BELUM berubah di task ini — blok hex `styles.css:27-42` masih hidup dan masih menimpa; itu urusan Task 3). Yang boleh berubah halus: elemen yang dulu kena override legacy (mis. `hidden md:flex` kini benar tersembunyi di mobile).

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "refactor(css): pindah @tailwind ke entry sendiri, utilities di akhir cascade"
```

---

### Task 2: Token layer (`tokens.css`) + pemetaan `tailwind.config.js`

**Files:**
- Create: `src/styles/tokens.css`
- Modify: `src/main.tsx` (sisipkan import tokens.css setelah base.css)
- Modify: `tailwind.config.js` (tulis ulang penuh — isi final di bawah)

**Interfaces:**
- Produces (dipakai Task 3-7): class Tailwind `text-ink`, `text-graphite`, `text-caption`, `text-helper`, `border-divider`, `bg-canvas`, `bg-wash`, `bg-fog`, `text-success|warning|danger`, `rounded-card`, `shadow-nav`, `shadow-feature`, `text-subheading|heading-sm|heading|heading-lg`, `container` (teremulasi); CSS vars `--jfu-*` untuk konsumen non-Tailwind (styles.css legacy).

- [ ] **Step 1: Buat `src/styles/tokens.css`**

```css
/* Design tokens JFU — struktur mengikuti DESIGN.md "Relate", nilai milik JFU.
   Namespace --jfu-* agar tidak mungkin tabrakan dengan var shadcn di base.css.
   Konsumen: theme.extend di tailwind.config.js + rule legacy di styles.css. */
:root {
  /* Surfaces */
  --jfu-canvas: #fdfdf8;   /* latar halaman — warm off-white brand (= jfu.bg lama) */
  --jfu-wash: #f0f6fd;     /* surface tint biru muda (peran "Lavender Wash") */
  --jfu-fog: #f8fafc;      /* surface abu netral (= legacy --card) */

  /* Teks */
  --jfu-ink: #1a1a1a;      /* heading (menggantikan 35x text-[#1a1a1a]) */
  --jfu-graphite: #374151; /* body text (menggantikan [#444]/[#555]) */
  --jfu-caption: #6b7280;  /* teks sekunder (menggantikan 10x [#666]) */
  --jfu-helper: #9ca3af;   /* teks tersier/hint (menggantikan [#888]) */
  --jfu-divider: #e5e7eb;  /* hairline border */

  /* Brand */
  --jfu-accent: #1976D2;
  --jfu-accent-light: #42A5F5;
  --jfu-accent-dark: #1565C0;

  /* Status */
  --jfu-success: #16a34a;
  --jfu-warning: #d97706;
  --jfu-danger: #dc2626;

  /* Radius 2-tier */
  --jfu-radius-inner: 0.5rem;  /* 8px — kartu dalam */
  --jfu-radius-outer: 1.25rem; /* 20px — shell kartu luar (Soft DNA) */
}
```

- [ ] **Step 2: Sisipkan di `src/main.tsx`** — `import './styles/tokens.css'` tepat SETELAH `import './styles/base.css'`.

- [ ] **Step 3: Tulis ulang `tailwind.config.js` (isi final penuh)**

```js
/** @type {import('tailwindcss').Config} */
import defaultTheme from 'tailwindcss/defaultTheme'

export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    // Emulasi geometri .container legacy (styles.css:288-310) yang dihapus di Task 3.
    container: {
      center: true,
      padding: { DEFAULT: '1rem', md: '2rem', lg: '3rem' },
      screens: { sm: '640px', md: '768px', lg: '1024px', xl: '1200px', '2xl': '1200px' },
    },
    extend: {
      fontFamily: {
        // Diganti ke Inter di Task 4; sementara masih Jakarta agar task ini visual-noop.
        jakarta: ['"Plus Jakarta Sans"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      boxShadow: {
        card: '0 8px 32px rgba(0,0,0,0.06)',
        glow: '0 8px 25px rgba(25,118,210,0.3)',
        nav: '0 4px 20px rgba(25,118,210,0.08)',
        feature: '0 1px 2px rgba(16,24,40,0.04), 0 4px 12px rgba(16,24,40,0.05), 0 12px 32px rgba(16,24,40,0.07)',
      },
      borderRadius: {
        // Nilai eksplisit — mencabut indireksi shadcn var(--radius) TANPA menggeser
        // hasil render: lg tetap 8px, md 6px, sm dipatok 4px (nilai computed lama
        // calc(0.5rem - 4px); stock Tailwind sm=2px akan menggeser 11 pemakaian admin).
        sm: '0.25rem',
        md: '0.375rem',
        lg: '0.5rem',
        card: 'var(--jfu-radius-outer)', // 20px — shell Soft DNA, ganti inline borderRadius
      },
      colors: {
        // jfu.* SENGAJA hex literal, bukan var(): modifier alpha (bg-jfu-primary/[0.08],
        // border-jfu-primary/20) butuh channel — var() opaque tidak bisa.
        jfu: {
          primary: '#1976D2',
          light: '#42A5F5',
          dark: '#1565C0',
          sky: '#0091ff',
          bg: '#fdfdf8',
        },
        // Warna semantik — TIDAK mendukung modifier /opacity (nilainya var()).
        // Butuh alpha? pakai jfu.* atau skala stock Tailwind.
        canvas: 'var(--jfu-canvas)',
        wash: 'var(--jfu-wash)',
        fog: 'var(--jfu-fog)',
        ink: 'var(--jfu-ink)',
        graphite: 'var(--jfu-graphite)',
        caption: 'var(--jfu-caption)',
        helper: 'var(--jfu-helper)',
        divider: 'var(--jfu-divider)',
        success: 'var(--jfu-success)',
        warning: 'var(--jfu-warning)',
        danger: 'var(--jfu-danger)',
        // Plumbing shadcn — dipakai admin, JANGAN dihapus.
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      fontSize: {
        // Type scale heading ber-tracking negatif (DNA Relate, skala dashboard —
        // bukan 56-80px milik landing). caption/body pakai stock text-xs/sm/base.
        // Nama sengaja tidak bentrok dengan nama warna (text-caption = warna!).
        subheading: ['1.25rem', { lineHeight: '1.4', letterSpacing: '-0.01em' }],
        'heading-sm': ['1.375rem', { lineHeight: '1.3', letterSpacing: '-0.015em' }],
        heading: ['1.75rem', { lineHeight: '1.25', letterSpacing: '-0.02em' }],
        'heading-lg': ['2rem', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'smooth-step-in': {
          '0%': { opacity: '0', transform: 'translateY(8px) scale(0.995)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'slide-left-in': {
          '0%': { opacity: '0', transform: 'translateX(24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-right-in': {
          '0%': { opacity: '0', transform: 'translateX(-24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
        'smooth-step-in': 'smooth-step-in 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-left-in': 'slide-left-in 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-right-in': 'slide-right-in 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}
```

Catatan penting yang sudah dipikirkan — jangan "dirapikan" balik:
- `fontSize` TIDAK memuat key `caption`/`body` karena `colors` sudah punya `caption` — kalau dua-duanya ada, `text-caption` ambigu (Tailwind bisa emit dua rule). Heading-only itu disengaja.
- `borderRadius.sm` dipatok `0.25rem` (bukan stock 2px) — mempertahankan hasil render 11 pemakaian `rounded-sm` admin yang selama ini resolve `calc(var(--radius) - 4px)` = 4px.
- `container.screens` di-cap 1200px meniru `.container` legacy; `.container` legacy baru dihapus di Task 3 (di task ini Tailwind `container` sudah menang cascade karena `@tailwind components` ada di `utilities.css`).

- [ ] **Step 4: Verifikasi**

```bash
cd multi-step-form && npm run typecheck && npm run build
```
Expected: hijau. Smoke `/dashboard` + `/internal-dash`: `rounded-sm`/`rounded-lg` admin tidak bergeser (bandingkan sudut tombol/kartu dengan sebelum task).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(tokens): layer token --jfu-* + pemetaan semantik tailwind (warna, radius 2-tier, type scale, shadow)"
```

---

### Task 3: Pangkas `styles.css` legacy — hapus redefinisi utility, rekonsiliasi `:root`, `.container`

**Files:**
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `--jfu-*` dari Task 2; urutan cascade dari Task 1.
- Produces: `styles.css` tanpa satu pun redefinisi nama utility Tailwind dan tanpa var bernama shadcn — sehingga semua workaround defensif bisa dicabut di Task 6/8. **Efek samping yang disengaja: warna admin berubah** (var shadcn jadi valid — `bg-primary` jadi navy, `text-muted-foreground` jadi slate benar; sebelumnya `hsl(#hex)` invalid → property di-drop).

- [ ] **Step 1: Audit pemakai legacy sebelum menghapus**

Blok `styles.css:760-1009` mayoritas menyalin nilai Tailwind persis (mt-*, mb-*, py-*, px-*, gap-*, font-*, text-align — aman dihapus). Delta yang BEDA nilai dan butuh audit:

| Rule legacy | Delta vs Tailwind | Mitigasi |
|---|---|---|
| `.grid { gap: 1.5rem }` (762) | Tailwind `.grid` tanpa gap | Cari `className` mengandung `grid` TANPA class `gap-*` di file legacy-styled, tambah `gap-6` eksplisit |
| `.text-gray-600 { color: var(--muted) }` (937) | var(--muted) `#64748b` vs stock `#4b5563` | Terima (jadi sedikit lebih gelap = lebih terbaca) |
| `.bg-gray-50 { var(--card) #f8fafc }` (925) | stock `#f9fafb` | Delta tak kasat mata — terima |
| `.border-t { 1px solid var(--border) }` (873) | stock hanya set width; warna dari `border-gray-200` dsb. | Cek pemakaian `border-t` tanpa class `border-<warna>` di file legacy-styled; delta warna `#e2e8f0`→`#e5e7eb` tak kasat mata |
| `.rounded-lg { var(--radius) }` (921) | = 8px, sama dengan config baru | Aman |
| `.text-green-600 { var(--success) #22c55e }` (941) | stock `#16a34a` | Terima (lebih standar) |

Perintah audit (jalankan, tindaklanjuti barisnya):
```bash
cd multi-step-form
# file yang bergantung styling legacy:
grep -rl "manual-flow-container\|modal-overlay\|google-form-flow\|form-section\|floating-label\|section-card" src --include="*.tsx"
# di file-file hasil di atas: grid tanpa gap?
grep -n 'className="[^"]*grid' <file> | grep -v 'gap-'
```

- [ ] **Step 2: Hapus blok redefinisi utility `styles.css` baris 760-1009**

Dari komentar `/* Grid and Responsive Utilities */` (760) sampai `.min-h-screen { … }` (1007-1009) **inklusif** — termasuk duplikat `@keyframes spin` (997-1005; Tailwind emit sendiri untuk `animate-spin`). **JANGAN hapus** blok `@media (max-width: 767px) { .sidebar .space-y-2 { display:none } }` (1013-1018) — itu selector legacy yang menumpang nama utility, bukan redefinisi.

- [ ] **Step 3: Hapus dua blok `:root` di `styles.css`**

Hapus baris 27-42 (`:root { --primary: #000000; … --card-foreground }`) dan 44-56 (`[data-theme="dark"] { … }`). (Dark mati: `App.tsx:134-138` force-light.)

- [ ] **Step 4: Repoint semua `var()` sisa di `styles.css` ke `--jfu-*`**

Mechanical replace di seluruh file (≈196 referensi):

| Lama | Baru | Catatan |
|---|---|---|
| `var(--border)` | `var(--jfu-divider)` | |
| `var(--card-foreground)` | `var(--jfu-ink)` | |
| `var(--card)` | `var(--jfu-fog)` | ganti SETELAH `--card-foreground` (substring!) |
| `var(--muted-foreground)` | `var(--jfu-helper)` | |
| `var(--muted)` | `var(--jfu-caption)` | ganti SETELAH `--muted-foreground` |
| `var(--foreground)` | `var(--jfu-ink)` | |
| `var(--background)` | `var(--jfu-canvas)` | halaman publik: putih → warm off-white brand — retheme disengaja |
| `var(--input)` | `#ffffff` | |
| `var(--ring)` | `var(--jfu-accent)` | |
| `var(--success)` | `var(--jfu-success)` | |
| `var(--error)` | `var(--jfu-danger)` | |
| `var(--radius)` | `var(--jfu-radius-inner)` | |
| `var(--primary-hover)` | `var(--jfu-accent-dark)` | ganti SEBELUM `--primary` |
| `var(--primary)` | `var(--jfu-accent)` | **retheme disengaja**: `.button-primary` legacy hitam → biru brand (untung untuk Group B) |

Urutan replace penting (substring): `--card-foreground` sebelum `--card`; `--muted-foreground` sebelum `--muted`; `--primary-hover` sebelum `--primary`.

- [ ] **Step 5: Hapus rule `.container` legacy (`styles.css:287-310`, semua media query-nya)**

Geometrinya sudah diemulasi `theme.container` di Task 2 (max-width 1200, center, padding 1rem/2rem/3rem). `App.tsx` PublicLayout (`className="container py-8"`, baris 65 & 69) TIDAK perlu diubah — `center: true` menggantikan `margin: 0 auto`.

- [ ] **Step 6: Verifikasi**

```bash
cd multi-step-form && npm run build
grep -n "var(--radius)\|var(--border)\|var(--card)\|var(--muted)\|var(--primary)\|var(--foreground)\|var(--background)" src/styles.css
grep -n "^\.flex \|^\.flex{\|^\.grid \|^\.grid{\|^\.rounded-lg\|^\.text-sm\|^\.min-h-screen\|^\.animate-spin" src/styles.css
```
Expected: build hijau; kedua grep → 0 hasil.

Smoke visual (paling teliti di task ini):
- `/internal-dash` — **warna BERUBAH DISENGAJA**: tombol `bg-primary` jadi navy shadcn, teks muted jadi slate. Cek: tabel submissions + chip, detail sheet (portal Radix — hack `!important` InternalDashboard.css), dropdown, dialog, transactions, customers. Kalau ada yang tampak rusak (bukan sekadar beda warna), berhenti dan laporkan.
- `/login`, `/payment-success`, `/pages` — lebar konten ≈1200px center, footer normal, form legacy (`.form-*`, `.button-primary` kini biru) tidak berantakan; latar halaman kini `#fdfdf8`.
- `/dashboard/submit-iklan` — StepSurveyDetails (modal manual-flow) & grid-nya: pastikan tidak ada grid kehilangan gap (hasil audit Step 1).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "refactor(css)!: hapus redefinisi utility & :root hex legacy, repoint styles.css ke token --jfu-*"
```

---

### Task 4: Font Inter untuk seluruh app

**Files:**
- Modify: `package.json` (deps)
- Modify: `src/main.tsx` (import font)
- Modify: `index.html` (hapus CDN)
- Modify: `tailwind.config.js` (fontFamily)
- Modify: `src/components/DashboardLayout.tsx` (hapus `font-jakarta`)
- Modify: `src/styles.css` (body font-family)

- [ ] **Step 1: Tukar dependency**

```bash
cd multi-step-form && npm uninstall @fontsource/plus-jakarta-sans && npm install @fontsource/inter
```

- [ ] **Step 2: Tukar import font di `src/main.tsx`**

Ganti 5 baris `@fontsource/plus-jakarta-sans/*` dengan:
```tsx
// Inter — self-hosted via @fontsource (Relate: 400/500/600 saja; tanpa CDN).
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css' // dipakai font-bold di beberapa heading/CTA lama
```
(700 disertakan karena kode existing memakai `font-bold`; kalau grep `font-bold\|font-extrabold` di src menunjukkan nol pemakaian di luar admin, boleh drop.)

- [ ] **Step 3: Hapus CDN Google Fonts di `index.html`** — hapus baris 9-11 (`preconnect fonts.googleapis`, `preconnect fonts.gstatic`, `<link href="https://fonts.googleapis.com/css2?family=Inter…">`). Preconnect Google APIs (baris 14-17) TETAP.

- [ ] **Step 4: `tailwind.config.js`** — ganti blok `fontFamily`:

```js
fontFamily: {
  sans: ['Inter', ...defaultTheme.fontFamily.sans],
},
```
(Hapus key `jakarta`. Preflight menset `font-family` di `html` dari `fontFamily.sans` → seluruh app mewarisi Inter tanpa class.)

- [ ] **Step 5: `DashboardLayout.tsx`** — hapus token `font-jakarta` dari className root (satu-satunya pemakai; grep `font-jakarta` untuk memastikan).

- [ ] **Step 6: `src/styles.css` body rule (~baris setelah pemangkasan, dulu :71)** — hapus baris `font-family: 'Inter', …;` dari rule `body` (biarkan preflight yang menentukan; menghindari dua sumber kebenaran).

- [ ] **Step 7: Verifikasi**

```bash
cd multi-step-form
grep -rn "plus-jakarta\|font-jakarta" src index.html package.json   # expected: 0
grep -n "fonts.googleapis" index.html                                # expected: 0
npm run build
```
Smoke: `/dashboard` & `/login` render Inter (cek devtools computed font); tidak ada FOUT aneh.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(font): Inter self-hosted untuk seluruh app, cabut Jakarta Sans & CDN"
```

---

### Task 5: Primitives — Button `royal`/`royalOutline`, Chip single-source, Card 2-tier

**Files:**
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/chip.tsx`
- Modify: `src/components/ui/card.tsx`
- Modify: `src/utils/extend-ui.ts`

**Interfaces:**
- Consumes: token Task 2 (`rounded-card`, `border-divider`, warna `jfu.*`).
- Produces (dipakai Task 6-7):
  - `Button` varian baru `royal` & `royalOutline`, size baru `cta` (varian shadcn lama TIDAK berubah — admin memakainya).
  - `chip.tsx` meng-export `CHIP_TINT: Record<ChipVariant, { bg: string; border: string; text: string; dot: string }>`.
  - `extendStatusStyle(status)` tetap mengembalikan `{ bg, text, dot }` dengan shape lama (konsumen `PublicationPhase`/`SchedulePhase` tidak perlu berubah).
  - `Card` menerima prop `tier?: 'default' | 'outer' | 'inner'`.

- [ ] **Step 1: `button.tsx` — tambah varian & size (varian lama utuh)**

Di object `variants.variant` tambah:
```ts
royal:
  "rounded-full font-semibold text-white bg-gradient-to-br from-jfu-primary to-jfu-light shadow-glow hover:-translate-y-0.5 hover:from-jfu-primary hover:to-jfu-light transition-all",
royalOutline:
  "rounded-full font-semibold border-[1.5px] border-jfu-primary/30 bg-white text-jfu-primary hover:bg-jfu-primary/[0.04] hover:border-jfu-primary/60 transition-colors",
```
Di `variants.size` tambah:
```ts
cta: "min-h-11 md:min-h-9 px-4 py-2 justify-center",
```
(String `royal` diangkat verbatim dari `ReviewPhase.tsx:27` — hasil visual CTA tidak berubah. `whitespace-nowrap` sudah ada di base cva. `max-md:w-full` tetap urusan call site.)

- [ ] **Step 2: `chip.tsx` — export `CHIP_TINT`** (tambahkan di bawah `chipVariants`):

```ts
/** Tint per-varian untuk konsumsi di LUAR komponen Chip (baris status,
 * airing bar, extension rows) supaya seluruh app membaca SATU palet.
 * Selaras dengan chipVariants di atas — ubah keduanya bersama. */
export const CHIP_TINT: Record<ChipVariant, { bg: string; border: string; text: string; dot: string }> = {
  blue:   { bg: "bg-jfu-primary/[0.08]", border: "border-jfu-primary/20", text: "text-jfu-primary", dot: "bg-jfu-primary" },
  amber:  { bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-700",  dot: "bg-amber-500" },
  green:  { bg: "bg-green-50",  border: "border-green-200",  text: "text-green-700",  dot: "bg-green-500" },
  red:    { bg: "bg-red-50",    border: "border-red-200",    text: "text-red-600",    dot: "bg-red-400" },
  orange: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", dot: "bg-orange-500" },
  indigo: { bg: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-700", dot: "bg-indigo-500" },
  purple: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", dot: "bg-purple-500" },
  slate:  { bg: "bg-gray-50",   border: "border-gray-200",   text: "text-gray-600",   dot: "bg-gray-400" },
  outline:{ bg: "bg-transparent", border: "border-divider",  text: "text-ink",        dot: "bg-current" },
};
```

- [ ] **Step 3: `extend-ui.ts` — jadikan turunan CHIP_TINT** (ganti seluruh isi `EXTEND_STATUS_STYLES` + `extendStatusStyle`; `STATUS_LABEL_KEYS` & `extendStatusLabelKey` tetap):

```ts
import { CHIP_TINT, type ChipVariant } from '@/components/ui/chip';

// Status extension → varian chip. Satu-satunya pemetaan; tint-nya milik CHIP_TINT.
const EXTEND_STATUS_VARIANT: Record<string, ChipVariant> = {
  in_review: 'slate',
  waiting_payment: 'amber',
  paid: 'blue',
  scheduled: 'purple',
  live: 'green',
  completed: 'slate',
  cancelled: 'red',
  expired: 'red',
};

export function extendStatusStyle(status?: string | null) {
  const variant = EXTEND_STATUS_VARIANT[(status || '').toLowerCase()] || 'purple';
  const tint = CHIP_TINT[variant];
  // Shape lama dipertahankan: bg memuat kelas background + border sekaligus.
  return { bg: `${tint.bg} ${tint.border}`, text: tint.text, dot: tint.dot };
}
```
Delta hue yang diterima: `paid` biru-50 → tint biru brand; `live` green-700→green-700 (sama); `cancelled/expired` text red-600 (sama). Konsumen (`PublicationPhase.tsx`, `SchedulePhase.tsx`, `ExtendSection`) tidak berubah karena shape return sama.

- [ ] **Step 4: `card.tsx` — cva + tier** (ganti komponen `Card` saja; `CardHeader/Title/Description/Content/Footer` tetap):

```tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const cardVariants = cva("border bg-white text-gray-950", {
  variants: {
    tier: {
      // default = shadcn lama, dipakai admin — jangan diubah.
      default: "rounded-lg shadow-sm",
      // Shell Soft DNA (dulu inline borderRadius:'20px' + shadow-card di call site).
      outer: "rounded-card border-jfu-primary/[0.12] shadow-card",
      // Kartu dalam pada shell (radius tier dalam, tanpa bayangan).
      inner: "rounded-lg border-divider shadow-none",
    },
  },
  defaultVariants: { tier: "default" },
})

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof cardVariants>
>(({ className = "", tier, ...props }, ref) => (
  <div ref={ref} className={cn(cardVariants({ tier }), className)} {...props} />
))
Card.displayName = "Card"
```
Catatan: kelas `dark:*` lama dibuang (app force-light, blok dark memang mati). `cn` memakai tailwind-merge → override call-site lama (`shadow-card` dsb.) tetap menang seperti sebelumnya.

- [ ] **Step 5: Verifikasi**

```bash
cd multi-step-form && npm run typecheck && npm run build
```
Smoke: `/internal-dash` — Button/Card admin tak berubah (varian default tak disentuh); `/dashboard` — belum ada perubahan (call site belum pindah).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(ui): Button royal/royalOutline+size cta, CHIP_TINT single-source, Card tier outer/inner"
```

---

### Task 6: Sweep Group A — dashboard user

**Files (modify):**
- `src/pages/dashboard/StatusPage.tsx`, `ChatPage.tsx`, `ProfilePage.tsx`, `KilatPage.tsx`
- `src/pages/PaymentCheckoutPage.tsx`
- `src/components/DashboardLayout.tsx`, `AppNav.tsx`, `PageHeader.tsx`, `CreateOrderCards.tsx`, `AdsFlowCard.tsx`, `MultiStepForm.tsx`, `StepOneMethodSelection.tsx`, `StepOneGoogleForm.tsx`, `StepOneFormFields.tsx`, `StepSurveyDetails.tsx`, `StepSchedule.tsx`, `StepCheckout.tsx`, `GoogleDriveImportSimple.tsx`, `MobileProgressBar.tsx`, `ProgressTracker.tsx`, `ProfileForm.tsx`, `ProfileCompletionSheet.tsx`
- `src/components/status/ReviewPhase.tsx`, `SchedulePhase.tsx`, `PublicationPhase.tsx`, `PhaseRail.tsx`, `InfoTooltip.tsx`

**Interfaces:**
- Consumes: `text-ink|graphite|caption|helper`, `rounded-card`, `shadow-nav`, `Button variant="royal|royalOutline" size="cta"`, `Chip`, `Card tier`.

- [ ] **Step 1: Sweep warna hex → token (mechanical, seluruh file di atas)**

| Cari | Ganti |
|---|---|
| `text-[#1a1a1a]` | `text-ink` |
| `text-[#666]` | `text-caption` |
| `text-[#888]` | `text-helper` |
| `text-[#555]` | `text-graphite` |
| `text-[#444]` | `text-graphite` |

PENGECUALIAN: `[#3c4043]` di `GoogleDriveImportSimple.tsx:257` JANGAN diganti — itu spesifikasi brand tombol Google Sign-In; beri komentar `{/* #3c4043 = spec warna teks tombol Google — bukan token JFU */}`.

- [ ] **Step 2: CTA → Button varian**

- `ReviewPhase.tsx`: hapus const `ctaButtonClass` + `ctaRoyal` (baris 26-27); semua `<Button className={`${ctaRoyal} ${ctaButtonClass}`}>` → `<Button variant="royal" size="cta" className="max-md:w-full">`.
- `SchedulePhase.tsx`: hapus `ctaButtonClass` + `ctaRoyal` (baris 209-210) dengan pola sama (call site-nya `text-xs` — tambah `className="max-md:w-full text-xs"`); `ctaSoftRose`/`ctaSoftAmber` (211-212) TETAP sebagai const lokal (niche, YAGNI), hanya rapikan komentar.
- `GoogleDriveImportSimple.tsx:439`: recipe royal inline → `<Button variant="royal" size="cta">`; CTA amber di :451 tetap bespoke + komentar kenapa.
- Aksi sekunder yang sekarang pakai border ad-hoc (mis. tombol "Ganti metode", link-button di ReviewPhase) → `variant="royalOutline" size="cta"` bila cocok; kalau ragu, biarkan (dicatat di commit message).

- [ ] **Step 3: Radius & shell kartu**

- `StatusPage.tsx:327,420,455`: hapus `style={{ borderRadius: '20px' }}` + komentar "borderRadius inline karena…"; ganti class `rounded-*` yang ada di elemen itu dengan `rounded-card` (atau konversi elemen ke `<Card tier="outer">` bila strukturnya sudah kartu murni — pilih per call site saat diff).
- Kartu-kartu dalam (booking card, cost breakdown, dsb.): pastikan `rounded-lg` (8px) — tier dalam.

- [ ] **Step 4: Cabut workaround cascade (kini aman — Task 1+3 sudah beres)**

- `AppNav.tsx:21-22`: hapus komentar/constraint "node yang di-toggle visibilitasnya per breakpoint harus node polos"; gabungkan kembali `hidden md:flex` bila dulu dipecah — uji toggle di 375px & 1024px.
- `AppNav.tsx:39`: `shadow-[0_4px_20px_rgba(25,118,210,0.08)]` → `shadow-nav`.
- `ReviewPhase.tsx:179-180`: `space-y-1.5` hack → kembalikan ke `grid gap-1.5` sesuai maksud awal (lihat komentar di situ).
- `SchedulePhase.tsx:531-536`: hapus komentar "cascade tak terduga lawan styles.css legacy", pakai kelas tone langsung.

- [ ] **Step 5: Tipografi heading**

- `PageHeader.tsx:10` (judul halaman): → `text-heading-sm font-semibold text-ink`.
- Judul section/kartu di `StatusPage`/`CreateOrderCards`: `text-subheading font-semibold text-ink` bila ukuran lama ±20px; JANGAN mengubah hirarki ukuran yang disengaja beda — hanya normalisasi yang nilainya memang 20/22/28px.
- `getReviewChip` (`ReviewPhase.tsx:34-58`): ganti tiga blok `<span>` inline dengan:

```tsx
import { Chip } from '@/components/ui/chip';
// …
if (step === -1) return <Chip variant="red" size="sm" dot className="shrink-0">{t('reviewChipRejected')}</Chip>;
if (step === 0)  return <Chip variant="slate" size="sm" dot className="shrink-0">{t('reviewChipPending')}</Chip>;
return <Chip variant="green" size="sm" dot className="shrink-0">{t('reviewChipApproved')}</Chip>;
```
(Delta diterima: rose→red, emerald→green, teks 10px→11px — konsolidasi palet memang tujuannya.)

- [ ] **Step 6: Verifikasi**

```bash
cd multi-step-form && npm run typecheck && npm run build
grep -rn "text-\[#1a1a1a\]\|text-\[#666\]\|text-\[#888\]\|text-\[#555\]\|text-\[#444\]" src/pages/dashboard src/components --include="*.tsx"   # expected: 0
grep -rn "ctaRoyal\|borderRadius: '20px'\|menang di cascade" src --include="*.tsx"   # expected: 0
```
Smoke `/dashboard` mobile (375px) + desktop: kartu order di tiap state (review pending/approved/rejected — chip baru; schedule + CTA bayar — Button royal; publication + airing bar — tint CHIP_TINT; extension rows), `/dashboard/submit-iklan` semua step, `/dashboard/chat`, `/dashboard/profile`, `/dashboard/payment/:id`.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "refactor(dashboard): sweep hex->token, CTA->Button royal, radius 2-tier, cabut workaround cascade"
```

---

### Task 7: Sweep Group B — halaman publik React

**Files (modify):**
- `src/pages/LoginPage.tsx`, `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`
- `src/pages/PaymentSuccessPage.tsx` (+ `src/components/PaymentSuccess.tsx`), `PaymentFailedPage.tsx` (+ `PaymentFailed.tsx`), `PaymentRetryPage.tsx`
- `src/pages/InvoicePage.tsx`
- `src/pages/public/SurveyListingPage.tsx`, `SurveyPage.tsx`
- `src/styles.css` (bagian `.form-*`/`.button-*`/`.footer` — nilai saja)

- [ ] **Step 1: Sweep hex → token** — tabel yang sama dengan Task 6 Step 1, di file-file Group B.

- [ ] **Step 2: Layar yang digerakkan CSS legacy** (form login/modal legacy): retheme DI DALAM `styles.css` — nilai sudah otomatis ikut token sejak repoint Task 3 (`.button-primary` biru, radius `--jfu-radius-inner`, border `--jfu-divider`). Di task ini hanya rapikan nilai hardcoded sisa di section `.form-*`/`.footer` yang jelas melenceng dari token (mis. `#333`, `#e2e8f0` literal) → ganti `var(--jfu-*)` yang sesuai. JANGAN menulis ulang markup.

- [ ] **Step 3: `InvoicePage.tsx`** — sweep token seperti biasa, lalu cek blok `@media print` / stylesheet print-nya: warna print harus tetap hitam-putih tegas; kalau rule print memakai warna yang di-sweep, kembalikan literal di rule print.

- [ ] **Step 4: `SurveyListingPage` / `SurveyPage`** — pill/badge ad-hoc → `<Chip>`; abu-abu ad-hoc → token; kartu → `<Card tier="outer">` bila bentuknya kartu Soft DNA.

- [ ] **Step 5: Verifikasi**

```bash
cd multi-step-form && npm run typecheck && npm run build
grep -rn "text-\[#1a1a1a\]\|text-\[#666\]\|text-\[#888\]\|text-\[#555\]\|text-\[#444\]" src --include="*.tsx"   # expected: 0 (seluruh src)
```
Smoke: `/login` (+ lupa/reset password), `/payment-success|failed|retry`, `/invoices/:paymentId` + print preview (Cmd+P), `/pages` & `/pages/:slug`; footer PublicLayout & lebar container di 1440px.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor(public): sweep halaman publik ke token design system"
```

---

### Task 8: Cleanup akhir + verifikasi menyeluruh

**Files:**
- Delete: `src/App.css` (7 baris, kosong by design — cek dulu tak ada yang import; kalau ada, hapus importnya juga)
- Modify (opsional, boleh skip per item kalau smoke admin menemukan masalah): `src/components/transactions/TransactionListRow.tsx:24`, `src/components/customers/CustomerListRow.tsx:18` (komentar "never hidden md:flex" → boleh pakai normal), `src/components/transactions/WalletView.tsx:46` (`useMediaQuery` JS → `lg:grid-cols-2` CSS), `src/components/InternalDashboard.tsx:772`, `src/components/CustomersPage.tsx:318`

- [ ] **Step 1: Hapus `src/App.css`** + import-nya bila ada (`grep -rn "App.css" src`).

- [ ] **Step 2: Sapu komentar basi** — `grep -rn "menang di cascade\|styles.css legacy" src --include="*.tsx"` → hapus/perbarui tiap komentar yang merujuk masalah yang sudah tidak ada.

- [ ] **Step 3: Workaround admin (opsional)** — cabut satu per satu file di daftar atas, smoke `/internal-dash` setelah masing-masing. Kalau ragu, skip — Group D memang bukan scope.

- [ ] **Step 4: Verifikasi final (semua harus lolos)**

```bash
cd multi-step-form && npm run typecheck && npm run lint && npm run build
# Grep gate — semua 0:
grep -rn "text-\[#1a1a1a\]\|text-\[#666\]\|text-\[#888\]\|text-\[#555\]\|text-\[#444\]" src --include="*.tsx"
grep -rn "ctaRoyal\|ctaButtonClass" src
grep -rn "borderRadius: '20px'" src
grep -rn "plus-jakarta\|font-jakarta" src index.html package.json
grep -n "fonts.googleapis" index.html
grep -rn "EXTEND_STATUS_STYLES" src
grep -rn "shadow-\[0_4px_20px" src
# Struktur:
grep -rln "@tailwind" src        # hanya styles/base.css + styles/utilities.css
```

- [ ] **Step 5: Smoke matrix lengkap** (dev server; 375px & 1280px):

| Grup | Rute | Yang dicek |
|---|---|---|
| A | `/dashboard` | kartu order semua state, chip review, CTA royal, airing bar, extension rows, FAB scroll-top |
| A | `/dashboard/submit-iklan` | method selection, Google Drive import (termasuk personal-data warning), modal manual-flow, schedule, checkout |
| A | `/dashboard/submit-kilat`, `/chat`, `/profile`, `/payment/:id` | layout + token konsisten, sheet profil |
| B | `/login`, `/forgot-password`, `/reset-password` | form legacy biru brand, bg canvas |
| B | `/payment-success|failed|retry`, `/invoices/:id` (+print), `/pages`, `/pages/:slug` | container 1200px, footer, print B/W |
| D | `/internal-dash` | submissions+chip+sheet portal, transactions+WalletView, customers, analytics, page-builder, dropdown; warna navy shadcn = kondisi baru yang diterima |

- [ ] **Step 6: Update graph & commit**

```bash
cd /Users/jakpat/GarCode/jakpatforuniv && .venv/bin/python -m graphify update .
cd multi-step-form && git add -A && git commit -m "chore: cleanup design-system adoption + verifikasi"
```

---

## Catatan drift & keputusan yang diterima (untuk pembaca masa depan)

- Landing statis `public/homepage/` tetap Plus Jakarta Sans + CSS vars sendiri (`--blue-primary #1976D2`) — di luar scope; kalau suatu saat mau disatukan, `tokens.css` inilah sumber kebenarannya.
- Warna semantik ber-`var()` (ink/caption/divider/…) tidak bisa pakai modifier `/opacity` Tailwind — untuk alpha pakai `jfu.*` (hex literal) atau skala stock.
- Admin berubah warna pada Task 3 secara SENGAJA (var shadcn jadi valid). Kalau hasilnya dianggap jelek, perbaikannya adalah menyetel nilai HSL di `styles/base.css`, BUKAN mengembalikan blok hex.
- `status-tokens.ts` (admin) belum disatukan ke `CHIP_TINT` — sudah emit `ChipVariant` jadi kompatibel; penyatuan penuh ditunda sampai ada kebutuhan admin.
