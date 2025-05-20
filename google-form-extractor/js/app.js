document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const formUrlInput = document.getElementById('form-url');
    const extractBtn = document.getElementById('extract-btn');
    const clearBtn = document.getElementById('clear-btn');
    const loadingElement = document.getElementById('loading');
    const errorMessageElement = document.getElementById('error-message');
    const resultContainer = document.getElementById('result-container');
    const formTitleElement = document.getElementById('form-title');
    const formDescriptionElement = document.getElementById('form-description');
    const questionCountElement = document.getElementById('question-count');

    // CORS Proxy URLs - try different ones if one fails
    const corsProxies = [
        'https://corsproxy.io/?',
        'https://cors-anywhere.herokuapp.com/',
        'https://api.allorigins.win/raw?url='
    ];

    // Event Listeners
    extractBtn.addEventListener('click', extractFormInfo);
    clearBtn.addEventListener('click', clearForm);
    formUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            extractFormInfo();
        }
    });

    // Main function to extract form info
    async function extractFormInfo() {
        const formUrl = formUrlInput.value.trim();
        
        if (!formUrl) {
            showError('Silakan masukkan URL Google Form.');
            return;
        }

        if (!isValidGoogleFormUrl(formUrl)) {
            showError('URL tidak valid. Pastikan URL dimulai dengan "https://docs.google.com/forms/"');
            return;
        }

        // Reset UI
        hideError();
        hideResults();
        showLoading();

        // Try each CORS proxy until one works
        for (const proxy of corsProxies) {
            try {
                const result = await fetchFormInfo(proxy + formUrl);
                if (result) {
                    displayResults(result);
                    hideLoading();
                    return;
                }
            } catch (error) {
                console.error(`Error with proxy ${proxy}:`, error);
                // Continue to next proxy
            }
        }

        // If all proxies fail
        hideLoading();
        showError('Tidak dapat mengakses form. Coba lagi nanti atau gunakan URL form yang berbeda.');
    }

    // Function to fetch form info using a proxy
    async function fetchFormInfo(proxyUrl) {
        try {
            const response = await axios.get(proxyUrl);
            const html = response.data;
            
            // Extract form data from the JavaScript in the page
            const scriptRegex = /var FB_PUBLIC_LOAD_DATA_ = ([\s\S]*?);<\/script>/;
            const match = scriptRegex.exec(html);
            
            if (!match || !match[1]) {
                throw new Error('Tidak dapat menemukan data form.');
            }
            
            // Parse the JSON data
            const formData = JSON.parse(match[1]);
            
            // Extract relevant information
            const title = formData[1][8] || 'Tidak tersedia';
            const description = formData[1][0] || 'Tidak tersedia';
            
            // Count questions (excluding page breaks which have type 8)
            const questions = formData[1][1];
            const questionCount = questions.filter(q => q[3] !== 8).length;
            
            return {
                title,
                description,
                questionCount
            };
        } catch (error) {
            console.error('Error fetching form info:', error);
            throw error;
        }
    }

    // Function to validate Google Form URL
    function isValidGoogleFormUrl(url) {
        return url.startsWith('https://docs.google.com/forms/') || 
               url.startsWith('http://docs.google.com/forms/');
    }

    // UI Helper Functions
    function showLoading() {
        loadingElement.style.display = 'block';
    }

    function hideLoading() {
        loadingElement.style.display = 'none';
    }

    function showError(message) {
        errorMessageElement.textContent = message;
        errorMessageElement.style.display = 'block';
    }

    function hideError() {
        errorMessageElement.style.display = 'none';
    }

    function displayResults(formInfo) {
        formTitleElement.textContent = formInfo.title;
        formDescriptionElement.textContent = formInfo.description;
        questionCountElement.textContent = formInfo.questionCount;
        resultContainer.style.display = 'block';
    }

    function hideResults() {
        resultContainer.style.display = 'none';
    }

    function clearForm() {
        formUrlInput.value = '';
        hideError();
        hideResults();
    }

    // Alternative method using a serverless function (commented out for now)
    /*
    async function fetchFormInfoViaServerless(formUrl) {
        try {
            // Replace with your serverless function URL
            const serverlessUrl = 'https://your-serverless-function.netlify.app/.netlify/functions/get-form-info';
            const response = await axios.post(serverlessUrl, { url: formUrl });
            return response.data;
        } catch (error) {
            console.error('Error fetching via serverless:', error);
            throw error;
        }
    }
    */
});
