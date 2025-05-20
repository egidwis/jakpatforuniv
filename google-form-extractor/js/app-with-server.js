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

    // API endpoint (local server)
    const API_ENDPOINT = '/api/fetch-form';

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

        try {
            const result = await fetchFormInfo(formUrl);
            displayResults(result);
        } catch (error) {
            showError('Tidak dapat mengakses form: ' + error.message);
        } finally {
            hideLoading();
        }
    }

    // Function to fetch form info using our server
    async function fetchFormInfo(formUrl) {
        try {
            const response = await axios.post(API_ENDPOINT, { url: formUrl });
            return response.data;
        } catch (error) {
            console.error('Error fetching form info:', error);
            if (error.response) {
                throw new Error(error.response.data.error || 'Server error');
            } else if (error.request) {
                throw new Error('Tidak dapat terhubung ke server. Pastikan server berjalan.');
            } else {
                throw error;
            }
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
});
