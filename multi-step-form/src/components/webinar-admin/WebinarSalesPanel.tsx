import { cn } from '@/lib/utils';
import {
    formatRupiah, parseWholeNumber, priceBreakdown, seatsSummary,
    type AdminWebinarEvent, type SalesChoice, type WebinarForm,
} from '@/utils/webinarAdmin';
import type { FieldErrors } from './useWebinarEditor';
import { Field, PanelHeading, WibDateTime, inputClass } from './WebinarFormParts';

function Radio({
    checked, onSelect, disabled, children,
}: { checked: boolean; onSelect: () => void; disabled?: boolean; children: React.ReactNode }) {
    return (
        <label className={cn('flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm', disabled ? 'opacity-60' : 'cursor-pointer hover:bg-slate-50')}>
            <input type="radio" checked={checked} onChange={onSelect} disabled={disabled} className="h-4 w-4 accent-blue-600" />
            <span className={cn(checked ? 'font-semibold text-slate-900' : 'text-slate-700')}>{children}</span>
        </label>
    );
}

export function WebinarSalesPanel({
    form,
    update,
    errors,
    row,
    disabled,
}: {
    form: WebinarForm;
    update: (patch: Partial<WebinarForm>) => void;
    errors: FieldErrors;
    row: AdminWebinarEvent | null;
    disabled: boolean;
}) {
    const published = row?.status === 'published';
    const choose = (salesChoice: SalesChoice) => update({ salesChoice });
    const price = parseWholeNumber(form.price);
    const breakdown = priceBreakdown(typeof price === 'number' && !Number.isNaN(price) ? price : null);
    const seats = seatsSummary(row?.webinar_offer_state);

    return (
        <div className="space-y-6">
            <section className="space-y-3">
                <PanelHeading>Penjualan</PanelHeading>
                <div>
                    <p className="mb-1 text-[13px] font-semibold text-slate-800">Halaman ini menjual</p>
                    <Radio checked onSelect={() => {}} disabled={disabled}>Tiket webinar</Radio>
                </div>

                <Field field="sales_open_at" label="Penjualan dibuka" error={errors.sales_open_at}>
                    <div className="space-y-0.5">
                        <Radio checked={form.salesChoice === 'now'} onSelect={() => choose('now')} disabled={disabled}>Sekarang</Radio>
                        <Radio checked={form.salesChoice === 'date'} onSelect={() => choose('date')} disabled={disabled}>Pada tanggal</Radio>
                        {form.salesChoice === 'date' && (
                            <div className="pb-1 pl-8">
                                <WibDateTime
                                    label="Tanggal buka"
                                    date={form.openDate}
                                    time={form.openTime}
                                    onChange={({ date, time }) => update({ openDate: date, openTime: time })}
                                    disabled={disabled}
                                    error={errors.sales_open_at}
                                />
                            </div>
                        )}
                        <Radio checked={form.salesChoice === 'undecided'} onSelect={() => choose('undecided')} disabled={disabled}>
                            Belum ditentukan
                        </Radio>
                        {published && (
                            <Radio checked={form.salesChoice === 'closed'} onSelect={() => choose('closed')} disabled={disabled}>
                                Ditutup
                            </Radio>
                        )}
                    </div>
                </Field>

                <Field field="sales_close_at" label="Penjualan ditutup" error={errors.sales_close_at}>
                    <label className={cn('flex items-center gap-2.5 px-2 py-1.5 text-sm text-slate-700', !disabled && 'cursor-pointer')}>
                        <input
                            type="checkbox"
                            checked={form.closeAtStart}
                            onChange={(e) => update({ closeAtStart: e.target.checked })}
                            disabled={disabled}
                            className="h-4 w-4 accent-blue-600"
                        />
                        Saat acara mulai
                    </label>
                    {!form.closeAtStart && (
                        <div className="pl-8 pt-1">
                            <WibDateTime
                                label="Tanggal tutup"
                                date={form.closeDate}
                                time={form.closeTime}
                                onChange={({ date, time }) => update({ closeDate: date, closeTime: time })}
                                disabled={disabled}
                                error={errors.sales_close_at}
                            />
                        </div>
                    )}
                </Field>
            </section>

            <hr className="border-slate-200" />

            <section className="space-y-4">
                <PanelHeading>Jadwal</PanelHeading>
                <Field field="starts_at" label="Mulai" error={errors.starts_at}>
                    <WibDateTime
                        label="Mulai"
                        date={form.startDate}
                        time={form.startTime}
                        onChange={({ date, time }) => update({ startDate: date, startTime: time })}
                        disabled={disabled}
                        error={errors.starts_at}
                    />
                </Field>
                <Field field="duration_minutes" label="Durasi" error={errors.duration_minutes}>
                    <div className="flex items-center gap-2">
                        <input
                            inputMode="numeric"
                            value={form.duration}
                            onChange={(e) => update({ duration: e.target.value })}
                            disabled={disabled}
                            placeholder="90"
                            className={cn(inputClass(errors.duration_minutes), '!w-24')}
                        />
                        <span className="text-sm text-slate-500">menit</span>
                    </div>
                </Field>
            </section>

            <section className="space-y-4">
                <PanelHeading>Harga & kuota</PanelHeading>
                <Field
                    field="price"
                    label="Harga"
                    error={errors.price}
                    hint={breakdown
                        ? `= ${formatRupiah(breakdown.subtotal)} + PPN 11% ${formatRupiah(breakdown.ppn)}`
                        : 'Sudah termasuk PPN 11%. Minimal Rp 1.000.'}
                >
                    <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">Rp</span>
                        <input
                            inputMode="numeric"
                            value={form.price}
                            onChange={(e) => update({ price: e.target.value })}
                            disabled={disabled}
                            placeholder="50000"
                            className={cn(inputClass(errors.price), '!pl-9')}
                        />
                    </div>
                </Field>
                <Field
                    field="quota"
                    label="Kuota"
                    error={errors.quota}
                    hint={row && row.status !== 'draft' ? `Terjual ${seats.sold} · ditahan ${seats.held}` : undefined}
                >
                    <div className="flex items-center gap-2">
                        <input
                            inputMode="numeric"
                            value={form.quota}
                            onChange={(e) => update({ quota: e.target.value })}
                            disabled={disabled}
                            placeholder="100"
                            className={cn(inputClass(errors.quota), '!w-28')}
                        />
                        <span className="text-sm text-slate-500">kursi</span>
                    </div>
                </Field>
            </section>

            <section className="space-y-4">
                <PanelHeading>Link Zoom/Meet</PanelHeading>
                <Field
                    field="meeting_url"
                    label="Link rapat"
                    error={errors.meeting_url}
                    hint="Hanya terlihat oleh pemegang tiket lewat link gabung. Boleh menyusul."
                >
                    <input
                        type="url"
                        value={form.meeting_url}
                        onChange={(e) => update({ meeting_url: e.target.value })}
                        disabled={disabled}
                        placeholder="https://zoom.us/j/..."
                        className={inputClass(errors.meeting_url)}
                    />
                </Field>
            </section>

            <label className={cn('flex items-start gap-2.5 text-sm text-slate-700', !disabled && 'cursor-pointer')}>
                <input
                    type="checkbox"
                    checked={form.is_listed}
                    onChange={(e) => update({ is_listed: e.target.checked })}
                    disabled={disabled}
                    className="mt-0.5 h-4 w-4 accent-blue-600"
                />
                <span>
                    <span className="font-semibold text-slate-800">Tampil di daftar</span>
                    <span className="block text-xs text-slate-500">Muncul di /webinar dan homepage. Matikan untuk acara yang hanya dibagikan lewat link.</span>
                </span>
            </label>
        </div>
    );
}
