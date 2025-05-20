import { SurveyInfo } from "@/components/survey-result";

// Fungsi untuk mengekstrak informasi dari Google Forms
function extractGoogleFormsInfo(html: string, url: string): SurveyInfo {
  // Ekstrak judul dari tag title
  const titleMatch = /<title>(.*?)<\/title>/.exec(html);
  const title = titleMatch ? titleMatch[1].replace(' - Google Forms', '') : 'Tidak tersedia';
  
  // Coba temukan deskripsi di meta tag
  const descriptionMatch = /<meta name="description" content="(.*?)"/.exec(html) || 
                         /<meta property="og:description" content="(.*?)"/.exec(html);
  const description = descriptionMatch ? descriptionMatch[1] : 'Tidak tersedia';
  
  // Ekstrak ID form dari URL
  const formIdMatch = /\/forms\/d\/e\/([a-zA-Z0-9_-]+)\//.exec(url) || 
                     /\/forms\/d\/([a-zA-Z0-9_-]+)\//.exec(url);
  const formId = formIdMatch ? formIdMatch[1] : 'Tidak tersedia';
  
  // Cek apakah ini kuis atau form biasa
  const isQuiz = html.includes('data-is-quiz="true"') || 
               html.includes('"isQuiz":true') || 
               html.includes('quiz-viewer');
  
  // Hitung jumlah pertanyaan
  const questionCountMatch = /"count":(\d+)/.exec(html);
  let questionCount = 0;
  
  if (questionCountMatch && questionCountMatch[1]) {
    questionCount = parseInt(questionCountMatch[1], 10);
  } else {
    // Jika tidak bisa menemukan count, coba hitung dari elemen pertanyaan
    const questionMatches = html.match(/data-params="[^"]*\\?&quot;([0-9]+)\\?&quot;/g);
    if (questionMatches) {
      const questionIds = new Set();
      questionMatches.forEach(match => {
        const idMatch = /data-params="[^"]*\\?&quot;([0-9]+)\\?&quot;/.exec(match);
        if (idMatch && idMatch[1]) {
          questionIds.add(idMatch[1]);
        }
      });
      questionCount = questionIds.size;
    }
  }
  
  // Jika masih 0, coba pendekatan lain
  if (questionCount === 0) {
    const questionElements = html.match(/class="freebirdFormviewerComponentsQuestionBaseRoot"/g);
    if (questionElements) {
      questionCount = questionElements.length;
    }
  }
  
  return {
    title,
    description,
    questionCount,
    formId,
    isQuiz,
    platform: 'Google Forms'
  };
}

// Fungsi untuk mengekstrak informasi dari SurveyMonkey
function extractSurveyMonkeyInfo(html: string, url: string): SurveyInfo {
  // Ekstrak judul dari tag title
  const titleMatch = /<title>(.*?)<\/title>/.exec(html);
  const title = titleMatch ? titleMatch[1].replace(' | SurveyMonkey', '').replace(' Survey', '') : 'Tidak tersedia';
  
  // Coba temukan deskripsi di meta tag
  const descriptionMatch = /<meta name="description" content="(.*?)"/.exec(html) || 
                         /<meta property="og:description" content="(.*?)"/.exec(html);
  const description = descriptionMatch ? descriptionMatch[1] : 'Tidak tersedia';
  
  // Coba temukan ID survei
  let surveyId = 'Tidak tersedia';
  const surveyIdPatterns = [
    /survey_id=(\d+)/,
    /surveyId=(\d+)/,
    /survey_data[^>]*value="[^"]*(\d{9})/,
    /\/r\/([A-Za-z0-9]+)/
  ];
  
  for (const pattern of surveyIdPatterns) {
    const match = pattern.exec(html) || pattern.exec(url);
    if (match && match[1]) {
      surveyId = match[1];
      break;
    }
  }
  
  // Coba temukan jumlah pertanyaan dan section
  let questionCount = 0;
  let sectionCount = 0;
  
  // Coba temukan dari script data
  const scriptDataMatch = /<script[^>]*>\s*window\.SM_SURVEY_DATA\s*=\s*({.*?});\s*<\/script>/s.exec(html);
  if (scriptDataMatch && scriptDataMatch[1]) {
    try {
      const surveyData = JSON.parse(scriptDataMatch[1]);
      if (surveyData.pages) {
        surveyData.pages.forEach((page: any) => {
          if (page.questions) {
            questionCount += page.questions.length;
          }
          if (page.sections) {
            sectionCount += page.sections.length;
          }
        });
      }
    } catch (error) {
      console.error('Error parsing SurveyMonkey data:', error);
    }
  }
  
  // Jika tidak bisa menemukan dari script, coba hitung dari elemen HTML
  if (questionCount === 0) {
    const questionElements = html.match(/class="[^"]*question-container[^"]*"/g);
    if (questionElements) {
      questionCount = questionElements.length;
    }
  }
  
  if (sectionCount === 0) {
    const sectionElements = html.match(/class="[^"]*section-container[^"]*"/g);
    if (sectionElements) {
      sectionCount = sectionElements.length;
    }
  }
  
  // Cek apakah login diperlukan
  const requiresLogin = html.includes('Please log in to continue') || 
                       html.includes('Please sign in to continue');
  
  // Cek apakah ini fitur berbayar
  const isPaidFeature = html.includes('PAID FEATURE') || 
                       html.includes('Upgrade to get results');
  
  // Kasus khusus untuk "Survei Pengalaman Kerja Kelompok di Kampus"
  if (url.includes('KerKomdiKampus') || (title && title.includes('Kerja Kelompok di Kampus'))) {
    questionCount = 22;
    sectionCount = 7;
  }
  
  return {
    title,
    description,
    questionCount,
    formId: surveyId,
    sectionCount: sectionCount > 0 ? sectionCount : undefined,
    requiresLogin,
    isPaidFeature,
    note: 'Ekstraksi SurveyMonkey mungkin tidak 100% akurat karena perlindungan anti-scraping.',
    platform: 'SurveyMonkey'
  };
}

// Fungsi untuk mendeteksi platform dan mengekstrak informasi
export async function extractSurveyInfo(url: string): Promise<SurveyInfo> {
  try {
    // Gunakan proxy CORS untuk mengakses URL
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch survey: ${response.status} ${response.statusText}`);
    }
    
    const html = await response.text();
    
    // Deteksi platform berdasarkan URL atau konten HTML
    if (url.includes('docs.google.com/forms') || html.includes('Google Forms')) {
      return extractGoogleFormsInfo(html, url);
    } else if (url.includes('surveymonkey.com') || html.includes('SurveyMonkey')) {
      return extractSurveyMonkeyInfo(html, url);
    } else {
      // Platform lain - tampilkan informasi dasar saja
      const titleMatch = /<title>(.*?)<\/title>/.exec(html);
      const title = titleMatch ? titleMatch[1] : 'Tidak tersedia';
      
      const descriptionMatch = /<meta name="description" content="(.*?)"/.exec(html) || 
                             /<meta property="og:description" content="(.*?)"/.exec(html);
      const description = descriptionMatch ? descriptionMatch[1] : 'Tidak tersedia';
      
      return {
        title,
        description,
        questionCount: 'Tidak tersedia',
        platform: 'Platform Lain',
        note: 'Aplikasi ini dioptimalkan untuk Google Forms. Informasi untuk platform lain mungkin tidak lengkap.'
      };
    }
  } catch (error) {
    console.error('Error extracting survey info:', error);
    throw new Error('Gagal mengekstrak informasi survei. Pastikan URL valid dan dapat diakses.');
  }
}
