const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zewuzezbmrmpttysjvpg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpld3V6ZXpibXJtcHR0eXNqdnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3NDg0MzMsImV4cCI6MjA2MzMyNDQzM30.IsFpW4TMm1mrLse-dZNvZpB-srOIFb9f2XBgNpaOwpI';

const supabase = createClient(supabaseUrl, supabaseKey);

const transactions = [
    {
        name_query: 'Usep Suhud',
        name: 'USEP SUHUD',
        amount: 2525000,
        items: [
            { id: '1', name: 'Jakpat for University (Platform) - EM-2601-JAK', qty: 1, price: 150000, category: 'Jakpat for University (Platform)' },
            { id: '2', name: "Respondent's Incentive - EM-2601-JAK", qty: 5, price: 25000, category: "Respondent's Incentive" },
            { id: '3', name: 'Jakpat for University (Platform) - EM-2602-JAK', qty: 2, price: 300000, category: 'Jakpat for University (Platform)' },
            { id: '4', name: "Respondent's Incentive - EM-2602-JAK", qty: 5, price: 30000, category: "Respondent's Incentive" },
            { id: '5', name: 'Jakpat for University (Platform) - EM-2603-JAK', qty: 2, price: 300000, category: 'Jakpat for University (Platform)' },
            { id: '6', name: "Respondent's Incentive - EM-2603-JAK", qty: 5, price: 30000, category: "Respondent's Incentive" },
            { id: '7', name: 'Jakpat for University (Platform) - EM-2604-JAK', qty: 2, price: 300000, category: 'Jakpat for University (Platform)' },
            { id: '8', name: "Respondent's Incentive - EM-2604-JAK", qty: 5, price: 30000, category: "Respondent's Incentive" }
        ]
    }
];

async function main() {
    console.log('Starting backfill update...');

    for (const t of transactions) {
        console.log(`Processing ${t.name}...`);

        // 1. Find form_submission_id
        const { data: submissions, error: findError } = await supabase
            .from('form_submissions')
            .select('id, full_name, email')
            .ilike('full_name', `%${t.name_query}%`);

        if (findError || !submissions || submissions.length === 0) {
            console.error('Submission not found for', t.name);
            continue;
        }

        const submission = submissions[0];
        console.log(`Found submission: ${submission.full_name}`);

        // 2. Prepare transaction data (Note)
        const note = JSON.stringify({
            items: t.items,
            memo: 'Manual Backfill via Script (Updated)'
        });

        // 3. Find existing transaction to update
        const { data: existingTx, error: txFindError } = await supabase
            .from('transactions')
            .select('id')
            .eq('form_submission_id', submission.id)
            .ilike('payment_method', '%Manual Backfill%')
            .order('created_at', { ascending: false })
            .limit(1);

        if (existingTx && existingTx.length > 0) {
            // UDPATE existing
            const { error: updateError } = await supabase
                .from('transactions')
                .update({
                    amount: t.amount,
                    note: note,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingTx[0].id);

            if (updateError) console.error('Error updating tx:', updateError);
            else console.log(`Transaction UPDATED for ${t.name} (ID: ${existingTx[0].id})`);

        } else {
            // INSERT new (fallback if user deleted it)
            const transactionData = {
                form_submission_id: submission.id,
                amount: t.amount,
                status: 'completed',
                payment_method: 'Mayar (Manual Backfill)',
                payment_id: `backfill_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                note: note,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            const { data: newTx, error: insertError } = await supabase
                .from('transactions')
                .insert([transactionData])
                .select();

            if (insertError) console.error('Error inserting tx:', insertError);
            else console.log(`Transaction CREATED for ${t.name} (ID: ${newTx[0].id})`);
        }

        // 4. Update Submission Payment Status (Ensure it is paid)
        await supabase
            .from('form_submissions')
            .update({ payment_status: 'paid', status: 'process' })
            .eq('id', submission.id);

        console.log(`Submission status ensured for ${t.name}`);
    }

    console.log('Update complete.');
}

main();
