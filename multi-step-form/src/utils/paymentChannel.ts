// Map a raw DOKU payment-channel code (stored in transactions.payment_channel)
// to a human-friendly Indonesian label for display on invoices/receipts.
// DOKU reports codes like "VIRTUAL_ACCOUNT_BCA", "QRIS", "CREDIT_CARD",
// "EMONEY_OVO", "ONLINE_TO_OFFLINE_ALFA". Unknown codes are prettified generically.

const EXACT: Record<string, string> = {
  QRIS: 'QRIS',
  CREDIT_CARD: 'Kartu Kredit',
  CARD_PAYMENT: 'Kartu Kredit',
  DIRECT_DEBIT: 'Direct Debit',
};

// Bank code fragment -> display name (for Virtual Account channels).
const BANKS: Record<string, string> = {
  BCA: 'BCA',
  BANK_CENTRAL_ASIA: 'BCA',
  MANDIRI: 'Mandiri',
  BANK_MANDIRI: 'Mandiri',
  BRI: 'BRI',
  BANK_RAKYAT_INDONESIA: 'BRI',
  BNI: 'BNI',
  BANK_NEGARA_INDONESIA: 'BNI',
  CIMB: 'CIMB Niaga',
  BANK_CIMB: 'CIMB Niaga',
  PERMATA: 'Permata',
  BANK_PERMATA: 'Permata',
  BSI: 'BSI',
  BANK_SYARIAH_INDONESIA: 'BSI',
  DANAMON: 'Danamon',
  BANK_DANAMON: 'Danamon',
  DOKU: 'DOKU',
  MAYBANK: 'Maybank',
  BANK_MAYBANK: 'Maybank',
  SINARMAS: 'Sinarmas',
  BANK_SINARMAS: 'Sinarmas',
};

// E-wallet fragment -> display name.
const WALLETS: Record<string, string> = {
  OVO: 'OVO',
  DANA: 'DANA',
  SHOPEE_PAY: 'ShopeePay',
  SHOPEEPAY: 'ShopeePay',
  LINKAJA: 'LinkAja',
  LINK_AJA: 'LinkAja',
  GOPAY: 'GoPay',
};

// Retail outlet fragment -> display name.
const RETAIL: Record<string, string> = {
  ALFA: 'Alfamart',
  ALFAMART: 'Alfamart',
  INDOMARET: 'Indomaret',
};

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function lookupFragment(rest: string, table: Record<string, string>): string {
  const key = rest.replace(/^_+|_+$/g, '');
  if (table[key]) return table[key];
  // Try removing a leading BANK_ qualifier.
  const noBank = key.replace(/^BANK_/, '');
  if (table[noBank]) return table[noBank];
  return titleCase(key.replace(/_/g, ' '));
}

/**
 * Friendly label for a DOKU channel code.
 * @param code      raw payment_channel value (may be null/undefined)
 * @param fallback  label to use when no channel was captured (default "DOKU")
 */
export function formatPaymentChannel(code?: string | null, fallback = 'DOKU'): string {
  if (!code) return fallback;
  const c = code.toUpperCase().trim();
  if (!c) return fallback;

  if (EXACT[c]) return EXACT[c];

  if (c.startsWith('VIRTUAL_ACCOUNT')) {
    return `Virtual Account ${lookupFragment(c.slice('VIRTUAL_ACCOUNT'.length), BANKS)}`;
  }
  if (c.startsWith('EMONEY')) {
    return lookupFragment(c.slice('EMONEY'.length), WALLETS);
  }
  if (c.startsWith('ONLINE_TO_OFFLINE')) {
    return `Gerai ${lookupFragment(c.slice('ONLINE_TO_OFFLINE'.length), RETAIL)}`;
  }
  if (c.startsWith('DIRECT_DEBIT')) {
    const rest = c.slice('DIRECT_DEBIT'.length).replace(/^_+/, '');
    return rest ? `Direct Debit ${lookupFragment(rest, BANKS)}` : 'Direct Debit';
  }
  if (c.includes('QRIS')) return 'QRIS';
  if (c.includes('CREDIT_CARD') || c.includes('CARD')) return 'Kartu Kredit';

  // Unknown code — prettify generically (e.g. "BNPL_KREDIVO" -> "Bnpl Kredivo").
  return titleCase(c.replace(/_/g, ' '));
}
