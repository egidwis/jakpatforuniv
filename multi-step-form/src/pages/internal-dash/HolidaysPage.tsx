import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarOff, ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { addDaysToYmd, formatYmdId, isWeekdayYmd, toWibYmd } from '@/utils/airing-window';
import { fetchHolidays, saveHoliday, type OperationalHoliday } from '@/utils/operationalHolidays';
import { fetchKilatSchedule, type KilatScheduleEntry } from '@/utils/supabase';

/**
 * Kalender libur operasional tim admin (Phase 5 §5.4b, rilis R3).
 *
 * Satu saklar per tanggal. Aktif = Kilat TUTUP di tanggal itu (trigger sql/117
 * menolak klaim baru peneliti), Iklan otomatis tetap tayang, dan peneliti
 * melihat banner "admin libur" di dashboard, status order, dan chat Mimin.
 *
 * ⚠️ Trigger hanya memeriksa KLAIM BARU. Gelombang Kilat yang sudah terpesan
 * di tanggal yang baru diliburkan tetap berdiri — halaman ini menampilkannya
 * supaya admin memindahkan/menghubungi penelitinya secara manual.
 */

const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const WAVES_ON_HOLIDAY = 'border-amber-200 bg-amber-50 text-amber-900';
const WAVES_ON_WORKDAY = 'border-gray-200 bg-white text-gray-700';

