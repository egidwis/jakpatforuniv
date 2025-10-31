import { simpleGoogleAuth } from './google-auth-simple';

interface FormResponse {
  responseId: string;
  createTime: string;
  lastSubmittedTime: string;
  answers: Record<string, any>;
}

interface ResponsesData {
  responses: FormResponse[];
  totalCount: number;
}

/**
 * Fetch responses from a Google Form using Forms API
 * Requires forms.responses.readonly scope
 */
export async function getFormResponses(formId: string): Promise<ResponsesData> {
  try {
    const token = simpleGoogleAuth.getAccessToken();

    if (!token) {
      throw new Error('Not authenticated. Please sign in first.');
    }

    // Fetch form responses using Google Forms API
    const response = await fetch(
      `https://forms.googleapis.com/v1/forms/${formId}/responses`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Failed to fetch responses: ${response.status} ${response.statusText}. ${
          errorData.error?.message || ''
        }`
      );
    }

    const data = await response.json();

    return {
      responses: data.responses || [],
      totalCount: data.responses?.length || 0,
    };
  } catch (error) {
    console.error('Error fetching form responses:', error);
    throw error;
  }
}

/**
 * Get just the response count without fetching all response data
 */
export async function getFormResponseCount(formId: string): Promise<number> {
  try {
    const { totalCount } = await getFormResponses(formId);
    return totalCount;
  } catch (error) {
    console.error('Error getting response count:', error);
    return 0;
  }
}

/**
 * Export responses to CSV format
 */
export function exportResponsesToCSV(
  responses: FormResponse[],
  formTitle: string
): void {
  if (responses.length === 0) {
    alert('No responses to export');
    return;
  }

  // Get all unique question IDs from all responses
  const questionIds = new Set<string>();
  responses.forEach(response => {
    Object.keys(response.answers || {}).forEach(qId => questionIds.add(qId));
  });

  // Create CSV header
  const headers = ['Response ID', 'Submitted At', ...Array.from(questionIds)];
  const csvRows = [headers.join(',')];

  // Add data rows
  responses.forEach(response => {
    const row = [
      response.responseId,
      response.lastSubmittedTime,
      ...Array.from(questionIds).map(qId => {
        const answer = response.answers?.[qId];
        if (!answer) return '';

        // Handle different answer types
        if (answer.textAnswers?.answers) {
          return `"${answer.textAnswers.answers.map((a: any) => a.value).join('; ')}"`;
        }
        return '""';
      })
    ];
    csvRows.push(row.join(','));
  });

  // Download CSV
  const csv = csvRows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${formTitle}_responses_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
}
