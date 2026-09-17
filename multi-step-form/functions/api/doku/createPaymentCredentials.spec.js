import { describe, it, expect, vi, afterEach } from 'vitest';
import { onRequest } from './create-payment.js';

/*
  Dua kebohongan yang dibongkar di sini — keduanya berujung pada toast merah
  yang sama di layar peneliti: "Form submission not found".

  ── 1. Fallback senyap ke anon key ────────────────────────────────────────
  `SERVICE_ROLE || VITE_ANON || ANON` berarti lupa memasang satu variabel
  environment tidak menghasilkan kegagalan apa pun — ia menghasilkan role yang
  SALAH. Baris `form_submissions` tetap terlihat oleh `anon` (RLS baris lolos),
  tapi GRANT KOLOM menolak `total_cost` dan `email`, jadi PostgREST memulangkan
  objek galat. Pola persis ini sudah dicabut dari `webhook.js` sesudah insiden
  2026-08-10; `create-payment.js` tidak pernah ikut diperbaiki, dan komentarnya
  sendiri di `:1206` sudah menuding penyebabnya tanpa pernah mencegahnya.

  ── 2. Galat menyamar jadi "tidak ada" ────────────────────────────────────
  `!Array.isArray(subs)` menyamakan "PostgREST MENOLAK permintaanmu" dengan
  "barisnya TIDAK ADA". Dua sebab yang sama sekali berbeda dicetak dengan satu
  kalimat, dan kalimat itu menunjuk ke arah yang salah: orang yang membacanya
  akan mencari order yang hilang, bukan kredensial yang hilang.

  Ironisnya pembacaan `ad_schedules` 20 baris di bawahnya SUDAH memeriksa
  `!schedRes.ok` dan membalas 502. Asimetri itu bugnya.

  ⚠️ Tes ini juga menjaga properti yang tidak terlihat dari status code:
  `fetch` TIDAK BOLEH dipanggil sama sekali saat service key hilang. Fail-closed
  yang tetap menembak PostgREST dengan anon key cuma memindahkan kegagalannya
  satu lapis lebih dalam.
*/

const KEY_NAME = 'SUPABASE_SERVICE_ROLE_KEY';

const baseEnv = (over = {}) => ({
    VITE_SUPABASE_URL: 'https://proyek.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-palsu',
    ...over,
});

const ctxOf = (env) => ({
    request: new Request('https://submit.jakpatforuniv.com/api/doku/create-payment', {
        method: 'POST',
        body: JSON.stringify({ formSubmissionId: '08ef25ac-0000-0000-0000-000000000000' }),
        headers: { 'Content-Type': 'application/json' },
    }),
    env,
});

afterEach(() => {
    vi.unstubAllGlobals();
});

/** Respons PostgREST palsu — `ok` dan badannya dikendalikan tes. */
const responseOf = (body, { ok = true, status = 200 } = {}) => ({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
});

describe('create-payment — kredensial gagal-TERTUTUP', () => {
    it('menolak dengan 500 dan MENYEBUT nama kunci saat service key hilang', async () => {
        const res = await onRequest(ctxOf(baseEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined })));

        expect(res.status).toBe(500);
        const body = await res.json();
        /*
          Pesannya harus memuat nama variabelnya. Ini satu-satunya alasan tes
          ini ada di atas sekadar "status 500": orang berikutnya yang terjebak
          akan membaca kalimat ini, dan kalimat yang cuma berbunyi "Supabase
          credentials not configured" tidak memberitahunya kunci yang MANA.
        */
        expect(JSON.stringify(body)).toContain(KEY_NAME);
    });

    it('TIDAK PERNAH turun ke anon key — nol permintaan PostgREST saat service key hilang', async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);

        await onRequest(
            ctxOf(
                baseEnv({
                    SUPABASE_SERVICE_ROLE_KEY: undefined,
                    // Kunci anon SENGAJA disediakan: inilah yang dulu diam-diam dipakai.
                    VITE_SUPABASE_ANON_KEY: 'anon-palsu',
                    SUPABASE_ANON_KEY: 'anon-palsu-2',
                }),
            ),
        );

        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('tetap menolak 500 saat URL Supabase yang hilang', async () => {
        const res = await onRequest(
            ctxOf(baseEnv({ VITE_SUPABASE_URL: undefined, SUPABASE_URL: undefined })),
        );
        expect(res.status).toBe(500);
    });
});

describe('create-payment — galat baca ≠ baris tidak ada', () => {
    it('membalas 502 saat PostgREST MENOLAK pembacaan submission', async () => {
        /*
          Bentuk badan ini bukan karangan: inilah yang benar-benar dipulangkan
          PostgREST saat `anon` menyentuh kolom yang tidak di-grant. Ia OBJEK,
          bukan array — dan itulah yang dulu lolos sebagai "tidak ditemukan".
        */
        vi.stubGlobal('fetch', vi.fn(async () =>
            responseOf(
                { code: '42501', message: 'permission denied for table form_submissions' },
                { ok: false, status: 403 },
            ),
        ));

        const res = await onRequest(ctxOf(baseEnv()));

        expect(res.status).toBe(502);
        const body = await res.json();
        expect(body.error).not.toMatch(/not found/i);
    });

    it('tetap membalas 404 saat barisnya memang TIDAK ADA', async () => {
        // Array kosong = PostgREST menjawab dengan sukses, ordernya yang tidak ada.
        vi.stubGlobal('fetch', vi.fn(async () => responseOf([], { ok: true, status: 200 })));

        const res = await onRequest(ctxOf(baseEnv()));

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toMatch(/not found/i);
    });
});
