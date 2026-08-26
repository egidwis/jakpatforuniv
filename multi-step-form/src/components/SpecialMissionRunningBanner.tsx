import React, { useState } from 'react';
import { Target, Sparkles, ChevronRight, ArrowRight } from 'lucide-react';
import { CustomMissionModal } from './CustomMissionModal';

export const SpecialMissionRunningBanner: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const bannerText = (
    <div className="flex items-center gap-6 text-xs text-white font-medium">
      <span className="flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-amber-300 fill-amber-300 shrink-0" />
        <span>
          Butuh responden untuk <strong>Mystery Shopping toko/booth</strong>, <strong>testing website &amp; aplikasi</strong>, <strong>tasting sampel produk</strong>, atau <strong>validasi ide bisnis</strong>?
        </span>
      </span>
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/25 hover:bg-white text-white hover:text-pink-600 font-extrabold text-[11px] transition-all cursor-pointer shadow-2xs shrink-0">
        <span>Ajukan Misi Khusus</span>
        <ArrowRight className="w-3 h-3" />
      </span>
      <span className="text-white/40 text-xs select-none">•</span>
    </div>
  );

  return (
    <>
      <div
        onClick={() => setIsModalOpen(true)}
        className="w-full bg-gradient-to-r from-pink-600 via-rose-500 to-pink-600 text-white shadow-xs border-b border-pink-700/20 overflow-hidden cursor-pointer group py-2 px-3 sm:px-4 relative z-30 transition-all hover:brightness-105 select-none"
        title="Klik untuk mengajukan Misi & Aksi Khusus Responden"
      >
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          {/* Left Static Badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/20 text-white text-[10px] font-black uppercase tracking-wider shrink-0 border border-white/20 shadow-xs">
            <Target className="w-3.5 h-3.5 text-amber-300" />
            <span>Misi Khusus</span>
          </div>

          {/* Running Marquee Container */}
          <div className="flex-1 overflow-hidden relative">
            <div className="animate-marquee flex items-center gap-6 whitespace-nowrap">
              {bannerText}
              {bannerText}
              {bannerText}
              {bannerText}
            </div>
          </div>

          {/* Right Action Hint */}
          <div className="hidden md:flex items-center gap-1 text-[11px] font-bold text-white/90 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0">
            <span>Buka Form</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      <CustomMissionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
};
