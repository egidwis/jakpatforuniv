import { createClient } from '@supabase/supabase-js';

export async function onRequest(context) {
  // Ambil parameter dari URL
  const url = new URL(context.request.url);
  const formId = url.searchParams.get('id');
  
  // Jika tidak ada form_id, return error
  if (!formId) {
    return new Response(JSON.stringify({ 
      success: false, 
      message: 'Missing form ID' 
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // Inisialisasi Supabase client
    const supabaseUrl = context.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = context.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Database credentials not configured' 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    // Ambil data form submission
    const { data: formData, error: formError } = await supabase
      .from('form_submissions')
      .select('*')
      .eq('id', formId)
      .single();
    
    if (formError) {
      console.error('Error finding form submission:', formError);
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Form not found',
        error: formError.message
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Return data form
    return new Response(JSON.stringify({ 
      success: true, 
      ...formData
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error fetching form data:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      message: 'Error fetching form data: ' + error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
