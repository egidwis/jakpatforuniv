// Test script untuk Google Sheets API
// Jalankan dengan: node test-sheets-api.js

const API_BASE_URL = 'https://4b8912c5.jakpatforuniv-submit.pages.dev';

async function testSendToSheets() {
  console.log('🧪 Testing Google Sheets API...\n');

  // Test 1: Test connection dengan OPTIONS request
  console.log('1️⃣ Testing API connection...');
  try {
    const response = await fetch(`${API_BASE_URL}/api/send-to-sheets`, {
      method: 'OPTIONS'
    });

    console.log(`✅ OPTIONS request: ${response.status} ${response.statusText}`);
    console.log('Headers:', Object.fromEntries(response.headers.entries()));
  } catch (error) {
    console.log(`❌ OPTIONS request failed: ${error.message}`);
  }

  console.log('\n');

  // Test 2: Test dengan form ID yang tidak ada (untuk test error handling)
  console.log('2️⃣ Testing with invalid form ID...');
  try {
    const response = await fetch(`${API_BASE_URL}/api/send-to-sheets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        formId: 'test-invalid-id-123',
        action: 'test'
      })
    });

    const data = await response.json();
    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.log(`❌ Test with invalid ID failed: ${error.message}`);
  }

  console.log('\n');

  // Test 3: Test tanpa form ID (untuk test validation)
  console.log('3️⃣ Testing without form ID...');
  try {
    const response = await fetch(`${API_BASE_URL}/api/send-to-sheets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'test'
      })
    });

    const data = await response.json();
    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.log(`❌ Test without form ID failed: ${error.message}`);
  }

  console.log('\n');

  // Test 4: Test dengan method yang salah
  console.log('4️⃣ Testing with wrong method...');
  try {
    const response = await fetch(`${API_BASE_URL}/api/send-to-sheets`, {
      method: 'GET'
    });

    const data = await response.json();
    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.log(`❌ Test with GET method failed: ${error.message}`);
  }

  console.log('\n');

  // Test 5: Test Google Apps Script langsung
  console.log('5️⃣ Testing Google Apps Script directly...');
  try {
    const testData = {
      timestamp: new Date().toISOString(),
      form_id: 'test-direct-call',
      survey_url: 'https://docs.google.com/forms/test',
      title: 'Test Survey Direct Call',
      description: 'Testing direct call to Google Apps Script',
      question_count: 5,
      criteria_responden: 'Test',
      duration: 1,
      start_date: '2024-01-20',
      end_date: '2024-01-21',
      full_name: 'Test User',
      email: 'test@example.com',
      phone_number: '08123456789',
      university: 'Test University',
      department: 'Test Department',
      status: 'Mahasiswa',
      winner_count: 1,
      prize_per_winner: 500,
      total_cost: 1000,
      payment_status: 'test',
      action: 'api_test',
      sent_at: new Date().toISOString()
    };

    const response = await fetch('https://script.google.com/macros/s/AKfycbwXDt4vaJMMjZX2nf-yUC0RljUsjETOpBbNcMOuKRRnPsFwxW-34t3yb6ZUIr3u8qOR/exec', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData)
    });

    const responseText = await response.text();
    console.log(`Status: ${response.status}`);
    console.log('Response text:', responseText.substring(0, 200) + (responseText.length > 200 ? '...' : ''));

    // Try to parse as JSON
    try {
      const jsonData = JSON.parse(responseText);
      console.log('Parsed JSON:', JSON.stringify(jsonData, null, 2));
    } catch (parseError) {
      console.log('Response is not JSON format');
    }
  } catch (error) {
    console.log(`❌ Direct Google Apps Script test failed: ${error.message}`);
  }

  console.log('\n✅ All tests completed!');
}

// Jalankan test
testSendToSheets().catch(console.error);
