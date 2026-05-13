import { dokuRequest } from '../_helpers.js';

/**
 * GET /api/doku/sac/balance?account_id=SAC-xxxx-xxxx
 * Get balance of a DOKU Sub Account
 */
export async function onRequest(context) {
  if (context.request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const url = new URL(context.request.url);
    const accountId = url.searchParams.get('account_id');

    if (!accountId) {
      return new Response(JSON.stringify({ error: 'account_id query parameter is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await dokuRequest(
      context.env,
      'GET',
      `/sac-merchant/v1/balances/${accountId}`
    );

    console.log('[SAC Balance] Response:', JSON.stringify(result.data));

    return new Response(JSON.stringify(result.data), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SAC Balance] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
