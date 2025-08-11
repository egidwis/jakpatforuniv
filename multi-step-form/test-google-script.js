// Test Google Apps Script langsung
// Jalankan dengan: node test-google-script.js

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwXDt4vaJMMjZX2nf-yUC0RljUsjETOpBbNcMOuKRRnPsFwxW-34t3yb6ZUIr3u8qOR/exec';

async function testGoogleScript() {
  console.log('🧪 Testing Google Apps Script directly...\n');

  // Test 1: GET request (untuk cek apakah script aktif)
  console.log('1️⃣ Testing GET request...');
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'GET'
    });
    
    const responseText = await response.text();
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log('Response length:', responseText.length);
    console.log('Response preview:', responseText.substring(0, 200) + '...');
    
    // Check if it's HTML error page
    if (responseText.includes('<title>Salah</title>')) {
      console.log('❌ Google Apps Script returning error page');
    }
  } catch (error) {
    console.log(`❌ GET request failed: ${error.message}`);
  }

  console.log('\n');

  // Test 2: POST dengan data minimal
  console.log('2️⃣ Testing POST with minimal data...');
  try {
    const minimalData = {
      test: true,
      timestamp: new Date().toISOString()
    };

    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(minimalData)
    });

    const responseText = await response.text();
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log('Response length:', responseText.length);
    console.log('Response preview:', responseText.substring(0, 200) + '...');
  } catch (error) {
    console.log(`❌ POST minimal data failed: ${error.message}`);
  }

  console.log('\n');

  // Test 3: POST dengan form data (application/x-www-form-urlencoded)
  console.log('3️⃣ Testing POST with form data...');
  try {
    const formData = new URLSearchParams();
    formData.append('test', 'true');
    formData.append('timestamp', new Date().toISOString());
    formData.append('form_id', 'test-form-123');

    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData
    });

    const responseText = await response.text();
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log('Response length:', responseText.length);
    console.log('Response preview:', responseText.substring(0, 200) + '...');
  } catch (error) {
    console.log(`❌ POST form data failed: ${error.message}`);
  }

  console.log('\n');

  // Test 4: POST dengan query parameters
  console.log('4️⃣ Testing POST with query parameters...');
  try {
    const queryParams = new URLSearchParams({
      test: 'true',
      timestamp: new Date().toISOString(),
      form_id: 'test-query-123'
    });

    const response = await fetch(`${GOOGLE_SCRIPT_URL}?${queryParams}`, {
      method: 'POST'
    });

    const responseText = await response.text();
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log('Response length:', responseText.length);
    console.log('Response preview:', responseText.substring(0, 200) + '...');
  } catch (error) {
    console.log(`❌ POST with query params failed: ${error.message}`);
  }

  console.log('\n');

  // Test 5: Cek headers yang dikirim
  console.log('5️⃣ Testing with different headers...');
  try {
    const testData = {
      form_id: 'test-headers-123',
      title: 'Test Survey',
      email: 'test@example.com'
    };

    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Node.js Test Script'
      },
      body: JSON.stringify(testData)
    });

    const responseText = await response.text();
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    console.log('Response length:', responseText.length);
    console.log('Response preview:', responseText.substring(0, 200) + '...');
  } catch (error) {
    console.log(`❌ POST with headers failed: ${error.message}`);
  }

  console.log('\n✅ Google Apps Script tests completed!');
  console.log('\n📝 Analysis:');
  console.log('- If all responses show HTML error page with "Salah", the script might have issues');
  console.log('- Check Google Apps Script logs in Google Cloud Console');
  console.log('- Verify the script is deployed as web app with proper permissions');
  console.log('- Make sure the script can handle POST requests with JSON data');
}

// Jalankan test
testGoogleScript().catch(console.error);
