import { dokuRequest } from '../_helpers.js';

/**
 * POST /api/doku/sac/transfer
 * Transfer balance between Sub Accounts (e.g. Master → Product SAC, or Product → Respondent)
 * 
 * Request body:
 * {
 *   "origin": "SAC-xxxx-xxxx",
 *   "destination": "SAC-yyyy-yyyy",
 *   "amount": 10000,
 *   "invoice_number": "TRF/JFU/1234567890"
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
    const required = ['origin', 'destination', 'amount', 'invoice_number'];
    const missing = required.filter(f => !requestData[f]);
    if (missing.length > 0) {
      return new Response(JSON.stringify({ error: `Missing fields: ${missing.join(', ')}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const payload = {
      transfer: {
        origin: requestData.origin,
        destination: requestData.destination,
        amount: requestData.amount,
        invoice_number: requestData.invoice_number.substring(0, 100)
      }
    };

    const result = await dokuRequest(
      context.env,
      'POST',
      '/sac-merchant/v1/transfers',
      payload
    );

    console.log('[SAC Transfer] Response:', JSON.stringify(result.data));

    return new Response(JSON.stringify(result.data), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SAC Transfer] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
