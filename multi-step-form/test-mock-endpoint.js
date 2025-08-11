// Test mock endpoint langsung
const API_BASE_URL = 'https://4b8912c5.jakpatforuniv-submit.pages.dev';

async function testMockEndpoint() {
  console.log('🧪 Testing Mock Endpoint...\n');

  // Test mock endpoint langsung
  console.log('1️⃣ Testing mock endpoint directly...');
  try {
    const testData = {
      form_id: 'test-mock-123',
      title: 'Test Survey Mock',
      email: 'test@example.com',
      action: 'test'
    };

    const response = await fetch(`${API_BASE_URL}/api/mock-sheets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData)
    });

    const data = await response.json();
    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.log(`❌ Mock endpoint test failed: ${error.message}`);
  }

  console.log('\n');

  // Test dengan data yang lebih lengkap
  console.log('2️⃣ Testing with complete data...');
  try {
    const completeData = {
      timestamp: new Date().toISOString(),
      form_id: 'test-complete-456',
      survey_url: 'https://docs.google.com/forms/test',
      title: 'Complete Test Survey',
      description: 'Testing with complete data set',
      question_count: 10,
      criteria_responden: 'Mahasiswa',
      duration: 7,
      start_date: '2024-01-20',
      end_date: '2024-01-27',
      full_name: 'Test User Complete',
      email: 'complete@example.com',
      phone_number: '08123456789',
      university: 'Test University',
      department: 'Test Department',
      status: 'Mahasiswa',
      winner_count: 5,
      prize_per_winner: 10000,
      total_cost: 50000,
      payment_status: 'completed',
      action: 'complete_test',
      sent_at: new Date().toISOString()
    };

    const response = await fetch(`${API_BASE_URL}/api/mock-sheets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(completeData)
    });

    const data = await response.json();
    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.log(`❌ Complete data test failed: ${error.message}`);
  }

  console.log('\n✅ Mock endpoint tests completed!');
}

testMockEndpoint().catch(console.error);
