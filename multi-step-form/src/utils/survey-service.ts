/**
 * Fungsi untuk mengekstrak informasi dari URL Google Forms
 * @param url URL Google Forms
 * @returns Informasi survei
 */
export async function extractGoogleFormsInfo(url: string) {
  try {
    // Normalisasi URL Google Forms
    url = normalizeGoogleFormUrl(url);
    console.log("Normalized URL:", url);

    // Cek terlebih dahulu apakah form tidak publik
    try {
      // Gunakan fetch langsung untuk memeriksa apakah form tidak publik
      const directResponse = await fetch(url);
      const directHtml = await directResponse.text();

      // Cek teks yang menunjukkan form tidak publik
      if (directHtml.includes('This form can only be viewed by users in the owner\'s organization') ||
          directHtml.includes('You need permission') ||
          directHtml.includes('requires permission')) {
        console.log("Form is not public");
        throw new Error("FORM_NOT_PUBLIC");
      }

      // Coba ekstrak langsung dari HTML jika memungkinkan
      try {
        const directResult = extractFromHtml(directHtml);
        if (directResult) {
          console.log("Successfully extracted directly from HTML");
          return directResult;
        }
      } catch (extractError) {
        console.log("Direct extraction failed:", extractError);
      }
    } catch (directError) {
      // Jika error bukan karena form tidak publik, lanjutkan dengan proxy
      if (directError instanceof Error && directError.message === "FORM_NOT_PUBLIC") {
        throw directError;
      }
      console.log("Direct fetch failed, continuing with proxies");
    }

    // Gunakan CORS proxy untuk mengakses form
    const corsProxies = [
      'https://corsproxy.io/?',
      'https://api.allorigins.win/raw?url=',
      'https://cors-anywhere.herokuapp.com/',
      'https://cors.eu.org/',
      'https://cors-proxy.htmldriven.com/?url='
    ];

    let lastHtml = '';

    // Coba setiap proxy sampai berhasil
    for (const proxy of corsProxies) {
      try {
        console.log(`Trying proxy: ${proxy}`);
        const response = await fetch(proxy + encodeURIComponent(url));
        if (!response.ok) {
          console.log(`Proxy ${proxy} returned status ${response.status}`);
          continue;
        }

        const html = await response.text();
        lastHtml = html; // Simpan HTML terakhir untuk pengecekan form tidak publik

        // Cek apakah form tidak publik dari respons proxy
        if (html.includes('This form can only be viewed by users in the owner\'s organization') ||
            html.includes('You need permission') ||
            html.includes('requires permission')) {
          console.log("Form is not public (detected via proxy)");
          throw new Error("FORM_NOT_PUBLIC");
        }

        // Coba ekstrak dari HTML
        const result = extractFromHtml(html);
        if (result) {
          console.log(`Successfully extracted via proxy ${proxy}`);
          return result;
        }
      } catch (proxyError) {
        // Jika error karena form tidak publik, lempar error tersebut
        if (proxyError instanceof Error && proxyError.message === "FORM_NOT_PUBLIC") {
          throw proxyError;
        }

        console.error(`Error with proxy ${proxy}:`, proxyError);
        // Lanjutkan ke proxy berikutnya
      }
    }

    // Jika semua proxy gagal, coba metode alternatif
    console.log("All proxies failed, trying alternative method...");

    // Gunakan API publik untuk mengekstrak data (jika ada)
    const apiUrl = `https://jakpatforuniv-api.vercel.app/api/extract?url=${encodeURIComponent(url)}`;
    console.log("Trying API extraction:", apiUrl);
    const apiResponse = await fetch(apiUrl);

    if (apiResponse.ok) {
      const data = await apiResponse.json();
      console.log("API extraction response:", data);

      // Jika API mengembalikan status error
      if (data.error) {
        throw new Error("EXTRACTION_FAILED");
      }

      return {
        title: data.title || 'Tidak tersedia',
        description: data.description || 'Tidak tersedia',
        questionCount: data.questionCount || 0,
        platform: 'Google Forms'
      };
    }

    // Cek lagi dari HTML terakhir yang didapat
    if (lastHtml && (
        lastHtml.includes('This form can only be viewed by users in the owner\'s organization') ||
        lastHtml.includes('You need permission') ||
        lastHtml.includes('requires permission'))) {
      throw new Error("FORM_NOT_PUBLIC");
    }

    // Jika semua metode gagal, gunakan fallback dengan data dummy
    console.log("All extraction methods failed, using fallback");
    return {
      title: 'Form tidak dapat diekstrak',
      description: 'Silakan isi detail form secara manual',
      questionCount: 0,
      platform: 'Google Forms'
    };
  } catch (error) {
    console.error("Error extracting Google Forms info:", error);

    // Propagate specific error codes
    if (error instanceof Error &&
        (error.message === "FORM_NOT_PUBLIC" ||
         error.message === "EXTRACTION_FAILED")) {
      throw error;
    }

    // Default error
    throw new Error("EXTRACTION_FAILED");
  }
}

