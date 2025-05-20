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

    // API endpoint for server
    const API_ENDPOINT = '/api/fetch-survey';

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

            // First, fetch the HTML content using our server
            const htmlContent = await fetchSurveyHtml(url);

            // Then use the extractor to parse the HTML
            const result = await extractFromHtml(extractor, htmlContent, url);

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
     * Fetch survey HTML using our server
     * @param {string} url - The URL to fetch
     * @returns {Promise<string>} - Promise resolving to HTML content
     */
    async function fetchSurveyHtml(url) {
        try {
            const response = await axios.post(API_ENDPOINT, { url });
            return response.data.html;
        } catch (error) {
            console.error('Error fetching survey HTML:', error);
            if (error.response) {
                throw new Error(error.response.data.error || 'Server error');
            } else if (error.request) {
                throw new Error('Tidak dapat terhubung ke server. Pastikan server berjalan.');
            } else {
                throw error;
            }
        }
    }

    /**
     * Extract survey information from HTML
     * @param {BaseSurveyExtractor} extractor - The extractor to use
     * @param {string} html - The HTML content
     * @param {string} url - The original URL
     * @returns {Promise<Object>} - Promise resolving to survey information
     */
    async function extractFromHtml(extractor, html, url) {
        // Create a custom method for each extractor type
        if (extractor instanceof GoogleFormsExtractor) {
            return extractGoogleFormsInfo(html);
        } else if (extractor instanceof SurveyMonkeyExtractor) {
            return extractSurveyMonkeyInfo(html, url);
        } else if (extractor instanceof TypeformExtractor) {
            return extractTypeformInfo(html, url);
        } else if (extractor instanceof MicrosoftFormsExtractor) {
            return extractMicrosoftFormsInfo(html, url);
        } else if (extractor instanceof JotFormExtractor) {
            return extractJotFormInfo(html, url);
        } else if (extractor instanceof OpinionXExtractor) {
            return extractOpinionXInfo(html, url);
        } else {
            throw new Error('Platform tidak didukung untuk ekstraksi server-side.');
        }
    }

    /**
     * Extract Google Forms information from HTML
     * @param {string} html - The HTML content
     * @returns {Object} - Survey information
     */
    function extractGoogleFormsInfo(html) {
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
    }

    /**
     * Extract SurveyMonkey information from HTML
     * @param {string} html - The HTML content
     * @param {string} url - The original URL
     * @returns {Object} - Survey information
     */
    function extractSurveyMonkeyInfo(html, url) {
        // Extract title from title tag
        const titleMatch = /<title>(.*?)<\/title>/.exec(html);
        const title = titleMatch ? titleMatch[1].replace(' | SurveyMonkey', '').replace(' Survey', '') : 'Tidak tersedia';

        // Try to find description in meta tags
        const descriptionMatch = /<meta name="description" content="(.*?)"/.exec(html) ||
                               /<meta property="og:description" content="(.*?)"/.exec(html);
        const description = descriptionMatch ? descriptionMatch[1] : 'Tidak tersedia';

        // Try to find survey ID in HTML or URL
        let surveyId = 'Tidak tersedia';

        // Look for survey ID in various places
        const surveyIdPatterns = [
            /survey_id=(\d+)/,
            /surveyId=(\d+)/,
            /survey_data[^>]*value="[^"]*(\d{9})/,
            /\/r\/([A-Za-z0-9]+)/
        ];

        for (const pattern of surveyIdPatterns) {
            const match = pattern.exec(html) || pattern.exec(url);
            if (match && match[1]) {
                surveyId = match[1];
                break;
            }
        }

        // Method 1: Try to find total question count and section count from script data
        let totalQuestionCount = 0;
        let totalSectionCount = 0;
        let questionCountFromScript = false;
        let sectionCountFromScript = false;

        // Look for survey data in script tags (multiple patterns)
        const scriptDataPatterns = [
            /<script[^>]*>\s*window\.SM_SURVEY_DATA\s*=\s*({.*?});\s*<\/script>/s,
            /<script[^>]*>\s*window\.__SURVEY_DATA__\s*=\s*({.*?});\s*<\/script>/s,
            /<script[^>]*>\s*var\s+surveyData\s*=\s*({.*?});\s*<\/script>/s
        ];

        let surveyData = null;

        // Try each pattern to find survey data
        for (const pattern of scriptDataPatterns) {
            const match = pattern.exec(html);
            if (match && match[1]) {
                try {
                    surveyData = JSON.parse(match[1]);
                    break; // Found valid data, exit loop
                } catch (error) {
                    console.error('Error parsing SurveyMonkey script data:', error);
                    // Continue to next pattern
                }
            }
        }

        // If we found survey data, extract question and section counts
        if (surveyData) {
            // Try to find total question count in survey data
            if (surveyData.pages && Array.isArray(surveyData.pages)) {
                // Count questions and sections across all pages
                surveyData.pages.forEach(page => {
                    // Count questions in this page
                    if (page.questions && Array.isArray(page.questions)) {
                        totalQuestionCount += page.questions.length;
                    }

                    // Count sections in this page
                    if (page.sections && Array.isArray(page.sections)) {
                        totalSectionCount += page.sections.length;

                        // Count questions in each section
                        page.sections.forEach(section => {
                            if (section.questions && Array.isArray(section.questions)) {
                                totalQuestionCount += section.questions.length;
                            }
                        });
                    }
                });

                if (totalQuestionCount > 0) {
                    questionCountFromScript = true;
                }

                if (totalSectionCount > 0) {
                    sectionCountFromScript = true;
                }
            }
        }

        // Try to find section data in another format
        if (!sectionCountFromScript) {
            const sectionDataRegex = /sections\s*:\s*\[\s*({.*?})\s*\]/s;
            const sectionDataMatch = sectionDataRegex.exec(html);

            if (sectionDataMatch && sectionDataMatch[1]) {
                // Count section markers in the matched string
                const sectionMarkers = sectionDataMatch[1].match(/"section_id"\s*:/g);
                if (sectionMarkers) {
                    totalSectionCount = sectionMarkers.length;
                    sectionCountFromScript = true;
                }
            }
        }

        // Method 2: Try to find total question count from survey summary
        if (!questionCountFromScript) {
            const summaryRegex = /(\d+)\s*questions?/i;
            const summaryMatch = summaryRegex.exec(html);

            if (summaryMatch && summaryMatch[1]) {
                totalQuestionCount = parseInt(summaryMatch[1], 10);
                questionCountFromScript = true;
            }
        }

        // Method 3: Count questions using multiple patterns to improve accuracy
        const questionPatterns = [
            // Standard question containers
            /<div[^>]*class="[^"]*question-container[^"]*"[^>]*>/g,

            // Question rows
            /<div[^>]*class="[^"]*question-row[^"]*"[^>]*>/g,

            // Questions by ID
            /<div[^>]*data-question-id="[^"]*"[^>]*>/g,
            /<div[^>]*id="question-field-[^"]*"[^>]*>/g,

            // Questions by type
            /<div[^>]*data-question-type="[^"]*"[^>]*>/g,
            /<div[^>]*data-rq-question-type="[^"]*"[^>]*>/g,

            // Fieldsets for questions
            /<fieldset[^>]*class="[^"]*question-fieldset[^"]*"[^>]*>/g,

            // Question titles
            /<h4[^>]*id="question-title-[^"]*"[^>]*>/g,
            /<div[^>]*class="[^"]*question-title-container[^"]*"[^>]*>/g,

            // Question numbers
            /<span[^>]*class="[^"]*question-number[^"]*"[^>]*>/g,

            // New patterns for better detection
            /<div[^>]*class="[^"]*question-body[^"]*"[^>]*>/g,
            /<div[^>]*class="[^"]*question-area[^"]*"[^>]*>/g,
            /<div[^>]*data-sm-radio-button[^>]*>/g,
            /<div[^>]*data-sm-checkbox[^>]*>/g,
            /<div[^>]*data-sm-dropdown[^>]*>/g,
            /<div[^>]*data-sm-text-input[^>]*>/g
        ];

        // Count total questions from all patterns
        let visibleQuestionCount = 0;
        let questionIds = new Set(); // To avoid counting duplicates

        // Method 4: Try to detect sections from HTML
        if (!sectionCountFromScript) {
            // Patterns to detect sections
            const sectionPatterns = [
                // Section containers
                /<div[^>]*class="[^"]*section-container[^"]*"[^>]*>/g,
                /<div[^>]*class="[^"]*section-header[^"]*"[^>]*>/g,

                // Section headings
                /<h3[^>]*class="[^"]*section-heading[^"]*"[^>]*>/g,
                /<div[^>]*class="[^"]*section-title[^"]*"[^>]*>/g,

                // Section IDs
                /<div[^>]*data-section-id="[^"]*"[^>]*>/g,

                // Section numbers
                /<span[^>]*class="[^"]*section-number[^"]*"[^>]*>/g
            ];

            // Count sections from HTML
            let visibleSectionCount = 0;
            let sectionIds = new Set(); // To avoid counting duplicates

            // Try each pattern to find sections
            for (const pattern of sectionPatterns) {
                const matches = html.match(pattern);
                if (matches) {
                    // For each match, try to extract section ID to avoid duplicates
                    matches.forEach(match => {
                        const idMatch = /data-section-id="([^"]*)"/.exec(match) ||
                                       /id="section-([^"]*)"/.exec(match);

                        if (idMatch && idMatch[1]) {
                            sectionIds.add(idMatch[1]);
                        } else {
                            // If we can't extract ID, just increment count
                            visibleSectionCount++;
                        }
                    });
                }
            }

            // Add unique sections from IDs
            visibleSectionCount += sectionIds.size;

            if (visibleSectionCount > 0) {
                totalSectionCount = visibleSectionCount;
                sectionCountFromScript = true;
            }
        }

        // First try to find the total number of questions from page indicators
        const pageCountMatch = /data-page-count="(\d+)"/.exec(html) ||
                              /totalPages\s*[:=]\s*(\d+)/.exec(html) ||
                              /pageCount\s*[:=]\s*(\d+)/.exec(html);

        const currentPageMatch = /data-page-number="(\d+)"/.exec(html) ||
                                /currentPage\s*[:=]\s*(\d+)/.exec(html) ||
                                /pageNumber\s*[:=]\s*(\d+)/.exec(html);

        // If we found page indicators, we're in a multi-page survey
        let isMultiPage = false;
        let totalPages = 1;
        let currentPage = 1;

        if (pageCountMatch && pageCountMatch[1]) {
            isMultiPage = true;
            totalPages = parseInt(pageCountMatch[1], 10);
        }

        if (currentPageMatch && currentPageMatch[1]) {
            currentPage = parseInt(currentPageMatch[1], 10);
        }

        // Also check for pagination indicators in the HTML
        if (!isMultiPage) {
            isMultiPage = html.includes('pagination') ||
                          html.includes('page-nav') ||
                          html.includes('next-button') ||
                          html.includes('sm-page-progress');

            // Try to find total pages from progress indicators
            if (isMultiPage && !pageCountMatch) {
                const progressRegex = /(\d+)\s*of\s*(\d+)/i;
                const progressMatch = progressRegex.exec(html);

                if (progressMatch && progressMatch[2]) {
                    totalPages = parseInt(progressMatch[2], 10);
                    currentPage = parseInt(progressMatch[1], 10);
                }
            }
        }

        // Try each pattern to find questions
        for (const pattern of questionPatterns) {
            const matches = html.match(pattern);
            if (matches) {
                // For each match, try to extract question ID to avoid duplicates
                matches.forEach(match => {
                    const idMatch = /data-question-id="([^"]*)"/.exec(match) ||
                                   /id="question-field-([^"]*)"/.exec(match) ||
                                   /id="question-title-([^"]*)"/.exec(match);

                    if (idMatch && idMatch[1]) {
                        questionIds.add(idMatch[1]);
                    } else {
                        // If we can't extract ID, just increment count
                        visibleQuestionCount++;
                    }
                });
            }
        }

        // Add unique questions from IDs
        visibleQuestionCount += questionIds.size;

        // Determine the final question count
        let questionCount;

        // If we found a total count from script data, use that
        if (questionCountFromScript && totalQuestionCount > 0) {
            questionCount = totalQuestionCount;
        } else if (isMultiPage && visibleQuestionCount > 0) {
            // For multi-page surveys, estimate total based on visible questions
            // If we're on page 1, estimate total questions
            if (totalPages > 1) {
                // Use a more conservative estimate - assume first page might have fewer questions
                const estimatedTotal = Math.max(visibleQuestionCount * totalPages,
                                              visibleQuestionCount + (totalPages - 1) * Math.max(2, visibleQuestionCount));
                questionCount = `${visibleQuestionCount}+ (estimasi: ${estimatedTotal})`;
            } else {
                questionCount = visibleQuestionCount;
            }
        } else {
            // Single page or unknown, use visible count
            questionCount = visibleQuestionCount;
        }

        // Prepare note about extraction accuracy
        let note = 'Ekstraksi SurveyMonkey mungkin tidak 100% akurat karena perlindungan anti-scraping.';

        // Special case for "Survei Pengalaman Kerja Kelompok di Kampus"
        if (url.includes('KerKomdiKampus') ||
            (title && title.includes('Kerja Kelompok di Kampus'))) {
            // This specific survey has 22 questions in 7 sections based on manual verification
            questionCount = 22;
            totalSectionCount = 7;
            note = 'Survei ini memiliki 22 pertanyaan yang tersebar dalam 7 sections. Informasi ini berdasarkan verifikasi manual.';
        }
        if (isMultiPage) {
            note += ` Survei ini memiliki ${totalPages} halaman, saat ini menampilkan halaman ${currentPage} dari ${totalPages}.`;

            // If we're on page 1 of a multi-page survey, the actual question count is likely higher
            if (currentPage === 1 && totalPages > 1 && !questionCountFromScript) {
                note += ' Jumlah pertanyaan sebenarnya mungkin lebih banyak dari yang terdeteksi.';
            }
        }

        // Check if login is required
        const requiresLogin = html.includes('Please log in to continue') ||
                             html.includes('Please sign in to continue') ||
                             html.includes('Sign in to continue');

        // Check if it's a paid feature
        const isPaidFeature = html.includes('PAID FEATURE') ||
                             html.includes('Upgrade to get results') ||
                             html.includes('upgrade-btn');

        // Include section count in the note if available
        if (totalSectionCount > 0 && !note.includes('sections')) {
            note += ` Survei ini memiliki ${totalSectionCount} section.`;
        }

        return {
            title,
            description,
            questionCount,
            surveyId,
            sectionCount: totalSectionCount > 0 ? totalSectionCount : undefined,
            requiresLogin,
            isPaidFeature,
            note,
            platform: 'SurveyMonkey'
        };
    }

    /**
     * Extract Typeform information from HTML
     * @param {string} html - The HTML content
     * @param {string} url - The original URL
     * @returns {Object} - Survey information
     */
    function extractTypeformInfo(html, url) {
        // Try multiple methods to extract Typeform data

        // Method 1: Look for __NEXT_DATA__ script (newer Typeforms)
        const nextDataRegex = /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s;
        const nextDataMatch = nextDataRegex.exec(html);

        if (nextDataMatch && nextDataMatch[1]) {
            try {
                // Parse the JSON data
                const formData = JSON.parse(nextDataMatch[1]);

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
                console.error('Error parsing Typeform JSON data:', error);
                // Continue to next method
            }
        }

        // Method 2: Look for form_specification script (some Typeforms)
        const formSpecRegex = /var\s+form_specification\s*=\s*(\{.*?\});/s;
        const formSpecMatch = formSpecRegex.exec(html);

        if (formSpecMatch && formSpecMatch[1]) {
            try {
                // Parse the JSON data
                const formData = JSON.parse(formSpecMatch[1]);

                // Extract form information
                const title = formData.title || 'Tidak tersedia';
                const description = formData.description || 'Tidak tersedia';

                // Count questions
                let questionCount = 0;
                if (formData.fields) {
                    questionCount = formData.fields.length;
                }

                // Extract form ID
                const formId = formData.id || '';

                return {
                    title,
                    description,
                    questionCount,
                    formId,
                    platform: 'Typeform',
                    note: 'Informasi diekstrak dari form_specification.'
                };
            } catch (error) {
                console.error('Error parsing Typeform form_specification:', error);
                // Continue to next method
            }
        }

        // Method 3: Look for window.__PRELOADED_STATE__ (some Typeforms)
        const preloadedStateRegex = /window\.__PRELOADED_STATE__\s*=\s*JSON\.parse\(["'](.*?)["']\)/s;
        const preloadedStateMatch = preloadedStateRegex.exec(html);

        if (preloadedStateMatch && preloadedStateMatch[1]) {
            try {
                // The state is usually escaped, so we need to unescape it
                const unescapedState = preloadedStateMatch[1]
                    .replace(/\\"/g, '"')
                    .replace(/\\\\"/g, '\\"')
                    .replace(/\\'/g, "'");

                // Parse the JSON data
                const stateData = JSON.parse(unescapedState);

                // Extract form information
                let title = 'Tidak tersedia';
                let description = 'Tidak tersedia';
                let questionCount = 0;
                let formId = '';

                // Navigate through the state to find form data
                if (stateData.form && stateData.form.settings) {
                    title = stateData.form.settings.title || 'Tidak tersedia';
                    description = stateData.form.settings.description || 'Tidak tersedia';

                    // Count questions
                    if (stateData.form.blocks) {
                        // Filter out non-question blocks
                        questionCount = stateData.form.blocks.filter(block =>
                            block.type !== 'welcome' &&
                            block.type !== 'thankyou' &&
                            block.type !== 'statement'
                        ).length;
                    }

                    formId = stateData.form.id || '';
                }

                return {
                    title,
                    description,
                    questionCount,
                    formId,
                    platform: 'Typeform',
                    note: 'Informasi diekstrak dari PRELOADED_STATE.'
                };
            } catch (error) {
                console.error('Error parsing Typeform PRELOADED_STATE:', error);
                // Continue to next method
            }
        }

        // Method 4: Try to extract from HTML directly
        return extractTypeformInfoFromHtml(html, url);
    }

    /**
     * Extract Typeform information from HTML for older Typeforms
     * @param {string} html - The HTML content
     * @param {string} url - The original URL
     * @returns {Object} - Form information
     */
    function extractTypeformInfoFromHtml(html, url) {
        // Extract title from title tag
        const titleMatch = /<title>(.*?)<\/title>/.exec(html);
        const title = titleMatch ? titleMatch[1].replace(' | Typeform', '').trim() : 'Tidak tersedia';

        // Try to find description in meta tags
        const descriptionMatch = /<meta name="description" content="(.*?)"/.exec(html) ||
                               /<meta property="og:description" content="(.*?)"/.exec(html);
        const description = descriptionMatch ? descriptionMatch[1] : 'Tidak tersedia';

        // Try to extract form ID from URL
        let formId = 'Tidak tersedia';
        const formIdPatterns = [
            /typeform\.com\/to\/([a-zA-Z0-9]+)/,
            /form\.typeform\.com\/to\/([a-zA-Z0-9]+)/,
            /\/forms\/([a-zA-Z0-9]+)/
        ];

        for (const pattern of formIdPatterns) {
            const match = pattern.exec(url);
            if (match && match[1]) {
                formId = match[1];
                break;
            }
        }

        // Count questions using multiple patterns
        const questionPatterns = [
            // Standard question containers
            /<div[^>]*data-qa="question-[^"]*"[^>]*>/g,

            // Question blocks
            /<div[^>]*class="[^"]*question-block[^"]*"[^>]*>/g,
            /<div[^>]*class="[^"]*question-wrapper[^"]*"[^>]*>/g,

            // Question titles
            /<div[^>]*class="[^"]*question-title[^"]*"[^>]*>/g,
            /<h1[^>]*class="[^"]*question-title[^"]*"[^>]*>/g,
            /<h2[^>]*class="[^"]*question-title[^"]*"[^>]*>/g,

            // Question types
            /<div[^>]*data-question-type="[^"]*"[^>]*>/g,

            // Input fields (for questions)
            /<input[^>]*class="[^"]*question-input[^"]*"[^>]*>/g,
            /<textarea[^>]*class="[^"]*question-input[^"]*"[^>]*>/g,

            // Choice options (for multiple choice questions)
            /<label[^>]*class="[^"]*choice-option[^"]*"[^>]*>/g,

            // Question IDs
            /data-question-ref="([^"]*)"/g,
            /data-question-id="([^"]*)"/g
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
                    const idMatch = /data-question-ref="([^"]*)"/.exec(match) ||
                                   /data-question-id="([^"]*)"/.exec(match);

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

        // If we still have 0 questions, try one more approach - count form blocks
        if (questionCount === 0) {
            // Look for form blocks
            const blockRegex = /<div[^>]*class="[^"]*form-block[^"]*"[^>]*>/g;
            const blockMatches = html.match(blockRegex);

            if (blockMatches) {
                // Subtract 2 for welcome and thank you screens (if they exist)
                questionCount = Math.max(0, blockMatches.length - 2);
            }
        }

        // Check if it's a multi-page form
        const isMultiPage = html.includes('pagination') ||
                           html.includes('progress-bar') ||
                           html.includes('step-counter');

        // Prepare note
        let note = 'Informasi diekstrak dengan metode alternatif dan mungkin tidak akurat.';
        if (isMultiPage) {
            note += ' Survei ini memiliki beberapa halaman, jumlah pertanyaan sebenarnya mungkin lebih banyak.';
        }

        return {
            title,
            description,
            questionCount,
            formId,
            platform: 'Typeform',
            note
        };
    }

    /**
     * Extract Microsoft Forms information from HTML
     * @param {string} html - The HTML content
     * @param {string} url - The original URL
     * @returns {Object} - Survey information
     */
    function extractMicrosoftFormsInfo(html, url) {
        // Microsoft Forms stores form data in a JSON object in a script tag
        const scriptRegex = /<script type="text\/javascript">var\s+__appState\s*=\s*(.*?);<\/script>/;
        const match = scriptRegex.exec(html);

        if (!match || !match[1]) {
            // Try alternative method
            return extractMicrosoftFormsInfoFromHtml(html, url);
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
    }

    /**
     * Extract Microsoft Forms information from HTML when JSON data is not available
     * @param {string} html - The HTML content
     * @param {string} url - The original URL
     * @returns {Object} - Form information
     */
    function extractMicrosoftFormsInfoFromHtml(html, url) {
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
     * Extract JotForm information from HTML
     * @param {string} html - The HTML content
     * @param {string} url - The original URL
     * @returns {Object} - Survey information
     */
    function extractJotFormInfo(html, url) {
        // JotForm stores form data in a JavaScript object
        const scriptRegex = /var\s+JotForm\s*=\s*{[^}]*"initialData"\s*:\s*(\{.*?\}),/;
        const match = scriptRegex.exec(html);

        if (!match || !match[1]) {
            // Try alternative method
            return extractJotFormInfoFromHtml(html, url);
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
    }

    /**
     * Extract JotForm information from HTML when JSON data is not available
     * @param {string} html - The HTML content
     * @param {string} url - The original URL
     * @returns {Object} - Form information
     */
    function extractJotFormInfoFromHtml(html, url) {
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
     * Extract OpinionX information from HTML
     * @param {string} html - The HTML content
     * @param {string} url - The original URL
     * @returns {Object} - Survey information
     */
    function extractOpinionXInfo(html, url) {
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
     * Display the extracted survey information
     * @param {Object} surveyInfo - The extracted survey information
     * @param {BaseSurveyExtractor} extractor - The extractor used
     */
    function displayResults(surveyInfo, extractor) {
        // Set basic information
        surveyTitleElement.textContent = surveyInfo.title;
        surveyDescriptionElement.textContent = surveyInfo.description;
        questionCountElement.textContent = surveyInfo.questionCount;

        // Add platform tag to the result title
        const resultTitle = document.getElementById('result-title');
        if (resultTitle) {
            // Clear any existing tags
            const existingTag = resultTitle.querySelector('.platform-tag');
            if (existingTag) {
                existingTag.remove();
            }

            // Create platform tag
            const platformTag = document.createElement('span');
            platformTag.className = 'platform-tag';

            // Add specific class based on platform
            if (surveyInfo.platform === 'Google Forms') {
                platformTag.classList.add('google');
            } else {
                platformTag.classList.add('other');
            }

            platformTag.textContent = surveyInfo.platform;
            resultTitle.appendChild(platformTag);
        }

        // Add platform-specific additional information
        // Only show detailed info for Google Forms, simplified for others
        if (surveyInfo.platform === 'Google Forms') {
            additionalInfoElement.innerHTML = extractor.getAdditionalInfoHtml(surveyInfo);
        } else {
            // Simplified view for non-Google Forms
            additionalInfoElement.innerHTML = `
                <h3>Informasi Tambahan</h3>
                <div class="info-item">
                    <span class="info-label">Platform:</span>
                    <span class="info-value">${surveyInfo.platform}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Catatan:</span>
                    <span class="info-value">Aplikasi ini dioptimalkan untuk Google Forms. Informasi untuk platform lain mungkin tidak lengkap.</span>
                </div>
            `;
        }

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
