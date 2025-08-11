// Fungsi untuk mengekstrak informasi dari Google Forms
import axios from 'axios';
import { getProxiedUrl, tryAllProxies } from './proxy-service';

// Interface untuk hasil ekstraksi
export interface SurveyInfo {
  title: string;
  description: string;
  questionCount: number;
  platform: string;
}

// Fungsi untuk mengekstrak informasi dari Google Forms
export async function extractGoogleFormsInfo(url: string): Promise<SurveyInfo> {
  try {
    console.log('Extracting Google Forms info from:', url);
    
    // Gunakan proxy untuk mengatasi masalah CORS
    let html = '';
    
    try {
      // Coba ambil konten HTML dari URL dengan proxy
      const proxiedUrl = getProxiedUrl(url);
      console.log('Using proxied URL:', proxiedUrl);
      
      const response = await axios.get(proxiedUrl, {
        timeout: 15000, // 15 detik timeout
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Referer': 'https://www.google.com/'
        }
      });
      
      html = response.data;
      console.log('Successfully fetched HTML content, length:', html.length);
    } catch (error) {
      console.error('Error fetching with proxy, trying alternative method:', error);
      
      // Coba metode alternatif dengan proxy lain
      try {
        console.log('Trying alternative proxy method');
        const result = await tryAllProxies(url, async (proxiedUrl) => {
          const response = await axios.get(proxiedUrl, {
            timeout: 15000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              'Referer': 'https://www.google.com/'
            }
          });
          return response.data;
        });
        
        if (result) {
          html = result;
          console.log('Successfully fetched HTML with alternative proxy, length:', html.length);
        }
      } catch (proxyError) {
        console.error('All proxy methods failed:', proxyError);
      }
      
      // Jika masih gagal dan tidak ada HTML, gunakan nilai default
      if (!html) {
        console.log('Using default values as fallback');
        return {
          title: 'Google Form',
          description: 'Form ini tidak dapat diekstrak secara otomatis. Silakan isi detail secara manual.',
          questionCount: 10,
          platform: 'Google Forms'
        };
      }
    }
    
    // Ekstrak judul
    let title = '';
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].replace(' - Google Forms', '').trim();
      console.log('Extracted title:', title);
    } else {
      console.log('Failed to extract title');
      title = 'Google Form';
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

    // Hitung jumlah pertanyaan dengan menghitung elemen yang mengandung pertanyaan
    let questionCount = 0;
    
    // Metode 1: Ekstrak dari FB_PUBLIC_LOAD_DATA_ (paling akurat)
    const fbDataMatch = html.match(/var FB_PUBLIC_LOAD_DATA_ = (.*?);<\/script>/s);
    if (fbDataMatch && fbDataMatch[1]) {
      try {
        console.log('Found FB_PUBLIC_LOAD_DATA_, trying to extract question count');
        
        // Hitung jumlah "null,2," dalam data
        const nullTwoMatches = fbDataMatch[1].match(/null,2,/g);
        if (nullTwoMatches) {
          questionCount = nullTwoMatches.length;
          console.log(`Detected ${questionCount} questions using FB_PUBLIC_LOAD_DATA_`);
        }
      } catch (error) {
        console.error('Error parsing FB_PUBLIC_LOAD_DATA_:', error);
      }
    }

    // Jika masih 0, gunakan nilai default
    if (questionCount === 0) {
      console.log('Failed to detect question count, using default value');
      questionCount = 10;
    }

    // Jika form tidak bisa diakses (misalnya karena private)
    if (html.includes('You need permission') || html.includes('You need to login')) {
      console.log('Form requires permission or login');
      throw new Error('FORM_NOT_PUBLIC');
    }

    return {
      title,
      description,
      questionCount,
      platform: 'Google Forms'
    };
  } catch (error) {
    console.error('Error extracting Google Forms info:', error);

    // Jika error adalah karena network atau timeout, kemungkinan form tidak public
    if (axios.isAxiosError(error) && (error.code === 'ECONNABORTED' || error.code === 'ECONNREFUSED' || error.response?.status === 403)) {
      throw new Error('FORM_NOT_PUBLIC');
    }

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
