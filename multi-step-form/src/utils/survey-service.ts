/**
 * Fungsi untuk mengekstrak informasi dari URL Google Forms
 * @param url URL Google Forms
 * @returns Informasi survei
 */
export async function extractGoogleFormsInfo(url: string) {
  try {
    // Gunakan CORS proxy untuk mengakses form
    const corsProxies = [
      'https://corsproxy.io/?',
      'https://cors-anywhere.herokuapp.com/',
      'https://api.allorigins.win/raw?url='
    ];

    // Coba setiap proxy sampai berhasil
    for (const proxy of corsProxies) {
      try {
        const response = await fetch(proxy + encodeURIComponent(url));
        if (!response.ok) continue;

        const html = await response.text();

        // Ekstrak data form dari JavaScript di halaman
        const scriptRegex = /var FB_PUBLIC_LOAD_DATA_ = ([\s\S]*?);<\/script>/;
        const match = scriptRegex.exec(html);

        if (!match || !match[1]) {
          continue; // Coba proxy berikutnya jika tidak menemukan data
        }

        // Parse data JSON
        const formData = JSON.parse(match[1]);

        // Ekstrak informasi yang relevan
        const title = formData[1][8] || 'Tidak tersedia';
        const description = formData[1][0] || 'Tidak tersedia';

        // Hitung pertanyaan (kecuali page breaks yang memiliki tipe 8)
        const questions = formData[1][1];
        const questionCount = questions.filter((q: any) => q[3] !== 8).length;

        // Dapatkan informasi tambahan
        const formId = formData[14] || '';
        const isQuiz = formData[1][10] ? !!formData[1][10][0] : false;
        const requiresLogin = formData[1][10] ? !!formData[1][10][1] : false;

        console.log(`Extracted form info: Title=${title}, Questions=${questionCount}`);

        return {
          title,
          description,
          questionCount,
          formId,
          isQuiz,
          requiresLogin,
          platform: 'Google Forms'
        };
      } catch (proxyError) {
        console.error(`Error with proxy ${proxy}:`, proxyError);
        // Lanjutkan ke proxy berikutnya
      }
    }

    // Jika semua proxy gagal, coba metode alternatif
    console.log("All proxies failed, trying alternative method...");

    // Gunakan API publik untuk mengekstrak data (jika ada)
    const apiUrl = `https://jakpatforuniv-api.vercel.app/api/extract?url=${encodeURIComponent(url)}`;
    const apiResponse = await fetch(apiUrl);

    if (apiResponse.ok) {
      const data = await apiResponse.json();
      return {
        title: data.title || 'Tidak tersedia',
        description: data.description || 'Tidak tersedia',
        questionCount: data.questionCount || 0,
        platform: 'Google Forms'
      };
    }

    throw new Error("Tidak dapat mengakses form. Coba lagi nanti atau gunakan URL form yang berbeda.");
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
