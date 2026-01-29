// Google Forms API Service for direct form data extraction (Browser-compatible)
import { simpleGoogleAuth } from './google-auth-simple';
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
      if (!simpleGoogleAuth.isAuthenticated()) {
        return {
          success: false,
          error: 'User not authenticated. Please sign in to Google first.'
        };
      }

      console.log('Extracting form data using Google Forms API for form:', formId);

      // Try using gapi.client first (more reliable in browser)
      if (window.gapi) {
        try {
          const response = await this.extractUsingGapi(formId);
          return response;
        } catch (gapiError) {
          console.log('gapi.client failed, falling back to HTTP:', gapiError);
          // Fall through to HTTP method
        }
      }

      // Fallback to direct HTTP request
      const url = `https://forms.googleapis.com/v1/forms/${formId}`;

      const response = await simpleGoogleAuth.makeAuthenticatedRequest(url);

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

  // Extract using gapi.client (preferred method)
  private async extractUsingGapi(formId: string): Promise<GoogleFormsApiResponse> {
    // Note: Google Forms API v1 discovery document might not be available in gapi.client
    // This is a placeholder for when Google adds Forms API to their client library
    // For now, we'll use the HTTP fallback method
    throw new Error('Google Forms API not available in gapi.client yet');
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

        // Check for Question Group (Grid) - Count each row as a question
        if (item.questionGroupItem && item.questionGroupItem.questions) {
          item.questionGroupItem.questions.forEach((groupQuestion: any, groupIndex: number) => {
            const question: GoogleFormQuestion = {
              questionId: groupQuestion.questionId || `q_${index}_${groupIndex}`,
              title: groupQuestion.rowQuestion?.title || item.title || `Question ${index + 1} - Row ${groupIndex + 1}`,
              type: 'grid', // Mark as grid row
              required: groupQuestion.required || false,
              options: [] // Grid options usually shared, we can extract if needed but for counting purpose it's fine
            };
            questions.push(question);
          });
          return;
        }

        // IMPORTANT: Only process items that have questionItem (actual questions)
        // This excludes:
        // - Form title/description items
        // - Text-only/description items
        // - Image items
        // - Video items
        if (!item.questionItem || !item.questionItem.question) {
          return;
        }

        const question: GoogleFormQuestion = {
          questionId: item.questionItem.question.questionId || `q_${index}`,
          title: item.title || `Question ${index + 1}`,
          type: this.getQuestionType(item),
          required: item.questionItem.question.required || false,
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
        collectEmail: apiResponse.settings?.collectEmail || false,
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

      // Detect personal data questions
      const personalDataKeywords: string[] = [];
      let hasPersonalDataQuestions = false;

      formData.questions.forEach(question => {
        const titleLower = question.title.toLowerCase();

        // 1. Email
        if (titleLower.includes('email') || titleLower.includes('e-mail')) {
          if (!personalDataKeywords.includes('email')) personalDataKeywords.push('email');
          hasPersonalDataQuestions = true;
        }

        // 2. Phone / WhatsApp
        if (titleLower.includes('phone') || titleLower.includes('nomor telepon') || titleLower.includes('no. hp') || titleLower.includes('whatsapp') || titleLower.includes('wa')) {
          if (!personalDataKeywords.includes('phone')) personalDataKeywords.push('phone');
          hasPersonalDataQuestions = true;
        }

        // 3. Full Name / KTP Name (Regular "Nama" is allowed)
        if (titleLower.includes('nama lengkap') || titleLower.includes('full name') || titleLower.includes('nama sesuai ktp') || titleLower.includes('nama panjang')) {
          if (!personalDataKeywords.includes('full name')) personalDataKeywords.push('full name');
          hasPersonalDataQuestions = true;
        }

        // 4. Address
        if (titleLower.includes('address') || titleLower.includes('alamat rumah')) {
          if (!personalDataKeywords.includes('address')) personalDataKeywords.push('address');
          hasPersonalDataQuestions = true;
        }

        // 5. NIK / ID Number
        if (titleLower.includes('nik') || titleLower.includes('nomor induk kependudukan') || titleLower.includes('ktp') || titleLower.includes('id card')) {
          if (!personalDataKeywords.includes('nik/id')) personalDataKeywords.push('nik/id');
          hasPersonalDataQuestions = true;
        }

        // 6. File Upload
        if (question.type === 'file_upload') {
          if (!personalDataKeywords.includes('file upload')) personalDataKeywords.push('file upload');
          hasPersonalDataQuestions = true;
        }
      });

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
      if (!simpleGoogleAuth.isAuthenticated()) {
        throw new Error('User not authenticated');
      }

      const url = `https://forms.googleapis.com/v1/forms/${formId}/responses?pageSize=${limit}`;

      const response = await simpleGoogleAuth.makeAuthenticatedRequest(url);

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