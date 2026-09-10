import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  RotateCw,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
  HelpCircle,
  Shuffle
} from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import type { FormAuditResult, SurveySubmission } from './types';
import { auditSubmissionForm } from '../../utils/auditService';

interface AuditScorecardProps {
  submission: SurveySubmission;
  onAuditComplete?: (newResult: FormAuditResult) => void;
}

export function AuditScorecard({ submission, onAuditComplete }: AuditScorecardProps) {
  const [isAuditing, setIsAuditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showFindingsDetail, setShowFindingsDetail] = useState(false);
  const [localAudit, setLocalAudit] = useState<FormAuditResult | null | undefined>(
    submission.ai_prescreening
  );

  const audit = localAudit || submission.ai_prescreening;

  const handleRunAudit = async () => {
    if (!submission.formUrl) {
      toast.error('Submission tidak memiliki URL form');
      return;
    }

    setIsAuditing(true);
    try {
      toast.info('Memulai AI Pre-Screening kuesioner...');
      const result = await auditSubmissionForm(
        submission.id,
        submission.formUrl,
        submission.questionCount || 0
      );
      setLocalAudit(result);
      if (onAuditComplete) {
        onAuditComplete(result);
      }
      toast.success('Audit selesai diproses!');
    } catch (err: any) {
      console.error('Audit failed:', err);
      toast.error(`Audit gagal: ${err.message || 'Terjadi kesalahan sistem'}`);
    } finally {
      setIsAuditing(false);
    }
  };

  const handleCopyReviewNotes = () => {
    if (!audit) return;

    let text = `Halo Kak ${submission.researcherName || ''},\n\n`;
    text += `Berikut catatan hasil verifikasi awal untuk kuesioner "${submission.formTitle}":\n`;

    // Question count note
    if (audit.question_count.status === 'mismatch_over') {
      text += `- 📋 Jumlah pertanyaan: Terdeteksi ${audit.question_count.actual_detected} pertanyaan (order diajukan ${audit.question_count.reported} pertanyaan, selisih +${audit.question_count.diff}).\n`;
    }

    // PII note
    if (audit.pii.has_pii && audit.pii.findings.length > 0) {
      const types = audit.pii.findings.map(f => f.type).join(', ');
      text += `- 🛡️ Data Pribadi (PII): Terdeteksi permintaan data sensitif (${types}). Mohon pastikan data bersifat opsional untuk pengiriman reward/hadiah, atau ditiadakan dari kuesioner utama sesuai regulasi Jakpat.\n`;
    }

    // Randomizer
    if (audit.randomizer.detected) {
      text += `- 🔀 Randomizer: Terindikasi adanya pengacakan urutan soal/opsi.\n`;
    }

    if (audit.summary) {
      text += `\nCatatan Admin: ${audit.summary}\n`;
    }

    text += `\nMohon bantuannya untuk memeriksa kembali kuesioner ya Kak. Terima kasih! 🙏`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Catatan revisi disalin ke clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  // State 1: Chưa diaudit / Not Yet Audited
  if (!audit) {
    return (
      <div className="rounded-xl border border-dashed border-indigo-200 bg-gradient-to-r from-indigo-50/50 via-purple-50/30 to-blue-50/50 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold text-gray-900 dark:text-white">
                AI Pre-Screening Kuesioner
              </h4>
              <span className="text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 px-1.5 py-0.2 rounded font-semibold">
                Beta
              </span>
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
              Otomatisasi inspeksi PII, kecocokan kuota pertanyaan, dan randomizer via headless DOM extractor.
            </p>
          </div>
        </div>

        <Button
          size="sm"
          onClick={handleRunAudit}
          disabled={isAuditing}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shrink-0 shadow-sm flex items-center gap-1.5"
        >
          <RotateCw className={`w-3.5 h-3.5 ${isAuditing ? 'animate-spin' : ''}`} />
          <span>{isAuditing ? 'Mengekstrak Form...' : '⚡ Mulai Audit AI'}</span>
        </Button>
      </div>
    );
  }

  // State 2: Audited Scorecard
  const isClean = audit.status === 'clean' || audit.recommendation === 'ready_to_approve';
  const isFlagged = audit.status === 'flagged' || audit.recommendation === 'reject_or_revise';

  const themeClasses = isClean
    ? 'border-emerald-200/90 bg-emerald-50/40 dark:bg-emerald-950/20'
    : isFlagged
    ? 'border-rose-200/90 bg-rose-50/40 dark:bg-rose-950/20'
    : 'border-amber-200/90 bg-amber-50/40 dark:bg-amber-950/20';

  const statusBadge = isClean ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300">
      <CheckCircle2 className="w-3.5 h-3.5" /> Lolos Pre-Screening
    </span>
  ) : isFlagged ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-900/40 dark:text-rose-300">
      <ShieldAlert className="w-3.5 h-3.5" /> Perlu Revisi / Flagged
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/40 dark:text-amber-300">
      <AlertTriangle className="w-3.5 h-3.5" /> Perlu Review Manual
    </span>
  );

  const platformLabel = {
    google_forms: 'Google Forms',
    microsoft_forms: 'Microsoft Forms',
    typeform: 'Typeform',
    qualtrics: 'Qualtrics',
    other: 'External Survey'
  }[audit.source_platform] || 'Survey Link';

  return (
    <div className={`rounded-xl border ${themeClasses} p-3.5 space-y-3 transition-all shadow-2xs`}>
      {/* Top Bar: Title, Verdict Badge, Platform, Re-run */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center shadow-2xs">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <span className="text-xs font-bold text-gray-900 dark:text-white">
            AI Pre-Screening
          </span>
          <span className="text-[10px] px-1.5 py-0.2 rounded font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
            {platformLabel}
          </span>
          {statusBadge}
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRunAudit}
            disabled={isAuditing}
            className="h-7 px-2 text-xs text-gray-600 hover:text-gray-900 dark:text-gray-300 flex items-center gap-1"
            title="Jalankan ulang audit kuesioner"
          >
            <RotateCw className={`w-3 h-3 ${isAuditing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isAuditing ? 'Memindai...' : 'Audit Ulang'}</span>
          </Button>

          {(isFlagged || !isClean) && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyReviewNotes}
              className="h-7 px-2 text-xs text-indigo-700 border-indigo-200 hover:bg-indigo-50 dark:text-indigo-300 flex items-center gap-1"
              title="Salin template catatan revisi untuk dikirimkan ke peneliti"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Tersalin' : 'Salin Catatan'}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Metric Pills Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-0.5">
        {/* Metric 1: Question Count */}
        <div className="bg-white/80 dark:bg-gray-800/80 rounded-lg p-2 border border-gray-200/80 dark:border-gray-700/80 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-gray-500 shrink-0" />
            <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">
              Jumlah Pertanyaan
            </span>
          </div>
          {audit.question_count.status === 'match' ? (
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">
              {audit.question_count.actual_detected} / {audit.question_count.reported} (Sesuai)
            </span>
          ) : audit.question_count.status === 'mismatch_over' ? (
            <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded">
              {audit.question_count.actual_detected} (+{audit.question_count.diff} Lebih)
            </span>
          ) : (
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
              {audit.question_count.actual_detected} ({audit.question_count.diff} Kurang)
            </span>
          )}
        </div>

        {/* Metric 2: PII */}
        <div className="bg-white/80 dark:bg-gray-800/80 rounded-lg p-2 border border-gray-200/80 dark:border-gray-700/80 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-gray-500 shrink-0" />
            <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">
              Data Pribadi (PII)
            </span>
          </div>
          {!audit.pii.has_pii ? (
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">
              Bebas PII
            </span>
          ) : audit.pii.status === 'violation' ? (
            <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded">
              ⚠️ {audit.pii.findings.length} Terdeteksi
            </span>
          ) : (
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
              ⚠️ {audit.pii.findings.length} Perlu Cek
            </span>
          )}
        </div>

        {/* Metric 3: Randomizer */}
        <div className="bg-white/80 dark:bg-gray-800/80 rounded-lg p-2 border border-gray-200/80 dark:border-gray-700/80 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Shuffle className="w-3.5 h-3.5 text-gray-500 shrink-0" />
            <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">
              Randomizer
            </span>
          </div>
          {audit.randomizer.detected ? (
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
              Terindikasi Acak
            </span>
          ) : (
            <span className="text-[10px] font-medium text-gray-600 bg-gray-100 border border-gray-200 px-1.5 py-0.2 rounded">
              Tidak Terdeteksi
            </span>
          )}
        </div>
      </div>

      {/* Summary Description */}
      {audit.summary && (
        <div className="text-xs text-gray-700 dark:text-gray-300 bg-white/60 dark:bg-gray-800/60 p-2.5 rounded-lg border border-gray-200/60 dark:border-gray-700/60 leading-relaxed">
          <span className="font-semibold text-gray-900 dark:text-white">Kesimpulan AI: </span>
          {audit.summary}
        </div>
      )}

      {/* Expandable PII Findings Breakdown */}
      {audit.pii.has_pii && audit.pii.findings.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowFindingsDetail(!showFindingsDetail)}
            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 flex items-center gap-1 cursor-pointer transition-colors"
          >
            {showFindingsDetail ? (
              <>
                <ChevronUp className="w-3 h-3" /> Sembunyikan detail temuan ({audit.pii.findings.length})
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" /> Lihat detail temuan ({audit.pii.findings.length})
              </>
            )}
          </button>

          {showFindingsDetail && (
            <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-amber-300 dark:border-amber-700 text-xs">
              {audit.pii.findings.map((finding, idx) => (
                <div
                  key={idx}
                  className="bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-700 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded">
                      {finding.type}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      Tingkat: {finding.confidence}
                    </span>
                  </div>
                  <p className="text-gray-900 dark:text-gray-100 font-mono text-[11px] bg-gray-50 dark:bg-gray-900 p-1 rounded">
                    &quot;{finding.snippet}&quot;
                  </p>
                  {finding.context && (
                    <p className="text-[10px] text-gray-500">
                      Konteks: {finding.context}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
