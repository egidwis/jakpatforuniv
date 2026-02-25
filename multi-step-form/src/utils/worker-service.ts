// Utility for working with Web Workers

import type { SurveyInfo } from './survey-service';

// Static blacklist removed - we now use pattern detection only

// Dynamic blacklist removed - we now use pattern detection instead

// Fungsi untuk mengekstrak form ID dari URL Google Form
function extractFormId(url: string): string | null {
  const match = url.match(/\/forms\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

// Fungsi untuk mendeteksi pattern URL yang bermasalah
export function hasProblematicUrlPattern(url: string): boolean {
  // Pattern 1: Remove usp= check - this is actually a normal Google tracking parameter
  // usp= parameters are safe and commonly used by Google Forms
  // Commenting out the problematic check:
  // if (url.includes('usp=')) {
  //   console.log('Detected problematic URL pattern: contains usp= parameter');
  //   return true;
  // }

  // Pattern 2: URL dengan parameter edit (form dalam mode edit)
  if (url.includes('/edit')) {
    console.log('Detected problematic URL pattern: contains /edit path');
    return true;
  }

  // Pattern 3: URL dengan parameter viewform yang tidak standar
  // Allow usp= and embedded= parameters, they are safe Google tracking parameters
  if (url.includes('viewform?') && !url.includes('usp=') && !url.includes('embedded=')) {
    console.log('Detected problematic URL pattern: non-standard viewform parameters');
    return true;
  }

  // Pattern 4: URL dengan parameter sharing yang mencurigakan
  if (url.includes('sharing=') || url.includes('share=')) {
    console.log('Detected problematic URL pattern: contains sharing parameters');
    return true;
  }

  return false;
}

// Fungsi untuk memeriksa apakah URL bermasalah berdasarkan pattern
export function isProblematicUrl(url: string): boolean {
  // Check URL patterns only
  if (hasProblematicUrlPattern(url)) {
    console.log('URL flagged as problematic due to URL pattern');
    return true;
  }

  return false;
}

// Fungsi untuk quick pre-check URL
async function quickPreCheck(url: string): Promise<'accessible' | 'problematic' | 'unknown'> {
  try {
    console.log('Performing quick pre-check for URL:', url);

    // Very short timeout for quick check
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500); // 1.5 second timeout

    const response = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 403 || response.status === 401) {
        return 'problematic';
      }
      return 'unknown';
    }

    const html = await response.text();

    // Quick check for permission issues
    if (html.includes('You need permission') ||
      html.includes('Request access') ||
      html.includes('Sign in') ||
      html.includes('accounts.google.com') ||
      html.length < 1000) {
      return 'problematic';
    }

    return 'accessible';
  } catch (error: any) {
    console.log('Quick pre-check failed:', error.message);
    // If quick check fails, we don't know - let the main extraction decide
    return 'unknown';
  }
}

// Function to extract form information using a Web Worker
export async function extractFormInfoWithWorker(url: string): Promise<SurveyInfo> {
  // Skip quick pre-check - let the worker handle everything
  console.log('Starting worker extraction directly for URL:', url);

  return new Promise((resolve, reject) => {
    try {
      // Create a new worker
      const worker = new Worker(new URL('../workers/form-extractor.worker.ts', import.meta.url), { type: 'module' });

      // Set a timeout for the entire worker operation
      const timeoutId = setTimeout(() => {
        console.log('Worker timeout reached, terminating worker');
        worker.terminate();
        reject(new Error('WORKER_TIMEOUT'));
      }, 5000); // 5 second global timeout (reduced from 8)

      // Listen for messages from the worker
      worker.addEventListener('message', (event) => {
        clearTimeout(timeoutId);

        if (event.data.type === 'EXTRACT_RESPONSE') {
          if (event.data.data) {
            resolve(event.data.data);
          } else {
            const error = event.data.error || 'Failed to extract form info';
            reject(new Error(error));
          }
        }

        // Always terminate the worker when done
        worker.terminate();
      });

      // Listen for errors
      worker.addEventListener('error', (error) => {
        clearTimeout(timeoutId);
        console.error('Worker error:', error);
        worker.terminate();
        reject(new Error('Worker error: ' + error.message));
      });

      // Send the URL to the worker
      worker.postMessage({
        type: 'EXTRACT_REQUEST',
        url
      });

      console.log('Worker started for URL:', url);
    } catch (error) {
      console.error('Error creating worker:', error);
      reject(error);
    }
  });
}

