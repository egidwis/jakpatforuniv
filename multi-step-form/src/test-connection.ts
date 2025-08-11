import { supabase, checkSupabaseConnection } from './utils/supabase';

// Fungsi untuk menguji koneksi ke Supabase
export async function testSupabaseConnection() {
  console.log('Testing Supabase connection...');
  
  try {
    // Cek koneksi menggunakan fungsi yang sudah ada
    const isConnected = await checkSupabaseConnection();
    console.log('Connection test result:', isConnected ? 'Connected' : 'Not connected');
    
    if (isConnected) {
      // Coba query sederhana ke tabel form_submissions
      const { data, error } = await supabase
        .from('form_submissions')
        .select('count');
      
      if (error) {
        console.error('Error querying form_submissions:', error);
        return false;
      }
      
      console.log('Successfully queried form_submissions:', data);
      return true;
    } else {
      console.warn('Not connected to Supabase');
      return false;
    }
  } catch (error) {
    console.error('Error testing Supabase connection:', error);
    return false;
  }
}

// Jalankan tes koneksi
testSupabaseConnection()
  .then(result => {
    console.log('Connection test completed. Result:', result ? 'SUCCESS' : 'FAILED');
  })
  .catch(error => {
    console.error('Connection test failed with error:', error);
  });
