function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sheet1");
    var data = JSON.parse(e.postData.contents);
    
    // Log untuk debugging
    console.log("Received data:", data);
    
    // Siapkan data untuk row baru - DENGAN REFERRAL_SOURCE
    var rowData = [
      data.timestamp || new Date().toISOString(),
      data.form_id || '',
      data.survey_url || '',
      data.title || '',
      data.description || '',
      data.question_count || '',
      data.criteria_responden || '',
      data.duration || '',
      data.start_date || '',
      data.end_date || '',
      data.full_name || '',
      data.email || '',
      data.phone_number || '',
      data.university || '',
      data.department || '',
      data.status || '',
      data.referral_source || '',  // FIELD BARU DITAMBAHKAN DI SINI
      data.winner_count || '',
      data.prize_per_winner || '',
      data.voucher_code || '',
      data.total_cost || '',
      data.payment_status || '',
      data.action || '',
      data.sent_at || new Date().toISOString()
    ];
    
    // Tambahkan header jika sheet kosong - DENGAN REFERRAL SOURCE
    if (sheet.getLastRow() === 0) {
      var headers = [
        'Timestamp', 'Form ID', 'Survey URL', 'Title', 'Description', 
        'Question Count', 'Criteria Responden', 'Duration', 'Start Date', 'End Date',
        'Full Name', 'Email', 'Phone Number', 'University', 'Department', 'Status',
        'Referral Source',  // HEADER BARU DITAMBAHKAN DI SINI
        'Winner Count', 'Prize Per Winner', 'Voucher Code', 'Total Cost', 
        'Payment Status', 'Action', 'Sent At'
      ];
      sheet.appendRow(headers);
    }
    
    // Tambahkan data
    sheet.appendRow(rowData);
    
    // Return JSON response
    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        message: "Data berhasil disimpan ke Google Sheets",
        timestamp: new Date().toISOString(),
        row_count: sheet.getLastRow()
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error("Error:", error);
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        message: "Error: " + error.toString(),
        timestamp: new Date().toISOString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
