// Fungsi untuk mengekstrak informasi dari Google Forms
import axios from 'axios';
import { getProxiedUrl, tryAllProxies } from './proxy-service';

// Interface untuk hasil ekstraksi
export interface SurveyInfo {
  title: string;
  description: string;
  questionCount: number;
  platform: string;
  hasPersonalDataQuestions?: boolean;
  detectedKeywords?: string[];
  url?: string;
  apiData?: any;
}

// Fungsi untuk mengekstrak informasi dari Google Forms
export async function extractGoogleFormsInfo(url: string): Promise<SurveyInfo> {
  try {
    console.log('Extracting Google Forms info from:', url);

    // Gunakan timeout yang lebih pendek untuk mencegah browser hang
    const TIMEOUT_MS = 8000; // 8 detik timeout

    // Gunakan Promise.race untuk menerapkan timeout global pada seluruh proses ekstraksi
    return await Promise.race([
      // Proses ekstraksi utama
      (async () => {
        let html = '';
        let title = 'Google Form';
        let description = 'Form description not available';
        let questionCount = 10; // Default value

        try {
          // Coba ambil konten HTML dari URL dengan proxy dan timeout
          console.log('Fetching form content with timeout...');

          // Gunakan tryAllProxies dengan timeout yang lebih pendek
          html = await tryAllProxies(url, async (proxiedUrl) => {
            const response = await axios.get(proxiedUrl, {
              timeout: 5000, // 5 detik timeout per request
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': 'https://www.google.com/'
              }
            });
            return response.data;
          }, 5000); // 5 detik timeout untuk tryAllProxies

          console.log('Successfully fetched HTML content, length:', html.length);

          // Cek apakah form memerlukan login
          if (html.includes('You need permission') ||
            html.includes('You need to login') ||
            html.includes('need to sign in')) {
            console.log('Form requires permission or login');
            throw new Error('FORM_NOT_PUBLIC');
          }

          // Ekstrak judul - gunakan metode yang lebih efisien
          const titleMatch = /<title>(.*?)<\/title>/i.exec(html);
          if (titleMatch && titleMatch[1]) {
            title = titleMatch[1].replace(' - Google Forms', '').trim();
            console.log('Extracted title:', title);
          }

          // Ekstrak deskripsi - gunakan metode yang lebih efisien
          const descriptionMatch = /<meta\s+property="og:description"\s+content="([^"]*?)"/i.exec(html);
          if (descriptionMatch && descriptionMatch[1]) {
            description = descriptionMatch[1].trim();
            console.log('Extracted description:', description);
          }

          // Ekstrak jumlah pertanyaan - gunakan metode yang lebih efisien
          // Cari FB_PUBLIC_LOAD_DATA_ dengan regex yang lebih efisien
          const fbDataRegex = /var\s+FB_PUBLIC_LOAD_DATA_\s*=\s*(\[.*?\]);/;
          const fbDataMatch = fbDataRegex.exec(html);

          if (fbDataMatch && fbDataMatch[1]) {
            try {
              // Coba parse JSON data
              const formData = JSON.parse(fbDataMatch[1]);

              // Cek struktur data untuk pertanyaan
              if (formData && formData[1] && Array.isArray(formData[1][1])) {
                // Filter pertanyaan (exclude page breaks yang memiliki type 8)
                const questions = formData[1][1];
                questionCount = questions.filter(q => q[3] !== 8).length;
                console.log(`Detected ${questionCount} questions`);
              }
            } catch (parseError) {
              console.error('Error parsing form data:', parseError);
              // Gunakan nilai default jika parsing gagal
            }
          } else {
            // Jika tidak bisa menemukan FB_PUBLIC_LOAD_DATA_, coba metode alternatif
            // Hitung jumlah elemen pertanyaan dengan regex sederhana
            const questionMatches = html.match(/freebirdFormviewerComponentsQuestionBaseRoot/g);
            if (questionMatches) {
              questionCount = questionMatches.length;
              console.log(`Detected ${questionCount} questions using alternative method`);
            }
          }

        } catch (fetchError) {
          console.error('Error fetching form content:', fetchError);

          // Jika error adalah karena form tidak public
          if ((fetchError as any).message === 'FORM_NOT_PUBLIC') {
            throw fetchError; // Re-throw error untuk ditangani di level atas
          }

          // Untuk error lainnya, gunakan nilai default
          console.log('Using default values due to fetch error');
        }

        // Pastikan questionCount adalah angka yang valid
        if (isNaN(questionCount) || questionCount <= 0) {
          questionCount = 10; // Default value jika tidak valid
        }

        // Return hasil ekstraksi
        const extractedData = {
          title,
          description,
          questionCount,
          platform: 'Google Forms'
        };

        console.log('Final extracted Google Forms data:', JSON.stringify(extractedData, null, 2));
        return extractedData;
      })(),

      // Timeout promise
      new Promise<SurveyInfo>((_, reject) => {
        setTimeout(() => {
          console.log('Extraction timed out, using default values');
          reject(new Error('EXTRACTION_TIMEOUT'));
        }, TIMEOUT_MS);
      })
    ]);

  } catch (error) {
    console.error('Error in extractGoogleFormsInfo:', error);

    // Handle specific error types
    if ((error as any).message === 'FORM_NOT_PUBLIC') {
      throw new Error('FORM_NOT_PUBLIC');
    } else if ((error as any).message === 'EXTRACTION_TIMEOUT') {
      // Jika timeout, gunakan nilai default
      console.log('Extraction timed out, returning default values');
      return {
        title: 'Google Form',
        description: 'Form ini tidak dapat diekstrak karena waktu proses terlalu lama. Silakan isi detail secara manual.',
        questionCount: 10,
        platform: 'Google Forms'
      };
    } else if (axios.isAxiosError(error)) {
      // Handle Axios errors
      if (error.code === 'ECONNABORTED' || error.code === 'ECONNREFUSED' || error.response?.status === 403) {
        throw new Error('FORM_NOT_PUBLIC');
      }
    }

    // Untuk error lainnya
    throw new Error('EXTRACTION_FAILED');
  }
}

