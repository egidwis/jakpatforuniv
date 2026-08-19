import React, { useState, useRef } from 'react';
import { UploadCloud, FileSpreadsheet, Sparkles, Loader2, FileText, CheckCircle2 } from 'lucide-react';
import { parseCSV, profileSurveyDataset } from '../../utils/surveyDataProfiler';
import type { DatasetSummary } from './types';
import { toast } from 'sonner';

interface CsvUploadDropzoneProps {
  onDataLoaded: (summary: DatasetSummary, rawRows: Record<string, string>[]) => void;
  isLoading?: boolean;
}

const SAMPLE_CSV = `Jenis Kelamin,Usia,Semester,Fakultas,Frekuensi Belanja Online,Tingkat Kepuasan Layanan,Metode Pembayaran Utama,Kendala Terbesar
Perempuan,20,Semester 4,Ekonomi & Bisnis,Lebih dari 5x sebulan,Sangat Puas,E-Wallet (GoPay/ShopeePay/DANA),Ongkos Kirim Mahal
Laki-laki,21,Semester 6,Ilmu Komputer,2-4x sebulan,Puas,E-Wallet (GoPay/ShopeePay/DANA),Waktu Pengiriman Lama
Perempuan,19,Semester 2,Ilmu Sosial & Politik,Lebih dari 5x sebulan,Sangat Puas,QRIS Bank,Barang Tidak Sesuai Foto
Laki-laki,22,Semester 8,Teknik,1x sebulan,Cukup Puas,Transfer Bank,Ongkos Kirim Mahal
Perempuan,21,Semester 6,Kedokteran,2-4x sebulan,Puas,E-Wallet (GoPay/ShopeePay/DANA),Customer Service Lambat
Laki-laki,20,Semester 4,Ekonomi & Bisnis,Lebih dari 5x sebulan,Puas,QRIS Bank,Ongkos Kirim Mahal
Perempuan,22,Semester 8,Hukum,2-4x sebulan,Sangat Puas,E-Wallet (GoPay/ShopeePay/DANA),Barang Tidak Sesuai Foto
Laki-laki,23,Semester 8,Teknik,1x sebulan,Tidak Puas,COD (Cash on Delivery),Waktu Pengiriman Lama
Perempuan,20,Semester 4,Psikologi,Lebih dari 5x sebulan,Sangat Puas,E-Wallet (GoPay/ShopeePay/DANA),Ongkos Kirim Mahal
Laki-laki,19,Semester 2,MIPA,2-4x sebulan,Puas,QRIS Bank,Ongkos Kirim Mahal
Perempuan,21,Semester 6,Ekonomi & Bisnis,Lebih dari 5x sebulan,Sangat Puas,E-Wallet (GoPay/ShopeePay/DANA),Customer Service Lambat
Laki-laki,22,Semester 6,Ilmu Komputer,2-4x sebulan,Puas,E-Wallet (GoPay/ShopeePay/DANA),Ongkos Kirim Mahal
Perempuan,20,Semester 4,Ilmu Budaya,1x sebulan,Cukup Puas,QRIS Bank,Barang Tidak Sesuai Foto
Perempuan,21,Semester 6,Ekonomi & Bisnis,Lebih dari 5x sebulan,Sangat Puas,E-Wallet (GoPay/ShopeePay/DANA),Ongkos Kirim Mahal
Laki-laki,20,Semester 4,Teknik,2-4x sebulan,Puas,E-Wallet (GoPay/ShopeePay/DANA),Waktu Pengiriman Lama`;

export const CsvUploadDropzone: React.FC<CsvUploadDropzoneProps> = ({ onDataLoaded, isLoading }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Format file harus berupa .csv');
      return;
    }

    setParsing(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const { headers, rows } = parseCSV(text);

        if (headers.length === 0 || rows.length === 0) {
          toast.error('File CSV kosong atau format tidak valid.');
          setParsing(false);
          return;
        }

        const summary = profileSurveyDataset(file.name, headers, rows);
        toast.success(`Berhasil memuat ${rows.length} baris data dan ${headers.length} variabel pertanyaan.`);
        onDataLoaded(summary, rows);
      } catch (err: any) {
        console.error('Error parsing CSV:', err);
        toast.error('Gagal membaca file CSV. Pastikan format tabel valid.');
      } finally {
        setParsing(false);
      }
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) processFile(file);
  };

  const handleLoadSample = () => {
    setParsing(true);
    setTimeout(() => {
      const { headers, rows } = parseCSV(SAMPLE_CSV);
      const summary = profileSurveyDataset('Sample_Survei_ECommerce_Mahasiswa.csv', headers, rows);
      toast.success('Dataset sampel berhasil dimuat!');
      onDataLoaded(summary, rows);
      setParsing(false);
    }, 400);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".csv"
        className="hidden"
      />

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !parsing && !isLoading && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-3xl p-8 md:p-12 text-center transition-all cursor-pointer bg-white ${
          isDragging
            ? 'border-indigo-500 bg-indigo-50/50 scale-[1.01]'
            : 'border-gray-200 hover:border-indigo-400 hover:bg-gray-50/60 shadow-sm hover:shadow-md'
        }`}
      >
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-100 to-purple-100 flex items-center justify-center text-indigo-600 shadow-inner">
            {parsing || isLoading ? (
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            ) : (
              <UploadCloud className="w-8 h-8" />
            )}
          </div>

          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              Upload File CSV Hasil Respon Survei
            </h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              Tarik dan lepas file <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 font-mono text-xs">.csv</code> berisi baris respon/jawaban responden (export Google Form, Qualtrics, Excel, dsb).
            </p>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-md shadow-indigo-500/20 transition-all"
            >
              Pilih File CSV Respon
            </button>
          </div>

          <div className="flex items-center gap-4 text-xs text-gray-400 pt-3 border-t border-gray-100 w-full justify-center">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Deteksi Otomatis Variabel
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Siap Laporan Riset &amp; Skripsi
            </span>
          </div>
        </div>
      </div>

      {/* Try sample dataset CTA */}
      <div className="mt-6 text-center">
        <p className="text-xs text-gray-500 mb-2">Belum punya data CSV sendiri?</p>
        <button
          type="button"
          onClick={handleLoadSample}
          disabled={parsing || isLoading}
          className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/60 px-3.5 py-2 rounded-xl transition-all"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Coba Pakai Dataset Sampel (Survei E-Commerce Mahasiswa)
        </button>
      </div>
    </div>
  );
};
