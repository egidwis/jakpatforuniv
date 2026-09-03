import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ChevronDown, Check, RefreshCw } from 'lucide-react';
import { supabase, getAuthUser } from '../../utils/supabase';
import { Button } from '@/components/ui/button';
import { Chip, type ChipVariant } from '@/components/ui/chip';
import { cn } from '@/lib/utils';
import { formatIDR } from './types';

/**
 * Notifikasi pembayaran DOKU yang tidak selesai diproses.
 *
 * Lahir dari insiden 2026-08-10: DOKU mencatat pembayaran SUKSES sementara
 * dashboard admin tetap "Menunggu", dan tidak ada satu pun permukaan yang
 * memberi tahu — ketahuan hanya karena kebetulan dibandingkan manual.
 * Baris-barisnya ditulis webhook.js ke `doku_webhook_events` (sql/54).
 *
 * Di hari normal komponen ini TIDAK merender apa pun.
 */

interface WebhookEvent {
  id: string;
  received_at: string;
  invoice_number: string | null;
  doku_status: string | null;
  amount: number | null;
  outcome: string;
  http_status: number;
  error_message: string | null;
}

const OUTCOME_LABELS: Record<string, string> = {
  write_failed: 'Gagal menulis ke database',
  amount_mismatch: 'Jumlah tidak cocok',
  no_submission_found: 'Invoice tidak dikenali',
  payout: 'Payout bermasalah',
  forwarded_jm: 'Forward ke Jakpat Mission gagal',
  // sql/80 — uang sah, tagihannya sudah mati.
  paid_on_dead_bill: 'Dibayar di tagihan mati',
  // sql/77 — request yang ditolak sebelum fase tulis. Tanpa entri di ketiga
  // peta ini, chip-nya mencetak slug mentah dan hint-nya kosong: kelas bug
  // yang persis ditutup 65369c1.
  rejected_auth: 'Ditolak: autentikasi',
  rejected_payload: 'Ditolak: payload tak terbaca',
  handler_crashed: 'Handler error',
};

const OUTCOME_VARIANTS: Record<string, ChipVariant> = {
  write_failed: 'red',
  amount_mismatch: 'orange',
  no_submission_found: 'amber',
  payout: 'slate',
  forwarded_jm: 'slate',
  // Merah: uangnya sudah diterima dan BELUM tercatat sebagai pendapatan.
  // Ini bukan peringatan, ini selisih buku yang menunggu orang.
  paid_on_dead_bill: 'red',
  rejected_auth: 'orange',
  rejected_payload: 'orange',
  handler_crashed: 'red',
};

const OUTCOME_HINTS: Record<string, string> = {
  write_failed:
    'Buka Notification Center di dashboard DOKU dan klik "Kirim Ulang Notifikasi". Kalau tetap gagal, rekonsiliasi manual invoices / transactions / form_submissions.',
  amount_mismatch:
    'Jumlah yang dibayar berbeda dari nilai invoice — tidak ada yang ditulis, ini disengaja. Cocokkan angkanya sebelum menandai lunas apa pun.',
  no_submission_found:
    'Invoice ini tidak ada di transactions maupun invoices. Kirim ulang notifikasi tidak akan menolong — telusuri di dashboard DOKU siapa yang membayar.',
  // ⚠️ JANGAN tawarkan "Kirim Ulang Notifikasi" di sini. Mengirim ulang hanya
  // menghasilkan paid_on_dead_bill lagi — penolakannya disengaja, bukan
  // kegagalan teknis. Yang dibutuhkan keputusan manusia.
  paid_on_dead_bill:
    'Uang SUDAH diterima DOKU tapi BELUM tercatat sebagai pendapatan: tagihannya sudah dibatalkan/kedaluwarsa, jadi jadwalnya sengaja tidak disentuh. Pindahkan pembayaran ini ke tagihan yang masih hidup, atau proses sebagai kelebihan bayar. Kirim ulang notifikasi tidak akan menolong.',
  rejected_auth:
    'DOKU menelepon dan KITA yang menolak di gerbang autentikasi — bedakan dari "tidak ada baris sama sekali", yang berarti DOKU tidak pernah menelepon. Periksa notification URL & secret ?k= di dashboard DOKU.',
  rejected_payload:
    'Autentikasi lolos, tapi badan request tidak terbaca atau tanpa nomor invoice. Lihat raw_payload di doku_webhook_events.',
  handler_crashed:
    'Error tak terduga di handler. DOKU akan retry; kalau berulang, baca error_message dan raw_payload sebelum menyentuh data apa pun.',
};

