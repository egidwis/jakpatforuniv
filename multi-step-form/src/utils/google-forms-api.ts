// Google Forms API Service for direct form data extraction
import { googleAuth } from './google-auth';
import type { SurveyInfo } from './survey-service';

export interface GoogleFormQuestion {
  questionId: string;
  title: string;
  type: string;
  required: boolean;
  options?: string[];
}

export interface GoogleFormData {
  formId: string;
  title: string;
  description: string;
  questions: GoogleFormQuestion[];
  settings?: {
    isPublic: boolean;
    allowResponseEditing: boolean;
    collectEmail: boolean;
  };
}

export interface GoogleFormsApiResponse {
  success: boolean;
  data?: GoogleFormData;
  error?: string;
}

export class GoogleFormsApiService {
  private static instance: GoogleFormsApiService;

  private constructor() { }

  static getInstance(): GoogleFormsApiService {
    if (!GoogleFormsApiService.instance) {
      GoogleFormsApiService.instance = new GoogleFormsApiService();
    }
    return GoogleFormsApiService.instance;
  }

  // Extract form data using Google Forms API (100% accuracy)
  async extractFormData(formId: string): Promise<GoogleFormsApiResponse> {
    try {
      if (!googleAuth.isSignedIn()) {
        return {
          success: false,
          error: 'User not authenticated. Please sign in to Google first.'
        };
      }

      console.log('Extracting form data using Google Forms API for form:', formId);

      const url = `https://forms.googleapis.com/v1/forms/${formId}`;

      const response = await googleAuth.makeAuthenticatedRequest(url);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        if (response.status === 404) {
          throw new Error('Form not found or you do not have access to this form');
        } else if (response.status === 403) {
          throw new Error('Access denied. You may not have permission to read this form');
        } else {
          throw new Error(errorData.error?.message || `API error: ${response.status}`);
        }
      }

      const formData = await response.json();

      console.log('Form data retrieved successfully:', formData.info?.title);

      // Parse the form data
      const parsedData = this.parseFormData(formData, formId);

      return {
        success: true,
        data: parsedData
      };
    } catch (error: any) {
      console.error('Error extracting form data:', error);
      return {
        success: false,
        error: error.message || 'Failed to extract form data'
      };
    }
  }

  // Parse Google Forms API response into our format
  private parseFormData(apiResponse: any, formId: string): GoogleFormData {
    const questions: GoogleFormQuestion[] = [];

    // Extract questions from items
    if (apiResponse.items && Array.isArray(apiResponse.items)) {
      apiResponse.items.forEach((item: any, index: number) => {
        // Skip page breaks and section headers
        if (item.pageBreakItem || item.sectionHeaderItem) {
          return;
        }

        const question: GoogleFormQuestion = {
          questionId: item.questionItem?.question?.questionId || `q_${index}`,
          title: item.title || `Question ${index + 1}`,
          type: this.getQuestionType(item),
          required: item.questionItem?.question?.required || false,
        };

        // Extract options for choice questions
        if (item.questionItem?.question?.choiceQuestion) {
          const options = item.questionItem.question.choiceQuestion.options;
          if (options && Array.isArray(options)) {
            question.options = options.map((option: any) => option.value || '');
          }
        } else if (item.questionItem?.question?.scaleQuestion) {
          const scale = item.questionItem.question.scaleQuestion;
          question.options = [`Scale: ${scale.low || 1} to ${scale.high || 5}`];
        }

        questions.push(question);
      });
    }

    return {
      formId,
      title: apiResponse.info?.title || 'Untitled Form',
      description: apiResponse.info?.description || '',
      questions,
      settings: {
        isPublic: !apiResponse.settings?.quizSettings?.isQuiz,
        allowResponseEditing: apiResponse.settings?.allowResponseEditing || false,
        // Google Forms API uses `emailCollectionType` enum, NOT `collectEmail` boolean
        // Values: "DO_NOT_COLLECT", "VERIFIED", "RESPONDER_INPUT"
        collectEmail: apiResponse.settings?.emailCollectionType
          ? apiResponse.settings.emailCollectionType !== 'DO_NOT_COLLECT'
          : false,
      }
    };
  }

  // Convert Google Forms question types to our format
  private getQuestionType(item: any): string {
    if (!item.questionItem || !item.questionItem.question) {
      return 'unknown';
    }

    const question = item.questionItem.question;

    if (question.textQuestion) {
      return question.textQuestion.paragraph ? 'long_text' : 'short_text';
    } else if (question.choiceQuestion) {
      return question.choiceQuestion.type === 'RADIO' ? 'multiple_choice' : 'checkboxes';
    } else if (question.scaleQuestion) {
      return 'linear_scale';
    } else if (question.dateQuestion) {
      return 'date';
    } else if (question.timeQuestion) {
      return 'time';
    } else if (question.fileUploadQuestion) {
      return 'file_upload';
    } else if (question.rowQuestion) {
      return 'grid';
    }

    return 'unknown';
  }

  // Convert to SurveyInfo format (compatibility with existing system)
  async extractToSurveyInfo(formId: string): Promise<SurveyInfo> {
    try {
      const result = await this.extractFormData(formId);

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to extract form data');
      }

      const formData = result.data;
      const formUrl = `https://docs.google.com/forms/d/${formId}/viewform`;

      // VERIFIKASI PUBLIK (ANONIM)
      // Mencegah form "Not Published" / "Restricted" lolos karena status kepemilikan
      try {
        console.log('Melakukan verifikasi akses publik via proxy...');
        
        let htmlText = '';
        let fetchSuccess = false;
        
        // 1. Coba via internal proxy terlebih dahulu
        try {
          const proxyUrl = `/api/google-forms-proxy?url=${encodeURIComponent(formUrl)}`;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);
          const res = await fetch(proxyUrl, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (res.ok) {
            htmlText = await res.text();
            fetchSuccess = true;
            console.log('Verifikasi akses publik via internal proxy berhasil.');
          } else {
            console.warn(`Internal proxy status: ${res.status}, falling back to corsproxy.io`);
            if (res.status === 401 || res.status === 403) {
              throw new Error('errorFormRestricted');
            } else if (res.status === 404) {
              throw new Error('errorFormNotPublished');
            }
          }
        } catch (e: any) {
          if (e.message === 'errorFormRestricted' || e.message === 'errorFormNotPublished') {
            throw e;
          }
          console.warn('Internal proxy failed, falling back to corsproxy.io:', e);
        }
        
        // 2. Fallback ke corsproxy.io jika internal proxy gagal
        if (!fetchSuccess) {
          try {
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(formUrl)}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);
            const res = await fetch(proxyUrl, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (res.ok) {
              htmlText = await res.text();
              fetchSuccess = true;
              console.log('Verifikasi akses publik via corsproxy.io berhasil.');
            } else {
              console.warn(`corsproxy.io status: ${res.status}`);
            }
          } catch (e) {
            console.warn('corsproxy.io failed:', e);
          }
        }
        
        if (fetchSuccess && htmlText) {
          const lowerHtml = htmlText.toLowerCase();
          
          // Check for unpublished or closed status
          if (
            lowerHtml.includes('document is not published') || 
            htmlText.includes('This document is not published') ||
            lowerHtml.includes('no longer accepting responses') ||
            lowerHtml.includes('tidak lagi menerima tanggapan') ||
            lowerHtml.includes('tidak menerima tanggapan') ||
            lowerHtml.includes('no longer accepting')
          ) {
            throw new Error('errorFormNotPublished');
          }
          
          // Check for captcha/block first
          const isGoogleCaptchaOrBlock = lowerHtml.includes('recaptcha') || lowerHtml.includes('unusual traffic') || lowerHtml.includes('captcha');
          
          if (!isGoogleCaptchaOrBlock) {
            // Check for restricted access
            if (
              lowerHtml.includes('you need permission') || 
              lowerHtml.includes('request access') || 
              lowerHtml.includes('sign in to continue') ||
              htmlText.includes('You need permission') ||
              htmlText.includes('Request access') ||
              htmlText.includes('Sign in to continue')
            ) {
              throw new Error('errorFormRestricted');
            }
          } else {
            console.warn('Google CAPTCHA or traffic block detected, skipping restricted check to avoid false positive.');
          }
        }
      } catch (proxyError: any) {
         // Jika error merupakan key terjemahan yang kita lempar, teruskan ke luar
         if (proxyError.message === 'errorFormNotPublished' || proxyError.message === 'errorFormRestricted') {
             throw proxyError;
         }
         // Abaikan error murni jaringan, anggap aman jika API utama berhasil
         console.warn('Proxy access check network failed, ignoring:', proxyError);
      }

      // Detect personal data questions
      const personalDataKeywords: string[] = [];
      let hasPersonalDataQuestions = false;

      formData.questions.forEach(question => {
        const titleLower = question.title.toLowerCase();

        // 1. Email (word boundaries might fail on e-mail or email, better to keep it simple or use \bemail\b)
        if (/\b(email|e-mail)\b/i.test(titleLower)) {
          if (!personalDataKeywords.includes('email')) personalDataKeywords.push('email');
          hasPersonalDataQuestions = true;
        }
        // 2. Phone (added henpon, hape variations)
        if (/\b(phone|whatsapp|wa|telepon|no(?:mor)?\s*hp|no(?:mor)?\s*wa|no(?:mor)?\s*telepon|hp|handphone|hanphone|henpon|hanpon|hape|telp|no(?:\.)?\s*hp|no(?:mor)?\s*telp)\b/i.test(titleLower)) {
          if (!personalDataKeywords.includes('phone')) personalDataKeywords.push('phone');
          hasPersonalDataQuestions = true;
        }
        // 3. Name (Full name, etc)
        // 'nama' alone might be too generic depending on context, but let's bound it
        if (/\b(name|nama|full name|nama lengkap|nama sesuai ktp|first name|last name|nama depan|nama belakang)\b/i.test(titleLower)) {
          if (!personalDataKeywords.includes('name')) personalDataKeywords.push('name');
          hasPersonalDataQuestions = true;
        }
        // 4. Address
        if (/\b(address|alamat|alamat rumah|alamat lengkap)\b/i.test(titleLower)) {
          if (!personalDataKeywords.includes('address')) personalDataKeywords.push('address');
          hasPersonalDataQuestions = true;
        }
        // 5. NIK/ID (CRITICAL: use word boundaries to avoid 'menikah', 'teknik')
        if (/\b(nik|ktp|id card|nomor induk kependudukan)\b/i.test(titleLower)) {
          if (!personalDataKeywords.includes('nik/id')) personalDataKeywords.push('nik/id');
          hasPersonalDataQuestions = true;
        }

        // 6. File Upload
        if (question.type === 'file_upload') {
          if (!personalDataKeywords.includes('file upload')) personalDataKeywords.push('file upload');
          hasPersonalDataQuestions = true;
        }

        // 7. E-wallet / Reward (Dana, Gopay, Ovo, Shopeepay, Linkaja, etc. as personal data)
        const isEwalletSensitive = 
          // Verbs asking for e-wallet accounts/numbers
          /(?:masukkan|isikan|isi|tuliskan|tulis|input|enter|cantumkan|sertakan|bagikan)\s+(?:akun\s+|nomor\s+|no\.?\s+|id\s+)?(?:dana|gopay|go-pay|ovo|shopeepay|shopee\s*pay|linkaja|link\s*aja|e-?wallet)/i.test(titleLower) ||
          // Direct requests: "nomor/no/id/hp/rek DANA/OVO/etc."
          /(?:nomor|no\.?|number|id|rek(?:ening)?)\s*(?:[-(:/]?\s*(?:hp|telp|handphone|telepon)\s*)?[-\/(\[]?\s*(?:dana|gopay|go-pay|ovo|shopeepay|shopee\s*pay|linkaja|link\s*aja|e-?wallet)/i.test(titleLower) ||
          // E-wallet name followed by number/id/hp/rekening
          /(?:dana|gopay|go-pay|ovo|shopeepay|shopee\s*pay|linkaja|link\s*aja|e-?wallet)\s*[-((:/]?\s*(?:nomor|no\.?|number|id|rek(?:ening)?|hp|telp|handphone|akun|account)/i.test(titleLower) ||
          // Pronoun pattern (e.g. "DANA Anda")
          /(?:nomor\s+)?(?:dana|gopay|go-pay|ovo|shopeepay|shopee\s*pay|linkaja|link\s*aja)\s+(?:anda|kamu)/i.test(titleLower) ||
          // Transfer or gift destination patterns
          /(?:transfer|kirim|pengiriman)\s+(?:hadiah|uang|dana|insentif|reward)\s+(?:ke|melalui|via)/i.test(titleLower) ||
          /(?:melalui|via)\s+(?:dana|gopay|go-pay|ovo|shopeepay|shopee\s*pay|linkaja|link\s*aja|e-wallet)\s+(?:nomor|ke|akun)/i.test(titleLower) ||
          /(?:dikirim|diterima)\s+(?:hadiah|reward|prize|insentif)\s+(?:melalui|via|ke)/i.test(titleLower) ||
          /(?:hadiah|reward|prize|insentif)\s+akan\s+(?:dikirim|diterima|transfer)/i.test(titleLower);

        if (isEwalletSensitive) {
          if (!personalDataKeywords.includes('e-wallet/hadiah')) personalDataKeywords.push('e-wallet/hadiah');
          hasPersonalDataQuestions = true;
        }
      });

      // Check Google Form's built-in "Collect email addresses" setting
      if (formData.settings?.collectEmail) {
        if (!personalDataKeywords.includes('email otomatis')) {
          personalDataKeywords.push('email otomatis');
        }
        hasPersonalDataQuestions = true;
      }

      return {
        title: formData.title,
        description: formData.description || 'Form description not available',
        questionCount: formData.questions.length,
        platform: 'Google Forms (API)',
        url: formUrl,
        hasPersonalDataQuestions,
        detectedKeywords: personalDataKeywords,
        // Additional data from API
        apiData: {
          formId,
          questions: formData.questions,
          settings: formData.settings
        }
      };
    } catch (error: any) {
      console.error('Error converting to SurveyInfo:', error);
      throw error;
    }
  }

  // Get form responses (if needed)
  async getFormResponses(formId: string, limit: number = 100): Promise<any> {
    try {
      if (!googleAuth.isSignedIn()) {
        throw new Error('User not authenticated');
      }

      const url = `https://forms.googleapis.com/v1/forms/${formId}/responses?pageSize=${limit}`;

      const response = await googleAuth.makeAuthenticatedRequest(url);

      if (!response.ok) {
        throw new Error(`Failed to get responses: ${response.status}`);
      }

      const data = await response.json();
      return data.responses || [];
    } catch (error) {
      console.error('Error getting form responses:', error);
      throw error;
    }
  }

  // Validate form access
  async validateFormAccess(formId: string): Promise<boolean> {
    try {
      const result = await this.extractFormData(formId);
      return result.success;
    } catch (error) {
      console.error('Error validating form access:', error);
      return false;
    }
  }
}

// Singleton instance
export const googleFormsApi = GoogleFormsApiService.getInstance();