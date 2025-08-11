// Script sederhana untuk menguji koneksi ke Supabase
import { createClient } from '@supabase/supabase-js';

// Gunakan URL dan key yang sama dengan yang ada di aplikasi
const supabaseUrl = 'https://zewuzezbmrmpttysjvpg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpld3V6ZXpibXJtcHR0eXNqdnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3NDg0MzMsImV4cCI6MjA2MzMyNDQzM30.IsFpW4TMm1mrLse-dZNvZpB-srOIFb9f2XBgNpaOwpI';

// Buat Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

// Fungsi untuk menguji koneksi
async function testConnection() {
  console.log('Testing Supabase connection...');
  console.log('URL:', supabaseUrl);
  console.log('Key:', supabaseKey ? 'Available (not shown for security)' : 'Not available');

  try {
    // Coba query sederhana ke tabel form_submissions
    const { data, error } = await supabase
      .from('form_submissions')
      .select('count');

    if (error) {
      console.error('Error querying form_submissions:', error);
      return false;
    }

    console.log('Successfully queried form_submissions!');
    console.log('Data:', data);
    return true;
  } catch (error) {
    console.error('Error testing Supabase connection:', error);
    return false;
  }
}

// Jalankan tes
testConnection()
  .then(result => {
    console.log('Connection test completed. Result:', result ? 'SUCCESS' : 'FAILED');
    process.exit(result ? 0 : 1);
  })
  .catch(error => {
    console.error('Connection test failed with error:', error);
    process.exit(1);
  });
