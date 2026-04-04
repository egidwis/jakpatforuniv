/**
 * Script to list ALL proof files in storage and check their actual sizes
 * Run: node scripts/check-storage.cjs
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zewuzezbmrmpttysjvpg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpld3V6ZXpibXJtcHR0eXNqdnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3NDg0MzMsImV4cCI6MjA2MzMyNDQzM30.IsFpW4TMm1mrLse-dZNvZpB-srOIFb9f2XBgNpaOwpI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  console.log('=== Full Storage Analysis ===\n');

  // List ALL files (paginated)
  let allFiles = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const { data, error } = await supabase.storage
      .from('page-uploads')
      .list('', { limit, offset, sortBy: { column: 'created_at', order: 'asc' } });

    if (error) {
      console.log('Error listing files:', error.message);
      break;
    }

    if (!data || data.length === 0) break;

    allFiles.push(...data);
    offset += limit;

    if (data.length < limit) break;
  }

  console.log(`Total files in storage: ${allFiles.length}`);

  // Separate proof files from other files
  const proofFiles = allFiles.filter(f => f.name.startsWith('proof-'));
  const otherFiles = allFiles.filter(f => !f.name.startsWith('proof-') && !f.id); // non-folder non-proof
  const folders = allFiles.filter(f => !f.name.startsWith('proof-') && f.id === null);

  console.log(`  Proof files: ${proofFiles.length}`);
  console.log(`  Other files: ${otherFiles.length}`);
  console.log(`  Folders: ${folders.length}`);

  // Calculate total proof size
  let totalProofSize = 0;
  proofFiles.forEach(f => {
    totalProofSize += f.metadata?.size || 0;
  });
  console.log(`\nTotal proof storage used: ${(totalProofSize / 1024).toFixed(1)} KB (${(totalProofSize / 1024 / 1024).toFixed(2)} MB)`);

  // List all proof files with sizes
  console.log('\n--- All Proof Files ---');
  proofFiles.forEach(f => {
    const sizeKB = ((f.metadata?.size || 0) / 1024).toFixed(1);
    console.log(`  ${f.name} - ${sizeKB} KB - created: ${f.created_at}`);
  });

  // Check subfolders (e.g., 'banners')
  console.log('\n--- Checking subfolders ---');
  const { data: bannerFiles } = await supabase.storage
    .from('page-uploads')
    .list('banners', { limit: 100 });

  if (bannerFiles && bannerFiles.length > 0) {
    console.log(`  banners/ folder: ${bannerFiles.length} files`);
    bannerFiles.forEach(f => {
      const sizeKB = ((f.metadata?.size || 0) / 1024).toFixed(1);
      console.log(`    ${f.name} - ${sizeKB} KB`);
    });
  }

  // Now test: Can anon key DELETE a file from storage?
  console.log('\n--- Storage Policy Test ---');
  if (proofFiles.length > 0) {
    console.log(`Testing remove on first proof: ${proofFiles[0].name}`);
    const { data: delResult, error: delError } = await supabase.storage
      .from('page-uploads')
      .remove([proofFiles[0].name]);

    if (delError) {
      console.log(`  ❌ CANNOT delete: ${delError.message}`);
      console.log(`  Storage RLS is BLOCKING deletes!`);
    } else {
      console.log(`  ✅ Delete response:`, JSON.stringify(delResult));
      
      // Verify if it was actually deleted
      const { data: checkFile } = await supabase.storage
        .from('page-uploads')
        .list('', { search: proofFiles[0].name });
      
      if (checkFile && checkFile.some(f => f.name === proofFiles[0].name)) {
        console.log(`  ⚠️  File STILL EXISTS after delete call! Storage policy might be returning success but NOT deleting.`);
      } else {
        console.log(`  ✅ File confirmed DELETED from storage.`);
      }
    }
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);
