document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const surveyUrlInput = document.getElementById('survey-url');
    const extractBtn = document.getElementById('extract-btn');
    const clearBtn = document.getElementById('clear-btn');
    const loadingElement = document.getElementById('loading');
    const errorMessageElement = document.getElementById('error-message');
    const resultContainer = document.getElementById('result-container');
    const surveyTitleElement = document.getElementById('survey-title');
    const surveyDescriptionElement = document.getElementById('survey-description');
    const questionCountElement = document.getElementById('question-count');
    const additionalInfoElement = document.getElementById('additional-info');
    const platformInfoElement = document.getElementById('platform-info');
    const platformNameElement = document.getElementById('platform-name');
    const platformDescriptionElement = document.getElementById('platform-description');
    const platformIconElement = document.getElementById('platform-icon-img');

    // Event Listeners
    extractBtn.addEventListener('click', extractSurveyInfo);
    clearBtn.addEventListener('click', clearForm);
    surveyUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            extractSurveyInfo();
        }
    });
    
    // Input change listener to detect platform
    surveyUrlInput.addEventListener('input', detectPlatform);

    /**
     * Detect the survey platform based on the URL
     */
    function detectPlatform() {
        const url = surveyUrlInput.value.trim();
        
        if (!url) {
            hidePlatformInfo();
            return;
        }
        
        try {
            const extractor = surveyExtractorFactory.getExtractor(url);
            showPlatformInfo(extractor);
        } catch (error) {
            hidePlatformInfo();
        }
    }

    /**
     * Show platform information
     * @param {BaseSurveyExtractor} extractor - The extractor for the detected platform
     */
    function showPlatformInfo(extractor) {
        platformNameElement.textContent = extractor.name;
        platformDescriptionElement.textContent = extractor.description;
        platformIconElement.src = extractor.iconUrl;
        platformInfoElement.style.display = 'flex';
    }

    /**
     * Hide platform information
     */
    function hidePlatformInfo() {
        platformInfoElement.style.display = 'none';
    }

    /**
     * Main function to extract survey information
     */
    async function extractSurveyInfo() {
        const url = surveyUrlInput.value.trim();
        
        if (!url) {
            showError('Silakan masukkan URL survei.');
            return;
        }

        // Reset UI
        hideError();
        hideResults();
        showLoading();

        try {
            // Get the appropriate extractor for the URL
            const extractor = surveyExtractorFactory.getExtractor(url);
            
            // Extract survey information
            const result = await extractor.extract(url);
            
            // Display results
            displayResults(result, extractor);
        } catch (error) {
            console.error('Error extracting survey info:', error);
            showError(error.message || 'Terjadi kesalahan saat mengekstrak informasi survei.');
        } finally {
            hideLoading();
        }
    }

    /**
     * Display the extracted survey information
     * @param {Object} surveyInfo - The extracted survey information
     * @param {BaseSurveyExtractor} extractor - The extractor used
     */
    function displayResults(surveyInfo, extractor) {
        surveyTitleElement.textContent = surveyInfo.title;
        surveyDescriptionElement.textContent = surveyInfo.description;
        questionCountElement.textContent = surveyInfo.questionCount;
        
        // Add platform-specific additional information
        additionalInfoElement.innerHTML = extractor.getAdditionalInfoHtml(surveyInfo);
        
        resultContainer.style.display = 'block';
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

    function hideResults() {
        resultContainer.style.display = 'none';
    }

    function clearForm() {
        surveyUrlInput.value = '';
        hideError();
        hideResults();
        hidePlatformInfo();
    }
});
