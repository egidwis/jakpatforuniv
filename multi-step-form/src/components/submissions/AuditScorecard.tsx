import { useState, useEffect, useRef } from 'react';
import { RotateCw, ChevronDown, Sparkles, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import type { FormAuditResult, SurveySubmission } from './types';
import { auditSubmissionForm } from '../../utils/auditService';
import { cn } from '@/lib/utils';
import {
  auditViewOf, headerOf, shouldAutoAudit, autoAuditKey, COUNT_SOURCE_LABEL,
  type AuditView, type AuditHeader,
} from './auditView';

/**
 * Kartu Pra-cek AI — BUKTI, bukan vonis. Semua keputusan tampilan ada di
 * `auditView.ts`; komponen ini hanya merender dan menjalankan audit.
 *
 * SATU BARIS secara bawaan: angka pertanyaan, selisihnya terhadap order, dan
 * data pribadi — sebagai chip. Rincian (cuplikan PII, catatan AI, waktu pindai)
 * di balik ⌄. Kartu netral (slate); warna hanya pada chip yang menyala:
 * selisih ke atas & data pribadi (amber), angka hasil parser (biru, "terhitung").
 * Tidak ada hijau/merah keseluruhan — kartu tidak tahu apakah order ini layak
 * disetujui.
 */
interface AuditScorecardProps {
  submission: SurveySubmission;
  /**
   * Auto-cek hanya selama order menunggu keputusan review (`isNeedReview` di
   * SubmissionDetailSheet). Selain itu kartu diam sampai admin menekan Cek.
   */
  autoRun: boolean;
  /** Dipanggil dengan id order yang DIAUDIT — tetap benar walau kartu ini
   *  sudah dilepas karena admin pindah baris. */
  onAuditComplete?: (submissionId: string, newResult: FormAuditResult) => void;
}

export function AuditScorecard({ submission, autoRun, onAuditComplete }: AuditScorecardProps) {
  const [isAuditing, setIsAuditing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [localAudit, setLocalAudit] = useState<FormAuditResult | null | undefined>(
    submission.ai_prescreening
  );

  const triggered = useRef<Record<string, boolean>>({});
  const audit = localAudit ?? submission.ai_prescreening ?? null;

  // Penjaga identitas: hasil `await` hanya boleh menyentuh state kartu ini bila
  // kartunya masih hidup DAN masih milik order yang sama. Pemanggil memasang
  // `key={submission.id}`, jadi pindah baris = kartu dilepas.
  const aliveRef = useRef(true);
  const currentIdRef = useRef(submission.id);
  currentIdRef.current = submission.id;
  useEffect(() => () => { aliveRef.current = false; }, []);

  useEffect(() => {
    setLocalAudit(submission.ai_prescreening);
  }, [submission.id, submission.ai_prescreening]);

  const handleRunAudit = async (isAuto: boolean = false) => {
    if (!submission.formUrl) {
      if (!isAuto) toast.error('Submission tidak memiliki URL form');
      return;
    }

    // Ditangkap SEBELUM await — endpoint juga menulis ke id ini.
    const requestedId = submission.id;
    const isCurrent = () => aliveRef.current && currentIdRef.current === requestedId;

    setIsAuditing(true);
    setFailed(false);
    try {
      const result = await auditSubmissionForm(
        requestedId,
        submission.formUrl,
        submission.questionCount || 0
      );
      // Baris induk selalu diperbarui — hasilnya memang milik requestedId.
      onAuditComplete?.(requestedId, result);
      if (!isCurrent()) return;
      setLocalAudit(result);
      if (!isAuto) toast.success('Pra-cek selesai');
    } catch (err: any) {
      console.error('Audit failed:', err);
      if (!isCurrent()) return;
      // Gagal TIDAK lagi sunyi: auto-run dulu menelan error dan kartu kembali
      // kosong. Sekarang kepala kartu berbunyi "gagal memindai".
      setFailed(true);
      if (!isAuto) toast.error(`Pra-cek gagal: ${err.message || 'Terjadi kesalahan sistem'}`);
    } finally {
      if (isCurrent()) setIsAuditing(false);
    }
  };

  useEffect(() => {
    const key = autoAuditKey(submission.id, submission.formUrl);
    if (shouldAutoAudit({
      autoRun,
      audit,
      formUrl: submission.formUrl,
      isAuditing,
      alreadyTriggered: Boolean(triggered.current[key]),
    })) {
      triggered.current[key] = true;
      handleRunAudit(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission.id, submission.formUrl, autoRun, audit, isAuditing]);

  const view = audit ? auditViewOf(audit, submission) : null;
  const header = headerOf(view, { isAuditing, failed });
  const isOpen = expanded && header.expandable;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/40">
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-indigo-500" aria-hidden />

        <button
          type="button"
          onClick={() => header.expandable && setExpanded((v) => !v)}
          disabled={!header.expandable}
          aria-expanded={header.expandable ? isOpen : undefined}
          aria-label={`Pra-cek AI: ${header.status}${header.failed ? ' (pindai terakhir gagal)' : ''}`}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1 text-left text-xs disabled:cursor-default"
        >
          <span className="font-semibold text-slate-900 dark:text-white">Pra-cek AI</span>
          {header.failed && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-px text-[11px] font-medium text-amber-800">
              gagal memindai
            </span>
          )}
          <HeaderFacts header={header} view={view} />
        </button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => handleRunAudit(false)}
          disabled={header.buttonDisabled}
          className="h-7 shrink-0 border-slate-200 px-2 text-xs text-slate-700 hover:bg-white"
          title="Pindai ulang kuesioner dari link order saat ini"
        >
          <RotateCw className={cn('mr-1 h-3 w-3', isAuditing && 'animate-spin')} />
          {header.buttonLabel}
        </Button>

        {header.expandable && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700"
            aria-label={isOpen ? 'Sembunyikan rincian pra-cek' : 'Tampilkan rincian pra-cek'}
            aria-expanded={isOpen}
          >
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-180')} />
          </button>
        )}
      </div>

      {isOpen && view && <Details view={view} />}
    </div>
  );
}

