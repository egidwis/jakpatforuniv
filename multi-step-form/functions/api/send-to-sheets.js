// Cloudflare Function untuk mengirim data dari Supabase ke Google Sheets
// Menggunakan Google Apps Script web app yang sudah di-deploy

import { createClient } from '@supabase/supabase-js';

// Helper function untuk mengirim data langsung ke Google Sheets (untuk testing)
async function sendDirectDataToSheets(data, corsHeaders) {
  try {
    const googleAppsScriptUrl = 'https://script.google.com/macros/s/AKfycbwOQzDhxJ88ms5EyNCEunzxi6B74KIK5rAT6QPaxPTqjexJsHritaEpnPt6wCA9q7Vj/exec';

    console.log('Sending direct data to Google Sheets:', {
      url: googleAppsScriptUrl,
      dataKeys: Object.keys(data)
    });

    const response = await fetch(googleAppsScriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });

    const responseText = await response.text();
    console.log('Google Apps Script response:', {
      status: response.status,
      statusText: response.statusText,
      responseText: responseText.substring(0, 200)
    });

    if (!response.ok) {
      throw new Error(`Google Apps Script error: ${response.status} ${response.statusText} - ${responseText}`);
    }

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (parseError) {
      console.warn('Could not parse Google Apps Script response as JSON:', parseError);
      responseData = { message: responseText };
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Data successfully sent to Google Sheets (direct)',
      sheets_response: responseData,
      sent_at: new Date().toISOString()
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (error) {
    console.error('Error sending direct data to Google Sheets:', error);

    return new Response(JSON.stringify({
      success: false,
      message: 'Error sending data to Google Sheets',
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}

export async function onRequest(context) {
  // Set CORS headers untuk semua response
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };

  // Handle preflight request
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  // Hanya terima metode POST
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({
      success: false,
      message: 'Method not allowed'
    }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }

  try {
    // Parse request body
    const requestData = await context.request.json();
    const { formId, action = 'send' } = requestData;

    console.log('Send to sheets request:', { formId, action, hasDirectData: !!requestData.form_id });

    // Jika ada data langsung (untuk testing), gunakan data tersebut
    if (requestData.form_id && !formId) {
      console.log('Using direct data for testing');
      return await sendDirectDataToSheets(requestData, corsHeaders);
    }

    if (!formId) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Form ID is required'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Inisialisasi Supabase client
    const supabaseUrl = context.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = context.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Database credentials not configured'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Ambil data form submission dari Supabase
    const { data: formData, error: formError } = await supabase
      .from('form_submissions')
      .select('*')
      .eq('id', formId)
      .single();

    if (formError) {
      console.error('Error fetching form data:', formError);
      return new Response(JSON.stringify({
        success: false,
        message: 'Form data not found',
        error: formError.message
      }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    if (!formData) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Form data not found'
      }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    console.log('Form data retrieved:', {
      id: formData.id,
      title: formData.title,
      email: formData.email,
      payment_status: formData.payment_status
    });

    // URL Google Apps Script web app yang sudah diperbaiki
    const googleAppsScriptUrl = 'https://script.google.com/macros/s/AKfycbwOQzDhxJ88ms5EyNCEunzxi6B74KIK5rAT6QPaxPTqjexJsHritaEpnPt6wCA9q7Vj/exec';
    // Backup mock endpoint jika Google Apps Script gagal
    // const mockUrl = 'https://c1e63347.jakpatforuniv-submit.pages.dev/api/mock-sheets';

    // Siapkan data untuk dikirim ke Google Sheets
    const sheetsData = {
      // Informasi dasar
      timestamp: formData.created_at || new Date().toISOString(),
      form_id: formData.id,

      // Data survey
      survey_url: formData.survey_url,
      title: formData.title,
      description: formData.description,
      question_count: formData.question_count,
      criteria_responden: formData.criteria_responden,

      // Durasi dan tanggal
      duration: formData.duration,
      start_date: formData.start_date,
      end_date: formData.end_date,

      // Data personal
      full_name: formData.full_name,
      email: formData.email,
      phone_number: formData.phone_number,
      university: formData.university,
      department: formData.department,
      status: formData.status,
      referral_source: formData.referral_source,

      // Data insentif
      winner_count: formData.winner_count,
      prize_per_winner: formData.prize_per_winner,
      voucher_code: formData.voucher_code,
      total_cost: formData.total_cost,

      // Status
      payment_status: formData.payment_status,

      // Metadata
      action: action,
      sent_at: new Date().toISOString()
    };

    console.log('Sending data to Google Sheets:', {
      url: googleAppsScriptUrl,
      dataKeys: Object.keys(sheetsData),
      formId: sheetsData.form_id,
      email: sheetsData.email
    });

    // Kirim data ke Google Apps Script
    const response = await fetch(googleAppsScriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sheetsData)
    });

    const responseText = await response.text();
    console.log('Google Apps Script response:', {
      status: response.status,
      statusText: response.statusText,
      responseText: responseText.substring(0, 200) // Log first 200 chars
    });

    if (!response.ok) {
      throw new Error(`Google Apps Script error: ${response.status} ${response.statusText} - ${responseText}`);
    }

    // Parse response dari Google Apps Script
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (parseError) {
      console.warn('Could not parse Google Apps Script response as JSON:', parseError);
      responseData = { message: responseText };
    }

    // Update status di Supabase bahwa data sudah dikirim ke sheets
    const { error: updateError } = await supabase
      .from('form_submissions')
      .update({
        updated_at: new Date().toISOString(),
        // Bisa tambahkan field sheets_sent_at jika ada
      })
      .eq('id', formId);

    if (updateError) {
      console.warn('Error updating form submission after sending to sheets:', updateError);
      // Continue anyway, karena data sudah berhasil dikirim ke sheets
    }

    console.log('Data successfully sent to Google Sheets');

    return new Response(JSON.stringify({
      success: true,
      message: 'Data successfully sent to Google Sheets',
      form_id: formId,
      sheets_response: responseData,
      sent_at: new Date().toISOString()
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (error) {
    console.error('Error sending data to Google Sheets:', error);

    return new Response(JSON.stringify({
      success: false,
      message: 'Error sending data to Google Sheets',
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}
