// Opsi biodata researcher — nilai (value) harus persis sama dengan data
// historis di form_submissions (dulu diisi lewat StepTwo) agar analitik
// admin yang mengelompokkan per status/referral tidak pecah.

export interface SelectOption {
  value: string;
  label: string;
}

export const ACADEMIC_STATUS_OPTIONS: SelectOption[] = [
  { value: 'Dosen', label: '👨‍🏫 Dosen' },
  { value: 'Mahasiswa S3 (Doktor)', label: '🎓 Mahasiswa S3 (Doktor)' },
  { value: 'Mahasiswa S2 (Master)', label: '🎓 Mahasiswa S2 (Master)' },
  { value: 'Mahasiswa S1 (Sarjana)', label: '🎓 Mahasiswa S1 (Sarjana)' },
  { value: 'Mahasiswa D3 (Diploma)', label: '🎓 Mahasiswa D3 (Diploma)' },
  { value: 'Pelajar SMA/SMK', label: '📚 Pelajar SMA/SMK' },
];

// Saran jurusan untuk autocomplete (<datalist>) di field Jurusan. Field tetap
// menerima ketikan bebas — daftar ini hanya memandu ke ejaan kanonik agar chart
// "Top Jurusan" di analytics admin tidak pecah karena varian penulisan.
// 5 jurusan teratas pengguna JFU (agregat form_submissions per 2026-07-09)
// diletakkan paling depan; sisanya jurusan populer nasional lintas rumpun.
// Level JURUSAN saja — FEB (fakultas) sengaja tidak dimasukkan (tumpang tindih
// dengan Manajemen/Akuntansi di bawahnya). Satu kanonik per jurusan (sinonim
// digabung). Akronim di dalam kurung supaya bisa dicari (mis. ketik "DKV").
export const DEPARTMENT_OPTIONS: string[] = [
  // 5 besar JFU
  'Manajemen',
  'Psikologi',
  'Ilmu Komunikasi',
  'Administrasi Niaga',
  'Akuntansi',
  // Ekonomi & bisnis
  'Ilmu Ekonomi',
  'Ekonomi Pembangunan',
  'Ekonomi Syariah',
  'Bisnis Digital',
  'Kewirausahaan',
  'Perpajakan',
  // Sosial & humaniora
  'Ilmu Administrasi Negara',
  'Ilmu Hubungan Internasional',
  'Ilmu Pemerintahan',
  'Ilmu Politik',
  'Sosiologi',
  'Antropologi',
  'Kriminologi',
  'Ilmu Hukum',
  'Ilmu Sejarah',
  'Sastra Inggris',
  'Sastra Indonesia',
  'Ilmu Perpustakaan',
  // Komputer & teknik
  'Teknik Informatika',
  'Sistem Informasi',
  'Ilmu Komputer',
  'Teknologi Informasi',
  'Teknik Sipil',
  'Teknik Mesin',
  'Teknik Elektro',
  'Teknik Industri',
  'Teknik Kimia',
  'Teknik Lingkungan',
  'Arsitektur',
  'Perencanaan Wilayah dan Kota (PWK)',
  // Desain
  'Desain Komunikasi Visual (DKV)',
  'Desain Interior',
  'Desain Produk',
  // Kesehatan
  'Kedokteran',
  'Kedokteran Gigi',
  'Keperawatan',
  'Farmasi',
  'Kesehatan Masyarakat',
  'Gizi',
  'Kebidanan',
  // Pendidikan & sains
  'Pendidikan Guru Sekolah Dasar (PGSD)',
  'Pendidikan Bahasa Inggris',
  'Matematika',
  'Statistika',
  'Agribisnis',
];

