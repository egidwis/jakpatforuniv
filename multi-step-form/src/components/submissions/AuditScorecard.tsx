import { useState, useEffect, useRef } from 'react';
import { RotateCw, Copy, Check, ChevronDown, ChevronUp, Sparkles, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import type { FormAuditResult, SurveySubmission } from './types';
import { auditSubmissionForm } from '../../utils/auditService';
import {
  auditViewOf, headerOf, shouldAutoAudit, autoAuditKey, reviewNotesOf, COUNT_SOURCE_LABEL,
  type AuditView,
} from './auditView';

/**
 * Kartu Pra-cek AI — BUKTI, bukan vonis. Semua keputusan tampilan ada di
 * `auditView.ts`; komponen ini hanya merender dan menjalankan audit.
 *
 * Kartu netral (slate). Warna hanya pada baris yang menyala: selisih pertanyaan
 * ke atas dan temuan data pribadi, keduanya amber. Tidak ada hijau/merah
 * keseluruhan — kartu tidak tahu apakah order ini layak disetujui.
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
  const [copied, setCopied] = useState(false);
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

  const handleCopy = () => {
    if (!view) return;
    navigator.clipboard.writeText(reviewNotesOf(view, submission));
    setCopied(true);
    toast.success('Catatan revisi disalin ke clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  // Isi di bawah kepala: hanya untuk hasil yang masih milik link ini.
  const showBody = view && !view.isStale && header.kind !== 'scanning' && header.kind !== 'rescanning_stale';
  const bodyKind = !showBody ? null : view.readState === 'unreadable' ? 'unreadable' : view.isClean ? 'clean' : 'findings';
  const canExpand = bodyKind === 'clean';
  const showCopy = Boolean(showBody && view.readState === 'read' && view.hasEvidence);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-900/40 px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1 text-xs leading-snug text-slate-700 dark:text-slate-300">
          <span className="font-semibold text-slate-900 dark:text-white">Pra-cek AI</span>
          <span className="text-slate-400"> · </span>
          <span className={header.kind === 'failed' ? 'text-amber-700 dark:text-amber-400' : undefined}>
            {header.status}
          </span>
        </p>

        {showCopy && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="h-7 px-2 text-xs text-slate-700 border-slate-200 hover:bg-white shrink-0"
            title="Salin template catatan revisi untuk dikirimkan ke peneliti"
          >
            {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
            {copied ? 'Tersalin' : 'Salin'}
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => handleRunAudit(false)}
          disabled={header.buttonDisabled}
          className="h-7 px-2 text-xs text-slate-700 border-slate-200 hover:bg-white shrink-0"
          title="Pindai ulang kuesioner dari link order saat ini"
        >
          <RotateCw className={`w-3 h-3 mr-1 ${isAuditing ? 'animate-spin' : ''}`} />
          {header.buttonLabel}
        </Button>

        {canExpand && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-white shrink-0"
            aria-label={expanded ? 'Sembunyikan ringkasan AI' : 'Tampilkan ringkasan AI'}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {bodyKind === 'unreadable' && (
        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          Form tidak bisa dibaca otomatis (login / tertutup). Cek manual lewat Buka Link.
        </p>
      )}

      {bodyKind === 'findings' && view && <FindingsBody view={view} />}

      {bodyKind === 'clean' && expanded && view && <SummaryBlock view={view} />}
    </div>
  );
}

function FindingsBody({ view }: { view: AuditView }) {
  const { count, pii } = view;
  const over = count.delta != null && count.delta > 0;
  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex items-baseline gap-2">
        <span className="w-24 shrink-0 text-slate-500">Pertanyaan</span>
        <span className="min-w-0 text-slate-800 dark:text-slate-200">
          {count.detected == null ? (
            <>tak terhitung · order {count.orderNow}</>
          ) : (
            <>
              <strong className="font-semibold">{count.detected}</strong> {COUNT_SOURCE_LABEL[count.source]} · order {count.orderNow}
              {over && (
                <span className="ml-2 font-semibold text-amber-700 dark:text-amber-400">▲ +{count.delta}</span>
              )}
              {count.delta != null && count.delta < 0 && (
                <span className="ml-2 text-slate-500">▼ {count.delta}</span>
              )}
            </>
          )}
          {count.maybePartial && (
            <span className="block text-[11px] text-slate-400">mungkin terbaca sebagian — teks form terpotong</span>
          )}
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="w-24 shrink-0 text-slate-500">Data pribadi</span>
        {pii.total === 0 ? (
          <span className="text-slate-800 dark:text-slate-200">tidak ditemukan</span>
        ) : (
          <div className="min-w-0 space-y-1">
            <span className="font-semibold text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mr-1 inline w-3 h-3 -translate-y-px" aria-hidden />
              {pii.total} pertanyaan perlu dicek
            </span>
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
      </div>

      {/* Tidak di-clamp: ini satu-satunya penjelasan saat ada temuan. */}
      <SummaryBlock view={view} />
    </div>
  );
}

function SummaryBlock({ view }: { view: AuditView }) {
  if (!view.summary && !view.auditedAt) return null;
  return (
    <div className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
      {view.summary && (
        <p>
          <span className="font-semibold text-slate-700 dark:text-slate-300">AI: </span>
          {view.summary}
        </p>
      )}
      {view.auditedAt && (
        <p className="mt-0.5 text-[11px] text-slate-400">
          Dipindai {new Date(view.auditedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
      )}
    </div>
  );
}
