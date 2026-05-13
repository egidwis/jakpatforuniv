import { dokuRequest } from '../_helpers.js';

/**
 * POST /api/doku/sac/create
 * Create a DOKU Sub Account
 * 
 * Request body:
 * {
 *   "email": "tegar@jakpat.net",
 *   "name": "JakpatForUniv",
 *   "type": "STANDARD"  // optional, defaults to STANDARD
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

    if (!requestData.email || !requestData.name) {
      return new Response(JSON.stringify({ error: 'email and name are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const payload = {
      account: {
        email: requestData.email.substring(0, 40),
        type: requestData.type || 'STANDARD',
        name: requestData.name.substring(0, 100)
      }
    };

    const result = await dokuRequest(
      context.env,
      'POST',
      '/sac-merchant/v1/accounts',
      payload
    );

    console.log('[SAC Create] Response:', JSON.stringify(result.data));

    return new Response(JSON.stringify(result.data), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SAC Create] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
