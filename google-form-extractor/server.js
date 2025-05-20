// Simple Node.js server to bypass CORS issues
// Install dependencies: npm install express cors axios
// Run with: node server.js

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, '/')));

// Endpoint to fetch Google Form
app.post('/api/fetch-form', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }
        
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
        
        return res.json({
            title,
            description,
            questionCount
        });
    } catch (error) {
        console.error('Error fetching form:', error);
        return res.status(500).json({ error: 'Failed to fetch form data' });
    }
});

// Default route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
