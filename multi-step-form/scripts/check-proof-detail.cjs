/**
 * Script to check proof count with more detail
 * Run: node scripts/check-proof-detail.cjs
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zewuzezbmrmpttysjvpg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpld3V6ZXpibXJtcHR0eXNqdnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3NDg0MzMsImV4cCI6MjA2MzMyNDQzM30.IsFpW4TMm1mrLse-dZNvZpB-srOIFb9f2XBgNpaOwpI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  console.log('=== Detailed proof analysis ===\n');

  // Total rows in page_respondents
  const { count: totalCount } = await supabase
    .from('page_respondents')
    .select('id', { count: 'exact', head: true });
  console.log(`Total rows in page_respondents: ${totalCount}`);

  // Rows with proof_url NOT NULL
  const { count: notNullCount } = await supabase
    .from('page_respondents')
    .select('id', { count: 'exact', head: true })
    .not('proof_url', 'is', null);
  console.log(`Rows where proof_url IS NOT NULL: ${notNullCount}`);

  // Rows with proof_url = null
  const { count: nullCount } = await supabase
    .from('page_respondents')
    .select('id', { count: 'exact', head: true })
    .is('proof_url', null);
  console.log(`Rows where proof_url IS NULL: ${nullCount}`);

  // Rows with proof_url = '' (empty string)
  const { count: emptyCount } = await supabase
    .from('page_respondents')
    .select('id', { count: 'exact', head: true })
    .eq('proof_url', '');
  console.log(`Rows where proof_url = '' (empty string): ${emptyCount}`);

  // Rows with proof_url containing 'supabase' (valid URLs)
  const { count: validCount } = await supabase
    .from('page_respondents')
    .select('id', { count: 'exact', head: true })
    .like('proof_url', '%supabase%');
  console.log(`Rows where proof_url contains 'supabase': ${validCount}`);

  // Sample some rows to see what proof_url looks like
  const { data: sampleRows } = await supabase
    .from('page_respondents')
    .select('id, proof_url, page_id')
    .limit(5);
  
  console.log('\nSample rows:');
  if (sampleRows && sampleRows.length > 0) {
    sampleRows.forEach(r => {
      console.log(`  id: ${r.id}, page_id: ${r.page_id}, proof_url: ${r.proof_url === null ? 'NULL' : r.proof_url === '' ? '(empty string)' : r.proof_url.substring(0, 80) + '...'}`);
    });
  } else {
    console.log('  No rows returned - RLS might be blocking SELECT for anon!');
  }

  // Check storage bucket - list files
  console.log('\n=== Checking Storage Bucket ===');
  const { data: files, error: listError } = await supabase.storage
    .from('page-uploads')
    .list('', { limit: 10 });

  if (listError) {
    console.log(`❌ Cannot list storage: ${listError.message}`);
  } else {
    console.log(`Files/folders in root of page-uploads: ${files?.length || 0}`);
    if (files) {
      files.forEach(f => {
        console.log(`  ${f.name} (${f.metadata?.size || 'folder'})`);
      });
    }
  }

  // List proof files specifically
  const { data: proofFiles, error: proofListError } = await supabase.storage
    .from('page-uploads')
    .list('', { limit: 10, search: 'proof' });

  if (!proofListError && proofFiles) {
    console.log(`\nFiles matching 'proof': ${proofFiles.length}`);
    proofFiles.slice(0, 5).forEach(f => {
      console.log(`  ${f.name} (size: ${f.metadata?.size || '?'})`);
    });
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);
