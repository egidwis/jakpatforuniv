/**
 * Extractor for Typeform
 */
class TypeformExtractor extends BaseSurveyExtractor {
    constructor() {
        super(
            'Typeform',
            'Platform survei dengan desain yang elegan dan pengalaman pengguna yang menarik',
            'https://www.typeform.com/favicon.ico'
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
        return url.includes('typeform.com');
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
                const result = await this.fetchTypeformInfo(proxy + url);
                if (result) {
                    return result;
                }
            } catch (error) {
                console.error(`Error with proxy ${proxy}:`, error);
                // Continue to next proxy
            }
        }
        
        throw new Error('Tidak dapat mengakses Typeform. Coba lagi nanti atau gunakan URL form yang berbeda.');
    }

    /**
     * Fetch Typeform information using a proxy
     * @param {string} proxyUrl - The proxy URL to use
     * @returns {Promise<Object>} - Promise resolving to form information
     */
    async fetchTypeformInfo(proxyUrl) {
        try {
            const response = await axios.get(proxyUrl);
            const html = response.data;
            
            // Typeform stores form data in a JSON object in a script tag
            const scriptRegex = /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/;
            const match = scriptRegex.exec(html);
            
            if (!match || !match[1]) {
                // Try alternative method for older Typeforms
                return this.extractTypeformInfoFromHtml(html, url);
            }
            
            // Parse the JSON data
            const formData = JSON.parse(match[1]);
            
            // Extract form information from the complex JSON structure
            let title = 'Tidak tersedia';
            let description = 'Tidak tersedia';
            let questionCount = 0;
            let formId = '';
            
            // Navigate through the JSON structure to find the form data
            if (formData.props && formData.props.pageProps && formData.props.pageProps.formData) {
                const typeformData = formData.props.pageProps.formData;
                title = typeformData.title || 'Tidak tersedia';
                description = typeformData.welcome_screens?.[0]?.description || 'Tidak tersedia';
                
                // Count questions (excluding welcome screens, thank you screens, etc.)
                if (typeformData.fields) {
                    questionCount = typeformData.fields.length;
                }
                
                formId = typeformData.id || '';
            }
            
            return {
                title,
                description,
                questionCount,
                formId,
                platform: 'Typeform'
            };
        } catch (error) {
            console.error('Error fetching Typeform info:', error);
            throw error;
        }
    }

    /**
     * Extract Typeform information from HTML for older Typeforms
     * @param {string} html - The HTML content
     * @param {string} url - The original URL
     * @returns {Object} - Form information
     */
    extractTypeformInfoFromHtml(html, url) {
        // Extract title from title tag
        const titleMatch = /<title>(.*?)<\/title>/.exec(html);
        const title = titleMatch ? titleMatch[1] : 'Tidak tersedia';
        
        // Try to find description in meta tags
        const descriptionMatch = /<meta name="description" content="(.*?)"/.exec(html);
        const description = descriptionMatch ? descriptionMatch[1] : 'Tidak tersedia';
        
        // Count questions by looking for question containers
        // This is a rough estimate as Typeform's structure can vary
        const questionRegex = /<div[^>]*data-qa="question-[^"]*"[^>]*>/g;
        const questionMatches = html.match(questionRegex);
        const questionCount = questionMatches ? questionMatches.length : 0;
        
        // Extract form ID from URL
        const formIdMatch = /typeform\.com\/to\/([a-zA-Z0-9]+)/.exec(url);
        const formId = formIdMatch ? formIdMatch[1] : 'Tidak tersedia';
        
        return {
            title,
            description,
            questionCount,
            formId,
            platform: 'Typeform',
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
            <h3>Informasi Tambahan Typeform</h3>
            <div class="info-item">
                <span class="info-label">ID Form:</span>
                <span class="info-value">${data.formId}</span>
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
surveyExtractorFactory.registerExtractor(new TypeformExtractor());
