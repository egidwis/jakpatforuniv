// Service untuk mengirim data ke Google Sheets melalui Cloudflare Function

interface SendToSheetsRequest {
  formId: string;
  action?: string;
}

interface SendToSheetsResponse {
  success: boolean;
  message: string;
  form_id?: string;
  sheets_response?: any;
  sent_at?: string;
  error?: string;
}

/**
 * Mengirim data form submission ke Google Sheets
 * @param formId - ID form submission yang akan dikirim
 * @param action - Aksi yang dilakukan (default: 'send')
 * @returns Promise dengan response dari API
 */
export const sendToGoogleSheets = async (
  formId: string, 
  action: string = 'send'
): Promise<SendToSheetsResponse> => {
  try {
    console.log('Sending form data to Google Sheets:', { formId, action });

    // Tentukan base URL berdasarkan environment
    const baseUrl = window.location.origin;
    const apiUrl = `${baseUrl}/api/send-to-sheets`;

    const requestData: SendToSheetsRequest = {
      formId,
      action
    };

    console.log('Making request to:', apiUrl);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData)
    });

    const responseData: SendToSheetsResponse = await response.json();

    console.log('Send to sheets response:', {
      status: response.status,
      success: responseData.success,
      message: responseData.message
    });

    if (!response.ok) {
      throw new Error(responseData.message || `HTTP error! status: ${response.status}`);
    }

    if (!responseData.success) {
      throw new Error(responseData.message || 'Failed to send data to Google Sheets');
    }

    return responseData;

  } catch (error: any) {
    console.error('Error sending data to Google Sheets:', error);
    throw new Error(`Failed to send data to Google Sheets: ${error.message}`);
  }
};

/**
 * Mengirim data form submission ke Google Sheets dengan retry mechanism
 * @param formId - ID form submission yang akan dikirim
 * @param maxRetries - Maksimal jumlah retry (default: 3)
 * @param action - Aksi yang dilakukan (default: 'send')
 * @returns Promise dengan response dari API
 */
export const sendToGoogleSheetsWithRetry = async (
  formId: string,
  maxRetries: number = 3,
  action: string = 'send'
): Promise<SendToSheetsResponse> => {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${maxRetries} to send data to Google Sheets`);
      
      const result = await sendToGoogleSheets(formId, action);
      
      console.log(`Successfully sent data to Google Sheets on attempt ${attempt}`);
      return result;

    } catch (error: any) {
      lastError = error;
      console.warn(`Attempt ${attempt}/${maxRetries} failed:`, error.message);

      // Jika ini bukan attempt terakhir, tunggu sebentar sebelum retry
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5 detik
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // Jika semua attempt gagal, throw error terakhir
  throw lastError!;
};

/**
 * Mengirim data ke Google Sheets secara background (tidak menunggu response)
 * Berguna untuk tidak mengganggu user experience
 * @param formId - ID form submission yang akan dikirim
 * @param action - Aksi yang dilakukan (default: 'send')
 */
export const sendToGoogleSheetsBackground = (
  formId: string,
  action: string = 'send'
): void => {
  // Jalankan di background tanpa menunggu response
  sendToGoogleSheetsWithRetry(formId, 2, action)
    .then((result) => {
      console.log('Background send to Google Sheets successful:', result);
    })
    .catch((error) => {
      console.error('Background send to Google Sheets failed:', error);
      // Bisa tambahkan logic untuk menyimpan ke queue untuk retry nanti
    });
};

/**
 * Cek apakah form data sudah dikirim ke Google Sheets
 * (Implementasi sederhana, bisa diperluas dengan field tracking di database)
 * @param formId - ID form submission
 * @returns Promise<boolean>
 */
export const isFormSentToSheets = async (formId: string): Promise<boolean> => {
  try {
    // Untuk saat ini, kita anggap semua form belum dikirim
    // Bisa diperluas dengan menambah field 'sheets_sent_at' di database
    return false;
  } catch (error) {
    console.error('Error checking if form sent to sheets:', error);
    return false;
  }
};

/**
 * Utility untuk format error message yang user-friendly
 * @param error - Error object
 * @returns String pesan error yang mudah dipahami
 */
export const formatSheetsError = (error: any): string => {
  if (typeof error === 'string') {
    return error;
  }

  if (error?.message) {
    // Konversi beberapa error message teknis menjadi user-friendly
    if (error.message.includes('fetch')) {
      return 'Gagal terhubung ke server. Periksa koneksi internet Anda.';
    }
    
    if (error.message.includes('timeout')) {
      return 'Koneksi timeout. Silakan coba lagi.';
    }

    if (error.message.includes('not found')) {
      return 'Data tidak ditemukan.';
    }

    return error.message;
  }

  return 'Terjadi kesalahan yang tidak diketahui.';
};