// Fungsi untuk mengekstrak informasi dari SurveyMonkey
export async function extractSurveyMonkeyInfo(url: string): Promise<SurveyInfo> {
  try {
    console.log('Extracting SurveyMonkey info from:', url);

    // Gunakan proxy untuk mengatasi masalah CORS
    const proxiedUrl = getProxiedUrl(url);
    console.log('Using proxied URL:', proxiedUrl);

    // Coba ambil konten HTML dari URL
    const response = await axios.get(proxiedUrl, {
      timeout: 10000, // 10 detik timeout
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const html = response.data;
    console.log('Successfully fetched HTML content, length:', html.length);

    // Ekstrak judul
    let title = '';
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].replace(' | SurveyMonkey', '').trim();
      console.log('Extracted title:', title);
    } else {
      console.log('Failed to extract title');
      title = 'SurveyMonkey Form';
    }

    // Ekstrak deskripsi
    let description = '';
    const descriptionMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]*?)"/i);
    if (descriptionMatch && descriptionMatch[1]) {
      description = descriptionMatch[1].trim();
      console.log('Extracted description:', description);
    } else {
      console.log('Failed to extract description');
      description = 'Form description not available';
    }

    // Untuk SurveyMonkey, gunakan nilai default
    const questionCount = 30; // Default untuk SurveyMonkey
    console.log('Using default question count for SurveyMonkey:', questionCount);

    return {
      title,
      description,
      questionCount,
      platform: 'SurveyMonkey'
    };
  } catch (error) {
    console.error('Error extracting SurveyMonkey info:', error);
    throw new Error('EXTRACTION_FAILED');
  }
}

// Fungsi untuk mengekstrak informasi dari OpinionX
export async function extractOpinionXInfo(url: string): Promise<SurveyInfo> {
  try {
    console.log('Extracting OpinionX info from:', url);

    // Gunakan proxy untuk mengatasi masalah CORS
    const proxiedUrl = getProxiedUrl(url);
    console.log('Using proxied URL:', proxiedUrl);

    // Coba ambil konten HTML dari URL
    const response = await axios.get(proxiedUrl, {
      timeout: 10000, // 10 detik timeout
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const html = response.data;
    console.log('Successfully fetched HTML content, length:', html.length);

    // Ekstrak judul
    let title = '';
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].replace(' | OpinionX', '').trim();
      console.log('Extracted title:', title);
    } else {
      console.log('Failed to extract title');
      title = 'OpinionX Form';
    }

    // Ekstrak deskripsi
    let description = '';
    const descriptionMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]*?)"/i);
    if (descriptionMatch && descriptionMatch[1]) {
      description = descriptionMatch[1].trim();
      console.log('Extracted description:', description);
    } else {
      console.log('Failed to extract description');
      description = 'Form description not available';
    }

    // Untuk OpinionX, sulit mendeteksi jumlah pertanyaan dari HTML
    // Gunakan nilai default
    const questionCount = 15; // Default untuk OpinionX
    console.log('Using default question count for OpinionX:', questionCount);

    return {
      title,
      description,
      questionCount,
      platform: 'OpinionX'
    };
  } catch (error) {
    console.error('Error extracting OpinionX info:', error);

    // Jika gagal, gunakan nilai default
    return {
      title: 'OpinionX Form',
      description: 'Form description not available',
      questionCount: 15, // Default untuk OpinionX
      platform: 'OpinionX'
    };
  }
}

