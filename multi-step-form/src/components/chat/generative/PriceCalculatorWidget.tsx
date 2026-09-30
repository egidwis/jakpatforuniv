import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calculator, Sparkles, ArrowRight, Zap, Flame } from 'lucide-react';
import { adRateAt } from '../../../utils/cost-calculator';
import { KILAT_ADDON_COST } from '../../../utils/constants';

export const PriceCalculatorWidget: React.FC = () => {
  const navigate = useNavigate();

  // Jumlah SOAL, bukan target responden: tarif iklan ditentukan tier soal
  // (AD_RATE_SCHEDULE). Versi sebelumnya memakai Rp150rb rata untuk semua tier
  // dan rumus Kilat karangan per 100 responden — angka yang tidak pernah
  // ditagih checkout mana pun.
  const [questionCount, setQuestionCount] = useState<number>(30);
  const [durationDays, setDurationDays] = useState<number>(1);
  const [serviceType, setServiceType] = useState<'regular' | 'kilat'>('regular');

  // Kalkulasi harga simulasi
  // Instan tarif = sekarang: order yang dibuat dari simulasi ini lahir hari ini.
  const calculation = useMemo(() => {
    const rate = adRateAt(questionCount, Date.now());
    if (serviceType === 'regular') {
      return {
        dailyPrice: rate.effective,
        listTotal: rate.list * durationDays,
        total: rate.effective * durationDays,
        introUntil: rate.introUntil,
        estSpeed: `${durationDays} - ${durationDays + 1} hari`,
        highlight: 'Cocok untuk riset akademik umum dengan budget hemat.'
      };
    }
    // Kilat: tarif dasar 1× (durasi tidak berlaku) + add-on.
    return {
      dailyPrice: rate.effective,
      listTotal: rate.list + KILAT_ADDON_COST,
      total: rate.effective + KILAT_ADDON_COST,
      introUntil: rate.introUntil,
      estSpeed: 'Kurang dari 24 jam',
      highlight: '⚡ Prioritas tayang kilat & slot terjamin untuk deadline mepet.'
    };
  }, [questionCount, durationDays, serviceType]);

  const handleOrderNow = () => {
    navigate('/?service=' + serviceType);
  };

  return (
    <div className="mt-3 p-4 bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/50 border border-indigo-100 rounded-2xl shadow-xs space-y-4 max-w-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-indigo-100/70 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600 text-white text-[11px] font-bold">
            <Calculator className="w-3.5 h-3.5" />
          </span>
          <div>
            <h4 className="text-xs font-bold text-slate-800 leading-tight">Simulasi Estimasi Biaya</h4>
            <p className="text-[10px] text-slate-500">Hitung biaya & kebutuhan durasi surveimu</p>
          </div>
        </div>
        <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1">
          <Sparkles className="w-2.5 h-2.5 text-emerald-600" />
          Kalkulator Interaktif
        </span>
      </div>

      {/* Switch Service Type */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100/80 rounded-xl">
        <button
          type="button"
          onClick={() => setServiceType('regular')}
          className={`py-1.5 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            serviceType === 'regular'
              ? 'bg-white text-indigo-700 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Flame className="w-3.5 h-3.5 text-amber-500" />
          <span>Survey Ads (Reguler)</span>
        </button>

        <button
          type="button"
          onClick={() => setServiceType('kilat')}
          className={`py-1.5 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            serviceType === 'kilat'
              ? 'bg-white text-indigo-700 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Zap className="w-3.5 h-3.5 text-amber-500" />
          <span>JFU Kilat ⚡</span>
        </button>
      </div>

      {/* Sliders */}
      <div className="space-y-3">
        {/* Slider Responden */}
        <div>
          <div className="flex justify-between items-center text-xs mb-1">
            <span className="font-semibold text-slate-700">Jumlah Soal:</span>
            <span className="font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
              {questionCount >= 100 ? '100+' : questionCount} Soal
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={100}
            step={1}
            value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
            <span>1</span>
            <span>50</span>
            <span>100+</span>
          </div>
        </div>

        {/* Slider Durasi (Hanya untuk Regular) */}
        {serviceType === 'regular' && (
          <div>
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="font-semibold text-slate-700">Durasi Penayangan Iklan:</span>
              <span className="font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                {durationDays} Hari
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={7}
              step={1}
              value={durationDays}
              onChange={(e) => setDurationDays(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
              <span>1 Hari</span>
              <span>4 Hari</span>
              <span>7 Hari</span>
            </div>
          </div>
        )}
      </div>

      {/* Summary Box */}
      <div className="p-3 bg-white border border-indigo-100 rounded-xl space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-xs font-semibold text-slate-600">Estimasi Total Biaya:</span>
          <span className="text-right">
            {calculation.listTotal > calculation.total && (
              <span className="block text-[11px] text-slate-500 line-through">
                Rp {calculation.listTotal.toLocaleString('id-ID')}
              </span>
            )}
            <span className="text-base font-extrabold text-indigo-700">
              Rp {calculation.total.toLocaleString('id-ID')}
            </span>
          </span>
        </div>
        <p className="text-[11px] text-slate-500 leading-tight">
          Biaya iklan saja — belum termasuk hadiah responden & PPN 11%.
          {calculation.introUntil && ' Harga perkenalan berlaku untuk order yang dibuat s/d '
            + new Date(`${calculation.introUntil}T00:00:00+07:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' })
            + '.'}
        </p>
        <p className="text-[11px] text-slate-500 leading-tight">
          {calculation.highlight} Estimasi perolehan: <span className="font-semibold text-slate-700">{calculation.estSpeed}</span>.
        </p>
      </div>

      {/* Action Button */}
      <button
        type="button"
        onClick={handleOrderNow}
        className="w-full inline-flex items-center justify-center gap-2 py-2 px-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer active:scale-98"
      >
        <span>Buat Order Baru dengan Pilihan Ini</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
