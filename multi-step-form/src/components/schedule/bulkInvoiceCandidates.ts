import { cardStateOf, type CardState } from '@/components/submissions/tabs/scheduleCardActions';
import type { AdScheduleEntry, ScheduleBilling } from '@/utils/supabase';

/**
 * Siapa yang boleh ikut satu tagihan gabungan, dan kenapa sisanya tidak.
 *
 * ⚠️ KELAYAKAN ITU PERTANYAAN TENTANG JADWAL, BUKAN TENTANG ORDER. Daftar
 * Submissions hanya tahu keadaan order (`paymentStates` berskala submission);
 * yang menentukan boleh-tidaknya ditagih adalah `cardStateOf` per jadwal — SATU
 * sumber yang sama dengan kartu di tab Reservasi Jadwal, supaya alasan yang
 * ditampilkan di sini tidak pernah bertentangan dengan chip di sana.
 *
 * ⚠️ YANG TERCORET HARUS TERLIHAT, BUKAN HILANG. Bentuk paling umum dari order
 * yang lolos review tapi belum ditagih adalah order TANPA `start_date`
 * (`choose_schedule`): 9 dari 10 order `approved` sejak Mei. Kalau baris seperti
 * itu dijatuhkan diam-diam, kejadian normalnya adalah admin mencentang 4 dan
 * hanya 1 yang ikut, tanpa penjelasan.
 */

export interface BulkCandidate {
  entry: AdScheduleEntry;
  submissionId: string;
  title: string;
  /** `created_at` ORDER — penentu masa berlaku voucher bundel ini. */
  orderCreatedAt: string | null;
  /**
   * ⚠️ DARI ORDER, BUKAN DARI JADWAL. `ad_schedules` tidak membawa
   * `question_count`, dan `calculateAdCostPerDay(0)` mengembalikan 0 — tanpa
   * angka ini setiap bundel lahir tanpa baris iklan sama sekali, jadi
   * tagihannya hanya berisi hadiah responden. Diamnya sempurna: formulirnya
   * tampil normal, hanya angkanya yang salah.
   */
  questionCount: number | null;
}

export interface BulkRejection {
  submissionId: string;
  title: string;
  state: CardState | 'no_schedule';
  reason: string;
  /** Ada jalan keluarnya di layar? Menentukan tombol "Tentukan Jadwal". */
  fixable: boolean;
}

export interface BulkPlan {
  candidates: BulkCandidate[];
  rejected: BulkRejection[];
}

/** Alasan yang dibaca admin, per keadaan kartu. */
const REASONS: Record<CardState | 'no_schedule', { text: string; fixable: boolean }> = {
  choose_schedule: { text: 'Belum ada tanggal tayang', fixable: true },
  awaiting_review: { text: 'Belum lolos review', fixable: false },
  waiting_payment: { text: 'Sudah punya tagihan aktif', fixable: false },
  hold_lapsed: { text: 'Slot lewat batas bayar 14.00 — centang "Tagihan tempo" kalau boleh tayang dulu', fixable: false },
  partially_paid: { text: 'Sudah dibayar sebagian', fixable: false },
  airing_on_credit: { text: 'Sudah tayang sebelum lunas dengan tagihan tempo aktif', fixable: false },
  paid: { text: 'Sudah lunas', fixable: false },
  cancelled: { text: 'Dibatalkan', fixable: false },
  no_schedule: { text: 'Belum punya jadwal sama sekali', fixable: true },
  awaiting_invoice: { text: '', fixable: false },
};

/**
 * Urutan presedens saat satu order punya beberapa jadwal yang semuanya tidak
 * layak: yang paling bisa ditindaklanjuti admin yang ditampilkan. Menyebut
 * "sudah lunas" untuk order yang jadwal lainnya cuma kurang tanggal akan
 * menghentikan admin pada masalah yang salah.
 */
const REJECTION_PRIORITY: Array<CardState | 'no_schedule'> = [
  'choose_schedule', 'no_schedule', 'waiting_payment', 'hold_lapsed',
  'awaiting_review', 'partially_paid', 'airing_on_credit', 'paid', 'cancelled',
];

