import type { FormAuditFinding, FormAuditResult } from './types';

// ─────────────────────────────────────────────────────────────
// Kartu Pra-cek AI: SEMUA keputusan tampilan di satu tempat yang bisa diuji,
// komponennya hanya merender. Pola sama dengan `cardStateOf` /
// `deriveOrderUiState`.
//
// ⛔ BUKTI, BUKAN VONIS. `status`/`recommendation` hasil LLM tetap tersimpan
// tapi TIDAK dibaca di sini. Terukur pada 59 audit produksi (23 Sep 2026):
// UI lama meng-OR-kan keduanya, dan LLM menulis `status:clean` +
// `reject_or_revise` — 27 kartu hijau, hanya 3 yang benar-benar disarankan
// approve. 10 dari 12 kartu "0 pertanyaan" berasal dari halaman login, dan
// tampil HIJAU.
// ─────────────────────────────────────────────────────────────

export type AuditReadState = 'read' | 'unreadable';
export type CountSource = 'parser' | 'ai';

export interface AuditCountView {
  /** null = tidak terhitung. */
  detected: number | null;
  source: CountSource;
  /** Jumlah pertanyaan order SAAT INI — bukan `reported` yang tersimpan di audit. */
  orderNow: number;
  /** detected − orderNow, dihitung ulang tiap render. null bila tak terhitung. */
  delta: number | null;
  /** Kurang dari order, tebakan AI, dan teksnya terpotong: mungkin terbaca sebagian. */
  maybePartial: boolean;
}

export interface AuditView {
  readState: AuditReadState;
  /** Audit dibuat untuk link yang BUKAN link order sekarang. */
  isStale: boolean;
  platformLabel: string;
  count: AuditCountView;
  /** Temuan diurutkan per `confidence`; `types` = semua jenis, tanpa duplikat. */
  pii: { total: number; top: FormAuditFinding[]; rest: number; types: string[] };
  /** Ada yang layak dikirim ke peneliti: data pribadi, atau pertanyaan lebih banyak dari order. */
  hasEvidence: boolean;
  /** Terbaca, jumlah cocok, nol temuan — kartu boleh diringkas satu baris. */
  isClean: boolean;
  summary: string;
  auditedAt: string | null;
}

const PLATFORM_LABEL: Record<string, string> = {
  google_forms: 'Google Forms',
  microsoft_forms: 'Microsoft Forms',
  typeform: 'Typeform',
  qualtrics: 'Qualtrics',
  other: 'Survei eksternal',
};

const CONFIDENCE_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export const PII_TOP = 3;

const sameUrl = (a: string | null | undefined, b: string | null | undefined) =>
  (a || '').trim() === (b || '').trim();

export function isAuditStale(audit: FormAuditResult, formUrl: string | null | undefined): boolean {
  // Audit tanpa url (baris sangat lama / gagal total) tidak bisa dibandingkan —
  // anggap tidak basi, supaya tidak memicu audit ulang tanpa henti.
  if (!audit.url) return false;
  return !sameUrl(audit.url, formUrl);
}

export function auditViewOf(
  audit: FormAuditResult,
  submission: { formUrl: string | null | undefined; questionCount: number | null | undefined },
): AuditView {
  const rawDetected = audit.question_count?.actual_detected ?? null;
  // Baris lama (tanpa read_state): LLM yang melapor 0 = halaman login.
  const readState: AuditReadState = audit.read_state ?? (rawDetected === 0 ? 'unreadable' : 'read');
  const source: CountSource = audit.count_source ?? 'ai';
  const detected = readState === 'unreadable' ? null : rawDetected;
  const orderNow = submission.questionCount || 0;
  const delta = detected == null ? null : detected - orderNow;

  const findings = readState === 'unreadable' ? [] : [...(audit.pii?.findings ?? [])];
  findings.sort((a, b) => (CONFIDENCE_RANK[a.confidence] ?? 3) - (CONFIDENCE_RANK[b.confidence] ?? 3));

  const hasEvidence = findings.length > 0 || (delta != null && delta > 0);

  return {
    readState,
    isStale: isAuditStale(audit, submission.formUrl),
    platformLabel: PLATFORM_LABEL[audit.source_platform] ?? 'Survei eksternal',
    count: {
      detected,
      source,
      orderNow,
      delta,
      maybePartial: source === 'ai' && Boolean(audit.text_truncated) && delta != null && delta < 0,
    },
    pii: {
      total: findings.length,
      top: findings.slice(0, PII_TOP),
      rest: Math.max(0, findings.length - PII_TOP),
      types: Array.from(new Set(findings.map((f) => f.type))),
    },
    hasEvidence,
    isClean: readState === 'read' && findings.length === 0 && delta === 0,
    summary: audit.summary || '',
    auditedAt: audit.audited_at || null,
  };
}

export const COUNT_SOURCE_LABEL: Record<CountSource, string> = {
  parser: 'terhitung',
  ai: 'perkiraan AI',
};

