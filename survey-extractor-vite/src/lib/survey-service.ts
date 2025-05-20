import type { SurveyInfo } from './types';

// Fungsi untuk mengekstrak informasi dari URL Google Forms
async function extractGoogleFormsInfo(url: string): Promise<SurveyInfo> {
  try {
    // Simulasi delay untuk menunjukkan loading state
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Ekstrak ID form dari URL
    const formId = extractGoogleFormsId(url);

    // Simulasi data yang diekstrak
    return {
      title: "Survei Pengalaman Kerja Kelompok di Kampus",
      description: "Survei ini bertujuan untuk mengumpulkan data tentang pengalaman mahasiswa dalam kerja kelompok selama perkuliahan.",
      questionCount: 22,
      platform: "Google Forms",
      formId: formId,
      sectionCount: 7,
      isQuiz: false,
      requiresLogin: false
    };
  } catch (error) {
    console.error("Error extracting Google Forms info:", error);
    throw new Error("Gagal mengekstrak informasi dari Google Forms");
  }
}

// Fungsi untuk mengekstrak informasi dari URL SurveyMonkey
async function extractSurveyMonkeyInfo(url: string): Promise<SurveyInfo> {
  try {
    // Simulasi delay untuk menunjukkan loading state
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Ekstrak ID survei dari URL
    const surveyId = extractSurveyMonkeyId(url);

    // Simulasi data yang diekstrak
    return {
      title: "Survei Kepuasan Pelanggan",
      description: "Bantu kami meningkatkan layanan dengan mengisi survei singkat ini.",
      questionCount: 15,
      platform: "SurveyMonkey",
      formId: surveyId,
      isPaidFeature: true,
      note: "Beberapa fitur mungkin memerlukan akses premium"
    };
  } catch (error) {
    console.error("Error extracting SurveyMonkey info:", error);
    throw new Error("Gagal mengekstrak informasi dari SurveyMonkey");
  }
}

// Fungsi untuk mengekstrak informasi dari URL OpinionX
async function extractOpinionXInfo(url: string): Promise<SurveyInfo> {
  try {
    // Simulasi delay untuk menunjukkan loading state
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Simulasi data yang diekstrak
    return {
      title: "Survei Opini Pengguna",
      description: "Kami ingin mendengar pendapat Anda tentang produk kami.",
      questionCount: 8,
      platform: "OpinionX",
      requiresLogin: true
    };
  } catch (error) {
    console.error("Error extracting OpinionX info:", error);
    throw new Error("Gagal mengekstrak informasi dari OpinionX");
  }
}

// Fungsi untuk mengekstrak informasi dari URL survei yang tidak dikenal
async function extractUnknownSurveyInfo(url: string): Promise<SurveyInfo> {
  // Simulasi delay untuk menunjukkan loading state
  await new Promise(resolve => setTimeout(resolve, 1000));

  return {
    title: "Survei Tidak Dikenal",
    description: "Platform survei ini belum didukung untuk ekstraksi detail.",
    questionCount: 0,
    platform: "Tidak Dikenal",
    note: "Platform ini belum didukung untuk ekstraksi detail."
  };
}

// Fungsi untuk mengekstrak ID dari URL Google Forms
function extractGoogleFormsId(url: string): string {
  try {
    const regex = /\/forms\/d\/e\/([a-zA-Z0-9_-]+)\/|\/forms\/([a-zA-Z0-9_-]+)\//;
    const match = url.match(regex);

    if (match) {
      return match[1] || match[2] || "unknown";
    }

    return "unknown";
  } catch (error) {
    console.error("Error extracting Google Forms ID:", error);
    return "unknown";
  }
}

// Fungsi untuk mengekstrak ID dari URL SurveyMonkey
function extractSurveyMonkeyId(url: string): string {
  try {
    const regex = /\/r\/([a-zA-Z0-9_-]+)/;
    const match = url.match(regex);

    if (match && match[1]) {
      return match[1];
    }

    return "unknown";
  } catch (error) {
    console.error("Error extracting SurveyMonkey ID:", error);
    return "unknown";
  }
}

// Fungsi utama untuk mengekstrak informasi survei
export async function extractSurveyInfo(url: string): Promise<SurveyInfo> {
  try {
    // Validasi URL
    if (!url) {
      throw new Error("URL tidak boleh kosong");
    }

    // Tentukan platform berdasarkan URL
    if (url.includes("docs.google.com/forms") || url.includes("forms.gle")) {
      return await extractGoogleFormsInfo(url);
    } else if (url.includes("surveymonkey.com")) {
      return await extractSurveyMonkeyInfo(url);
    } else if (url.includes("opinionx.co")) {
      return await extractOpinionXInfo(url);
    } else {
      return await extractUnknownSurveyInfo(url);
    }
  } catch (error) {
    console.error("Error extracting survey info:", error);
    throw error;
  }
}
