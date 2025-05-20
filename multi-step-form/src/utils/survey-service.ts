/**
 * Fungsi untuk mengekstrak informasi dari URL Google Forms
 * @param url URL Google Forms
 * @returns Informasi survei
 */
export async function extractGoogleFormsInfo(url: string) {
  try {
    // Simulasi delay untuk menunjukkan loading state
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Simulasi data yang diekstrak (url digunakan untuk logging)
    console.log(`Extracting info from Google Forms URL: ${url}`);

    return {
      title: "Survei Pengalaman Kerja Kelompok di Kampus",
      description: "Survei ini bertujuan untuk mengumpulkan data tentang pengalaman mahasiswa dalam kerja kelompok selama perkuliahan.",
      questionCount: 22,
      platform: "Google Forms",
    };
  } catch (error) {
    console.error("Error extracting Google Forms info:", error);
    throw new Error("Gagal mengekstrak informasi dari Google Forms");
  }
}

/**
 * Fungsi untuk mengekstrak informasi dari URL survei yang tidak dikenal
 * @param url URL survei
 * @returns Informasi survei
 */
export async function extractUnknownSurveyInfo(url: string) {
  // Simulasi delay untuk menunjukkan loading state
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Simulasi data yang diekstrak (url digunakan untuk logging)
  console.log(`Extracting info from unknown survey URL: ${url}`);

  return {
    title: "",
    description: "",
    questionCount: 0,
    platform: "Tidak Dikenal",
  };
}

/**
 * Fungsi utama untuk mengekstrak informasi survei
 * @param url URL survei
 * @returns Informasi survei
 */
export async function extractSurveyInfo(url: string) {
  try {
    // Validasi URL
    if (!url) {
      throw new Error("URL tidak boleh kosong");
    }

    // Tentukan platform berdasarkan URL
    if (url.includes("docs.google.com/forms") || url.includes("forms.gle")) {
      return await extractGoogleFormsInfo(url);
    } else {
      return await extractUnknownSurveyInfo(url);
    }
  } catch (error) {
    console.error("Error extracting survey info:", error);
    throw error;
  }
}
