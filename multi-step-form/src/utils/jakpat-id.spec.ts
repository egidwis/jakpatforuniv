import { describe, it, expect } from 'vitest';
import { normalizeJakpatId, jakpatIdWarning } from './jakpat-id';

describe('normalizeJakpatId', () => {
  it('leaves clean id alone', () => {
    expect(normalizeJakpatId('ks8oh')).toBe('ks8oh');
    expect(normalizeJakpatId('tegarerputra')).toBe('tegarerputra');
    expect(normalizeJakpatId('JAKPAT.50BX0')).toBe('JAKPAT.50BX0');
  });

  it('trims surrounding and inner whitespace', () => {
    expect(normalizeJakpatId('  tegarerputra  ')).toBe('tegarerputra');
    expect(normalizeJakpatId('ks 8oh')).toBe('ks8oh');
  });

  it('strips full jakpat URL prefixes', () => {
    expect(normalizeJakpatId('https://jakpat.net/s/JAKPAT.50BX0')).toBe('JAKPAT.50BX0');
    expect(normalizeJakpatId('https://jakpat.net/s/tegarerputra')).toBe('tegarerputra');
    expect(normalizeJakpatId('http://jakpat.net/s/50bx0')).toBe('50bx0');
    expect(normalizeJakpatId('https://www.jakpat.net/s/JAKPAT.50BX0')).toBe('JAKPAT.50BX0');
    expect(normalizeJakpatId('jakpat.net/s/ks8oh')).toBe('ks8oh');
  });

  it('preserves casing and handles empty string', () => {
    expect(normalizeJakpatId('JAKPAT.50BX0')).toBe('JAKPAT.50BX0');
    expect(normalizeJakpatId('')).toBe('');
  });
});

describe('jakpatIdWarning', () => {
  it('allows custom usernames, standard format, and arbitrary length without warning', () => {
    const validInputs = [
      'ks8oh',
      'qt0yt',
      '50bx0',
      'JAKPAT.50BX0',
      'jakpat.50bx0',
      'tegarerputra',
      'indah',
      'dimas',
      'ayu',
      'jakpat123',
      'eefafa.eas',
      'user_name-123'
    ];

    for (const input of validInputs) {
      expect(jakpatIdWarning(input)).toBeNull();
    }
  });

  it('allows pasted jakpat urls by normalizing before checking', () => {
    expect(jakpatIdWarning('https://jakpat.net/s/tegarerputra')).toBeNull();
    expect(jakpatIdWarning('https://jakpat.net/s/JAKPAT.50BX0')).toBeNull();
  });

  it('does not warn on empty input', () => {
    expect(jakpatIdWarning('')).toBeNull();
  });

  it('warns when respondent enters an email', () => {
    expect(jakpatIdWarning('tegar@gmail.com')).toContain('alamat email');
  });

  it('warns when respondent enters a phone number', () => {
    expect(jakpatIdWarning('081234567890')).toContain('nomor HP');
    expect(jakpatIdWarning('+6281234567890')).toContain('nomor HP');
  });

  it('warns when respondent pastes an unrelated external link', () => {
    expect(jakpatIdWarning('https://docs.google.com/forms/d/e/123')).toContain('tautan lain');
    expect(jakpatIdWarning('https://forms.gle/xyz')).toContain('tautan lain');
    expect(jakpatIdWarning('https://instagram.com/tegar')).toContain('tautan lain');
  });
});
