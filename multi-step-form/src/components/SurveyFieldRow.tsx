import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle } from 'lucide-react';
import { InfoTooltip } from '@/components/status/InfoTooltip';

/**
 * Primitif baris untuk form Iklan Survei — kartu kecil berpagar PER FIELD
 * (referensi: kartu job-listing Teero — "Location | Amsterdam", "Payment |
 * 15 / hour"), bukan tabel full-bleed `divide-y`.
 *
 * Versi pertama memakai tabel full-bleed dengan kolom label PERSENTASE
 * (`md:w-[42%]`). Di kartu lebar, itu menyisakan jarak kosong besar antara
 * label pendek ("Link Survei") dan divider sebelum nilai muncul — persis
 * masalah yang membuat hasilnya terasa kurang rapi dibanding referensi Teero.
 * Fix: kolom label FIXED WIDTH (`FIELD_LABEL_WIDTH`, bukan persentase), nilai
 * SELALU rata kiri tepat setelah divider (dulu compact rata kanan), dan
 * setiap baris jadi kotak `rounded-xl border` sendiri berjarak `gap-2` —
 * bukan garis pemisah `divide-y` yang menyambung. Karena lebar kolom label
 * dibagi rata di compact MAUPUN default, nilai di seluruh baris satu section
 * jatuh pada koordinat X yang sama, persis efek "tabel rapi" pada kartu
 * Teero.
 *
 * JEBAKAN CASCADE — `styles.css` dimuat SETELAH Tailwind (App.tsx meng-import
 * styles.css, main.tsx meng-import index.css) dan mendefinisikan `.flex-col`
 * tanpa pasangan responsif apa pun. Karena media query tidak menambah
 * spesifisitas, `.flex-col` yang datang belakangan MENGALAHKAN
 * `@media(md){.md\:flex-row}` milik Tailwind — jadi `flex-col md:flex-row`
 * akan terkunci sebagai kolom di semua lebar. Karena itu pergantian arah di
 * sini ditulis sebagai arbitrary value (`[flex-direction:column]`), yang tidak
 * punya kembaran di styles.css sehingga tak bisa ditimpa. Jangan
 * "dirapikan" balik jadi `flex-col`. `border` (semua sisi) dan `rounded-xl`
 * juga sudah dicek aman — styles.css cuma mendefinisikan `.border-t` (bukan
 * `.border` polos) dan `.rounded-lg` (bukan `.rounded-xl`).
 */

/**
 * Input tanpa border di dalam sel nilai. Menggantikan enam pasang handler
 * `onFocus`/`onBlur` yang dulu menyetel `style.borderColor` + `boxShadow`
 * secara manual: umpan balik fokus sekarang milik BARIS (kotaknya sendiri
 * lewat `focus-within:` di bawah), bukan input, jadi tidak ada dua kotak
 * bersarang.
 */
export const fieldInputClass =
  'w-full min-w-0 bg-transparent border-0 p-0 text-sm text-[#1a1a1a] placeholder:text-gray-400 ' +
  'focus:outline-none focus:ring-0 read-only:cursor-default read-only:text-gray-500 ' +
  '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

/** Pembungkus sekelompok baris — kotak-kotak berjarak, bukan lagi tabel bersambung. */
export const fieldRowListClass = 'mt-2 flex flex-col gap-2';

/** Lebar kolom label dibagi rata di semua baris (compact & default) supaya nilai sebaris X. */
const FIELD_LABEL_WIDTH = 'w-[150px] shrink-0 md:w-[175px]';

function rowShell(hasError?: boolean, readOnly?: boolean) {
  return (
    'rounded-xl border px-4 py-3 transition-colors ' +
    (hasError ? 'border-rose-200 ' : readOnly ? 'border-gray-200 bg-gray-50/80 ' : 'border-gray-200 ') +
    (readOnly ? 'cursor-not-allowed ' : 'focus-within:border-jfu-primary/50 focus-within:ring-1 focus-within:ring-jfu-primary/15')
  );
}

function LabelContent({
  icon: Icon,
  label,
  required,
  tooltip,
}: {
  icon: LucideIcon;
  label: string;
  required?: boolean;
  tooltip?: ReactNode;
}) {
  return (
    <>
      <Icon className="w-4 h-4 shrink-0 text-gray-400 mt-0.5" aria-hidden="true" />
      <span className="text-sm text-gray-600 leading-snug">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {tooltip && <InfoTooltip content={tooltip} />}
    </>
  );
}

