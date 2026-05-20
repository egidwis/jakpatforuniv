import { dokuRequest } from '../_helpers.js';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/doku/sac/payout
 * Send payout from a Sub Account to a bank account
 * 
 * Request body:
 * {
 *   "account_id": "SAC-xxxx-xxxx",
 *   "amount": 50000,
 *   "invoice_number": "WDR/JFU/1234567890",
 *   "bank_code": "CENAIDJA",
 *   "bank_account_number": "1234567890",
 *   "bank_account_name": "Nama Pemilik",
 *   "description": "Optional description for internal tracking"
 * }
 */
export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const requestData = await context.request.json();

    // Validate required fields
    const required = ['account_id', 'amount', 'invoice_number', 'bank_code', 'bank_account_number', 'bank_account_name'];
    const missing = required.filter(f => !requestData[f]);
    if (missing.length > 0) {
      return new Response(JSON.stringify({ error: `Missing fields: ${missing.join(', ')}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const payload = {
      account: {
        id: requestData.account_id
      },
      payout: {
        amount: String(requestData.amount),
        invoice_number: requestData.invoice_number.substring(0, 100)
      },
      beneficiary: {
        bank_code: requestData.bank_code.substring(0, 12),
        bank_account_number: String(requestData.bank_account_number).replace(/[^0-9]/g, '').substring(0, 40),
        bank_account_name: requestData.bank_account_name.substring(0, 40)
      }
    };

    console.log('[SAC Payout] Payload:', JSON.stringify(payload));

    const result = await dokuRequest(
      context.env,
      'POST',
      '/sac-merchant/v1/payouts',
      payload
    );

    console.log('[SAC Payout] Response:', JSON.stringify(result.data));

    // Save to Supabase
    try {
      const supabaseUrl = context.env.SUPABASE_URL || context.env.VITE_SUPABASE_URL;
      const supabaseKey = context.env.SUPABASE_SERVICE_ROLE_KEY || context.env.VITE_SUPABASE_ANON_KEY;
      
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const payoutStatus = result.data?.payout?.status || (result.ok ? 'SUCCESS' : 'FAILED');

        await supabase.from('doku_payouts').insert({
          account_id: requestData.account_id,
          amount: parseInt(requestData.amount, 10),
          bank_code: requestData.bank_code,
          bank_account_number: requestData.bank_account_number,
          bank_account_name: requestData.bank_account_name,
          invoice_number: requestData.invoice_number,
          description: requestData.description || null,
          status: payoutStatus
        });
      } else {
        console.warn('[SAC Payout] Supabase credentials missing, cannot save payout history.');
      }
    } catch (dbError) {
      console.error('[SAC Payout] Error saving to Supabase:', dbError);
      // We don't fail the request if saving to DB fails, since DOKU already processed it
    }

    return new Response(JSON.stringify(result.data), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SAC Payout] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