/**
 * Fungsi untuk menormalisasi URL Google Forms
 * @param url URL Google Forms
 * @returns URL yang dinormalisasi
 */
function normalizeGoogleFormUrl(url: string): string {
  // Hapus parameter yang tidak perlu
  url = url.split('?')[0];

  // Pastikan URL menggunakan format viewform
  if (!url.includes('/viewform') && !url.endsWith('/viewform')) {
    if (url.endsWith('/')) {
      url += 'viewform';
    } else {
      url += '/viewform';
    }
  }

  // Pastikan menggunakan HTTPS
  if (url.startsWith('http://')) {
    url = url.replace('http://', 'https://');
  }

  // Tangani URL pendek forms.gle
  if (url.includes('forms.gle')) {
    // Tidak bisa menormalisasi URL pendek, gunakan apa adanya
    return url;
  }

  return url;
}

/**
 * Fungsi untuk mengekstrak informasi dari HTML
 * @param html HTML dari Google Forms
 * @returns Informasi survei atau null jika gagal
 */
function extractFromHtml(html: string) {
  try {
    // Coba ekstrak dengan metode FB_PUBLIC_LOAD_DATA_
    const scriptRegex = /var FB_PUBLIC_LOAD_DATA_ = ([\s\S]*?);<\/script>/;
    const match = scriptRegex.exec(html);

    if (match && match[1]) {
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
    }

    // Jika metode FB_PUBLIC_LOAD_DATA_ gagal, coba metode alternatif
    // Ekstrak judul dari tag title
    const titleMatch = /<title>(.*?)<\/title>/.exec(html);
    const title = titleMatch ? titleMatch[1].replace(' - Google Forms', '') : 'Tidak tersedia';

    // Coba temukan deskripsi di meta tag
    const descriptionMatch = /<meta name="description" content="(.*?)"/.exec(html) ||
                           /<meta property="og:description" content="(.*?)"/.exec(html);
    const description = descriptionMatch ? descriptionMatch[1] : 'Tidak tersedia';

    // Hitung pertanyaan dengan metode alternatif
    const questionRegex = /<div[^>]*class="[^"]*freebirdFormviewerComponentsQuestionBaseRoot[^"]*"[^>]*>/g;
    const questionMatches = html.match(questionRegex);
    const questionCount = questionMatches ? questionMatches.length : 0;

    if (title !== 'Tidak tersedia' || questionCount > 0) {
      console.log(`Extracted form info with alternative method: Title=${title}, Questions=${questionCount}`);

      return {
        title,
        description,
        questionCount,
        platform: 'Google Forms'
      };
    }

    return null;
  } catch (error) {
    console.error("Error extracting from HTML:", error);
    return null;
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
      throw new Error("URL_EMPTY");
    }

    // Tentukan platform berdasarkan URL
    if (url.includes("docs.google.com/forms") || url.includes("forms.gle")) {
      return await extractGoogleFormsInfo(url);
    } else {
      // Jika bukan Google Form, tandai dengan error code khusus
      throw new Error("NON_GOOGLE_FORM");
    }
  } catch (error) {
    console.error("Error extracting survey info:", error);

    // Propagate specific error codes
    if (error instanceof Error) {
      throw error; // Teruskan error dengan kode spesifik
    }

    // Default error
    throw new Error("EXTRACTION_FAILED");
  }
}
