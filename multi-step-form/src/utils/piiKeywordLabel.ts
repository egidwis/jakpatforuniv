import type { TranslationKey } from '../i18n/translations';

/**
 * Kata kunci PII dari detektor (`detectPersonalDataInSchema`) → label i18n.
 * Dipakai panel PII langkah 1 dan blok jalur review di Ringkasan, supaya chip
 * yang sama tidak berbeda bunyi di dua layar.
 */
export const PII_KEYWORD_KEY: Record<string, TranslationKey> = {
  email: 'piiKwEmail',
  phone: 'piiKwPhone',
  'full name': 'piiKwName',
  name: 'piiKwName',
  address: 'piiKwAddress',
  'nik/id': 'piiKwNik',
  'file upload': 'piiKwFile',
  'e-wallet/hadiah': 'piiKwWallet',
  'email otomatis': 'piiKwCollectEmail',
};
