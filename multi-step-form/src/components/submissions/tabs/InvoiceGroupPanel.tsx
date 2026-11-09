import { useState } from 'react';
import { Check, Copy, ExternalLink, Layers, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { formatIDR } from '@/utils/currency';
import { formatWibShort } from '@/utils/airing-window';
import { payLinkUrl } from '@/utils/payLink';
import { supabase, type InvoiceGroup } from '@/utils/supabase';
import { closeTab, invoiceReadyMessage, openBlankTab, sendToTab } from '@/utils/waMessage';

/**
 * Panel "tagihan gabungan" di kartu jadwal admin.
 *
 * ⚠️ INFORMASI, BUKAN BARIS AKSI KEDUA — dan itu keputusan, bukan kelalaian.
 * Aksi kartu ini punya SATU sumber (`planCardActions`), dan invarian tab ini
 * berbunyi "maksimal satu tombol di luar menu ⋯". Menumbuhkan tombol
 * "Tandai Lunas"/"Batalkan" di sini berarti dua permukaan yang menawarkan aksi
 * uang yang sama, dengan dua gerbang yang bisa menyimpang — persis pola yang
 * dibongkar saat `PaymentSection` dibubarkan. Yang membuat cakupannya jujur
 * adalah LABEL aksinya ("Tandai Lunas (3 pesanan)") dan dialog konsekuensinya;
 * panel ini yang menyediakan buktinya: siapa saja yang ikut, dan berapa.
 *
 * Panel ini juga satu-satunya tempat di layar admin yang bisa menjawab
 * "pesanan mana lagi yang ikut tagihan ini" — anggota grup tersebar di ORDER
 * yang berbeda, jadi drawer order manapun hanya melihat potongannya sendiri.
 */
const DEAD_LABEL: Record<string, string> = { cancelled: 'batal', expired: 'kedaluwarsa', failed: 'gagal' };

export function InvoiceGroupPanel({
  group, currentScheduleId, expiresAt, researcherName, phoneNumber,
}: {
  group: InvoiceGroup;
  /** Jadwal yang kartunya sedang dibuka — ditandai «ini» di daftar. */
  currentScheduleId: string | null;
  /** Kapan link-nya mati. Null = tidak diketahui (baris pra-Bagian 3). */
  expiresAt?: string | null;
  researcherName?: string | null;
  phoneNumber?: string | null;
}) {
  const [busy, setBusy] = useState(false);

  if (group.memberCount < 2) return null;
  // Grup mati tetap ditampilkan (riwayat), tapi tidak boleh terbaca seperti
  // tagihan berjalan. 2 Nov 2026: grup batal berbunyi "Hidup s/d Sel, 3 Nov"
  // dan "belum" di keempat anggota, persis di bawah "Tagihan dibatalkan".
  const dead = !!group.allDead;
  const leadScheduleId = group.members[0]?.scheduleId ?? currentScheduleId;

  const buildWaPayload = async () => {
    if (!leadScheduleId) return null;
    let resolvedName = researcherName;
    let resolvedPhone = phoneNumber;
    const txBySchedule = new Map<string, any>();
    const txBySubmission = new Map<string, any>();
    const subById = new Map<string, any>();
    const schedById = new Map<string, any>();

    try {
      const subIds = Array.from(new Set(group.members.map((m) => m.submissionId).filter((v): v is string => !!v)));
      const schedIds = Array.from(new Set(group.members.map((m) => m.scheduleId).filter((v): v is string => !!v)));

      const [txRes, subRes, schedRes] = await Promise.all([
        supabase
          .from('transactions')
          .select('schedule_id, form_submission_id, amount, subtotal, ppn_amount, note')
          .eq('payment_id', group.paymentId),
        subIds.length > 0
          ? supabase.from('form_submissions').select('id, title, survey_url, full_name, phone_number').in('id', subIds)
          : Promise.resolve({ data: [] as any[] }),
        schedIds.length > 0
          ? supabase.from('ad_schedules').select('id, start_date, kilat_slot_hour').in('id', schedIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      for (const r of txRes.data || []) {
        if (r.schedule_id) txBySchedule.set(r.schedule_id, r);
        if (r.form_submission_id && !txBySubmission.has(r.form_submission_id)) {
          txBySubmission.set(r.form_submission_id, r);
        }
      }
      for (const s of subRes.data || []) {
        subById.set(s.id, s);
        if (!resolvedName && s.full_name) resolvedName = s.full_name;
        if (!resolvedPhone && s.phone_number) resolvedPhone = s.phone_number;
      }
      for (const sc of schedRes.data || []) {
        schedById.set(sc.id, sc);
      }
    } catch (err) {
      console.error('Gagal memuat rincian tagihan gabungan untuk WA:', err);
    }

    let totalSub = 0;
    let totalPpn = 0;
    let hasAllSub = true;

    const bundles = group.members.map((m) => {
      const tx = (m.scheduleId ? txBySchedule.get(m.scheduleId) : null)
        ?? (m.submissionId ? txBySubmission.get(m.submissionId) : null);
      const sub = m.submissionId ? subById.get(m.submissionId) : null;
      const sched = m.scheduleId ? schedById.get(m.scheduleId) : null;

      let parsedItems: Array<{ name: string; qty: number; price: number; total?: number }> | undefined;
      if (tx?.note) {
        try {
          const noteObj = typeof tx.note === 'string' ? JSON.parse(tx.note) : tx.note;
          if (Array.isArray(noteObj?.items)) {
            parsedItems = noteObj.items.map((it: any) => ({
              name: String(it.name || ''),
              qty: Number(it.qty || 1),
              price: Number(it.price || 0),
              total: Number(it.qty || 1) * Number(it.price || 0),
            }));
          }
        } catch {
          // abaikan jika note bukan JSON
        }
      }

      const subtotal = tx?.subtotal != null ? Number(tx.subtotal) : undefined;
      const ppn = tx?.ppn_amount != null ? Number(tx.ppn_amount) : undefined;
      if (subtotal != null && ppn != null) {
        totalSub += subtotal;
        totalPpn += ppn;
      } else {
        hasAllSub = false;
      }

      return {
        title: m.title || sub?.title || 'Survei Anda',
        surveyUrl: sub?.survey_url || null,
        startDate: m.startDate ?? sched?.start_date ?? null,
        kilatSlotHour: sched?.kilat_slot_hour ?? null,
        items: parsedItems,
        subtotal,
        ppn,
        amount: m.amount,
      };
    });

    const message = invoiceReadyMessage({
      researcherName: resolvedName,
      bundles,
      subtotal: hasAllSub && totalSub > 0 ? totalSub : undefined,
      ppn: hasAllSub && totalSub > 0 ? totalPpn : undefined,
      amount: group.total,
      invoiceUrl: payLinkUrl(leadScheduleId),
      tempo: group.isTempo,
    });

    return { phone: resolvedPhone, message };
  };

  const handleCopyWa = async () => {
    setBusy(true);
    try {
      const payload = await buildWaPayload();
      if (!payload) return;
      await navigator.clipboard.writeText(payload.message);
      toast.success('Template WhatsApp tagihan gabungan disalin.');
    } catch {
      toast.error('Gagal menyalin template WhatsApp.');
    } finally {
      setBusy(false);
    }
  };

  const handleSendWa = async () => {
    const waTab = openBlankTab();
    setBusy(true);
    try {
      const payload = await buildWaPayload();
      if (!payload) {
        closeTab(waTab);
        return;
      }
      sendToTab(waTab, payload.phone, payload.message);
    } catch {
      closeTab(waTab);
      toast.error('Gagal menyiapkan pesan WhatsApp.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={dead
      ? 'rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 space-y-2'
      : 'rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2.5 space-y-2'}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Layers className={`w-3.5 h-3.5 shrink-0 ${dead ? 'text-slate-500' : 'text-blue-600'}`} />
        <span className={`text-[11px] font-bold uppercase tracking-wide ${dead ? 'text-slate-600' : 'text-blue-900'}`}>
          Tagihan gabungan{group.isTempo ? ' tempo' : ''} · {group.memberCount} pesanan
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-slate-600">
          {dead ? 'Pernah ditagih' : 'Total ditagih'}{' '}
          <strong className={`font-semibold tabular-nums ${dead ? 'text-slate-600 line-through' : 'text-slate-900'}`}>{formatIDR(group.total)}</strong>
        </span>
        {group.allPaid ? (
          <span className="font-semibold text-emerald-700">Lunas seluruhnya</span>
        ) : dead ? (
          <span className="font-semibold text-slate-700">Tidak berlaku lagi</span>
        ) : expiresAt ? (
          <span className="text-slate-500">
            Hidup s/d <strong className="font-semibold text-slate-700">{formatWibShort(expiresAt)}</strong>
          </span>
        ) : null}
      </div>

      <ul className="space-y-1">
        {group.members.map((m, i) => {
          const isCurrent = !!currentScheduleId && m.scheduleId === currentScheduleId;
          return (
            <li
              key={m.scheduleId ?? `${m.paymentId}-${i}`}
              className="flex items-center justify-between gap-2 text-[11px]"
            >
              <span className="min-w-0 flex items-center gap-1.5">
                <span className="text-slate-400 tabular-nums shrink-0">{i + 1}.</span>
                <span className={isCurrent ? 'truncate font-semibold text-slate-900' : 'truncate text-slate-600'}>
                  {m.title}
                </span>
                {/* Tanpa penanda ini admin harus mencocokkan judul sendiri untuk
                    tahu kartu mana yang sedang ia buka di dalam daftar anggota. */}
                {isCurrent && <span className="shrink-0 text-[10px] font-bold text-blue-700">◀ ini</span>}
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="tabular-nums text-slate-600">{formatIDR(m.amount)}</span>
                {m.isPaid ? (
                  <span className="inline-flex items-center gap-0.5 font-semibold text-emerald-700">
                    <Check className="w-3 h-3" /> lunas
                  </span>
                ) : m.isDead ? (
                  <span className="text-slate-500">{DEAD_LABEL[m.status.toLowerCase()] ?? 'mati'}</span>
                ) : (
                  <span className="text-slate-500">belum</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
        <a
          href={`/invoices/${group.paymentId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:underline"
        >
          Buka {group.allPaid ? 'kuitansi' : 'tagihan'} gabungan{dead ? ' (riwayat)' : ''}
          <ExternalLink className="w-3 h-3" />
        </a>

        {!group.allPaid && !dead && leadScheduleId && (
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleCopyWa()}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-blue-700 hover:underline disabled:opacity-50"
              title="Salin teks WhatsApp tagihan gabungan beserta rincian tiap pesanan"
            >
              <Copy className="w-3 h-3" /> Salin WA
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSendWa()}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 hover:underline disabled:opacity-50"
              title="Kirim tagihan gabungan via WhatsApp"
            >
              <MessageCircle className="w-3 h-3" /> Kirim WA
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
