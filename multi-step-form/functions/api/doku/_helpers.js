/**
 * DOKU API Helpers — Reusable signature generation and request utilities
 * Used by checkout.js, sac/create.js, sac/balance.js, sac/payout.js, etc.
 */

/**
 * Generate DOKU HMAC-SHA256 signature for API requests
 * @param {string} clientId - DOKU Client ID
 * @param {string} secretKey - DOKU Secret Key
 * @param {string} requestTarget - API path (e.g. "/sac-merchant/v1/accounts")
 * @param {string|null} bodyString - JSON body string (null for GET requests)
 * @returns {Promise<{requestId: string, requestTimestamp: string, signature: string}>}
 */
export async function generateDokuSignature(clientId, secretKey, requestTarget, bodyString = null) {
  const enc = new TextEncoder();
  const requestId = crypto.randomUUID();
  const requestTimestamp = new Date().toISOString().slice(0, 19) + "Z";

  // Build component string to sign
  let componentStringToSign = `Client-Id:${clientId}\nRequest-Id:${requestId}\nRequest-Timestamp:${requestTimestamp}\nRequest-Target:${requestTarget}`;

  // For POST requests with body, add Digest
  if (bodyString) {
    const digestBuffer = await crypto.subtle.digest('SHA-256', enc.encode(bodyString));
    const digest = btoa(String.fromCharCode(...new Uint8Array(digestBuffer)));
    componentStringToSign += `\nDigest:${digest}`;
  }

  // Generate HMAC-SHA256 signature
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    enc.encode(componentStringToSign)
  );

  const signature = "HMACSHA256=" + btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

  return { requestId, requestTimestamp, signature };
}

/**
 * Get DOKU API base URL based on environment
 * @param {object} env - Cloudflare environment object
 * @returns {string} Base URL
 */
export function getDokuBaseUrl(env) {
  if (env.DOKU_ENV === 'production' || env.VITE_DOKU_ENV === 'production') {
    return 'https://api.doku.com';
  }
  return 'https://api-sandbox.doku.com';
}

/**
 * Get DOKU credentials from environment
 * @param {object} env - Cloudflare environment object
 * @returns {{clientId: string, secretKey: string}}
 */
export function getDokuCredentials(env) {
  const clientId = env.DOKU_CLIENT_ID || env.VITE_DOKU_CLIENT_ID;
  const secretKey = env.DOKU_SECRET_KEY;
  return { clientId, secretKey };
}

/**
 * Make authenticated DOKU API request
 * @param {object} env - Cloudflare environment
 * @param {string} method - HTTP method (GET, POST)
 * @param {string} requestTarget - API path
 * @param {object|null} body - Request body (null for GET)
 * @returns {Promise<{ok: boolean, status: number, data: object}>}
 */
export async function dokuRequest(env, method, requestTarget, body = null) {
  const { clientId, secretKey } = getDokuCredentials(env);

  if (!clientId || !secretKey) {
    throw new Error('DOKU credentials missing in environment');
  }

  const baseUrl = getDokuBaseUrl(env);
  const bodyString = body ? JSON.stringify(body) : null;

  const { requestId, requestTimestamp, signature } = await generateDokuSignature(
    clientId, secretKey, requestTarget, bodyString
  );

  const headers = {
    'Client-Id': clientId,
    'Request-Id': requestId,
    'Request-Timestamp': requestTimestamp,
    'Signature': signature,
  };

  if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
  }

  const fetchOptions = { method, headers };
  if (bodyString) {
    fetchOptions.body = bodyString;
  }

  console.log(`[DOKU] ${method} ${baseUrl}${requestTarget}`);
  console.log(`[DOKU] Request-Id: ${requestId}`);

  const response = await fetch(`${baseUrl}${requestTarget}`, fetchOptions);
  const resultText = await response.text();

  let data;
  try {
    data = JSON.parse(resultText);
  } catch {
    data = { raw: resultText };
  }

  return { ok: response.ok, status: response.status, data };
}