/** YMD hari pertama bulan `ym` (YYYY-MM) dan jumlah harinya. */
function monthBounds(ym: string): { first: string; last: string; days: number } {
  const [y, m] = ym.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const first = `${ym}-01`;
  return { first, last: addDaysToYmd(first, days - 1), days };
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** Senin = 0 … Minggu = 6. */
function mondayIndex(ymd: string): number {
  return (new Date(`${ymd}T00:00:00.000Z`).getUTCDay() + 6) % 7;
}

export function HolidaysPage() {
  const todayYmd = toWibYmd(new Date());
  const [month, setMonth] = useState(todayYmd.slice(0, 7));
  const [holidays, setHolidays] = useState<Record<string, OperationalHoliday>>({});
  const [kilat, setKilat] = useState<KilatScheduleEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [saving, setSaving] = useState(false);

  const { first, last, days } = monthBounds(month);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, waves] = await Promise.all([
        fetchHolidays(first, last),
        fetchKilatSchedule(first, last).catch(() => [] as KilatScheduleEntry[]),
      ]);
      setHolidays(Object.fromEntries(rows.map((h) => [h.date, h])));
      setKilat(waves);
    } catch (err: any) {
      toast.error(`Gagal memuat hari libur: ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  }, [first, last]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setDraftLabel(selected ? holidays[selected]?.label ?? '' : '');
  }, [selected, holidays]);

  const wavesByDay = useMemo(() => {
    const map: Record<string, KilatScheduleEntry[]> = {};
    for (const w of kilat) (map[w.ymd] ||= []).push(w);
    return map;
  }, [kilat]);

  const cells: (string | null)[] = [
    ...Array.from({ length: mondayIndex(first) }, () => null),
    ...Array.from({ length: days }, (_, i) => addDaysToYmd(first, i)),
  ];

  const activeCount = Object.values(holidays).filter((h) => h.isActive).length;
  const selectedHoliday = selected ? holidays[selected] : undefined;
  const selectedWaves = selected ? wavesByDay[selected] ?? [] : [];

  const persist = async (date: string, isActive: boolean, label: string) => {
    setSaving(true);
    try {
      const saved = await saveHoliday({ date, isActive, label });
      setHolidays((prev) => ({ ...prev, [date]: saved }));
      toast.success(isActive ? `${formatYmdId(date)} ditandai libur` : `${formatYmdId(date)} kembali hari kerja`);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-3xl mx-auto w-full">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-jfu-primary text-white flex items-center justify-center shadow-md shrink-0">
            <CalendarOff className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-gray-900">Hari Libur</h1>
            <p className="text-xs text-gray-500">
              Tanggal aktif: JFU Kilat tutup, Iklan otomatis tetap tayang, peneliti diberi tahu admin libur.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-50 shrink-0"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          Muat ulang
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="Bulan sebelumnya">
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <div className="text-center">
            <div className="text-sm font-bold text-gray-900">
              {new Date(`${first}T00:00:00.000Z`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
            </div>
            <div className="text-[11px] text-gray-500">{activeCount} tanggal libur aktif</div>
          </div>
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="Bulan berikutnya">
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-[10px] font-semibold text-gray-400 py-1">{d}</div>
          ))}
          {cells.map((ymd, i) => {
            if (!ymd) return <div key={`pad-${i}`} />;
            const h = holidays[ymd];
            const isOn = h?.isActive === true;
            const weekend = !isWeekdayYmd(ymd);
            const waves = wavesByDay[ymd]?.length ?? 0;
            return (
              <button
                key={ymd}
                type="button"
                onClick={() => setSelected(ymd)}
                className={cn(
                  'relative rounded-lg py-2 text-xs font-semibold border transition-colors min-h-[44px]',
                  selected === ymd ? 'ring-2 ring-blue-500' : '',
                  isOn
                    ? 'bg-rose-50 border-rose-200 text-rose-700'
                    : weekend
                      ? 'bg-gray-50 border-transparent text-gray-400'
                      : 'bg-white border-gray-100 text-gray-800 hover:bg-gray-50',
                  ymd === todayYmd && 'underline underline-offset-2',
                )}
                title={h?.label || undefined}
              >
                {Number(ymd.slice(8))}
                {isOn && <span className="block text-[9px] font-medium truncate px-0.5">{h.label || 'Libur'}</span>}
                {waves > 0 && (
                  <span
                    className={cn(
                      'absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full',
                      isOn ? 'bg-amber-500' : 'bg-blue-400',
                    )}
                    aria-label={`${waves} gelombang Kilat`}
                  />
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-gray-500">
          Titik biru = ada gelombang Kilat terpesan; titik oranye = gelombang terpesan di tanggal libur.
        </p>
      </div>

      {selected && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-gray-900">{formatYmdId(selected)}</div>
              <div className="text-[11px] text-gray-500">
                {!isWeekdayYmd(selected)
                  ? 'Akhir pekan — Kilat sudah tutup tanpa saklar ini.'
                  : selectedHoliday?.isActive
                    ? 'Libur aktif: Kilat tutup, peneliti melihat banner admin libur.'
                    : 'Hari kerja biasa.'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
              <Switch
                checked={selectedHoliday?.isActive === true}
                disabled={saving}
                onCheckedChange={(on) => persist(selected, on, draftLabel)}
                aria-label="Tandai libur"
              />
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-gray-700">Label (tampil ke peneliti)</span>
            <div className="mt-1 flex gap-2">
              <input
                value={draftLabel}
                maxLength={80}
                onChange={(e) => setDraftLabel(e.target.value)}
                placeholder="mis. Natal"
                className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={saving || draftLabel.trim() === (selectedHoliday?.label ?? '')}
                onClick={() => persist(selected, selectedHoliday?.isActive === true, draftLabel)}
                className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold disabled:opacity-40"
              >
                Simpan label
              </button>
            </div>
          </label>

          {selectedWaves.length > 0 && (
            <div className={cn('rounded-xl border p-3 text-xs', selectedHoliday?.isActive ? WAVES_ON_HOLIDAY : WAVES_ON_WORKDAY)}>
              <div className="flex items-center gap-1.5 font-bold mb-1.5">
                {selectedHoliday?.isActive && <AlertTriangle className="w-3.5 h-3.5" />}
                {selectedWaves.length} gelombang Kilat sudah terpesan di tanggal ini
              </div>
              {selectedHoliday?.isActive && (
                <p className="mb-2">
                  Saklar libur tidak memindahkan pesanan yang sudah ada. Pindahkan gelombangnya atau hubungi penelitinya secara manual.
                </p>
              )}
              <ul className="space-y-1">
                {selectedWaves.map((w) => (
                  <li key={w.id} className="flex justify-between gap-2">
                    <span className="truncate">
                      {w.hour != null ? `${String(w.hour).padStart(2, '0')}.00` : '—'} · {w.title} · {w.researcherName}
                    </span>
                    <span className="shrink-0 font-mono text-[10px]">{w.id.slice(0, 8)} · {w.paymentStatus || '—'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
