// Convert a non-negative integer amount (IDR) into Indonesian words ("terbilang").
// e.g. terbilang(4000) -> "empat ribu rupiah". Used on invoices/receipts where
// Indonesian business practice expects the amount spelled out in words.

const SATUAN = [
  '', 'satu', 'dua', 'tiga', 'empat', 'lima',
  'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas',
];

function toWords(n: number): string {
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${toWords(n - 10)} belas`;
  if (n < 100) {
    const rem = n % 10;
    return `${SATUAN[Math.floor(n / 10)]} puluh${rem ? ` ${toWords(rem)}` : ''}`;
  }
  if (n < 200) {
    const rem = n % 100;
    return `seratus${rem ? ` ${toWords(rem)}` : ''}`;
  }
  if (n < 1000) {
    const rem = n % 100;
    return `${SATUAN[Math.floor(n / 100)]} ratus${rem ? ` ${toWords(rem)}` : ''}`;
  }
  if (n < 2000) {
    const rem = n % 1000;
    return `seribu${rem ? ` ${toWords(rem)}` : ''}`;
  }
  if (n < 1_000_000) {
    const rem = n % 1000;
    return `${toWords(Math.floor(n / 1000))} ribu${rem ? ` ${toWords(rem)}` : ''}`;
  }
  if (n < 1_000_000_000) {
    const rem = n % 1_000_000;
    return `${toWords(Math.floor(n / 1_000_000))} juta${rem ? ` ${toWords(rem)}` : ''}`;
  }
  if (n < 1_000_000_000_000) {
    const rem = n % 1_000_000_000;
    return `${toWords(Math.floor(n / 1_000_000_000))} miliar${rem ? ` ${toWords(rem)}` : ''}`;
  }
  const rem = n % 1_000_000_000_000;
  return `${toWords(Math.floor(n / 1_000_000_000_000))} triliun${rem ? ` ${toWords(rem)}` : ''}`;
}

/** Lowercase words with the "rupiah" suffix, e.g. "empat ribu rupiah". */
export function terbilang(amount: number): string {
  const n = Math.floor(Math.abs(amount || 0));
  if (n === 0) return 'nol rupiah';
  const words = toWords(n).replace(/\s+/g, ' ').trim();
  return `${words} rupiah`;
}

/** Same as terbilang() but with the first letter capitalized, e.g. "Empat ribu rupiah". */
export function terbilangCapitalized(amount: number): string {
  const t = terbilang(amount);
  return t.charAt(0).toUpperCase() + t.slice(1);
}