/**
 * Keadaan kartu yang boleh ikut tagihan gabungan.
 *
 * Tagihan biasa: hanya `awaiting_invoice` — persis sebelum sql/102.
 *
 * Tagihan TEMPO (sql/102) membuka tiga lagi, karena batas bayar 14.00 tidak
 * berlaku baginya:
 *   `hold_lapsed`       — lewat batas bayar, tapi admin yakin penelitinya
 *                         akan membayar (kasus JFU-INV-15f4ac). Hanya yang
 *                         MASIH bertanggal; slot yang benar-benar lepas tidak.
 *   `waiting_payment`   — tagihan biasanya DIGANTI tagihan tempo;
 *                         `writeInvoiceRows` mematikan yang lama lebih dulu.
 *   `airing_on_credit`  — sudah kredit tapi belum punya tagihan tempo yang
 *                         berlaku (mis. tagihannya dibatalkan sebelum tayang).
 */
function isBillable(state: CardState, entry: AdScheduleEntry, billing: ScheduleBilling | undefined, tempo: boolean): boolean {
  if (state === 'awaiting_invoice') return true;
  if (!tempo || !entry.startDate || entry.reviewStatus !== 'approved') return false;
  if (state === 'hold_lapsed' || state === 'waiting_payment') return true;
  if (state === 'airing_on_credit') return !billing?.openInvoice;
  return false;
}

export interface PlanInput {
  submissions: Array<{
    id: string;
    formTitle: string;
    submittedAt?: string | null;
    questionCount?: number | null;
  }>;
  /** Seluruh jadwal milik order-order itu. */
  entries: AdScheduleEntry[];
  /** `schedule.id` → billing. Digabung dari `fetchScheduleBilling` per order. */
  billings: Map<string, ScheduleBilling>;
  now?: Date;
  /** Tagihan tempo — lihat `isBillable`. */
  tempo?: boolean;
}

export function planBulkInvoice(input: PlanInput): BulkPlan {
  const { submissions, entries, billings } = input;
  const tempo = !!input.tempo;
  const candidates: BulkCandidate[] = [];
  const rejected: BulkRejection[] = [];

  for (const submission of submissions) {
    const own = entries.filter((e) => e.submissionId === submission.id);

    if (own.length === 0) {
      // Terukur 0 dari 352 order sejak Mei — cermin `ad_schedules` selalu ada.
      // Tetap ditangani: nol baris berarti sesuatu yang lebih dalam rusak, dan
      // itu tidak boleh tampil sebagai order yang lenyap begitu saja.
      rejected.push({
        submissionId: submission.id,
        title: submission.formTitle,
        state: 'no_schedule',
        ...toReason('no_schedule'),
      });
      continue;
    }

    const billable = own.filter(
      (e) => isBillable(cardStateOf(e, billings.get(e.id)), e, billings.get(e.id), tempo),
    );

    if (billable.length > 0) {
      for (const entry of billable) {
        candidates.push({
          entry,
          submissionId: submission.id,
          title: submission.formTitle,
          orderCreatedAt: submission.submittedAt ?? null,
          questionCount: submission.questionCount ?? null,
        });
      }
      continue;
    }

    const states = own.map((e) => cardStateOf(e, billings.get(e.id)));
    const worst = REJECTION_PRIORITY.find((s) => states.includes(s as CardState)) ?? states[0];
    rejected.push({
      submissionId: submission.id,
      title: submission.formTitle,
      state: worst,
      ...toReason(worst),
    });
  }

  return { candidates, rejected };
}

function toReason(state: CardState | 'no_schedule') {
  const r = REASONS[state] ?? { text: 'Tidak bisa ditagih', fixable: false };
  return { reason: r.text || 'Tidak bisa ditagih', fixable: r.fixable };
}

/**
 * Apakah seluruh order yang dipilih milik SATU akun?
 *
 * ⚠️ `auth_user_id`, tidak pernah email. Email yang tampil di baris adalah
 * turunan `profiles` dan untuk order lama jatuh ke kolom bebas per order —
 * satu pembayaran yang mencampur dua pembeli membuat kuitansinya berbohong soal
 * siapa yang membayar. `null` di sini diperlakukan sebagai akun tersendiri,
 * jadi order tanpa pemilik tidak pernah menempel ke grup siapa pun.
 */
export function distinctAccounts(
  submissions: Array<{ auth_user_id?: string | null }>,
): number {
  return new Set(submissions.map((s) => s.auth_user_id ?? '(tanpa akun)')).size;
}
