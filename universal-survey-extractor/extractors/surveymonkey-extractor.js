/**
 * Extractor for SurveyMonkey
 */
class SurveyMonkeyExtractor extends BaseSurveyExtractor {
    constructor() {
        super(
            'SurveyMonkey',
            'Platform survei online populer dengan fitur analisis yang kuat',
            'https://prod.smassets.net/assets/cms/sm/uploads/images/favicon.png'
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
        return url.includes('surveymonkey.com');
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
                const result = await this.fetchSurveyInfo(proxy + url);
                if (result) {
                    return result;
                }
            } catch (error) {
                console.error(`Error with proxy ${proxy}:`, error);
                // Continue to next proxy
            }
        }

        throw new Error('Tidak dapat mengakses survei. Coba lagi nanti atau gunakan URL survei yang berbeda.');
    }

    /**
     * Fetch survey information using a proxy
     * @param {string} proxyUrl - The proxy URL to use
     * @returns {Promise<Object>} - Promise resolving to survey information
     */
    async fetchSurveyInfo(proxyUrl) {
        try {
            const response = await axios.get(proxyUrl);
            const html = response.data;

            // Extract survey data using regex patterns
            const titleMatch = /<title>(.*?)<\/title>/.exec(html);
            const title = titleMatch ? titleMatch[1].replace(' | SurveyMonkey', '') : 'Tidak tersedia';

            // Try to find description in meta tags
            const descriptionMatch = /<meta name="description" content="(.*?)"/.exec(html);
            const description = descriptionMatch ? descriptionMatch[1] : 'Tidak tersedia';

            // Count questions by looking for question containers
            const questionRegex = /<div[^>]*class="[^"]*question-container[^"]*"[^>]*>/g;
            const questionMatches = html.match(questionRegex);
            const questionCount = questionMatches ? questionMatches.length : 0;

            // Try to extract survey ID
            const surveyIdMatch = /survey_id=(\d+)/.exec(html) || /\/(\d+)\//.exec(url);
            const surveyId = surveyIdMatch ? surveyIdMatch[1] : 'Tidak tersedia';

            // Check if login is required
            const requiresLogin = html.includes('Please log in to continue') ||
                                 html.includes('Please sign in to continue');

            // Check if it's a paid feature
            const isPaidFeature = html.includes('PAID FEATURE') ||
                                 html.includes('Upgrade to get results');

            return {
                title,
                description,
                questionCount,
                surveyId,
                requiresLogin,
                isPaidFeature,
                platform: 'SurveyMonkey'
            };
        } catch (error) {
            console.error('Error fetching survey info:', error);
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
            <h3>Informasi Tambahan SurveyMonkey</h3>
            <div class="info-item">
                <span class="info-label">ID Survei:</span>
                <span class="info-value">${data.surveyId}</span>
            </div>
            ${data.sectionCount ? `
            <div class="info-item">
                <span class="info-label">Jumlah Section:</span>
                <span class="info-value">${data.sectionCount}</span>
            </div>
            ` : ''}
            <div class="info-item">
                <span class="info-label">Memerlukan Login:</span>
                <span class="info-value">${data.requiresLogin ? 'Ya' : 'Tidak'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Fitur Berbayar:</span>
                <span class="info-value">${data.isPaidFeature ? 'Ya' : 'Tidak'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Catatan:</span>
                <span class="info-value">${data.note || 'Ekstraksi SurveyMonkey mungkin tidak 100% akurat karena perlindungan anti-scraping.'}</span>
            </div>
        `;
    }
}

// Register the extractor
surveyExtractorFactory.registerExtractor(new SurveyMonkeyExtractor());
