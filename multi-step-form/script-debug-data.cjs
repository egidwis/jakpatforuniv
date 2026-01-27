const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log('Fetching paid submissions...');
    const { data, error } = await supabase
        .from('form_submissions')
        .select('id, full_name, status, payment_status')
        .eq('payment_status', 'paid');

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log(`Found ${data.length} paid submissions.`);

    const statusCounts = {};
    data.forEach(row => {
        statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
    });

    console.log('Status distribution for paid users:', statusCounts);
}

main();
