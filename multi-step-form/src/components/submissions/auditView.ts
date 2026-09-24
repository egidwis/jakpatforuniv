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
  /** Teks sesudah "Pra-cek AI · " (juga jadi label aksesibel ringkasan). */
  status: string;
  buttonLabel: 'Cek' | 'Cek Ulang' | 'Memindai…';
  buttonDisabled: boolean;
  /**
   * Percobaan terakhir gagal. Terpisah dari `kind`: hasil lama yang masih
   * milik link ini tetap ditampilkan, dengan penanda gagal di sampingnya —
   * bukan diganti kalimat gagal yang menyembunyikan bukti.
   */
  failed: boolean;
  /** Ada rincian di balik ⌄ (baris ringkas selalu tampil). */
  expandable: boolean;
}

export function headerOf(
  view: AuditView | null,
  s: { isAuditing: boolean; failed: boolean },
): AuditHeader {
  const base = { buttonDisabled: false, failed: s.failed && !s.isAuditing, expandable: false };
  if (s.isAuditing) {
    return view?.isStale
      ? { ...base, kind: 'rescanning_stale', status: 'link berubah, memindai ulang…', buttonLabel: 'Memindai…', buttonDisabled: true }
      : { ...base, kind: 'scanning', status: 'memindai…', buttonLabel: 'Memindai…', buttonDisabled: true };
  }
  if (!view) {
    return s.failed
      ? { ...base, kind: 'failed', status: 'gagal memindai', buttonLabel: 'Cek' }
      : { ...base, kind: 'unchecked', status: 'belum dicek', buttonLabel: 'Cek' };
  }
  if (view.isStale) return { ...base, kind: 'stale', status: 'hasil untuk link lama', buttonLabel: 'Cek Ulang' };
  if (view.readState === 'unreadable') {
    return { ...base, kind: 'unreadable', status: 'tak terbaca', buttonLabel: 'Cek Ulang', expandable: true };
  }
  return {
    ...base,
    kind: view.isClean ? 'clean' : 'findings',
    status: factsLineOf(view),
    buttonLabel: 'Cek Ulang',
    expandable: true,
  };
}

/** "39 perkiraan AI · order 35 · +4 · tanpa data pribadi" — bentuk teks baris ringkas. */
export function factsLineOf(view: AuditView): string {
  const { detected, source, orderNow, delta } = view.count;
  const count = detected == null
    ? `jumlah tak terhitung · order ${orderNow}`
    : `${detected} ${COUNT_SOURCE_LABEL[source]} · order ${orderNow}${delta ? ` · ${delta > 0 ? '+' : ''}${delta}` : ''}`;
  const pii = view.pii.total === 0 ? 'tanpa data pribadi' : `${view.pii.total} data pribadi`;
  return `${count} · ${pii}`;
}