/** Isi baris ringkas: chip fakta untuk hasil terbaca, kalimat pendek untuk sisanya. */
function HeaderFacts({ header, view }: { header: AuditHeader; view: AuditView | null }) {
  if ((header.kind === 'clean' || header.kind === 'findings') && view) {
    const { count, pii } = view;
    return (
      <>
        <Dot />
        {count.detected == null ? (
          <span className="text-slate-500">jumlah tak terhitung</span>
        ) : (
          <span className="inline-flex items-baseline gap-1">
            <strong className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">{count.detected}</strong>
            <SourceChip source={count.source} />
          </span>
        )}
        <span className="text-slate-500">order <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-300">{count.orderNow}</span></span>
        <DeltaChip delta={count.delta} />
        <Dot />
        {pii.total > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-px text-[11px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <ShieldAlert className="h-3 w-3" aria-hidden />
            {pii.total} data pribadi
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-slate-500">
            <ShieldCheck className="h-3 w-3" aria-hidden />
            tanpa data pribadi
          </span>
        )}
      </>
    );
  }

  if (header.kind === 'unreadable') {
    return (
      <>
        <Dot />
        <span className="rounded-full border border-slate-300 bg-white px-1.5 py-px text-[11px] font-semibold text-slate-700">
          tak terbaca
        </span>
        <span className="text-slate-500">cek manual lewat Buka Link</span>
      </>
    );
  }

  // Memindai / belum dicek / link lama / gagal tanpa hasil: kalimat pendek.
  if (header.kind === 'failed') return null; // chip "gagal memindai" sudah tampil
  return (
    <>
      <Dot />
      <span className={cn('text-slate-500', header.kind === 'stale' && 'italic')}>{header.status}</span>
    </>
  );
}

const Dot = () => <span className="text-slate-300" aria-hidden>·</span>;

function SourceChip({ source }: { source: 'parser' | 'ai' }) {
  return (
    <span
      className={cn(
        'rounded px-1 py-px text-[10px] font-medium',
        source === 'parser'
          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
      )}
      title={source === 'parser'
        ? 'Dihitung dari struktur form (aturan yang sama dengan import Google Forms).'
        : 'Ditebak AI dari teks form — bisa meleset.'}
    >
      {COUNT_SOURCE_LABEL[source]}
    </span>
  );
}

function DeltaChip({ delta }: { delta: number | null }) {
  if (delta == null) return null;
  if (delta > 0) {
    return (
      <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-px text-[11px] font-bold tabular-nums text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        ▲ +{delta}
      </span>
    );
  }
  if (delta < 0) {
    return <span className="text-[11px] font-medium tabular-nums text-slate-500">▼ {delta}</span>;
  }
  return <span className="text-[11px] text-slate-500">= sesuai</span>;
}

function Details({ view }: { view: AuditView }) {
  const { count, pii } = view;
  return (
    <div className="mt-2 space-y-2 border-t border-slate-200 pt-2 text-xs dark:border-slate-700">
      {view.readState === 'unreadable' ? (
        <p className="leading-relaxed text-slate-600 dark:text-slate-400">
          Form tidak bisa dibaca otomatis (login / tertutup). Jumlah pertanyaan dan data pribadi
          tidak diperiksa — cek manual lewat <strong className="font-semibold text-slate-800">Buka Link</strong>.
        </p>
      ) : (
        <>
          {count.detected != null && (
            <p className="leading-relaxed text-slate-600 dark:text-slate-400">
              {count.source === 'parser'
                ? 'Jumlah pertanyaan dihitung dari struktur form.'
                : 'Jumlah pertanyaan ditebak AI dari teks form — bisa meleset.'}
              {count.maybePartial && ' Teks form terpotong, jadi mungkin terbaca sebagian.'}
            </p>
          )}

          {pii.total > 0 && (
            <div className="space-y-1">
              <p className="font-medium text-slate-700 dark:text-slate-300">Pertanyaan yang meminta data pribadi</p>
              <div className="flex flex-wrap gap-1">
                {pii.top.map((f, i) => (
                  <span
                    key={i}
                    title={f.context ? `Konteks: ${f.context}` : undefined}
                    className="max-w-full truncate rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                  >
                    &quot;{f.snippet}&quot;
                  </span>
                ))}
                {pii.rest > 0 && <span className="px-1 py-0.5 text-[11px] text-slate-500">+{pii.rest} lainnya</span>}
              </div>
            </div>
          )}
        </>
      )}

      {view.summary && (
        <blockquote className="border-l-2 border-indigo-200 pl-2 leading-relaxed text-slate-600 dark:border-indigo-800 dark:text-slate-400">
          <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-indigo-500">Catatan AI</span>
          {view.summary}
        </blockquote>
      )}

      {view.auditedAt && (
        <p className="text-[11px] text-slate-400">
          Dipindai {new Date(view.auditedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
      )}
    </div>
  );
}