// Saran universitas untuk autocomplete (<datalist>) di field Universitas.
// 10 universitas teratas yang pernah order iklan (agregat form_submissions per
// 2026-07-09, varian digabung — mis. UNJ + "Universitas Negeri Jakarta" +
// typo → satu kanonik) diletakkan paling depan; sisanya PTN/PTS populer
// nasional untuk cakupan. Akronim di dalam kurung supaya bisa dicari dengan
// mengetik singkatannya (mis. "UGM", "ITB").
export const UNIVERSITY_OPTIONS: string[] = [
  // 10 besar JFU (pernah order)
  'Universitas Negeri Jakarta (UNJ)',
  'Universitas Indonesia (UI)',
  'Bina Nusantara University (BINUS)',
  'Universitas Gadjah Mada (UGM)',
  'Politeknik Negeri Malang (Polinema)',
  'STIEPARI Semarang',
  'Universitas Multimedia Nusantara (UMN)',
  'Universitas Al Azhar Indonesia (UAI)',
  'Universitas Bunda Mulia (UBM)',
  'Universitas Trilogi',
  // PTN populer nasional
  'Institut Teknologi Bandung (ITB)',
  'IPB University (Institut Pertanian Bogor)',
  'Institut Teknologi Sepuluh Nopember (ITS)',
  'Universitas Airlangga (UNAIR)',
  'Universitas Diponegoro (UNDIP)',
  'Universitas Padjadjaran (UNPAD)',
  'Universitas Brawijaya (UB)',
  'Universitas Sebelas Maret (UNS)',
  'Universitas Hasanuddin (UNHAS)',
  'Universitas Sumatera Utara (USU)',
  'Universitas Andalas (UNAND)',
  'Universitas Jenderal Soedirman (UNSOED)',
  'Universitas Lampung (UNILA)',
  'Universitas Sriwijaya (UNSRI)',
  'Universitas Riau (UNRI)',
  'Universitas Udayana (UNUD)',
  'Universitas Syiah Kuala (USK)',
  'Universitas Jember (UNEJ)',
  // LPTK / eks-IKIP
  'Universitas Pendidikan Indonesia (UPI)',
  'Universitas Negeri Yogyakarta (UNY)',
  'Universitas Negeri Semarang (UNNES)',
  'Universitas Negeri Malang (UM)',
  'Universitas Negeri Surabaya (UNESA)',
  'Universitas Negeri Medan (UNIMED)',
  'Universitas Negeri Padang (UNP)',
  'UPN Veteran Jakarta (UPNVJ)',
  // PTS populer
  'Universitas Islam Indonesia (UII)',
  'Universitas Muhammadiyah Yogyakarta (UMY)',
  'Universitas Muhammadiyah Malang (UMM)',
  'Universitas Muhammadiyah Surakarta (UMS)',
  'Telkom University (Tel-U)',
  'Universitas Mercu Buana',
  'Universitas Esa Unggul',
  'Universitas Trisakti',
  'Universitas Katolik Parahyangan (UNPAR)',
  'Universitas Katolik Indonesia Atma Jaya',
  'Universitas Kristen Petra',
  'Universitas Pelita Harapan (UPH)',
  'Universitas Gunadarma',
  'Universitas Pembangunan Jaya',
];

export const REFERRAL_SOURCE_OPTIONS: SelectOption[] = [
  { value: 'Tiktok', label: 'TikTok' },
  { value: 'Instagram', label: 'Instagram' },
  { value: 'LinkedIn', label: 'LinkedIn' },
  { value: 'Website Jakpat', label: 'Website Jakpat' },
  { value: 'Blog Jakpat', label: 'Blog Jakpat' },
  { value: 'Google Search', label: 'Google Search' },
  { value: 'Chat GPT', label: 'ChatGPT' },
  { value: 'Rekomendasi Dosen', label: 'Rekomendasi Dosen' },
  { value: 'Rekomendasi Teman', label: 'Rekomendasi Teman' },
  { value: 'Lainnya', label: 'Lainnya' },
];

// Format kolaps yang sama dengan penyimpanan form_submissions.referral_source
// (lihat StepCheckout / eks StepFour): "Lainnya: <detail>".
export const collapseReferralSource = (source: string, other?: string): string =>
  source === 'Lainnya' && other?.trim() ? `Lainnya: ${other.trim()}` : source;

// Kebalikan collapseReferralSource — untuk prefill form dari nilai tersimpan.
export const expandReferralSource = (stored: string | null | undefined): { source: string; other: string } => {
  if (!stored) return { source: '', other: '' };
  if (stored.startsWith('Lainnya:')) {
    return { source: 'Lainnya', other: stored.slice('Lainnya:'.length).trim() };
  }
  return { source: stored, other: '' };
};
