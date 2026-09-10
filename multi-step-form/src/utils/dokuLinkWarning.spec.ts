import { describe, it, expect } from 'vitest';
import { dokuLinkWarning } from './dokuLinkWarning';

/*
  Yang dijaga: pesan ini tidak boleh kembali jadi satu paragraf padat yang
  mengulang dirinya sendiri, DAN tidak boleh kehilangan satu pun dari tiga hal
  yang admin butuhkan — kesadaran, tindakan, sebab.
*/

const ID = 'JFU-INV-5b73a8-1789044625252';
const SEBAB = 'fitur Cancel Order belum aktif di akun DOKU';

describe('dokuLinkWarning', () => {
  it('judulnya menyebut yang paling perlu disadari: link-nya MASIH aktif', () => {
    const w = dokuLinkWarning('cancelled', ID, SEBAB);
    expect(w.title).toContain('masih aktif');
    // Nomor tagihan turun ke deskripsi — judul yang memuatnya jadi terlalu
    // panjang untuk dibaca sekilas, dan itu keluhan aslinya.
    expect(w.title).not.toContain(ID);
  });

  it('deskripsinya memuat KETIGA hal: subjek, tindakan, sebab', () => {
    const w = dokuLinkWarning('cancelled', ID, SEBAB);
    expect(w.description).toContain(ID);
    expect(w.description).toContain('Beri tahu penelitinya');
    expect(w.description).toContain(SEBAB);
  });

  it('tanpa sebab, tidak menulis baris "tidak diketahui" yang mengatakan nol', () => {
    const w = dokuLinkWarning('cancelled', ID, null);
    expect(w.description).not.toContain('Sebab:');
    expect(w.description).toContain('Beri tahu penelitinya');
  });

  it('sebab yang hanya spasi diperlakukan sebagai tidak ada', () => {
    expect(dokuLinkWarning('cancelled', ID, '   ').description).not.toContain('Sebab:');
  });

  it('varian `settled` menyebut LUNAS, bukan dibatalkan — keduanya tidak boleh tertukar', () => {
    const w = dokuLinkWarning('settled', '3 pesanan', SEBAB);
    expect(w.title).toContain('Ditandai lunas');
    expect(w.title).not.toContain('Dibatalkan');
    expect(w.description).toContain('3 pesanan');
  });

  it('tidak mengulang akibat yang sudah ada di judul', () => {
    // Keluhan aslinya: "link lamanya mungkin masih bisa dibayar" muncul dua
    // kali dalam satu pesan.
    const w = dokuLinkWarning('cancelled', ID, SEBAB);
    const gabungan = `${w.title} ${w.description}`.toLowerCase();
    expect(gabungan.split('masih aktif').length - 1).toBe(1);
  });
});