function formatWib(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
}

export function WebhookFailuresBanner() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchEvents = useCallback(async () => {
    try {
      setRefreshing(true);
      const { data, error } = await supabase
        .from('doku_webhook_events')
        .select('id, received_at, invoice_number, doku_status, amount, outcome, http_status, error_message')
        .neq('outcome', 'ok')
        .is('resolved_at', null)
        .order('received_at', { ascending: false })
        .limit(50);

      // Tabelnya lahir di sql/54. Kalau migrasinya belum diterapkan, diam saja —
      // jangan menakuti admin dengan error untuk fitur yang belum ada.
      if (error) {
        console.warn('[WebhookFailuresBanner] tidak bisa membaca doku_webhook_events:', error.message);
        setEvents([]);
        return;
      }
      setEvents(data || []);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleResolve = async (id: string) => {
    setResolvingId(id);
    try {
      const user = await getAuthUser();
      const { error } = await supabase
        .from('doku_webhook_events')
        .update({
          resolved_at: new Date().toISOString(),
          resolved_by: user?.email || 'admin',
        })
        .eq('id', id);

      if (error) throw error;
      setEvents((prev) => prev.filter((e) => e.id !== id));
      toast.success('Ditandai selesai');
    } catch (err) {
      console.error('Error resolving webhook event:', err);
      toast.error('Gagal menandai selesai');
    } finally {
      setResolvingId(null);
    }
  };

  if (events.length === 0) return null;

  return (
    <div className="shrink-0 mb-4 rounded-xl border border-red-200 bg-red-50 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-red-900">
            {events.length} notifikasi pembayaran DOKU perlu diperiksa
          </p>
          <p className="text-xs text-red-700">
            Pembayarannya mungkin sudah diterima DOKU, tapi status di sini belum tentu ikut berubah.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchEvents}
          disabled={refreshing}
          className="text-red-700 hover:text-red-900 hover:bg-red-100"
        >
          <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((v) => !v)}
          className="text-red-700 hover:text-red-900 hover:bg-red-100 gap-1"
        >
          {expanded ? 'Tutup' : 'Lihat'}
          <ChevronDown className={cn('w-4 h-4 transition-transform', expanded && 'rotate-180')} />
        </Button>
      </div>

      {expanded && (
        <div className="border-t border-red-200 divide-y divide-red-100">
          {events.map((event) => (
            <div key={event.id} className="px-4 py-3 bg-white/60">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <Chip variant={OUTCOME_VARIANTS[event.outcome] || 'slate'} size="sm">
                  {OUTCOME_LABELS[event.outcome] || event.outcome}
                </Chip>
                <span className="font-mono text-xs text-gray-700 break-all">
                  {event.invoice_number || '(tanpa nomor invoice)'}
                </span>
                {event.amount != null && (
                  <span className="text-xs font-semibold text-gray-900">{formatIDR(event.amount)}</span>
                )}
                <span className="text-xs text-gray-500">{formatWib(event.received_at)} WIB</span>
                <span className="text-xs text-gray-400">· kita balas HTTP {event.http_status}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleResolve(event.id)}
                  disabled={resolvingId === event.id}
                  className="ml-auto gap-1 h-7 text-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  Tandai selesai
                </Button>
              </div>

              {OUTCOME_HINTS[event.outcome] && (
                <p className="text-xs text-gray-600 mb-1.5">{OUTCOME_HINTS[event.outcome]}</p>
              )}

              {event.error_message && (
                <pre className="text-[11px] leading-relaxed text-gray-500 bg-gray-50 border border-gray-200 rounded-md p-2 whitespace-pre-wrap break-words">
                  {event.error_message}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
