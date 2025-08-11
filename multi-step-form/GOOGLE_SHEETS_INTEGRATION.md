# Google Sheets Integration

Dokumentasi untuk integrasi pengiriman data dari Supabase ke Google Sheets menggunakan Cloudflare Functions.

## Overview

Sistem ini secara otomatis mengirim data form submission dari database Supabase ke Google Sheets menggunakan Google Apps Script web app yang sudah di-deploy.

## Komponen

### 1. Cloudflare Function: `/api/send-to-sheets`
**File:** `functions/api/send-to-sheets.js`

Function ini bertanggung jawab untuk:
- Mengambil data form submission dari Supabase berdasarkan ID
- Mengirim data ke Google Apps Script web app
- Menangani error dan retry logic

**Endpoint:** `POST /api/send-to-sheets`

**Request Body:**
```json
{
  "formId": "uuid-form-submission-id",
  "action": "send" // optional: send, form_submission, payment_success, test
}
```

**Response:**
```json
{
  "success": true,
  "message": "Data successfully sent to Google Sheets",
  "form_id": "uuid-form-submission-id",
  "sheets_response": {...},
  "sent_at": "2024-01-20T10:30:00.000Z"
}
```

### 2. Client Service: `sheets-service.ts`
**File:** `src/utils/sheets-service.ts`

Utility functions untuk memanggil send-to-sheets API dari frontend:

- `sendToGoogleSheets()` - Kirim data dengan error handling
- `sendToGoogleSheetsWithRetry()` - Kirim data dengan retry mechanism
- `sendToGoogleSheetsBackground()` - Kirim data di background tanpa blocking UI

### 3. Google Apps Script Web App
**URL:** `https://script.google.com/macros/s/AKfycbwOQzDhxJ88ms5EyNCEunzxi6B74KIK5rAT6QPaxPTqjexJsHritaEpnPt6wCA9q7Vj/exec`

Web app yang menerima data dari Cloudflare Function dan menyimpannya ke Google Sheets.

## Trigger Points

### 1. Form Submission
**File:** `src/components/StepThree.tsx`

Setelah data berhasil disimpan ke Supabase, sistem otomatis mengirim data ke Google Sheets:

```typescript
// Kirim data ke Google Sheets secara background
if (savedData && savedData.id) {
  console.log('Mengirim data ke Google Sheets untuk form ID:', savedData.id);
  sendToGoogleSheetsBackground(savedData.id, 'form_submission');
}
```

### 2. Payment Success Webhook
**File:** `functions/webhook.js`

Setelah payment berhasil, sistem mengirim update ke Google Sheets:

```javascript
// Kirim data ke Google Sheets setelah payment berhasil
const sheetsResponse = await fetch(`${baseUrl}/api/send-to-sheets`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    formId: transaction.form_submission_id,
    action: 'payment_success'
  })
});
```

## Data Structure

Data yang dikirim ke Google Sheets:

```javascript
{
  // Informasi dasar
  timestamp: "2024-01-20T10:30:00.000Z",
  form_id: "uuid",

  // Data survey
  survey_url: "https://docs.google.com/forms/...",
  title: "Survey Title",
  description: "Survey Description",
  question_count: 10,
  criteria_responden: "Mahasiswa",

  // Durasi dan tanggal
  duration: 7,
  start_date: "2024-01-20",
  end_date: "2024-01-27",

  // Data personal
  full_name: "John Doe",
  email: "john@example.com",
  phone_number: "08123456789",
  university: "Universitas ABC",
  department: "Teknik Informatika",
  status: "Mahasiswa",
  referral_source: "Friend",

  // Data insentif
  winner_count: 5,
  prize_per_winner: 10000,
  voucher_code: "DISCOUNT10",
  total_cost: 50000,

  // Status
  payment_status: "completed",

  // Metadata
  action: "form_submission",
  sent_at: "2024-01-20T10:30:00.000Z"
}
```

## Testing

### Manual Testing
Akses halaman test: `/test-sheets.html`

Halaman ini memungkinkan testing manual dengan:
1. Input Form Submission ID
2. Pilih action type
3. Test connection ke API
4. Send data ke Google Sheets

### Programmatic Testing
```javascript
import { sendToGoogleSheets } from './src/utils/sheets-service';

// Test send data
try {
  const result = await sendToGoogleSheets('form-id-123', 'test');
  console.log('Success:', result);
} catch (error) {
  console.error('Error:', error);
}
```

## Error Handling

### Client Side
- Retry mechanism dengan exponential backoff
- Background sending untuk tidak mengganggu UX
- User-friendly error messages

### Server Side
- Validasi input data
- Error logging untuk debugging
- Graceful degradation jika Google Sheets tidak available

## Deployment

1. **Cloudflare Function** sudah otomatis ter-deploy dengan aplikasi
2. **Google Apps Script** sudah di-deploy di URL yang disediakan
3. **Environment Variables** yang diperlukan:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

## Monitoring

### Logs
- Check Cloudflare Functions logs untuk debugging
- Console logs di browser untuk client-side issues
- Google Apps Script logs untuk server-side Google Sheets issues

### Success Indicators
- Response `success: true` dari API
- Data muncul di Google Sheets
- No error logs di console

## Troubleshooting

### Common Issues

1. **Form ID not found**
   - Pastikan form submission sudah tersimpan di Supabase
   - Check format UUID yang benar

2. **Google Apps Script timeout**
   - Retry otomatis akan dilakukan
   - Check Google Apps Script logs

3. **CORS issues**
   - Function sudah include CORS headers
   - Check browser network tab untuk details

4. **Environment variables missing**
   - Pastikan Supabase credentials ter-configure di Cloudflare

### Debug Steps
1. Test connection dengan `/test-sheets.html`
2. Check browser console untuk client errors
3. Check Cloudflare Functions logs
4. Verify data di Supabase database
5. Check Google Apps Script execution logs