// ─────────────────────────────────────────────────────────────
// Kapan auto-cek berjalan.
//
// `autoRun` = `isNeedReview` di SubmissionDetailSheet — kondisi yang sama
// dengan tampilnya Approve/Reject. Order yang sudah diputuskan tidak memicu
// browser + AI saat drawer dibuka. Link yang berubah memicu audit ulang TEPAT
// sekali per pembukaan (`alreadyTriggered` dikunci `${id}|${formUrl}`).
// ─────────────────────────────────────────────────────────────

export function shouldAutoAudit(p: {
  autoRun: boolean;
  audit: FormAuditResult | null | undefined;
  formUrl: string | null | undefined;
  isAuditing: boolean;
  alreadyTriggered: boolean;
}): boolean {
  if (!p.autoRun || !p.formUrl || p.isAuditing || p.alreadyTriggered) return false;
  return !p.audit || isAuditStale(p.audit, p.formUrl);
}

export const autoAuditKey = (submissionId: string, formUrl: string | null | undefined) =>
  `${submissionId}|${(formUrl || '').trim()}`;

// ─────────────────────────────────────────────────────────────
// Kepala kartu: teks status + label tombol, untuk SETIAP keadaan. Tombol cek
// selalu terlihat — bukan di balik ⌄, bukan di menu.
// ─────────────────────────────────────────────────────────────

export type AuditHeaderKind =
  | 'scanning'
  | 'rescanning_stale'
  | 'failed'
  | 'unchecked'
  | 'stale'
  | 'unreadable'
  | 'clean'
  | 'findings';

export interface AuditHeader {
  kind: AuditHeaderKind;
  /** Teks sesudah "Pra-cek AI · ". */
  status: string;
  buttonLabel: 'Cek' | 'Cek Ulang' | 'Memindai…';
  buttonDisabled: boolean;
}

export function headerOf(
  view: AuditView | null,
  s: { isAuditing: boolean; failed: boolean },
): AuditHeader {
  if (s.isAuditing) {
    return view?.isStale
      ? { kind: 'rescanning_stale', status: 'link berubah, memindai ulang…', buttonLabel: 'Memindai…', buttonDisabled: true }
      : { kind: 'scanning', status: 'memindai…', buttonLabel: 'Memindai…', buttonDisabled: true };
  }
  const again = view ? 'Cek Ulang' : 'Cek';
  if (s.failed) return { kind: 'failed', status: 'gagal memindai', buttonLabel: again, buttonDisabled: false };
  if (!view) return { kind: 'unchecked', status: 'belum dicek', buttonLabel: 'Cek', buttonDisabled: false };
  if (view.isStale) return { kind: 'stale', status: 'hasil untuk link lama', buttonLabel: 'Cek Ulang', buttonDisabled: false };
  if (view.readState === 'unreadable') return { kind: 'unreadable', status: 'tak terbaca', buttonLabel: 'Cek Ulang', buttonDisabled: false };
  if (view.isClean) return { kind: 'clean', status: cleanLineOf(view), buttonLabel: 'Cek Ulang', buttonDisabled: false };
  return { kind: 'findings', status: view.platformLabel, buttonLabel: 'Cek Ulang', buttonDisabled: false };
}

/** "36 terhitung = order 36 · tanpa data pribadi" */
export function cleanLineOf(view: AuditView): string {
  return `${view.count.detected} ${COUNT_SOURCE_LABEL[view.count.source]} = order ${view.count.orderNow} · tanpa data pribadi`;
}

/**
 * Template "Salin Catatan" untuk peneliti — HANYA bukti, dan memakai `delta`
 * hasil hitung ulang terhadap order sekarang (bukan `question_count.status`
 * yang basi). Ringkasan & randomizer LLM sengaja tidak ikut: keduanya tidak
 * terukur, dan yang pertama bisa menyebut angka yang berbeda dari parser.
 */
export function reviewNotesOf(
  view: AuditView,
  submission: { researcherName?: string | null; formTitle?: string | null },
): string {
  let text = `Halo Kak ${submission.researcherName || ''},\n\n`;
  text += `Berikut catatan hasil verifikasi awal untuk kuesioner "${submission.formTitle || ''}":\n`;
  const { detected, delta, orderNow } = view.count;
  if (detected != null && delta != null && delta > 0) {
    text += `- 📋 Jumlah pertanyaan: terdapat ${detected} pertanyaan, sedangkan order diajukan ${orderNow} pertanyaan (selisih +${delta}).\n`;
  }
  if (view.pii.total > 0) {
    text += `- 🛡️ Data Pribadi (PII): terdapat permintaan data pribadi (${view.pii.types.join(', ')}). Mohon pastikan data bersifat opsional untuk pengiriman reward/hadiah, atau ditiadakan dari kuesioner utama sesuai regulasi Jakpat.\n`;
  }
  text += `\nMohon bantuannya untuk memeriksa kembali kuesioner ya Kak. Terima kasih! 🙏`;
  return text;
}
