const axios = require('axios');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Get URL from query parameter
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  try {
    // Fetch the form
    const response = await axios.get(url);
    const html = response.data;

    // Extract form data from the JavaScript in the page
    const scriptRegex = /var FB_PUBLIC_LOAD_DATA_ = ([\s\S]*?);<\/script>/;
    const match = scriptRegex.exec(html);

    if (!match || !match[1]) {
      return res.status(404).json({ error: 'Form data not found' });
    }

    // Parse the JSON data
    const formData = JSON.parse(match[1]);

    // Extract relevant information
    const title = formData[1][8] || 'Not available';
    const description = formData[1][0] || 'Not available';

    // Count questions (excluding page breaks which have type 8)
    const questions = formData[1][1];
    const questionCount = questions.filter(q => q[3] !== 8).length;

    // Get additional information
    const formId = formData[14] || '';
    const isQuiz = formData[1][10] ? !!formData[1][10][0] : false;
    const requiresLogin = formData[1][10] ? !!formData[1][10][1] : false;

    return res.json({
      title,
      description,
      questionCount,
      formId,
      isQuiz,
      requiresLogin,
      platform: 'Google Forms'
    });
  } catch (error) {
    console.error('Error fetching form:', error);
    return res.status(500).json({ error: 'Failed to fetch form data' });
  }
};
