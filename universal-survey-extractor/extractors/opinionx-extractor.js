/**
 * Extractor for OpinionX
 */
class OpinionXExtractor extends BaseSurveyExtractor {
    constructor() {
        super(
            'OpinionX',
            'Platform penelitian kualitatif dengan analisis AI untuk wawasan yang lebih dalam',
            'https://www.opinionx.co/favicon.ico'
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
        return url.includes('opinionx.co') || url.includes('opnx.to');
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
        
        throw new Error('Tidak dapat mengakses OpinionX. Coba lagi nanti atau gunakan URL survei yang berbeda.');
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
            
            // Extract survey information from HTML
            return this.extractFromHtml(html, proxyUrl);
        } catch (error) {
            console.error('Error fetching OpinionX info:', error);
            throw error;
        }
    }

    /**
     * Extract survey information from HTML
     * @param {string} html - The HTML content
     * @param {string} url - The original URL
     * @returns {Object} - Survey information
     */
    extractFromHtml(html, url) {
        // Extract title from title tag or meta tags
        let title = 'Tidak tersedia';
        const titleMatch = /<title>(.*?)<\/title>/.exec(html);
        if (titleMatch && titleMatch[1]) {
            title = titleMatch[1].replace(' | OpinionX', '').trim();
        }
        
        // Try to find title in meta tags if not found in title tag
        if (title === 'Tidak tersedia') {
            const ogTitleMatch = /<meta property="og:title" content="(.*?)"/.exec(html);
            if (ogTitleMatch && ogTitleMatch[1]) {
                title = ogTitleMatch[1].trim();
            }
        }
        
        // Try to find description in meta tags
        let description = 'Tidak tersedia';
        const descriptionMatch = /<meta name="description" content="(.*?)"/.exec(html) || 
                               /<meta property="og:description" content="(.*?)"/.exec(html);
        if (descriptionMatch && descriptionMatch[1]) {
            description = descriptionMatch[1].trim();
        }
        
        // Try to extract survey ID from URL
        let surveyId = 'Tidak tersedia';
        const surveyIdMatch = /\/s\/([a-zA-Z0-9_-]+)/.exec(url) || 
                             /opnx\.to\/([a-zA-Z0-9_-]+)/.exec(url);
        if (surveyIdMatch && surveyIdMatch[1]) {
            surveyId = surveyIdMatch[1];
        }
        
        // Count questions by looking for question containers
        // OpinionX typically uses React components, so we need to look for specific patterns
        const questionPatterns = [
            // Question containers
            /<div[^>]*class="[^"]*question-container[^"]*"[^>]*>/g,
            /<div[^>]*class="[^"]*question-wrapper[^"]*"[^>]*>/g,
            /<div[^>]*class="[^"]*question-item[^"]*"[^>]*>/g,
            
            // Question text elements
            /<h[1-6][^>]*class="[^"]*question-text[^"]*"[^>]*>/g,
            /<div[^>]*class="[^"]*question-text[^"]*"[^>]*>/g,
            
            // Question components
            /<div[^>]*data-question-id="[^"]*"[^>]*>/g,
            /<div[^>]*data-question-type="[^"]*"[^>]*>/g
        ];
        
        // Count total questions from all patterns
        let questionCount = 0;
        let questionIds = new Set(); // To avoid counting duplicates
        
        // Try each pattern to find questions
        for (const pattern of questionPatterns) {
            const matches = html.match(pattern);
            if (matches) {
                // For each match, try to extract question ID to avoid duplicates
                matches.forEach(match => {
                    const idMatch = /data-question-id="([^"]*)"/.exec(match);
                    
                    if (idMatch && idMatch[1]) {
                        questionIds.add(idMatch[1]);
                    } else {
                        // If we can't extract ID, just increment count
                        questionCount++;
                    }
                });
            }
        }
        
        // Add unique questions from IDs
        questionCount += questionIds.size;
        
        // Check if it's a multi-page survey
        const isMultiPage = html.includes('pagination') || 
                           html.includes('next-button') || 
                           html.includes('prev-button');
        
        // Try to find total pages if it's a multi-page survey
        let totalPages = 1;
        const pagesMatch = /data-total-pages="(\d+)"/.exec(html) || 
                          /totalPages\s*[:=]\s*(\d+)/.exec(html);
        if (pagesMatch && pagesMatch[1]) {
            totalPages = parseInt(pagesMatch[1], 10);
        }
        
        // Prepare note about extraction accuracy
        let note = 'Ekstraksi OpinionX mungkin tidak 100% akurat karena struktur dinamis dari platform.';
        if (isMultiPage) {
            note += ` Survei ini memiliki beberapa halaman (estimasi: ${totalPages} halaman).`;
            
            // If it's a multi-page survey, estimate total questions
            if (totalPages > 1 && questionCount > 0) {
                note += ' Jumlah pertanyaan sebenarnya mungkin lebih banyak.';
                questionCount = `${questionCount}+ (estimasi: ${questionCount * totalPages})`;
            }
        }
        
        // Check if login is required
        const requiresLogin = html.includes('login') || 
                             html.includes('sign in') || 
                             html.includes('sign-in') ||
                             html.includes('authentication');
        
        return {
            title,
            description,
            questionCount,
            surveyId,
            requiresLogin,
            isMultiPage,
            totalPages,
            note,
            platform: 'OpinionX'
        };
    }

    /**
     * Get additional platform-specific information as HTML
     * @param {Object} data - The extracted data
     * @returns {string} - HTML string with additional information
     */
    getAdditionalInfoHtml(data) {
        return `
            <h3>Informasi Tambahan OpinionX</h3>
            <div class="info-item">
                <span class="info-label">ID Survei:</span>
                <span class="info-value">${data.surveyId}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Memerlukan Login:</span>
                <span class="info-value">${data.requiresLogin ? 'Ya' : 'Tidak'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Multi-halaman:</span>
                <span class="info-value">${data.isMultiPage ? 'Ya' : 'Tidak'}</span>
            </div>
            ${data.isMultiPage ? `
            <div class="info-item">
                <span class="info-label">Estimasi Jumlah Halaman:</span>
                <span class="info-value">${data.totalPages}</span>
            </div>
            ` : ''}
            <div class="info-item">
                <span class="info-label">Catatan:</span>
                <span class="info-value">${data.note}</span>
            </div>
        `;
    }
}

// Register the extractor
surveyExtractorFactory.registerExtractor(new OpinionXExtractor());