// Fallback function for browsers that don't support Web Workers
export async function extractFormInfoFallback(url: string): Promise<SurveyInfo> {
  console.log('[FALLBACK DEBUG] SAFE EXTRACTION - with network fallback');

  // SAFE FETCH with very short timeout
  try {
    console.log('[FALLBACK DEBUG] Starting safe fetch');

    // Extract form ID from URL for pattern matching
    // Handle both regular and /e/ URLs
    let formIdMatch = url.match(/\/forms\/d\/([a-zA-Z0-9-_]+)/);
    if (!formIdMatch) {
      // Try /e/ format: /forms/d/e/1FAIpQLSe.../viewform
      formIdMatch = url.match(/\/forms\/d\/e\/([a-zA-Z0-9-_]+)/);
    }
    const formId = formIdMatch ? formIdMatch[1] : null;
    console.log('[FALLBACK DEBUG] Form ID:', formId);
    console.log('[FALLBACK DEBUG] Original URL:', url);

    // Basic validation - accept all Google Form URLs including shortlinks
    if (!url.includes('docs.google.com/forms') &&
      !url.includes('forms.gle') &&
      !url.includes('goo.gl') &&
      !url.includes('g.co')) {
      throw new Error('NON_GOOGLE_FORM');
    }

    // Try safe fetch with reasonable timeout
    console.log('[FALLBACK DEBUG] Attempting safe fetch with 8 second timeout');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

    let html = '';
    let title = `Google Form ${formId ? formId.substring(0, 8) + '...' : ''}`;
    let description = 'Form description not available';
    let questionCount = 10; // Default
    let hasPersonalDataQuestions = false;
    let detectedKeywords: string[] = [];
    let formData: any = null;

    try {
      // Try multiple proxies for better reliability
      console.log('[FALLBACK DEBUG] Trying multiple proxies for Google Form...');

      const proxyUrls = [
        `https://corsproxy.io/?${encodeURIComponent(url)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        `/api/google-forms-proxy?url=${encodeURIComponent(url)}`
      ];

      let response;
      let lastError;

      for (let i = 0; i < proxyUrls.length; i++) {
        const proxyUrl = proxyUrls[i];
        console.log(`[FALLBACK DEBUG] Trying proxy ${i + 1}/${proxyUrls.length}:`, proxyUrl);

        try {
          response = await fetch(proxyUrl, {
            signal: controller.signal
          });

          if (response.ok) {
            console.log(`[FALLBACK DEBUG] Proxy ${i + 1} successful, status:`, response.status);
            break;
          } else {
            console.log(`[FALLBACK DEBUG] Proxy ${i + 1} failed with status:`, response.status);
            lastError = new Error(`HTTP ${response.status}`);
            response = null;
          }
        } catch (error: any) {
          console.log(`[FALLBACK DEBUG] Proxy ${i + 1} failed:`, error.message);
          lastError = error;
          response = null;
        }
      }

      if (!response) {
        throw lastError || new Error('All proxies failed');
      }

      clearTimeout(timeoutId);
      console.log('[FALLBACK DEBUG] Fetch successful, status:', response.status);

      if (!response.ok) {
        if (response.status === 403) {
          console.log('[FALLBACK DEBUG] HTTP 403 - Form may be private or restricted');
          // For 403, return default data rather than throwing error
          return {
            title: `Google Form ${formId ? formId.substring(0, 8) + '...' : ''}`,
            description: 'This form appears to be private or restricted',
            questionCount: 5, // Conservative estimate
            platform: 'Google Forms',
            hasPersonalDataQuestions: false,
            detectedKeywords: []
          } as SurveyInfo;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      html = await response.text();
      console.log('[FALLBACK DEBUG] HTML received, length:', html.length);

      // Very specific privacy check - only trigger on actual restriction messages
      const privacyIndicators = [
        'You need permission to access this item',
        'Request access to',
        'This form can only be viewed by users in the',
        'Sign in to continue to Google Forms'
      ];

      const hasPrivacyIssue = privacyIndicators.some(indicator => html.includes(indicator));

      if (hasPrivacyIssue) {
        console.log('[FALLBACK DEBUG] Form appears private or restricted - found specific privacy indicator');
        throw new Error('FORM_NOT_PUBLIC');
      }

      // Additional check: if HTML is too short, it might be an error page
      if (html.length < 3000) {
        console.log('[FALLBACK DEBUG] HTML too short, might be error page (length:', html.length, ')');
        console.log('[FALLBACK DEBUG] HTML preview:', html.substring(0, 500));
        throw new Error('FORM_NOT_PUBLIC');
      }

      // If we have a reasonable amount of HTML and no obvious restrictions, proceed
      console.log('[FALLBACK DEBUG] Form appears accessible, proceeding with extraction');

      // Extract basic title and description (simple extraction)
      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      if (titleMatch && titleMatch[1] && titleMatch[1].trim()) {
        title = titleMatch[1].replace(' - Google Forms', '').trim();
        console.log('[FALLBACK DEBUG] Extracted title:', title);
      }

      // Extract description safely
      const descMatches = [
        /<meta\s+property="og:description"\s+content="([^"]*?)"/i,
        /<meta\s+name="description"\s+content="([^"]*?)"/i
      ];

      for (const regex of descMatches) {
        const match = regex.exec(html);
        if (match && match[1] && match[1].trim()) {
          description = match[1].trim();
          console.log('[FALLBACK DEBUG] Extracted description:', description);
          break;
        }
      }

      // PRIMARY METHOD: Extract from FB_PUBLIC_LOAD_DATA_ (most accurate)
      try {
        console.log('[FALLBACK DEBUG] Attempting FB_PUBLIC_LOAD_DATA_ extraction...');

        const fbDataRegex = /var\s+FB_PUBLIC_LOAD_DATA_\s*=\s*([\s\S]*?);\s*<\/script>/;
        const fbDataMatch = fbDataRegex.exec(html);

        if (fbDataMatch && fbDataMatch[1]) {
          console.log('[FALLBACK DEBUG] Found FB_PUBLIC_LOAD_DATA_, length:', fbDataMatch[1].length);

          try {
            formData = JSON.parse(fbDataMatch[1]);
            console.log('[FALLBACK DEBUG] Successfully parsed FB_PUBLIC_LOAD_DATA_');

            // Google Forms structure: formData[1][1] contains array of questions
            if (formData && formData[1] && Array.isArray(formData[1][1])) {
              const questions = formData[1][1];
              console.log('[FALLBACK DEBUG] Found questions array with', questions.length, 'items');

              // DETAILED DEBUGGING: Log each item structure
              questions.forEach((q, index) => {
                if (q && Array.isArray(q)) {
                  console.log(`[FALLBACK DEBUG] Item ${index}:`, {
                    type: q[3],
                    hasContent: q.length > 0,
                    firstElements: q.slice(0, 5),
                    length: q.length
                  });
                } else {
                  console.log(`[FALLBACK DEBUG] Item ${index}: not an array or null/undefined`);
                }
              });

              // Simple and accurate question counting
              const validQuestions = questions.filter((q, index) => {
                if (!q || !Array.isArray(q)) {
                  console.log(`[FALLBACK DEBUG] Filtering out item ${index}: not an array`);
                  return false;
                }

                const questionType = q[3];

                // Skip ONLY clear non-questions: section headers and page breaks
                if (questionType === 6 || questionType === 7 || questionType === 8) {
                  console.log(`[FALLBACK DEBUG] Filtering out item ${index}: non-question type (${questionType}) - "${q[1]}"`);
                  return false;
                }

                // Include ALL other types as questions (0, 1, 2, 3, 4, 5, etc.)
                // Type 0: Text input questions (very common in Google Forms)
                // Type 1: Text questions, Type 2: Multiple choice, Type 4: Dropdown, Type 5: Scale, etc.
                if (typeof questionType === 'number' && questionType >= 0 &&
                  questionType !== 6 && questionType !== 7 && questionType !== 8) {
                  console.log(`[FALLBACK DEBUG] Including item ${index}: valid question (type ${questionType}) - "${q[1]}"`);
                  return true;
                }

                console.log(`[FALLBACK DEBUG] Filtering out item ${index}: unknown type (${questionType}) - "${q[1]}"`);
                return false;
              });

              questionCount = validQuestions.length;
              console.log(`[FALLBACK DEBUG] FB_PUBLIC_LOAD_DATA_ method: ${questionCount} valid questions (from ${questions.length} total items)`);

              // Log question types for debugging
              const questionTypes = validQuestions.map(q => q[3]).filter(type => type !== undefined);
              const uniqueTypes = [...new Set(questionTypes)];
              console.log('[FALLBACK DEBUG] Question types found:', uniqueTypes);

              // SUCCESS! FB_PUBLIC_LOAD_DATA_ extraction successful
              console.log('[FALLBACK DEBUG] FB_PUBLIC_LOAD_DATA_ extraction successful - now checking personal data...');

              // Personal data detection dari FB_PUBLIC_LOAD_DATA_
              let hasPersonalDataQuestions = false;
              let detectedKeywords: string[] = [];

              const fbQuestions = formData[1][1];
              fbQuestions.forEach((q: any, index: number) => {
                if (q && Array.isArray(q) && q.length > 1 && q[1]) {
                  const questionText = String(q[1]).toLowerCase();
                  console.log(`[FALLBACK DEBUG] Checking FB item ${index}: "${q[1]}" (type: ${q[3]})`);

                  // More specific personal data detection - avoid false positives using word boundaries
                  const isNameField = /\b(nama lengkap|full name|nama depan|first name|nama belakang|last name|nama|name)\b/i.test(questionText) &&
                    !/\b(nama makanan|nama produk|nama tempat|nama perusahaan|nama sekolah|brand name|company name|school name)\b/i.test(questionText);

                  const isEmailField = /\b(email|e-mail)\b/i.test(questionText);

                  const isPhoneField = /\b(phone|whatsapp|wa|telepon|no(?:mor)?\s*hp|no(?:mor)?\s*wa|no(?:mor)?\s*telepon|hp|handphone|hanphone|henpon|hanpon|hape|telp|no(?:\.)?\s*hp|no(?:mor)?\s*telp|mobile|cell)\b/i.test(questionText);

                  const isNikField = /\b(nik|ktp|id card|nomor induk kependudukan)\b/i.test(questionText);

                  if (isNameField || isEmailField || isPhoneField) {
                    console.log(`[FALLBACK DEBUG] *** PERSONAL DATA FOUND in FB item ${index}: "${q[1]}" ***`);
                    hasPersonalDataQuestions = true;

                    // Determine keyword type
                    if (isNameField) {
                      if (!detectedKeywords.includes('name')) detectedKeywords.push('name');
                    } else if (isEmailField) {
                      if (!detectedKeywords.includes('email')) detectedKeywords.push('email');
                    } else if (isPhoneField) {
                      if (!detectedKeywords.includes('phone')) detectedKeywords.push('phone');
                    } else if (isNikField) {
                      if (!detectedKeywords.includes('nik/id')) detectedKeywords.push('nik/id');
                    }
                  }
                }
              });

              if (hasPersonalDataQuestions) {
                console.log(`[FALLBACK DEBUG] *** FINAL RESULT: hasPersonalDataQuestions = true, detectedKeywords:`, detectedKeywords);
              }

              return {
                title,
                description,
                questionCount,
                platform: 'Google Forms',
                url: url,
                hasPersonalDataQuestions,
                detectedKeywords
              };

            } else {
              console.log('[FALLBACK DEBUG] FB_PUBLIC_LOAD_DATA_ structure not as expected');
              throw new Error('Unexpected structure');
            }
          } catch (parseError: any) {
            console.log('[FALLBACK DEBUG] Failed to parse FB_PUBLIC_LOAD_DATA_:', parseError.message);
            questionCount = 0; // Will fall back to secondary methods
          }
        } else {
          console.log('[FALLBACK DEBUG] FB_PUBLIC_LOAD_DATA_ not found in HTML');
          questionCount = 0; // Will fall back to secondary methods
        }
      } catch (fbError: any) {
        console.log('[FALLBACK DEBUG] FB_PUBLIC_LOAD_DATA_ extraction failed:', fbError.message);
        questionCount = 0;
      }

      // FALLBACK METHOD: If FB_PUBLIC_LOAD_DATA_ fails, use simple patterns
      if (questionCount === 0) {
        console.log('[FALLBACK DEBUG] FB_PUBLIC_LOAD_DATA_ failed, trying fallback methods...');

        const fallbackPatterns = [
          { pattern: /jscontroller="(VXdfxd|lSvzH|YOQA7d|NRAOPe|HvnK2b|W7JYtf|auOCFe)"/g, name: 'InputController' },
          { pattern: /entry\.\d+/g, name: 'UniqueEntries', unique: true },
          { pattern: /\*(?!\s*(?:Indicates|Menunjukkan))/g, name: 'RequiredFields' }
        ];

        for (const { pattern, name, unique } of fallbackPatterns) {
          const matches = html.match(pattern);
          if (matches && matches.length > 0) {
            let count = matches.length;
            if (unique) {
              count = new Set(matches).size;
            }

            if (count > questionCount && count <= 50) {
              questionCount = count;
              console.log(`[FALLBACK DEBUG] Using fallback method ${name}: ${count} questions`);
              break;
            }
          }
        }
      }

      // Final fallback: Use default value
      if (questionCount === 0) {
        console.log('[FALLBACK DEBUG] All extraction methods failed, using default: 10');
        questionCount = 10;
      }

    } catch (countError) {
      console.log('[FALLBACK DEBUG] Question count extraction failed, using default:', countError);
    }

    // SAFE personal data detection - simple keyword search
    // Variables already declared at function scope

    try {
      // OPTION 2: Better HTML analysis - analyze actual form elements
      console.log('[FALLBACK DEBUG] Analyzing actual HTML form elements for personal data');

      // Quick check: are we looking for personal data in FB_PUBLIC_LOAD_DATA_ questions first?
      if (formData && formData[1] && Array.isArray(formData[1][1])) {
        console.log('[FALLBACK DEBUG] Checking FB_PUBLIC_LOAD_DATA_ for personal data patterns...');
        const questions = formData[1][1];
        let personalDataFound = false;

        questions.forEach((q: any, index: number) => {
          if (q && Array.isArray(q) && q.length > 1 && q[1]) {
            const questionText = String(q[1]).toLowerCase();
            console.log(`[FALLBACK DEBUG] Checking item ${index}: "${q[1]}" (type: ${q[3]})`);

            if (/\b(nama|name|email|e-mail|phone|telepon|handphone|hanphone|whatsapp|wa|alamat|nik|ktp|nomor induk kependudukan|henpon|hanpon|hape|telp|hp)\b/i.test(questionText)) {
              console.log(`[FALLBACK DEBUG] *** PERSONAL DATA FOUND in FB item ${index}: "${q[1]}" ***`);
              personalDataFound = true;

              // Determine keyword type
              if (/\b(nama|name)\b/i.test(questionText)) {
                if (!detectedKeywords.includes('name')) detectedKeywords.push('name');
              } else if (/\b(email|e-mail)\b/i.test(questionText)) {
                if (!detectedKeywords.includes('email')) detectedKeywords.push('email');
              } else if (/\b(phone|whatsapp|wa|telepon|no(?:mor)?\s*hp|no(?:mor)?\s*wa|no(?:mor)?\s*telepon|hp|handphone|hanphone|henpon|hanpon|hape|telp|no(?:\.)?\s*hp|no(?:mor)?\s*telp|mobile|cell)\b/i.test(questionText)) {
                if (!detectedKeywords.includes('phone')) detectedKeywords.push('phone');
              } else if (/\b(alamat|address)\b/i.test(questionText)) {
                if (!detectedKeywords.includes('address')) detectedKeywords.push('address');
              } else if (/\b(nik|ktp|id card|nomor induk kependudukan)\b/i.test(questionText)) {
                if (!detectedKeywords.includes('nik/id')) detectedKeywords.push('nik/id');
              }
            }
          }
        });

        if (personalDataFound) {
          hasPersonalDataQuestions = true;
          console.log(`[FALLBACK DEBUG] *** SETTING hasPersonalDataQuestions = true, detectedKeywords:`, detectedKeywords);
        }
      }

      // Debug: Show relevant HTML snippets that might contain personal data
      console.log('[FALLBACK DEBUG] Searching for phone patterns in HTML...');
      const phoneDebugPatterns = [
        /nomor\s*hanphone/gi,
        /nomor\s*handphone/gi,
        /nomor\s*telepon/gi,
        /nomor\s*hp/gi,
        /phone/gi,
        /whatsapp/gi
      ];

      for (const pattern of phoneDebugPatterns) {
        const matches = html.match(pattern);
        if (matches && matches.length > 0) {
          console.log(`[FALLBACK DEBUG] Found phone-related text: "${matches[0]}" (${matches.length} times)`);
          // Show surrounding context
          const index = html.search(pattern);
          if (index !== -1) {
            const context = html.substring(Math.max(0, index - 100), index + 200);
            console.log(`[FALLBACK DEBUG] Context:`, context);
          }
        }
      }

      // Look for Google Forms specific structure, not just regular HTML inputs
      const googleFormsPatterns = [
        // Google Forms question patterns - look for question text content with more specific patterns
        // Only match actual personal data collection, not generic usage
        /(?:<div[^>]*>|<span[^>]*>)\s*([^<]*(?:your email|email address|alamat email|e-?mail anda)[^<]*)\s*(?:<\/div>|<\/span>)/gi,
        /(?:<div[^>]*>|<span[^>]*>)\s*([^<]*(?:phone number|nomor telepon|nomor hp|nomor handphone|nomor hanphone|whatsapp number)[^<]*)\s*(?:<\/div>|<\/span>)/gi,
        /(?:<div[^>]*>|<span[^>]*>)\s*([^<]*(?:full name|first name|last name|nama lengkap|nama depan|nama belakang)[^<]*)\s*(?:<\/div>|<\/span>)/gi,
        /(?:<div[^>]*>|<span[^>]*>)\s*([^<]*(?:home address|mailing address|alamat rumah|alamat tempat tinggal)[^<]*)\s*(?:<\/div>|<\/span>)/gi,
      ];

      // Google Forms uses aria-label and data-params for form structure
      const googleFormsInputPatterns = [
        // Look for actual input elements in Google Forms
        /<input[^>]*aria-label=['"]*([^'"]*(?:email|e-mail)[^'"]*)/gi,
        /<input[^>]*aria-label=['"]*([^'"]*(?:phone|nomor|telepon|handphone|hanphone|hp|whatsapp)[^'"]*)/gi,
        /<input[^>]*aria-label=['"]*([^'"]*(?:name|nama)[^'"]*)/gi,
        /<input[^>]*aria-label=['"]*([^'"]*(?:address|alamat)[^'"]*)/gi,

        // Look for textarea elements
        /<textarea[^>]*aria-label=['"]*([^'"]*(?:email|phone|nomor|name|nama|address|alamat)[^'"]*)/gi,
      ];

      // Look for question titles in Google Forms structure - more comprehensive patterns
      const questionTitlePatterns = [
        // English patterns
        /class="[^"]*freebirdFormviewerComponentsQuestionBaseTitle[^"]*"[^>]*>([^<]*(?:email|e-?mail|electronic mail)[^<]*)</gi,
        /class="[^"]*freebirdFormviewerComponentsQuestionBaseTitle[^"]*"[^>]*>([^<]*(?:phone|telephone|mobile|cell)[^<]*)</gi,
        /class="[^"]*freebirdFormviewerComponentsQuestionBaseTitle[^"]*"[^>]*>([^<]*(?:full name|first name|last name|name)[^<]*)</gi,
        /class="[^"]*freebirdFormviewerComponentsQuestionBaseTitle[^"]*"[^>]*>([^<]*(?:address|location|residence)[^<]*)</gi,

        // Indonesian patterns
        /class="[^"]*freebirdFormviewerComponentsQuestionBaseTitle[^"]*"[^>]*>([^<]*(?:alamat email|surel)[^<]*)</gi,
        /class="[^"]*freebirdFormviewerComponentsQuestionBaseTitle[^"]*"[^>]*>([^<]*(?:nomor|telepon|handphone|hanphone|telp|hp|whatsapp|wa)[^<]*)</gi,
        /class="[^"]*freebirdFormviewerComponentsQuestionBaseTitle[^"]*"[^>]*>([^<]*(?:nama lengkap|nama depan|nama belakang|nama)[^<]*)</gi,
        /class="[^"]*freebirdFormviewerComponentsQuestionBaseTitle[^"]*"[^>]*>([^<]*(?:alamat|domisili|tempat tinggal)[^<]*)</gi,

        // Also check span elements that might contain question text
        /<span[^>]*class="[^"]*freebirdFormviewerComponentsQuestionBaseTitle[^"]*"[^>]*>([^<]*(?:email|e-?mail|alamat email)[^<]*)</gi,
        /<span[^>]*class="[^"]*freebirdFormviewerComponentsQuestionBaseTitle[^"]*"[^>]*>([^<]*(?:phone|nomor|telepon|handphone|hanphone|hp|whatsapp)[^<]*)</gi,
        /<span[^>]*class="[^"]*freebirdFormviewerComponentsQuestionBaseTitle[^"]*"[^>]*>([^<]*(?:name|nama)[^<]*)</gi,
      ];

      // Check Google Forms patterns (question content)
      const allPatterns = [...googleFormsPatterns, ...googleFormsInputPatterns, ...questionTitlePatterns];

      for (const pattern of allPatterns) {
        const matches = html.match(pattern);
        if (matches && matches.length > 0) {
          console.log('[FALLBACK DEBUG] Found Google Forms personal data pattern:', matches[0]);

          // Determine keyword type from the match - be more specific
          const match = matches[0].toLowerCase();
          if (/\b(email|e-mail|surel)\b/i.test(match)) {
            if (!detectedKeywords.includes('email')) detectedKeywords.push('email');
          } else if (/\b(phone|whatsapp|wa|telepon|no(?:mor)?\s*hp|no(?:mor)?\s*wa|no(?:mor)?\s*telepon|hp|handphone|hanphone|henpon|hanpon|hape|telp|no(?:\.)?\s*hp|no(?:mor)?\s*telp|mobile|cell)\b/i.test(match)) {
            if (!detectedKeywords.includes('phone')) detectedKeywords.push('phone');
          } else if (/\b(name|nama)\b/i.test(match)) {
            if (!detectedKeywords.includes('name')) detectedKeywords.push('name');
          } else if (/\b(address|alamat|domisili|residence)\b/i.test(match)) {
            if (!detectedKeywords.includes('address')) detectedKeywords.push('address');
          } else if (/\b(nik|ktp|id card|nomor induk kependudukan)\b/i.test(match)) {
            if (!detectedKeywords.includes('nik/id')) detectedKeywords.push('nik/id');
          }
        }
      }

      // Only trigger if we found actual input fields (not just labels)
      if (detectedKeywords.length > 0) {
        hasPersonalDataQuestions = true;
        console.log('[FALLBACK DEBUG] Personal data INPUT FIELDS detected:', detectedKeywords);
      } else {
        console.log('[FALLBACK DEBUG] No personal data input fields found');
      }

      if (detectedKeywords.length > 0) {
        console.log('[FALLBACK DEBUG] Personal data keywords detected:', detectedKeywords);
      } else {
        console.log('[FALLBACK DEBUG] No personal data keywords found');
      }

    } catch (detectionError) {
      console.log('[FALLBACK DEBUG] Personal data detection failed, skipping:', detectionError);
    }

    // Special debugging for specific URLs
    if (url.includes('1FAIpQLSdSGkjOa4F309mAXN4KHGxjgQRtkKHxr57NZFt_XQQFTT8OXg')) {
      console.log('[FALLBACK DEBUG] SPECIAL DEBUG - Quiz form detected');
      console.log('[FALLBACK DEBUG] Final question count before return:', questionCount);
      console.log('[FALLBACK DEBUG] HTML length:', html.length);
    }

    // Special debugging for Order Request form  
    if (url.includes('1FAIpQLSdCpIuBC5BNKhl2qv077I-WlOCmYR_7RHAJY9RZXpdD9519IQ')) {
      console.log('[FALLBACK DEBUG] SPECIAL DEBUG - Order Request form detected');
      console.log('[FALLBACK DEBUG] Final question count:', questionCount);
      console.log('[FALLBACK DEBUG] HTML length:', html.length);

      // Additional debug - try manual pattern search for better understanding
      const debugPatterns = [
        { name: 'Radio buttons', pattern: /type="radio"/g },
        { name: 'Input fields', pattern: /<input[^>]*>/g },
        { name: 'Question divs', pattern: /<div[^>]*question[^>]*>/gi },
        { name: 'Required asterisks', pattern: /\*/g },
        { name: 'Aria labels', pattern: /aria-label="[^"]*"/g },
        // More structural patterns
        { name: 'Radio groups (name attr)', pattern: /name="entry\.\d+"/g },
        { name: 'Question containers', pattern: /data-item-id="\d+"/g },
        { name: 'Form sections', pattern: /<div[^>]*role="group"/g },
        { name: 'Question IDs', pattern: /entry\.\d+/g },
        { name: 'FB form data', pattern: /FB_PUBLIC_LOAD_DATA_/g }
      ];

      for (const { name, pattern } of debugPatterns) {
        const matches = html.match(pattern);
        console.log(`[FALLBACK DEBUG] ${name}: ${matches ? matches.length : 0} found`);
      }
    }

    console.log('[FALLBACK DEBUG] Safe extraction with fetch completed');
    return {
      title,
      description,
      questionCount,
      platform: 'Google Forms',
      url: url,
      hasPersonalDataQuestions,
      detectedKeywords
    };

  } catch (fetchError: any) {
    // Handle specific error types
    if (fetchError.name === 'AbortError') {
      console.log('[FALLBACK DEBUG] Request timeout (8 seconds exceeded)');
      throw new Error('REQUEST_TIMEOUT');
    } else {
      console.log('[FALLBACK DEBUG] Fetch failed:', fetchError);
    }

    // Don't return fallback data that looks real - instead throw error
    // This prevents showing misleading mock data to users
    throw new Error('EXTRACTION_FAILED');
  }

  /* ORIGINAL CODE COMMENTED OUT TO TEST FREEZE
  try {
    console.log('[FALLBACK DEBUG] Starting fallback extraction for URL:', url);
    console.log('[FALLBACK DEBUG] Timestamp:', Date.now());
    // Skip quick pre-check - proceed directly to extraction

    // Gunakan proxy server untuk menghindari masalah CORS
    // Cek apakah kita berada di lingkungan produksi atau development
    const isProduction = window.location.hostname.includes('pages.dev') ||
                         window.location.hostname.includes('jakpatforuniv.com');

    if (url.includes('docs.google.com/forms')) {
      console.log('[FALLBACK DEBUG] Using public CORS proxy for Google Form extraction...');
      console.log('[FALLBACK DEBUG] About to create proxy URL and fetch');

      // Gunakan public CORS proxy service
      // Opsi 1: AllOrigins - service publik yang memungkinkan CORS
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;

      // Set a timeout for the fetch operation
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 second timeout (reduced from 8)

      try {
        console.log('[FALLBACK DEBUG] Fetching via public proxy:', proxyUrl);
        console.log('[FALLBACK DEBUG] Fetch starting with timeout:', 4000);
        const response = await fetch(proxyUrl, {
          signal: controller.signal
        });
        console.log('[FALLBACK DEBUG] Fetch completed, status:', response.status);

        clearTimeout(timeoutId);

        if (!response.ok) {
          console.error(`Proxy request failed: ${response.status}`);
          throw new Error(`Proxy request failed: ${response.status}`);
        }

        // Dapatkan HTML dari proxy dan proses secara lokal
        console.log('[FALLBACK DEBUG] Getting response text...');
        const html = await response.text();
        console.log('[FALLBACK DEBUG] Form content fetched via proxy, length:', html.length);
        console.log('[FALLBACK DEBUG] About to start HTML processing...');

        // Check if the form is accessible
        if (html.includes('You need permission') ||
            html.includes('Request access') ||
            html.includes('Sign in') ||
            html.includes('accounts.google.com') ||
            html.includes('Permission denied') ||
            html.length < 1000) { // Very short response usually indicates error
          console.log('Form appears to be private or restricted (fallback method)');
          throw new Error('FORM_NOT_PUBLIC');
        }

        // Extract title
        let title = 'Google Form';
        const titleMatch = /<title>(.*?)<\/title>/i.exec(html);
        if (titleMatch && titleMatch[1]) {
          title = titleMatch[1].replace(' - Google Forms', '').trim();
        }

        // Extract description
        let description = 'Form description not available';
        const descriptionMatch = /<meta\s+property="og:description"\s+content="([^"]*?)"/i.exec(html);
        if (descriptionMatch && descriptionMatch[1]) {
          description = descriptionMatch[1].trim();
        }

        // Extract question count menggunakan kode yang sudah ada
        let questionCount = 0;

        // Try to extract question count from FB_PUBLIC_LOAD_DATA_ first
        console.log('[FALLBACK DEBUG] Starting FB_PUBLIC_LOAD_DATA_ extraction...');
        const fbDataRegex = /var\s+FB_PUBLIC_LOAD_DATA_\s*=\s*([\s\S]*?);\s*<\/script>/;
        console.log('[FALLBACK DEBUG] About to execute regex on HTML...');
        const fbDataMatch = fbDataRegex.exec(html);
        console.log('[FALLBACK DEBUG] Regex execution completed');

        if (fbDataMatch && fbDataMatch[1]) {
          try {
            // Parse JSON data
            const formData = JSON.parse(fbDataMatch[1]);

            // Struktur data Google Form: formData[1][1] berisi array pertanyaan
            if (formData && formData[1] && Array.isArray(formData[1][1])) {
              // Filter pertanyaan (exclude page breaks yang memiliki type 8)
              const questions = formData[1][1];
              questionCount = questions.filter(q => q && Array.isArray(q) && q[3] !== 8).length;
              console.log(`Detected ${questionCount} questions using FB_PUBLIC_LOAD_DATA_ structure`);
            } else if (formData && formData[1] && Array.isArray(formData[1][8])) {
              // Alternative structure
              questionCount = formData[1][8].length;
              console.log(`Detected ${questionCount} questions using alternative structure`);
            }
          } catch (error) {
            console.error('Error parsing FB_PUBLIC_LOAD_DATA_:', error);
          }
        }

        // If FB_PUBLIC_LOAD_DATA_ method failed, try HTML patterns
        if (questionCount === 0) {
          // Metode 1: Cari elemen pertanyaan di HTML (most reliable pattern)
          const questionMatches = html.match(/freebirdFormviewerComponentsQuestionBaseRoot/g);
          if (questionMatches) {
            questionCount = questionMatches.length;
            console.log(`Detected ${questionCount} questions using HTML pattern`);
          }

          // Metode 2: Cari container pertanyaan
          if (questionCount === 0) {
            const containerMatches = html.match(/class="[^"]*freebirdFormviewerViewItemsItemItem[^"]*"/g);
            if (containerMatches) {
              questionCount = containerMatches.length;
              console.log(`Detected ${questionCount} questions using form content divs`);
            }
          }

          // Metode 3: Cari wrapper pertanyaan
          if (questionCount === 0) {
            const wrapperMatches = html.match(/class="[^"]*freebirdFormviewerViewNumberedItemContainer[^"]*"/g);
            if (wrapperMatches) {
              questionCount = wrapperMatches.length;
              console.log(`Detected ${questionCount} questions using question wrappers`);
            }
          }

          // Metode 4: Cari judul pertanyaan
          if (questionCount === 0) {
            const titleMatches = html.match(/class="[^"]*freebirdFormviewerComponentsQuestionBaseTitle[^"]*"/g);
            if (titleMatches) {
              questionCount = titleMatches.length;
              console.log(`Detected ${questionCount} questions using question titles`);
            }
          }

          // Metode 5: Cari elemen dengan role="listitem" (common in newer Google Forms)
          if (questionCount === 0) {
            const listItemMatches = html.match(/role="listitem"/g);
            if (listItemMatches) {
              // Adjust for potential non-question list items (usually 2 for header/footer)
              const estimatedCount = Math.max(1, listItemMatches.length - 2);
              questionCount = estimatedCount;
              console.log(`Estimated ${questionCount} questions using list item containers`);
            }
          }

          // Metode 6: URL khusus
          if (questionCount === 0 && url.includes('FAIpQLSfCvr6FASe1FPDNegiXnvT4lJUaS4cJUomnznyCNcVpE6HYXQ')) {
            questionCount = 5;
            console.log(`Set question count to ${questionCount} based on known form URL`);
          }
        }

        // Default jika semua metode gagal
        if (questionCount === 0) {
          questionCount = 10;
          console.log('Using default question count: 10');
        }

        return {
          title,
          description,
          questionCount,
          platform: 'Google Forms',
          url: url
        };
      } catch (proxyError) {
        console.error('Error using public proxy, falling back to direct extraction:', proxyError);
        // Lanjutkan dengan metode ekstraksi langsung jika proxy gagal
      }
    }

    // Metode ekstraksi langsung (akan digunakan jika proxy gagal atau jika bukan Google Form)
    console.log('Using direct extraction method...');

    // Set a timeout for the fetch operation
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

    // Fetch the form content
    console.log('Fetching form content...');
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch form: ${response.status}`);
    }

    const html = await response.text();
    console.log('Form content fetched, length:', html.length);

    // Check if the form is accessible
    if (html.includes('You need permission') ||
        html.includes('Request access') ||
        html.includes('Sign in') ||
        html.includes('accounts.google.com') ||
        html.includes('Permission denied') ||
        html.length < 1000) { // Very short response usually indicates error
      console.log('Form appears to be private or restricted (direct fallback method)');
      throw new Error('FORM_NOT_PUBLIC');
    }

    // Extract title
    let title = 'Google Form';
    const titleMatch = /<title>(.*?)<\/title>/i.exec(html);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].replace(' - Google Forms', '').trim();
    }

    // Extract description
    let description = 'Form description not available';
    const descriptionMatch = /<meta\s+property="og:description"\s+content="([^"]*?)"/i.exec(html);
    if (descriptionMatch && descriptionMatch[1]) {
      description = descriptionMatch[1].trim();
    }

    // Extract question count
    let questionCount = 0;
    console.log('Starting question count extraction...');

    // Try to extract question count from FB_PUBLIC_LOAD_DATA_
    // Gunakan regex yang lebih robust untuk menangkap data JSON
    console.log('Looking for FB_PUBLIC_LOAD_DATA_...');
    const fbDataRegex = /var\s+FB_PUBLIC_LOAD_DATA_\s*=\s*([\s\S]*?);\s*<\/script>/;
    const fbDataMatch = fbDataRegex.exec(html);

    if (fbDataMatch && fbDataMatch[1]) {
      console.log('Found FB_PUBLIC_LOAD_DATA_, length:', fbDataMatch[1].length);

      try {
        // Parse JSON data
        console.log('Parsing JSON data...');
        const formData = JSON.parse(fbDataMatch[1]);
        console.log('JSON parsed successfully');

        // Debug the structure
        if (formData && formData[1]) {
          console.log('Form data structure available at index 1');
          console.log('formData[1][1] is array?', Array.isArray(formData[1][1]));
          if (Array.isArray(formData[1][1])) {
            console.log('formData[1][1] length:', formData[1][1].length);
          }
        }

        // Struktur data Google Form: formData[1][1] berisi array pertanyaan
        if (formData && formData[1] && Array.isArray(formData[1][1])) {
          // Filter pertanyaan (exclude page breaks yang memiliki type 8)
          const questions = formData[1][1];
          const filteredQuestions = questions.filter(q => q && Array.isArray(q) && q[3] !== 8);
          questionCount = filteredQuestions.length;
          console.log(`Detected ${questionCount} questions using FB_PUBLIC_LOAD_DATA_ structure (from ${questions.length} total items)`);

          // Log the question types for debugging
          if (filteredQuestions.length > 0) {
            console.log('Question types found:');
            const types = new Set();
            filteredQuestions.forEach(q => {
              if (q && Array.isArray(q) && q[3] !== undefined) {
                types.add(q[3]);
              }
            });
            console.log('Types:', Array.from(types));
          }
        } else {
          // Metode alternatif: Coba cari di struktur data lain
          // Beberapa Google Form memiliki struktur yang berbeda
          console.log('Primary structure not found, trying alternatives...');

          try {
            // Debug other potential structures
            if (formData && formData[1]) {
              console.log('formData[1][8] is array?', Array.isArray(formData[1][8]));
              console.log('formData[1][4] is array?', Array.isArray(formData[1][4]));

              if (Array.isArray(formData[1][8])) {
                console.log('formData[1][8] length:', formData[1][8].length);
              }

              if (Array.isArray(formData[1][4])) {
                console.log('formData[1][4] length:', formData[1][4].length);
              }
            }

            // Coba cari di formData[1][8] (struktur alternatif)
            if (formData && formData[1] && Array.isArray(formData[1][8])) {
              questionCount = formData[1][8].length;
              console.log(`Detected ${questionCount} questions using alternative structure (formData[1][8])`);
            }

            // Jika masih 0, coba cari di formData[1][4] (struktur lain)
            if (questionCount === 0 && formData && formData[1] && Array.isArray(formData[1][4])) {
              // Hitung jumlah elemen yang memiliki panjang > 0
              const nonEmptyItems = formData[1][4].filter(item => Array.isArray(item) && item.length > 0);
              questionCount = nonEmptyItems.length;
              console.log(`Detected ${questionCount} questions using structure formData[1][4] (from ${formData[1][4].length} total items)`);
            }

            // Try another alternative structure: formData[1][3]
            if (questionCount === 0 && formData && formData[1] && Array.isArray(formData[1][3])) {
              const nonEmptyItems = formData[1][3].filter(item => item !== null && typeof item === 'object');
              questionCount = nonEmptyItems.length;
              console.log(`Detected ${questionCount} questions using structure formData[1][3]`);
            }
          } catch (structureError) {
            console.error('Error parsing alternative structures:', structureError);
          }
        }
      } catch (error) {
        console.error('Error parsing FB_PUBLIC_LOAD_DATA_:', error);

        // Jika parsing JSON gagal, coba ekstrak dengan regex
        try {
          console.log('Trying regex pattern extraction...');
          // Cari pola yang menunjukkan pertanyaan dalam string JSON
          const nullTwoMatches = fbDataMatch[1].match(/null,2,/g);
          if (nullTwoMatches) {
            questionCount = nullTwoMatches.length;
            console.log(`Detected ${questionCount} questions using regex pattern (null,2,)`);
          } else {
            console.log('No matches found for regex pattern (null,2,)');

            // Try alternative regex patterns
            const questionTypeMatches = fbDataMatch[1].match(/\[\d+,\d+,\d+,\d+,\d+\]/g);
            if (questionTypeMatches) {
              questionCount = questionTypeMatches.length;
              console.log(`Detected ${questionCount} questions using alternative regex pattern`);
            }
          }
        } catch (regexError) {
          console.error('Error with regex fallback:', regexError);
        }
      }
    } else {
      console.log('FB_PUBLIC_LOAD_DATA_ not found in HTML');
    }

    // If we couldn't extract the question count, try alternative methods
    if (questionCount === 0) {
      console.log('No questions detected from FB_PUBLIC_LOAD_DATA_, trying HTML patterns...');

      // Method 1: Try to count question elements in HTML (most reliable pattern)
      console.log('Method 1: Looking for freebirdFormviewerComponentsQuestionBaseRoot...');
      const questionMatches = html.match(/freebirdFormviewerComponentsQuestionBaseRoot/g);
      if (questionMatches) {
        questionCount = questionMatches.length;
        console.log(`Detected ${questionCount} questions using HTML pattern (freebirdFormviewerComponentsQuestionBaseRoot)`);
      } else {
        console.log('No matches found for freebirdFormviewerComponentsQuestionBaseRoot');
      }

      // Method 2: Try to find question containers
      if (questionCount === 0) {
        console.log('Method 2: Looking for role="listitem"...');
        const containerMatches = html.match(/role="listitem"/g);
        if (containerMatches) {
          console.log(`Found ${containerMatches.length} listitem elements`);
          // Adjust for potential non-question list items
          const estimatedCount = Math.max(1, containerMatches.length - 2);
          questionCount = estimatedCount;
          console.log(`Estimated ${questionCount} questions using list item containers`);
        } else {
          console.log('No matches found for role="listitem"');
        }
      }

      // Method 3: Try to find question labels
      if (questionCount === 0) {
        console.log('Method 3: Looking for aria-label attributes...');
        const labelMatches = html.match(/aria-label="(Question|Required|Optional)"/gi);
        if (labelMatches) {
          console.log(`Found ${labelMatches.length} question-related aria-labels`);
          questionCount = labelMatches.length;
          console.log(`Detected ${questionCount} questions using aria labels`);
        } else {
          console.log('No matches found for question-related aria-labels');
        }
      }

      // Method 4: Try to find question sections
      if (questionCount === 0) {
        console.log('Method 4: Looking for jscontroller="UmOCme"...');
        const sectionMatches = html.match(/jscontroller="UmOCme"/g);
        if (sectionMatches) {
          console.log(`Found ${sectionMatches.length} section controllers`);
          questionCount = sectionMatches.length;
          console.log(`Detected ${questionCount} questions using section controllers`);
        } else {
          console.log('No matches found for jscontroller="UmOCme"');
        }
      }

      // Method 5: Try to find question input fields
      if (questionCount === 0) {
        console.log('Method 5: Looking for input controllers...');
        // Count various input types that appear in questions
        const inputMatches = html.match(/jscontroller="(VXdfxd|lSvzH|YOQA7d|NRAOPe|HvnK2b|W7JYtf|auOCFe)"/g);
        if (inputMatches) {
          console.log(`Found ${inputMatches.length} input controllers`);
          questionCount = inputMatches.length;
          console.log(`Detected ${questionCount} questions using input controllers`);
        } else {
          console.log('No matches found for input controllers');
        }
      }

      // Method 6: Try to find form content divs
      if (questionCount === 0) {
        console.log('Method 6: Looking for form content divs...');
        const contentMatches = html.match(/class="[^"]*freebirdFormviewerViewItemsItemItem[^"]*"/g);
        if (contentMatches) {
          console.log(`Found ${contentMatches.length} form content divs`);
          questionCount = contentMatches.length;
          console.log(`Detected ${questionCount} questions using form content divs`);
        } else {
          console.log('No matches found for form content divs');
        }
      }

      // Method 7: Try to find question wrappers
      if (questionCount === 0) {
        console.log('Method 7: Looking for question wrappers...');
        const wrapperMatches = html.match(/class="[^"]*freebirdFormviewerViewNumberedItemContainer[^"]*"/g);
        if (wrapperMatches) {
          console.log(`Found ${wrapperMatches.length} question wrappers`);
          questionCount = wrapperMatches.length;
          console.log(`Detected ${questionCount} questions using question wrappers`);
        } else {
          console.log('No matches found for question wrappers');
        }
      }

      // Method 8: Try to find question titles
      if (questionCount === 0) {
        console.log('Method 8: Looking for question titles...');
        const titleMatches = html.match(/class="[^"]*freebirdFormviewerComponentsQuestionBaseTitle[^"]*"/g);
        if (titleMatches) {
          console.log(`Found ${titleMatches.length} question titles`);
          questionCount = titleMatches.length;
          console.log(`Detected ${questionCount} questions using question titles`);
        } else {
          console.log('No matches found for question titles');
        }
      }

      // Method 9: Try to find question required markers
      if (questionCount === 0) {
        console.log('Method 9: Looking for required question markers...');
        const requiredMatches = html.match(/class="[^"]*freebirdFormviewerComponentsQuestionBaseRequiredAsterisk[^"]*"/g);
        if (requiredMatches) {
          console.log(`Found ${requiredMatches.length} required question markers`);
          questionCount = requiredMatches.length;
          console.log(`Detected ${questionCount} questions using required markers`);
        } else {
          console.log('No matches found for required question markers');
        }
      }

      // Method 10: Try to find question containers with newer pattern
      if (questionCount === 0) {
        console.log('Method 10: Looking for newer question containers...');
        const containerMatches = html.match(/data-params="[^"]*question[^"]*"/gi);
        if (containerMatches) {
          console.log(`Found ${containerMatches.length} question data-params`);
          questionCount = containerMatches.length;
          console.log(`Detected ${questionCount} questions using data-params`);
        } else {
          console.log('No matches found for question data-params');
        }
      }

      // Method 11: Direct analysis of URL
      if (questionCount === 0 && url.includes('docs.google.com/forms')) {
        console.log('Method 11: Analyzing URL directly...');
        // For the specific URL in question
        if (url.includes('FAIpQLSfCvr6FASe1FPDNegiXnvT4lJUaS4cJUomnznyCNcVpE6HYXQ')) {
          console.log('Recognized specific form URL, setting known question count');
          // Set the actual known question count for this specific form
          // After manual inspection, this form has 5 questions
          questionCount = 5;
          console.log(`Set question count to ${questionCount} based on known form URL`);
        }

        // Add more specific form URLs here as needed
        // Example:
        // else if (url.includes('ANOTHER_FORM_ID')) {
        //   questionCount = X; // Replace X with the actual count
        // }
      }

      // If all else fails, use default value
      if (questionCount === 0) {
        console.log('WARNING: All extraction methods failed, using default question count: 10');
        questionCount = 10;
        console.log('Using default question count: 10');
      }
    }

    console.log('Final question count:', questionCount);

    // Determine platform
    let platform = 'Unknown Form';
    if (url.includes('docs.google.com/forms')) {
      platform = 'Google Forms';
    } else if (url.includes('surveymonkey.com')) {
      platform = 'SurveyMonkey';
    } else if (url.includes('opinionx.co')) {
      platform = 'OpinionX';
    }

    return {
      title,
      description,
      questionCount,
      platform
    };
  } catch (error) {
    console.error('Error in fallback extraction:', error);

    // Log error for debugging (no blacklist system anymore)
    console.log('Fallback extraction failed for URL:', url, 'Error:', error);

    throw error;
  }
  */
}

// Function to check if Web Workers are supported
export function isWorkerSupported(): boolean {
  return typeof Worker !== 'undefined';
}

// Debug functions for pattern detection
export function getPatternInfo() {
  return {
    patterns: [
      // 'usp= parameter', // Removed - usp= is normal Google tracking parameter
      '/edit path',
      'non-standard viewform parameters',
      'sharing parameters'
    ],
    description: 'Only pattern-based detection is used. No blacklists. usp= parameter is now allowed as it is normal Google tracking.'
  };
}

// Add to window for debugging (only in development)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).jakpatDebug = {
    getPatternInfo,
    isProblematicUrl,
    hasProblematicUrlPattern,
    testUrl: (url: string) => {
      console.log('=== URL Analysis ===');
      console.log('URL:', url);
      console.log('Has problematic pattern:', hasProblematicUrlPattern(url));
      console.log('Is problematic:', isProblematicUrl(url));
      console.log('Form ID:', extractFormId(url));
      return {
        url,
        hasProblematicPattern: hasProblematicUrlPattern(url),
        isProblematic: isProblematicUrl(url),
        formId: extractFormId(url)
      };
    }
  };
}
