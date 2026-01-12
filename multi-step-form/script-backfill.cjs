const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zewuzezbmrmpttysjvpg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpld3V6ZXpibXJtcHR0eXNqdnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3NDg0MzMsImV4cCI6MjA2MzMyNDQzM30.IsFpW4TMm1mrLse-dZNvZpB-srOIFb9f2XBgNpaOwpI';

const supabase = createClient(supabaseUrl, supabaseKey);

const transactions = [
    {
        email: 'abidzarghifari@mail.ugm.ac.id',
        name: 'Abi Dzar Ghifari',
        amount: 260000,
        created_at: '2026-01-02T15:41:00+07:00',
        items: [
            { id: '1', name: 'Jakpat for University (Platform)', qty: 1, price: 200000, category: 'Jakpat for University (Platform)' },
            { id: '2', name: "Respondent's Incentive", qty: 2, price: 30000, category: "Respondent's Incentive" }
        ]
    },
    {
        email: 'riosantoso6090@gmail.com',
        name: 'Rio Santoso',
        amount: 400000,
        created_at: '2026-01-02T15:50:00+07:00',
        items: [
            { id: '1', name: 'Jakpat for University (Platform)', qty: 1, price: 300000, category: 'Jakpat for University (Platform)' },
            { id: '2', name: "Respondent's Incentive", qty: 2, price: 50000, category: "Respondent's Incentive" }
        ]
    },
    {
        email: 'ieuan1022@gmail.com',
        name: 'niexuan',
        amount: 490000,
        created_at: '2026-01-05T15:35:00+07:00',
        items: [
            { id: '1', name: 'Jakpat for University (Platform)', qty: 2, price: 200000, category: 'Jakpat for University (Platform)' },
            { id: '2', name: "Respondent's Incentive", qty: 3, price: 30000, category: "Respondent's Incentive" }
        ]
    },
    {
        email: 'syafiraazka1722@gmail.com',
        name: 'Syafira Azka',
        amount: 200000,
        created_at: '2026-01-07T14:55:00+07:00',
        items: [
            { id: '1', name: 'Jakpat for University (Platform)', qty: 1, price: 150000, category: 'Jakpat for University (Platform)' },
            { id: '2', name: "Respondent's Incentive", qty: 2, price: 25000, category: "Respondent's Incentive" }
        ]
    },
    {
        email: 'assyfa.maura@ui.ac.id',
        name: 'Assyfa Maura Meldina',
        amount: 500000,
        created_at: '2026-01-08T15:26:00+07:00',
        items: [
            { id: '1', name: 'Jakpat for University (Platform)', qty: 1, price: 400000, category: 'Jakpat for University (Platform)' },
            { id: '2', name: "Respondent's Incentive", qty: 2, price: 50000, category: "Respondent's Incentive" }
        ]
    },
    {
        email: 'aryonokurnianto310@gmail.com',
        name: 'Aryono Kurnianto',
        amount: 290000,
        created_at: '2026-01-09T11:20:00+07:00',
        items: [
            { id: '1', name: 'Jakpat for University (ads)', qty: 1, price: 200000, category: 'Jakpat for University (ads)' },
            { id: '2', name: "Respondent's Incentive", qty: 3, price: 30000, category: "Respondent's Incentive" }
        ]
    },
    {
        email: 'usuhud@unj.ac.id',
        name: 'USEP SUHUD',
        amount: 1500000,
        created_at: '2026-01-09T17:13:00+07:00',
        items: [
            { id: '1', name: 'Jakpat for University (Platform) - JAK2604', qty: 2, price: 300000, category: 'Jakpat for University (Platform)' },
            { id: '2', name: "Respondent's Incentive - JAK2604", qty: 5, price: 30000, category: "Respondent's Incentive" },
            { id: '3', name: 'Jakpat for University (Platform) - JAK26003', qty: 2, price: 300000, category: 'Jakpat for University (Platform)' },
            { id: '4', name: "Respondent's Incentive - JAK26003", qty: 5, price: 30000, category: "Respondent's Incentive" }
        ]
    }
];

async function main() {
    console.log('Starting backfill...');

    for (const t of transactions) {
        console.log(`Processing ${t.name} (${t.email})...`);

        // 1. Find form_submission_id
        const { data: submissions, error: findError } = await supabase
            .from('form_submissions')
            .select('id, payment_status')
            .eq('email', t.email);

        if (findError) {
            console.error('Error finding submission:', findError);
            continue;
        }

        if (!submissions || submissions.length === 0) {
            console.warn(`No submission found for ${t.email}`);
            continue;
        }

        // Use the most recent submission if multiple? Or specific logic.
        // Assuming unique email or most recent is the target.
        const submissionId = submissions[0].id;

        // 2. Prepare transaction data
        const note = JSON.stringify({
            items: t.items,
            memo: 'Manual backfill'
        });

        const transactionData = {
            form_submission_id: submissionId,
            amount: t.amount,
            status: 'completed', // Using 'completed' as app logic maps to 'paid'
            payment_method: 'Mayar (Manual Backfill)',
            note: note,
            created_at: t.created_at,
            updated_at: new Date().toISOString()
        };

        // 3. Insert Transaction
        const { data: newTx, error: txError } = await supabase
            .from('transactions')
            .insert([transactionData])
            .select();

        if (txError) {
            console.error('Error inserting transaction:', txError);
        } else {
            console.log(`Transaction created for ${t.name}:`, newTx[0].id);
        }

        // 4. Update Submission Payment Status to 'paid' if not already
        const { error: updateError } = await supabase
            .from('form_submissions')
            .update({ payment_status: 'paid', status: 'process' }) // Also setting status to process as requested
            .eq('id', submissionId);

        if (updateError) {
            console.error('Error updating submission status:', updateError);
        } else {
            console.log(`Submission status updated for ${t.name}`);
        }
    }

    console.log('Backfill complete.');
}

main();
