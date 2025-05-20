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

// Endpoint to fetch survey data
app.post('/api/fetch-survey', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }
        
        const response = await axios.get(url);
        
        // Return the HTML content
        return res.json({
            html: response.data,
            url: url
        });
    } catch (error) {
        console.error('Error fetching survey:', error);
        return res.status(500).json({ 
            error: 'Failed to fetch survey data',
            message: error.message
        });
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
