/**
 * Script to check RLS policies on page_respondents and test proof deletion
 * Run: node scripts/check-rls.cjs
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zewuzezbmrmpttysjvpg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpld3V6ZXpibXJtcHR0eXNqdnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3NDg0MzMsImV4cCI6MjA2MzMyNDQzM30.IsFpW4TMm1mrLse-dZNvZpB-srOIFb9f2XBgNpaOwpI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  console.log('=== Checking page_respondents RLS & Proof Deletion ===\n');

  // 1. Check if we can SELECT from page_respondents (without auth)
  console.log('1. Testing SELECT (anon, no auth):');
  const { data: selectData, error: selectError, count: selectCount } = await supabase
    .from('page_respondents')
    .select('id, proof_url', { count: 'exact' })
    .not('proof_url', 'is', null)
    .limit(3);

  if (selectError) {
    console.log('   ❌ SELECT blocked:', selectError.message);
  } else {
    console.log(`   ✅ SELECT works. Found ${selectCount} rows with proof_url.`);
    if (selectData && selectData.length > 0) {
      console.log('   Sample:', selectData.slice(0, 2).map(r => ({ id: r.id, proof_url: r.proof_url?.substring(0, 60) + '...' })));
    }
  }

  // 2. Test UPDATE on page_respondents (anon, no auth) - DRY RUN
  console.log('\n2. Testing UPDATE (anon, no auth) - dry run with non-existent ID:');
  const { data: updateData, error: updateError, count: updateCount } = await supabase
    .from('page_respondents')
    .update({ proof_url: null }, { count: 'exact' })
    .eq('id', '00000000-0000-0000-0000-000000000000') // Non-existent ID
    .select();

  if (updateError) {
    console.log('   ❌ UPDATE blocked by RLS:', updateError.message, updateError.code);
    console.log('   This means: Proof deletion via UPDATE will SILENTLY FAIL!');
  } else {
    console.log(`   ✅ UPDATE allowed (0 rows matched as expected). Count: ${updateCount}`);
    console.log('   RLS allows UPDATE on page_respondents.');
  }

  // 3. Test storage delete (anon, no auth) - dry run
  console.log('\n3. Testing Storage DELETE (anon, no auth) - dry run with non-existent file:');
  const { data: storageData, error: storageError } = await supabase.storage
    .from('page-uploads')
    .remove(['non-existent-test-file-12345.png']);

  if (storageError) {
    console.log('   ❌ Storage DELETE blocked:', storageError.message);
    console.log('   This means: Files won\'t be deleted from storage!');
  } else {
    console.log('   ✅ Storage DELETE allowed. Response:', JSON.stringify(storageData));
  }

  // 4. Check if RLS is enabled on the table
  console.log('\n4. Checking table info via pg_catalog (may not work with anon key):');
  const { data: rlsData, error: rlsError } = await supabase.rpc('get_table_info', { 
    table_name: 'page_respondents' 
  });
  
  if (rlsError) {
    console.log('   ⚠️  Cannot query pg_catalog with anon key (expected):', rlsError.message);
  } else {
    console.log('   Table info:', rlsData);
  }

  // 5. Count proof_url NOT NULL to verify sidebar count
  console.log('\n5. Current proof count (what sidebar meter shows):');
  const { count: proofCount, error: countError } = await supabase
    .from('page_respondents')
    .select('id', { count: 'exact', head: true })
    .not('proof_url', 'is', null);

  if (countError) {
    console.log('   ❌ Error:', countError.message);
  } else {
    console.log(`   Total proofs: ${proofCount}`);
  }

  // 6. Also check for empty-string proof_url (which the code sets instead of null)
  console.log('\n6. Checking for empty string proof_url (code bug check):');
  const { count: emptyCount, error: emptyError } = await supabase
    .from('page_respondents')
    .select('id', { count: 'exact', head: true })
    .eq('proof_url', '');

  if (emptyError) {
    console.log('   ❌ Error:', emptyError.message);
  } else {
    console.log(`   Rows with proof_url = '' (empty string): ${emptyCount}`);
    if (emptyCount > 0) {
      console.log('   ⚠️  This suggests deletion DID work at the DB level previously,');
      console.log('      but the count query uses "NOT NULL" which doesn\'t filter empty strings!');
    }
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);