/**
 * Render sebagai SAUDARA kotak berpagar, bukan di dalamnya — kotak menandai
 * "field ini", sedangkan caption/error adalah komentar tentangnya. Ditulis
 * jadi elemen terpisah, bukan konten kotak.
 */
function RowFooter({ error, hint }: { error?: string; hint?: ReactNode }) {
  if (!error && !hint) return null;

  return error ? (
    <p className="mt-1.5 flex items-start gap-1 text-xs leading-relaxed text-rose-600">
      <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
      <span>{error}</span>
    </p>
  ) : (
    <div className="mt-1.5 text-xs leading-relaxed text-gray-500">{hint}</div>
  );
}

interface FieldRowProps {
  icon: LucideIcon;
  label: string;
  htmlFor?: string;
  required?: boolean;
  compact?: boolean;
  labelWidth?: string;
  valueInset?: string;
  error?: string;
  hint?: ReactNode;
  tooltip?: ReactNode;
  readOnly?: boolean;
  children: ReactNode;
}

export function FieldRow({
  icon,
  label,
  htmlFor,
  required,
  compact,
  labelWidth,
  valueInset,
  error,
  hint,
  tooltip,
  readOnly,
  children,
}: FieldRowProps) {
  if (compact) {
    return (
      <div>
        <div className={rowShell(!!error, readOnly)}>
          <div className="flex items-center gap-3">
            <label htmlFor={htmlFor} className={`flex items-center gap-2 min-w-0 shrink-0 ${labelWidth ?? FIELD_LABEL_WIDTH}`}>
              <LabelContent icon={icon} label={label} required={required} tooltip={tooltip} />
            </label>
            <div className={`flex items-center min-w-0 flex-1 border-l border-gray-100 ${valueInset ?? 'pl-4'}`}>
              {children}
            </div>
          </div>
        </div>
        <RowFooter error={error} hint={hint} />
      </div>
    );
  }

  return (
    <div>
      <div className={rowShell(!!error, readOnly)}>
        <div className="flex [flex-direction:column] gap-1.5 md:[flex-direction:row] md:items-start md:gap-3">
          <label htmlFor={htmlFor} className={`flex items-center md:items-start gap-2 min-w-0 [width:100%] md:[width:165px] md:shrink-0 md:pt-0.5 ${labelWidth ?? ''}`}>
            <LabelContent icon={icon} label={label} required={required} tooltip={tooltip} />
          </label>
          <div className="flex items-start min-w-0 [width:100%] md:[width:auto] md:flex-1 border-0 md:border-l md:border-gray-100 pl-6 md:pl-4">
            {children}
          </div>
        </div>
      </div>
      <RowFooter error={error} hint={hint} />
    </div>
  );
}

interface FieldBlockProps {
  icon: LucideIcon;
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  counter?: string;
  tooltip?: ReactNode;
  readOnly?: boolean;
  children: ReactNode;
}

/**
 * Field selebar penuh dengan label di atasnya — untuk `textarea`, yang tidak
 * pernah muat di sel nilai selebar setengah baris.
 */
export function FieldBlock({
  icon,
  label,
  htmlFor,
  required,
  error,
  hint,
  counter,
  tooltip,
  readOnly,
  children,
}: FieldBlockProps) {
  return (
    <div>
      <div className={rowShell(!!error, readOnly)}>
        <label htmlFor={htmlFor} className="flex items-center gap-2">
          <LabelContent icon={icon} label={label} required={required} tooltip={tooltip} />
        </label>

        {/* pl-6 = ikon w-4 + gap-2, jadi isi lurus di bawah teks label */}
        <div className="mt-2 pl-6">{children}</div>

        {counter && (
          <div className="mt-1 pl-6 text-right text-[10px] font-medium tabular-nums text-gray-400">{counter}</div>
        )}
      </div>
      <RowFooter error={error} hint={hint} />
    </div>
  );
}

/**
 * Label seksi polos. Menggantikan header kartu lama (kotak ikon biru + judul
 * uppercase + chip "Complete") — chip itu mengulang informasi yang sudah
 * terlihat dari field yang terisi.
 */
export function SectionLabel({ children, tooltip }: { children: ReactNode; tooltip?: ReactNode }) {
  return (
    <div className="flex items-center gap-0.5">
      <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{children}</h2>
      {tooltip && <InfoTooltip content={tooltip} />}
    </div>
  );
}
