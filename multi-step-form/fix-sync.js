import fs from 'fs';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const envConfig = dotenv.parse(fs.readFileSync('.env'));
for (const k in envConfig) {
  process.env[k] = envConfig[k];
}

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function syncInvoices() {
  const { data: transactions, error } = await supabase.from('transactions').select('payment_id, status').eq('status', 'completed');
  if (!transactions) return console.log('No completed transactions found.');

  console.log('Found ' + transactions.length + ' completed transactions.');

  let updatedCount = 0;
  for (const trx of transactions) {
    const { data } = await supabase
      .from('invoices')
      .update({ status: 'completed' })
      .eq('payment_id', trx.payment_id)
      .select();

    if (data && data.length > 0) updatedCount++;
  }

  console.log('Sync finished. Updated ' + updatedCount + ' existing invoices from pending to completed.');
}
syncInvoices();
