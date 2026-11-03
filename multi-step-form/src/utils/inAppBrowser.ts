const IN_APP_RE = /Instagram|FBAN|FBAV|FB_IAB|Line\/|TikTok|musical_ly|BytedanceWebview/i;

/** Google menolak login dari WebView aplikasi, jadi pembeli perlu diberi jalan keluar. */
export const isInAppBrowser = (userAgent: string): boolean => IN_APP_RE.test(userAgent);

const AUTH_MESSAGES: [RegExp, string][] = [
    [/invalid login credentials/i, 'Email atau password salah.'],
    [/user already registered|already been registered/i, 'Email sudah terdaftar. Silakan masuk.'],
    [/password should be at least/i, 'Password minimal 6 karakter.'],
    [/unable to validate email|invalid format/i, 'Format email tidak valid.'],
    [/rate limit|too many/i, 'Terlalu banyak percobaan. Coba lagi beberapa menit.'],
];

export function authErrorText(message: string | undefined): string {
    const text = message || '';
    return AUTH_MESSAGES.find(([re]) => re.test(text))?.[1] ?? (text || 'Autentikasi gagal');
}
