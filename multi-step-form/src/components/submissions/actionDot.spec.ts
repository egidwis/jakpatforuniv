import { describe, it, expect } from 'vitest';
import { getSubmissionActionDot } from './lifecycle';
import type { LifecycleInfo } from './lifecycle';

/*
  P5 — titik notifikasi baris Submissions berhenti menagih sumbu HALAMAN.

  Dua janji yang dijaga di sini:

    1. Pekerjaan halaman tidak lagi melahirkan titik. Admin yang melayani
       reservasi bukan orang yang membuat halaman; alarmnya pindah ke papan
       Jadwal.
    2. Cabang ABU "slot kedaluwarsa" akhirnya terjangkau. Cabang halaman dulu
       duduk DI ANTARA dua cabang `isScheduleActive`, jadi order kedaluwarsa
       yang bannernya masih bawaan mendapat titik MERAH halaman — menutupi abu
       yang seharusnya muncul.
*/

const lifecycleOf = (over: Partial<LifecycleInfo> = {}): LifecycleInfo => ({
    stage: 'reserved',
    displayStatus: 'approved',
    isPaid: false,
    isRejectedEvent: false,
    isLegacyActive: false,
    isActuallyExpired: false,
    hasValidSchedule: true,
    isPending: false,
    canReserveSlot: true,
    canPay: true,
    canBuildPage: false,
    pageStatus: 'none',
    slotExpiresAt: null,
    needsScheduleFollowUp: false,
    ...over,
});

describe('getSubmissionActionDot', () => {
    it('order yang menunggu review tetap merah', () => {
        expect(getSubmissionActionDot(lifecycleOf({ displayStatus: 'in_review' }))?.type).toBe('red');
    });

    it('order yang menunggu jadwal / perlu tagihan tetap merah', () => {
        expect(getSubmissionActionDot(lifecycleOf())?.type).toBe('red');
    });

    it('order yang menunggu pembayaran peneliti memberi ABU, bukan merah', () => {
        // Tagihan sudah terbit, admin tidak perlu aksi apa-apa -> indikator abu-abu
        const dot = getSubmissionActionDot(lifecycleOf({ stage: 'awaiting_payment', isPending: true, isActuallyExpired: false }));
        expect(dot).toEqual({ type: 'gray', label: 'Menunggu pembayaran peneliti' });
    });

    it('slot kedaluwarsa memberi MERAH, bukan abu-abu', () => {
        // Slot kedaluwarsa memerlukan tindakan admin (ganti tanggal / batalkan / buat tagihan baru) -> merah
        const dot = getSubmissionActionDot(lifecycleOf({ isActuallyExpired: true }));
        expect(dot).toEqual({ type: 'red', label: 'Perlu tindakan: Slot kedaluwarsa' });
    });

    it('order lunas yang halamannya masih draft TIDAK memberi titik', () => {
        // Dulu: merah "Perlu tindakan: Publikasikan Halaman".
        const dot = getSubmissionActionDot(lifecycleOf({
            stage: 'paid', isPaid: true, canBuildPage: true, pageStatus: 'drafted',
        }));
        expect(dot).toBeNull();
    });

    it('order tayang yang bannernya masih bawaan TIDAK memberi titik', () => {
        // Dulu: merah "Perlu tindakan: Upload Banner Iklan" — 2 order di
        // produksi, keduanya sudah dihitung pil papan Jadwal.
        const dot = getSubmissionActionDot(lifecycleOf({
            stage: 'live', isPaid: true, canBuildPage: true, pageStatus: 'live',
        }));
        expect(dot).toBeNull();
    });

    it('order spam / dibatalkan tetap senyap', () => {
        expect(getSubmissionActionDot(lifecycleOf({ displayStatus: 'spam' }))).toBeNull();
        expect(getSubmissionActionDot(lifecycleOf({ stage: 'cancelled' }))).toBeNull();
    });
});

describe('getSubmissionActionDot — reservasi menahan kuota, tagihan mati', () => {
    /*
      Bug yang dilaporkan: tagihan dibatalkan sementara reservasi masih
      menahan slot, dan daftar admin tidak memberi tanda apa pun.

      Sebabnya STRUKTURAL: deriveLifecycle hanya menerima kolom
      form_submissions, jadi fungsi ini tidak pernah melihat ad_schedules.
      Input yang hilang, bukan cabang yang hilang.
    */
    it('reservasi menahan kuota tanpa tagihan hidup → MERAH', () => {
        const dot = getSubmissionActionDot(lifecycleOf({
            stage: 'paid', isPaid: true, needsScheduleFollowUp: true,
        }));
        expect(dot).toEqual({ type: 'red', label: 'Perlu tindakan: Reservasi tanpa tagihan hidup' });
    });

    /*
      ⚠️ TES YANG MENGUNCI KOREKSI 2026-09-12.

      Diukur ke produksi: 24 jadwal bertanggal depan ber-slot_booked_by, dan
      SEMUANYA payment_status='paid'. Syarat dot versi pertama spec (tanpa
      klausa "belum lunas") akan menyalakan 24 titik merah yang seluruhnya
      tidak punya pekerjaan — persis kegagalan yang dikutip lifecycle.ts:233
      sebagai pelajaran ("menagih admin yang salah").

      Klausa "belum lunas" ditegakkan di sisi PERAKIT sinyal (InternalDashboard);
      di sini yang dijaga adalah kontraknya: sinyal false = diam.
    */
    it('tanpa sinyal → tidak ada titik tambahan (order lunas tetap diam)', () => {
        const dot = getSubmissionActionDot(lifecycleOf({
            stage: 'paid', isPaid: true, needsScheduleFollowUp: false,
        }));
        expect(dot).toBeNull();
    });

    it('sinyal TIDAK menang atas pekerjaan review', () => {
        // Review tetap presedens tertinggi — dot-nya sudah merah, dan
        // labelnya tidak boleh tertukar.
        const dot = getSubmissionActionDot(lifecycleOf({
            displayStatus: 'in_review', needsScheduleFollowUp: true,
        }));
        expect(dot?.label).toBe('Perlu tindakan di tab Review');
    });

    it('order spam/dibatalkan tetap senyap meski sinyalnya menyala', () => {
        expect(getSubmissionActionDot(lifecycleOf({
            displayStatus: 'spam', needsScheduleFollowUp: true,
        }))).toBeNull();
        expect(getSubmissionActionDot(lifecycleOf({
            stage: 'cancelled', needsScheduleFollowUp: true,
        }))).toBeNull();
    });
});
