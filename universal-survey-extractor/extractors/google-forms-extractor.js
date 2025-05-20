/**
 * Extractor for Google Forms
 */
class GoogleFormsExtractor extends BaseSurveyExtractor {
    constructor() {
        super(
            'Google Forms',
            'Platform survei gratis dari Google dengan integrasi Google Workspace',
            'https://www.gstatic.com/images/branding/product/2x/forms_48dp.png'
        );
        
        // CORS Proxy URLs - try different ones if one fails
        this.corsProxies = [
            'https://corsproxy.io/?',
            'https://cors-anywhere.herokuapp.com/',
            'https://api.allorigins.win/raw?url='
        ];
    }

    /**
     * Check if this extractor can handle the given URL
     * @param {string} url - The URL to check
     * @returns {boolean} - True if this extractor can handle the URL
     */
    canHandle(url) {
        return url.includes('docs.google.com/forms');
    }

    /**
     * Extract survey information from the given URL
     * @param {string} url - The URL to extract from
     * @returns {Promise<Object>} - Promise resolving to survey information
     */
    async extract(url) {
        // Try each CORS proxy until one works
        for (const proxy of this.corsProxies) {
            try {
                const result = await this.fetchFormInfo(proxy + url);
                if (result) {
                    return result;
                }
            } catch (error) {
                console.error(`Error with proxy ${proxy}:`, error);
                // Continue to next proxy
            }
        }
        
        throw new Error('Tidak dapat mengakses form. Coba lagi nanti atau gunakan URL form yang berbeda.');
    }

    /**
     * Fetch form information using a proxy
     * @param {string} proxyUrl - The proxy URL to use
     * @returns {Promise<Object>} - Promise resolving to form information
     */
    async fetchFormInfo(proxyUrl) {
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
            
            // Get additional information
            const formId = formData[14] || '';
            const isQuiz = formData[1][10] ? !!formData[1][10][0] : false;
            const requiresLogin = formData[1][10] ? !!formData[1][10][1] : false;
            const acceptingResponses = formData[1][10] ? !formData[1][10][6] : true;
            
            return {
                title,
                description,
                questionCount,
                formId,
                isQuiz,
                requiresLogin,
                acceptingResponses,
                platform: 'Google Forms'
            };
        } catch (error) {
            console.error('Error fetching form info:', error);
            throw error;
        }
    }

    /**
     * Get additional platform-specific information as HTML
     * @param {Object} data - The extracted data
     * @returns {string} - HTML string with additional information
     */
    getAdditionalInfoHtml(data) {
        return `
            <h3>Informasi Tambahan Google Forms</h3>
            <div class="info-item">
                <span class="info-label">ID Form:</span>
                <span class="info-value">${data.formId}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Jenis:</span>
                <span class="info-value">${data.isQuiz ? 'Kuis' : 'Formulir'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Memerlukan Login:</span>
                <span class="info-value">${data.requiresLogin ? 'Ya' : 'Tidak'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Menerima Respons:</span>
                <span class="info-value">${data.acceptingResponses ? 'Ya' : 'Tidak'}</span>
            </div>
        `;
    }
}

// Register the extractor
surveyExtractorFactory.registerExtractor(new GoogleFormsExtractor());
