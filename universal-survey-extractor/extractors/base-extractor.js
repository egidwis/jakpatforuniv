/**
 * Base class for all survey extractors
 */
class BaseSurveyExtractor {
    /**
     * Constructor
     * @param {string} name - The name of the platform
     * @param {string} description - A short description of the platform
     * @param {string} iconUrl - URL to the platform's icon
     */
    constructor(name, description, iconUrl) {
        this.name = name;
        this.description = description;
        this.iconUrl = iconUrl;
    }

    /**
     * Check if this extractor can handle the given URL
     * @param {string} url - The URL to check
     * @returns {boolean} - True if this extractor can handle the URL
     */
    canHandle(url) {
        throw new Error('Method canHandle() must be implemented by subclass');
    }

    /**
     * Extract survey information from the given URL
     * @param {string} url - The URL to extract from
     * @returns {Promise<Object>} - Promise resolving to survey information
     */
    async extract(url) {
        throw new Error('Method extract() must be implemented by subclass');
    }

    /**
     * Get additional platform-specific information as HTML
     * @param {Object} data - The extracted data
     * @returns {string} - HTML string with additional information
     */
    getAdditionalInfoHtml(data) {
        return '';
    }
}

/**
 * Factory class to get the appropriate extractor for a URL
 */
class SurveyExtractorFactory {
    constructor() {
        this.extractors = [];
    }

    /**
     * Register an extractor
     * @param {BaseSurveyExtractor} extractor - The extractor to register
     */
    registerExtractor(extractor) {
        this.extractors.push(extractor);
    }

    /**
     * Get the appropriate extractor for a URL
     * @param {string} url - The URL to get an extractor for
     * @returns {BaseSurveyExtractor} - The appropriate extractor
     * @throws {Error} - If no extractor can handle the URL
     */
    getExtractor(url) {
        for (const extractor of this.extractors) {
            if (extractor.canHandle(url)) {
                return extractor;
            }
        }
        throw new Error('Tidak ada extractor yang dapat menangani URL ini');
    }
}

// Create a global instance of the factory
const surveyExtractorFactory = new SurveyExtractorFactory();
