import { describe, expect, test } from 'vitest';
import { bookedByLabel, bookedByActor } from './bookedBy';

/*
  KENAPA TES INI ADA.

  `slot_booked_by` sudah tampil di TIGA permukaan dengan TIGA kata berbeda, dan
  hilang sama sekali di dua permukaan yang paling dibaca admin. Dua di antaranya
  memajang nilai kolom MENTAH — kata `user`, yang tidak dipakai siapa pun saat
  bicara.

  Yang dikunci di sini adalah aturannya, bukan tampilannya:

    TIGA KEADAAN, BUKAN DUA. `NULL` berarti "tak seorang pun pernah memesannya"
    — 705 baris produksi (diukur 2026-09-11) — dan itu BUKAN "dipesan admin".
    `scheduleCardActions.ts` sudah memakai perbedaan itu sebagai gerbang
    "Kabari via WA": mengabari "slot Anda sudah dipesan" untuk reservasi yang
    tak pernah terjadi adalah kebohongan yang tepat berbahaya.

  Ini juga bukan kosmetik — ia menjelaskan PERILAKU. `slotHold.ts` hanya melepas
  hold `slot_booked_by='user'`; jadwal admin tidak pernah lepas sendiri. Labelnya
  memberi tahu admin kenapa satu slot punya timer dan yang lain tidak.
*/

describe('bookedByActor — tiga keadaan', () => {
  test("'user' = peneliti", () => {
    expect(bookedByActor('user')).toBe('researcher');
  });

  test("'customer' diperlakukan sama dengan 'user'", () => {
    // Nilai warisan. `ScheduleCardList` sudah menoleransinya; helper ini
    // mewarisi toleransi itu supaya permukaan lain tidak menampilkan "Admin"
    // untuk slot yang dipesan penelitinya sendiri.
    expect(bookedByActor('customer')).toBe('researcher');
  });

  test("'admin' = admin", () => {
    expect(bookedByActor('admin')).toBe('admin');
  });

  test('NULL = belum dipesan siapa pun — BUKAN admin', () => {
    expect(bookedByActor(null)).toBe('nobody');
    expect(bookedByActor(undefined)).toBe('nobody');
    expect(bookedByActor('')).toBe('nobody');
  });

  test('nilai tak dikenal jatuh ke admin, bukan ke "belum dipesan"', () => {
    // Gagal ke arah yang jujur: barisnya JELAS punya pemesan (kolomnya terisi),
    // hanya kata itu yang tidak kita kenal. Memetakannya ke 'nobody' akan
    // menghapus fakta bahwa slot itu dipesan seseorang.
    expect(bookedByActor('ops')).toBe('admin');
  });

  test('casing & spasi tidak mengubah jawaban', () => {
    expect(bookedByActor('  USER ')).toBe('researcher');
    expect(bookedByActor('Admin')).toBe('admin');
  });
});

describe('bookedByLabel — kata yang dibaca manusia', () => {
  test('peneliti', () => {
    expect(bookedByLabel('user')).toBe('Slot dipesan peneliti');
    expect(bookedByLabel('customer')).toBe('Slot dipesan peneliti');
  });

  test('admin', () => {
    expect(bookedByLabel('admin')).toBe('Slot dipesan admin');
  });

  test('belum dipesan', () => {
    expect(bookedByLabel(null)).toBe('Slot belum dipesan');
  });

  test('tidak pernah memulangkan nilai kolom mentah', () => {
    // Cacat yang ditutup: `CampaignActions` memajang "Booked By: User" dan
    // `ScheduleEntryDrawer` "· dipesan user".
    for (const raw of ['user', 'customer', 'admin', null, undefined, 'ops']) {
      const label = bookedByLabel(raw);
      expect(label.toLowerCase()).not.toContain('user');
      expect(label.toLowerCase()).not.toContain('customer');
    }
  });

  test('cakupan ORDER memakai kata yang berbeda', () => {
    // Sesudah Phase 4, satu order bisa punya jadwal pertama yang dipesan admin
    // dan jadwal kedua yang dipesan penelitinya sendiri. Permukaan ORDER wajib
    // menyebut cakupannya, kalau tidak admin melihat dua jawaban berbeda untuk
    // satu pertanyaan.
    expect(bookedByLabel('user', { scope: 'order' })).toBe('Slot pertama dipesan peneliti');
    expect(bookedByLabel(null, { scope: 'order' })).toBe('Slot pertama belum dipesan');
  });
});
