/**
 * Extractor for JotForm
 */
class JotFormExtractor extends BaseSurveyExtractor {
    constructor() {
        super(
            'JotForm',
            'Platform pembuatan formulir online dengan banyak template dan integrasi',
            'https://www.jotform.com/favicon.ico'
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
        return url.includes('jotform.com') || url.includes('form.jotform.com');
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
        
        throw new Error('Tidak dapat mengakses JotForm. Coba lagi nanti atau gunakan URL form yang berbeda.');
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
            
            // JotForm stores form data in a JavaScript object
            const scriptRegex = /var\s+JotForm\s*=\s*{[^}]*"initialData"\s*:\s*(\{.*?\}),/;
            const match = scriptRegex.exec(html);
            
            if (!match || !match[1]) {
                // Try alternative method
                return this.extractFormInfoFromHtml(html, url);
            }
            
            // Parse the JSON data
            const formData = JSON.parse(match[1]);
            
            // Extract form information
            let title = formData.title || 'Tidak tersedia';
            let description = 'Tidak tersedia'; // JotForm doesn't have a standard description field
            
            // Extract form ID
            const formIdMatch = /\/form\/(\d+)/.exec(url);
            const formId = formIdMatch ? formIdMatch[1] : 'Tidak tersedia';
            
            // Count questions
            let questionCount = 0;
            if (formData.questions) {
                // Filter out hidden fields and other non-question elements
                questionCount = Object.values(formData.questions).filter(q => 
                    q.type !== 'control_hidden' && 
                    q.type !== 'control_pagebreak' &&
                    q.type !== 'control_button'
                ).length;
            }
            
            // Get additional information
            const isEncrypted = html.includes('encrypted-form') || html.includes('data-encrypted="true"');
            const hasPayment = html.includes('control_payment') || html.includes('control_paypal');
            
            return {
                title,
                description,
                questionCount,
                formId,
                isEncrypted,
                hasPayment,
                platform: 'JotForm'
            };
        } catch (error) {
            console.error('Error fetching JotForm info:', error);
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
        // Extract title from title tag or header
        const titleMatch = /<title>(.*?)<\/title>/.exec(html) || 
                          /<h1[^>]*class="[^"]*form-header[^"]*"[^>]*>(.*?)<\/h1>/.exec(html);
        const title = titleMatch ? titleMatch[1].replace(' | JotForm', '') : 'Tidak tersedia';
        
        // JotForm doesn't typically have a description field
        const description = 'Tidak tersedia';
        
        // Count questions by looking for question containers
        const questionRegex = /<li[^>]*class="[^"]*form-line[^"]*"[^>]*data-type="control_/g;
        const questionMatches = html.match(questionRegex);
        // Filter out hidden fields and other non-question elements
        const questionCount = questionMatches ? 
            questionMatches.filter(q => 
                !q.includes('control_hidden') && 
                !q.includes('control_pagebreak') &&
                !q.includes('control_button')
            ).length : 0;
        
        // Extract form ID from URL
        const formIdMatch = /\/form\/(\d+)/.exec(url);
        const formId = formIdMatch ? formIdMatch[1] : 'Tidak tersedia';
        
        // Get additional information
        const isEncrypted = html.includes('encrypted-form') || html.includes('data-encrypted="true"');
        const hasPayment = html.includes('control_payment') || html.includes('control_paypal');
        
        return {
            title,
            description,
            questionCount,
            formId,
            isEncrypted,
            hasPayment,
            platform: 'JotForm',
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
            <h3>Informasi Tambahan JotForm</h3>
            <div class="info-item">
                <span class="info-label">ID Form:</span>
                <span class="info-value">${data.formId}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Terenkripsi:</span>
                <span class="info-value">${data.isEncrypted ? 'Ya' : 'Tidak'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Memiliki Pembayaran:</span>
                <span class="info-value">${data.hasPayment ? 'Ya' : 'Tidak'}</span>
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
surveyExtractorFactory.registerExtractor(new JotFormExtractor());
