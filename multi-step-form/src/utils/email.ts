import type { FormSubmission } from './supabase';

// Fungsi untuk mengirim email notifikasi pembayaran berhasil
export const sendPaymentSuccessEmail = async (formData: FormSubmission) => {
  try {
    // Untuk sementara, kita hanya log ke console
    // Nanti akan diimplementasikan dengan Resend atau layanan email lainnya
    console.log('Sending payment success email to:', formData.email);
    console.log('Email content:', generateSuccessEmailContent(formData));

    // Implementasi sebenarnya akan menggunakan API seperti Resend
    // Contoh dengan Resend:
    /*
    const resend = new Resend(import.meta.env.VITE_RESEND_API_KEY);

    await resend.emails.send({
      from: 'Jakpat for Universities <noreply@jakpatforuniv.com>',
      to: formData.email,
      subject: 'Pembayaran Berhasil - Jakpat for Universities',
      html: generateSuccessEmailContent(formData),
    });
    */

    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

// Fungsi untuk mengirim email notifikasi pembayaran gagal
export const sendPaymentFailedEmail = async (formData: FormSubmission) => {
  try {
    // Untuk sementara, kita hanya log ke console
    console.log('Sending payment failed email to:', formData.email);
    console.log('Email content:', generateFailedEmailContent(formData));

    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

// Fungsi untuk generate konten email sukses
const generateSuccessEmailContent = (formData: FormSubmission): string => {
  const formatRupiah = (amount: number) => {
    return new Intl.NumberFormat('id-ID').format(amount);
  };

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #00bcd4; margin-bottom: 10px;">Pembayaran Berhasil!</h1>
        <p style="font-size: 18px; color: #4caf50; font-weight: bold;">Terima kasih atas pembayaran Anda</p>
      </div>

      <div style="background-color: #f9f9f9; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
        <h2 style="color: #333; font-size: 18px; margin-bottom: 15px;">Detail Survey</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; width: 40%;"><strong>Judul:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${formData.title}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Durasi:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${formData.duration} hari</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Tanggal:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${formData.start_date} - ${formData.end_date}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Total Biaya:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">Rp ${formatRupiah(formData.total_cost)}</td>
          </tr>
        </table>
      </div>

      <div style="margin-bottom: 30px;">
        <p>Survey Anda akan segera dipublikasikan ke responden Jakpat. Kami akan mengirimkan notifikasi ketika survey Anda sudah aktif.</p>
        <p>Jika Anda memiliki pertanyaan, silakan hubungi tim dukungan kami di <a href="mailto:support@jakpatforuniv.com" style="color: #00bcd4;">support@jakpatforuniv.com</a>.</p>
      </div>

      <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #777; font-size: 14px;">
        <p>Terima kasih telah menggunakan layanan kami!</p>
        <p>Jakpat for Universities</p>
      </div>
    </div>
  `;
};

// Fungsi untuk generate konten email gagal
const generateFailedEmailContent = (formData: FormSubmission): string => {
  const formatRupiah = (amount: number) => {
    return new Intl.NumberFormat('id-ID').format(amount);
  };

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #f44336; margin-bottom: 10px;">Pembayaran Gagal</h1>
        <p style="font-size: 18px; color: #777; font-weight: bold;">Kami tidak dapat memproses pembayaran Anda</p>
      </div>

      <div style="background-color: #f9f9f9; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
        <h2 style="color: #333; font-size: 18px; margin-bottom: 15px;">Detail Survey</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; width: 40%;"><strong>Judul:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${formData.title}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Total Biaya:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">Rp ${formatRupiah(formData.total_cost)}</td>
          </tr>
        </table>
      </div>

      <div style="margin-bottom: 30px;">
        <p>Maaf, kami tidak dapat memproses pembayaran Anda. Silakan coba lagi dengan mengklik tombol di bawah ini:</p>
        <div style="text-align: center; margin: 20px 0;">
          <a href="${window.location.origin}/payment-retry?id=${formData.id}" style="background-color: #00bcd4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">Coba Bayar Lagi</a>
        </div>
        <p>Jika Anda terus mengalami masalah, silakan hubungi tim dukungan kami di <a href="mailto:support@jakpatforuniv.com" style="color: #00bcd4;">support@jakpatforuniv.com</a>.</p>
      </div>

      <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #777; font-size: 14px;">
        <p>Terima kasih telah menggunakan layanan kami!</p>
        <p>Jakpat for Universities</p>
      </div>
    </div>
  `;
};
