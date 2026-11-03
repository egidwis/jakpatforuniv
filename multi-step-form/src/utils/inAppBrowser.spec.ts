import { describe, expect, it } from 'vitest';
import { authErrorText, isInAppBrowser } from './inAppBrowser';

describe('isInAppBrowser', () => {
    it.each([
        'Mozilla/5.0 (iPhone) Instagram 300.0',
        'Mozilla/5.0 (Linux; Android) [FB_IAB/FB4A;FBAV/400.0]',
        'Mozilla/5.0 (Linux; Android) musical_ly_2022 BytedanceWebview/d8a21c6',
        'Mozilla/5.0 (Linux; Android) Line/13.0',
    ])('mengenali %s', (ua) => expect(isInAppBrowser(ua)).toBe(true));

    it('Chrome dan Safari biasa tidak terkena', () => {
        expect(isInAppBrowser('Mozilla/5.0 (Linux; Android 14) Chrome/120.0 Mobile Safari/537.36')).toBe(false);
        expect(isInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17.0 Mobile/15E148 Safari/604.1')).toBe(false);
    });
});

describe('authErrorText', () => {
    it('menerjemahkan pesan Supabase yang umum', () => {
        expect(authErrorText('Invalid login credentials')).toBe('Email atau password salah.');
        expect(authErrorText('User already registered')).toBe('Email sudah terdaftar. Silakan masuk.');
    });
    it('pesan lain diteruskan, kosong diberi cadangan', () => {
        expect(authErrorText('Sesuatu terjadi')).toBe('Sesuatu terjadi');
        expect(authErrorText(undefined)).toBe('Autentikasi gagal');
    });
});
