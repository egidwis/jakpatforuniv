import type { SurveyFormData } from '../types';
import { DEFAULT_SURVEY_FORM_DATA } from './defaultFormData';
import { canUseKilatSelfServe } from './kilatAccess';

/**
 * Jenis order di wizard (Phase 5 §5.6): ditetapkan oleh PINTU yang dipakai,
 * bukan oleh draft dan bukan oleh tombol di dalam wizard.
 *
 * `/dashboard/submit-iklan?product=kilat` → Kilat, hanya untuk akun yang boleh
 * (`canUseKilatSelfServe`); selain itu → Iklan. Parameter Kilat dari akun yang
 * belum boleh DIABAIKAN, bukan ditolak — tautan yang beredar tetap mendarat di
 * wizard Iklan biasa.
 */
export type OrderProduct = 'regular' | 'kilat';

export function doorProductOf(param: string | null, email: string | null | undefined): OrderProduct {
  return param === 'kilat' && canUseKilatSelfServe(email) ? 'kilat' : 'regular';
}

export function orderProductOf(formData: Pick<SurveyFormData, 'isKilatUpgrade'>): OrderProduct {
  return formData.isKilatUpgrade ? 'kilat' : 'regular';
}

/**
 * Selaraskan formData dengan produk pintunya. Mengembalikan objek YANG SAMA
 * bila sudah selaras, supaya pemanggil di efek tidak memicu render tanpa akhir.
 *
 * Berganti produk = jadwal lama dibuang: tanggal Iklan bukan gelombang Kilat,
 * dan sebaliknya. Durasi Kilat dipaksa 1 (tidak pernah tampil); kembali ke
 * Iklan memakai durasi bawaan, karena "1" itu bukan pilihan peneliti.
 *
 * Dijalankan juga SETELAH impor Google Form di dalam wizard: impor survei lain
 * memulai dari nilai awal (`formDataForImportedSurvey`) yang selalu Iklan.
 */
export function applyOrderProduct(formData: SurveyFormData, product: OrderProduct): SurveyFormData {
  const isKilat = product === 'kilat';
  if (!!formData.isKilatUpgrade !== isKilat) {
    return {
      ...formData,
      isKilatUpgrade: isKilat,
      duration: isKilat ? 1 : DEFAULT_SURVEY_FORM_DATA.duration,
      startDate: '',
      endDate: '',
      startTime: '',
      kilatSlotHour: null,
    };
  }
  if (isKilat && formData.duration !== 1) return { ...formData, duration: 1 };
  return formData;
}
