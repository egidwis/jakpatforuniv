/**
 * Quick check: did the bulk delete actually update the database?
 * Run: node scripts/check-db-proof.cjs
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zewuzezbmrmpttysjvpg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpld3V6ZXpibXJtcHR0eXNqdnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3NDg0MzMsImV4cCI6MjA2MzMyNDQzM30.IsFpW4TMm1mrLse-dZNvZpB-srOIFb9f2XBgNpaOwpI';

// Need SERVICE_ROLE key to bypass RLS and see all rows
// Check if provided as env var
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  if (!SERVICE_ROLE_KEY) {
    console.log('⚠️  No SERVICE_ROLE_KEY provided.');
    console.log('   Anon key cannot see page_respondents due to RLS.');
    console.log('');
    console.log('   To run with service role key:');
    console.log('   SUPABASE_SERVICE_ROLE_KEY=your_key node scripts/check-db-proof.cjs');
    console.log('');
    console.log('   You can find it in Supabase Dashboard → Settings → API → service_role');
    console.log('');
    
    // Try anyway with anon
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    const { count: notNull } = await supabase
      .from('page_respondents')
      .select('id', { count: 'exact', head: true })
      .not('proof_url', 'is', null);
    
    const { count: total } = await supabase
      .from('page_respondents')
      .select('id', { count: 'exact', head: true });
    
    console.log(`   [Anon view] Total rows: ${total}, With proof: ${notNull}`);
    console.log('   (These might be 0 due to RLS blocking anon SELECT)');
    return;
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  console.log('=== Database Check (Service Role - bypasses RLS) ===\n');

  const { count: total } = await supabase
    .from('page_respondents')
    .select('id', { count: 'exact', head: true });

  const { count: withProof } = await supabase
    .from('page_respondents')
    .select('id', { count: 'exact', head: true })
    .not('proof_url', 'is', null);

  const { count: nullProof } = await supabase
    .from('page_respondents')
    .select('id', { count: 'exact', head: true })
    .is('proof_url', null);

  const { count: emptyProof } = await supabase
    .from('page_respondents')
    .select('id', { count: 'exact', head: true })
    .eq('proof_url', '');

  console.log(`Total rows: ${total}`);
  console.log(`With proof_url (NOT NULL): ${withProof}`);
  console.log(`proof_url IS NULL: ${nullProof}`);
  console.log(`proof_url = '' (empty string): ${emptyProof}`);

  // Sample some with proof
  if (withProof > 0) {
    const { data: samples } = await supabase
      .from('page_respondents')
      .select('id, page_id, proof_url')
      .not('proof_url', 'is', null)
      .limit(3);

    console.log('\nSample proof URLs:');
    samples?.forEach(r => {
      console.log(`  ${r.proof_url?.substring(0, 100)}...`);
    });
  }

  // Test storage delete with service role
  console.log('\n=== Storage Delete Test (Service Role) ===');
  const { data: files } = await supabase.storage
    .from('page-uploads')
    .list('', { limit: 1, search: 'proof' });

  if (files && files.length > 0) {
    const testFile = files[0].name;
    console.log(`Testing delete: ${testFile}`);
    
    const { data: delResult, error: delError } = await supabase.storage
      .from('page-uploads')
      .remove([testFile]);

    if (delError) {
      console.log(`  ❌ Delete error: ${delError.message}`);
    } else {
      console.log(`  Response: ${JSON.stringify(delResult)}`);
      
      // Verify
      const { data: check } = await supabase.storage
        .from('page-uploads')
        .list('', { search: testFile });
      
      const stillExists = check?.some(f => f.name === testFile);
      console.log(`  ${stillExists ? '⚠️  File STILL EXISTS' : '✅ File DELETED successfully'}`);
    }
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);