// Fungsi untuk mengekstrak informasi dari URL form generik
export async function extractGenericFormInfo(url: string): Promise<SurveyInfo> {
  try {
    console.log('Extracting generic form info from:', url);

    // Gunakan proxy untuk mengatasi masalah CORS
    const proxiedUrl = getProxiedUrl(url);
    console.log('Using proxied URL:', proxiedUrl);

    // Coba ambil konten HTML dari URL
    const response = await axios.get(proxiedUrl, {
      timeout: 10000, // 10 detik timeout
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const html = response.data;
    console.log('Successfully fetched HTML content, length:', html.length);

    // Ekstrak judul
    let title = '';
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim();
      console.log('Extracted title:', title);
    } else {
      console.log('Failed to extract title');
      title = 'Online Form';
    }

    // Ekstrak deskripsi
    let description = '';
    const descriptionMatch = html.match(/<meta\s+(?:name="description"|property="og:description")\s+content="([^"]*?)"/i);
    if (descriptionMatch && descriptionMatch[1]) {
      description = descriptionMatch[1].trim();
      console.log('Extracted description:', description);
    } else {
      console.log('Failed to extract description');
      description = 'Form description not available';
    }

    // Untuk form generik, sulit mendeteksi jumlah pertanyaan dari HTML
    // Gunakan nilai default
    const questionCount = 10; // Default untuk form generik
    console.log('Using default question count for generic form:', questionCount);

    // Coba deteksi platform
    let platform = 'Unknown Form';
    if (url.includes('typeform.com')) {
      platform = 'Typeform';
    } else if (url.includes('forms.office.com')) {
      platform = 'Microsoft Forms';
    } else if (url.includes('jotform.com')) {
      platform = 'JotForm';
    } else if (url.includes('wufoo.com')) {
      platform = 'Wufoo';
    } else if (url.includes('formstack.com')) {
      platform = 'Formstack';
    } else {
      // Coba deteksi dari HTML
      if (html.includes('typeform')) {
        platform = 'Typeform';
      } else if (html.includes('office.com/forms')) {
        platform = 'Microsoft Forms';
      } else if (html.includes('jotform')) {
        platform = 'JotForm';
      } else if (html.includes('wufoo')) {
        platform = 'Wufoo';
      } else if (html.includes('formstack')) {
        platform = 'Formstack';
      }
    }

    console.log('Detected platform:', platform);

    return {
      title,
      description,
      questionCount,
      platform
    };
  } catch (error) {
    console.error('Error extracting generic form info:', error);

    // Jika gagal, gunakan nilai default
    return {
      title: 'Online Form',
      description: 'Form description not available',
      questionCount: 10, // Default untuk form generik
      platform: 'Unknown Form'
    };
  }
}

// Fungsi utama untuk mengekstrak informasi survei
export async function extractSurveyInfo(url: string): Promise<SurveyInfo> {
  try {
    console.log('Extracting survey info from:', url);

    // Validasi URL
    if (!url) {
      console.error('URL is empty');
      throw new Error("URL_EMPTY");
    }

    // Validasi format URL dengan regex sederhana
    const urlRegex = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
    if (!urlRegex.test(url)) {
      console.error("Invalid URL format:", url);
      throw new Error("INVALID_URL_FORMAT");
    }

    // Normalisasi URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
      console.log('Normalized URL:', url);
    }

    // Tentukan platform berdasarkan URL
    if (url.includes("docs.google.com/forms") || url.includes("forms.gle")) {
      console.log('Detected Google Forms URL');
      return await extractGoogleFormsInfo(url);
    } else if (url.includes("surveymonkey.com")) {
      console.log('Detected SurveyMonkey URL');
      return await extractSurveyMonkeyInfo(url);
    } else if (url.includes("opinionx.co")) {
      console.log('Detected OpinionX URL');
      return await extractOpinionXInfo(url);
    } else {
      console.log('Unknown form platform, using generic extraction');
      return await extractGenericFormInfo(url);
    }
  } catch (error) {
    console.error("Error extracting survey info:", error);
    throw error;
  }
}
