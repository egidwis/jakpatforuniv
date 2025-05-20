/**
 * Extractor for Microsoft Forms
 */
class MicrosoftFormsExtractor extends BaseSurveyExtractor {
    constructor() {
        super(
            'Microsoft Forms',
            'Platform survei dari Microsoft dengan integrasi Microsoft 365',
            'https://forms.office.com/favicon.ico'
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
        return url.includes('forms.office.com') || url.includes('forms.microsoft.com');
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
        
        throw new Error('Tidak dapat mengakses Microsoft Form. Coba lagi nanti atau gunakan URL form yang berbeda.');
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
            
            // Microsoft Forms stores form data in a JSON object in a script tag
            const scriptRegex = /<script type="text\/javascript">var\s+__appState\s*=\s*(.*?);<\/script>/;
            const match = scriptRegex.exec(html);
            
            if (!match || !match[1]) {
                // Try alternative method
                return this.extractFormInfoFromHtml(html, url);
            }
            
            // Parse the JSON data
            const formData = JSON.parse(match[1]);
            
            // Extract form information
            let title = 'Tidak tersedia';
            let description = 'Tidak tersedia';
            let questionCount = 0;
            let formId = '';
            
            // Navigate through the JSON structure to find the form data
            if (formData.form && formData.form.title) {
                title = formData.form.title;
                description = formData.form.description || 'Tidak tersedia';
                
                // Count questions
                if (formData.form.questions) {
                    questionCount = Object.keys(formData.form.questions).length;
                }
                
                formId = formData.form.id || '';
            }
            
            // Check if login is required
            const requiresLogin = html.includes('Sign in to continue') || 
                                 html.includes('Please sign in');
            
            return {
                title,
                description,
                questionCount,
                formId,
                requiresLogin,
                platform: 'Microsoft Forms'
            };
        } catch (error) {
            console.error('Error fetching Microsoft Form info:', error);
            throw error;
        }
    }

    /**
     * Extract form information from HTML when JSON data is not available
     * @param {string} html - The HTML content
     * @param {string} url - The original URL
     * @returns {Object} - Form information
     */
    extractFormInfoFromHtml(html, url) {
        // Extract title from title tag
        const titleMatch = /<title>(.*?)<\/title>/.exec(html);
        const title = titleMatch ? titleMatch[1].replace(' - Microsoft Forms', '') : 'Tidak tersedia';
        
        // Try to find description
        const descriptionRegex = /<div[^>]*class="[^"]*office-form-subtitle[^"]*"[^>]*>(.*?)<\/div>/;
        const descriptionMatch = descriptionRegex.exec(html);
        const description = descriptionMatch ? descriptionMatch[1] : 'Tidak tersedia';
        
        // Count questions by looking for question containers
        const questionRegex = /<div[^>]*class="[^"]*office-form-question[^"]*"[^>]*>/g;
        const questionMatches = html.match(questionRegex);
        const questionCount = questionMatches ? questionMatches.length : 0;
        
        // Extract form ID from URL
        const formIdMatch = /[?&]id=([a-zA-Z0-9_-]+)/.exec(url);
        const formId = formIdMatch ? formIdMatch[1] : 'Tidak tersedia';
        
        // Check if login is required
        const requiresLogin = html.includes('Sign in to continue') || 
                             html.includes('Please sign in');
        
        return {
            title,
            description,
            questionCount,
            formId,
            requiresLogin,
            platform: 'Microsoft Forms',
            note: 'Informasi diekstrak dengan metode alternatif dan mungkin tidak akurat.'
        };
    }

    /**
     * Get additional platform-specific information as HTML
     * @param {Object} data - The extracted data
     * @returns {string} - HTML string with additional information
     */
    getAdditionalInfoHtml(data) {
        return `
            <h3>Informasi Tambahan Microsoft Forms</h3>
            <div class="info-item">
                <span class="info-label">ID Form:</span>
                <span class="info-value">${data.formId}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Memerlukan Login:</span>
                <span class="info-value">${data.requiresLogin ? 'Ya' : 'Tidak'}</span>
            </div>
            ${data.note ? `
            <div class="info-item">
                <span class="info-label">Catatan:</span>
                <span class="info-value">${data.note}</span>
            </div>
            ` : ''}
        `;
    }
}

// Register the extractor
surveyExtractorFactory.registerExtractor(new MicrosoftFormsExtractor());
