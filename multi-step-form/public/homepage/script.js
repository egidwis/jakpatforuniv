// ========================================
// Internationalization (i18n) System
// ========================================

// Get current language from localStorage or browser
function getInitialLanguage() {
    // Check localStorage first
    const savedLang = localStorage.getItem('jakpat-language');
    if (savedLang && (savedLang === 'id' || savedLang === 'en')) {
        return savedLang;
    }

    // Fallback to browser language detection
    const browserLang = navigator.language || navigator.userLanguage;
    // If browser language starts with 'id' (Indonesian), use Indonesian
    if (browserLang.toLowerCase().startsWith('id')) {
        return 'id';
    }
    // Otherwise default to English
    return 'en';
}

// Current active language
let currentLanguage = getInitialLanguage();

// Update all translatable elements
function updatePageLanguage(lang) {
    if (!translations || !translations[lang]) {
        console.error('Translation data not available for language:', lang);
        return;
    }

    const data = translations[lang];

    // Update all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        const keys = key.split('.');

        let value = data;
        for (const k of keys) {
            value = value[k];
            if (value === undefined) break;
        }

        if (value !== undefined) {
            // Use innerHTML to support HTML tags in translations
            element.innerHTML = value;
        }
    });

    // Update <html lang> attribute
    document.documentElement.setAttribute('lang', lang);

    // Update meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc && data.meta && data.meta.description) {
        metaDesc.setAttribute('content', data.meta.description);
    }

    // Update meta keywords
    const metaKeywords = document.querySelector('meta[name="keywords"]');
    if (metaKeywords && data.meta && data.meta.keywords) {
        metaKeywords.setAttribute('content', data.meta.keywords);
    }

    // Update JSON-LD structured data
    updateStructuredData(lang, data);

    // Update ARIA labels
    updateAriaLabels(lang, data);

    // Save language preference
    localStorage.setItem('jakpat-language', lang);
    currentLanguage = lang;

    // Update active button state
    updateLanguageButtons(lang);
}

// Update JSON-LD structured data
function updateStructuredData(lang, data) {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');

    scripts.forEach((script, index) => {
        try {
            const jsonData = JSON.parse(script.textContent);

            if (jsonData['@type'] === 'Organization' && data.structuredData.orgDescription) {
                jsonData.description = data.structuredData.orgDescription;
            } else if (jsonData['@type'] === 'Service' && data.structuredData.serviceDescription) {
                jsonData.description = data.structuredData.serviceDescription;
                jsonData.name = lang === 'id' ? 'Jakpat for Universities' : 'Jakpat for Universities';
            }

            script.textContent = JSON.stringify(jsonData, null, 4);
        } catch (e) {
            console.error('Error updating structured data:', e);
        }
    });
}

// Update ARIA labels
function updateAriaLabels(lang, data) {
    // Navigation
    const nav = document.querySelector('.nav');
    if (nav && data.nav.ariaLabel) {
        nav.setAttribute('aria-label', data.nav.ariaLabel);
    }

    const hamburger = document.querySelector('.hamburger');
    if (hamburger && data.nav.hamburgerAriaLabel) {
        hamburger.setAttribute('aria-label', data.nav.hamburgerAriaLabel);
    }

    const mobileMenu = document.querySelector('.mobile-menu');
    if (mobileMenu && data.nav.mobileMenuAriaLabel) {
        mobileMenu.setAttribute('aria-label', data.nav.mobileMenuAriaLabel);
    }

    const logoLink = document.querySelector('.logo');
    if (logoLink && data.nav.logoAriaLabel) {
        logoLink.setAttribute('aria-label', data.nav.logoAriaLabel);
    }

    // Footer
    const footerNav = document.querySelector('.footer-links');
    if (footerNav && data.footer.ariaLabel) {
        footerNav.setAttribute('aria-label', data.footer.ariaLabel);
    }

    // Update language switcher aria labels (navbar and mobile)
    const navLanguageSwitcher = document.querySelector('.nav-language-switcher');
    if (navLanguageSwitcher && data.footer.languageSwitcher) {
        navLanguageSwitcher.setAttribute('aria-label', data.footer.languageSwitcher);
    }

    const mobileLanguageSwitcher = document.querySelector('.mobile-language-switcher');
    if (mobileLanguageSwitcher && data.footer.languageSwitcher) {
        mobileLanguageSwitcher.setAttribute('aria-label', data.footer.languageSwitcher);
    }

    // CTA buttons
    const ctaButtons = document.querySelectorAll('.cta-button');
    ctaButtons.forEach(btn => {
        if (data.hero.ctaAriaLabel) {
            btn.setAttribute('aria-label', data.hero.ctaAriaLabel);
        }
    });

    const ctaButtonWhite = document.querySelector('.cta-button-white');
    if (ctaButtonWhite && data.cta.buttonAriaLabel) {
        ctaButtonWhite.setAttribute('aria-label', data.cta.buttonAriaLabel);
    }

    // Marquee
    const marquees = document.querySelectorAll('.logo-marquee');
    if (marquees.length > 0 && data.trust.marqueeAriaLabel1) {
        marquees[0]?.setAttribute('aria-label', data.trust.marqueeAriaLabel1);
    }
    if (marquees.length > 1 && data.trust.marqueeAriaLabel2) {
        marquees[1]?.setAttribute('aria-label', data.trust.marqueeAriaLabel2);
    }
}

// Update language button active state
function updateLanguageButtons(lang) {
    document.querySelectorAll('.lang-btn').forEach(btn => {
        if (btn.getAttribute('data-lang') === lang) {
            btn.classList.add('active');
            btn.setAttribute('aria-pressed', 'true');
        } else {
            btn.classList.remove('active');
            btn.setAttribute('aria-pressed', 'false');
        }
    });
}

// Language switcher event listeners
function initLanguageSwitcher() {
    const langButtons = document.querySelectorAll('.lang-btn');

    langButtons.forEach(button => {
        button.addEventListener('click', () => {
            const lang = button.getAttribute('data-lang');
            if (lang !== currentLanguage) {
                updatePageLanguage(lang);
            }
        });
    });
}

// Initialize i18n on page load
document.addEventListener('DOMContentLoaded', () => {
    // Apply initial language
    updatePageLanguage(currentLanguage);

    // Initialize language switcher
    initLanguageSwitcher();

    // Initialize hamburger menu
    initHamburgerMenu();
});

// Hamburger menu initialization
function initHamburgerMenu() {
    const hamburger = document.querySelector('.hamburger');
    const mobileMenu = document.querySelector('.mobile-menu');

    if (hamburger && mobileMenu) {
        hamburger.addEventListener('click', () => {
            const isActive = hamburger.classList.toggle('active');
            mobileMenu.classList.toggle('active');

            // Update aria-expanded attribute
            hamburger.setAttribute('aria-expanded', isActive);
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!hamburger.contains(e.target) && !mobileMenu.contains(e.target)) {
                hamburger.classList.remove('active');
                mobileMenu.classList.remove('active');
                hamburger.setAttribute('aria-expanded', 'false');
            }
        });

        // Close menu on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && mobileMenu.classList.contains('active')) {
                hamburger.classList.remove('active');
                mobileMenu.classList.remove('active');
                hamburger.setAttribute('aria-expanded', 'false');
            }
        });
    }
}

// ========================================
// Smooth scrolling for navigation links
// ========================================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth'
            });
            // Close mobile menu if open
            const mobileMenu = document.querySelector('.mobile-menu');
            const hamburger = document.querySelector('.hamburger');
            if (mobileMenu && mobileMenu.classList.contains('active')) {
                mobileMenu.classList.remove('active');
                hamburger.classList.remove('active');
            }
        }
    });
});

// Navigation background on scroll + active section tracking
window.addEventListener('scroll', () => {
    const nav = document.querySelector('.nav');

    // Add scrolled class for navbar shrink effect
    if (window.scrollY > 50) {
        nav.classList.add('scrolled');
    } else {
        nav.classList.remove('scrolled');
    }

    // Track active section
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-links a');

    let currentSection = '';

    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;
        if (window.scrollY >= (sectionTop - 200)) {
            currentSection = section.getAttribute('id');
        }
    });

    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${currentSection}`) {
            link.classList.add('active');
        }
    });
});

// Testimonials toggle functionality
function toggleTestimonials() {
    const container = document.querySelector('.testimonials-container');
    const button = document.querySelector('.show-more-btn');
    const showText = button.querySelector('.show-text');
    const hideText = button.querySelector('.hide-text');

    container.classList.toggle('testimonials-expanded');

    // Update aria-expanded attribute
    const isExpanded = container.classList.contains('testimonials-expanded');
    button.setAttribute('aria-expanded', isExpanded);

    if (isExpanded) {
        showText.style.display = 'none';
        hideText.style.display = 'inline';
    } else {
        showText.style.display = 'inline';
        hideText.style.display = 'none';
    }
}

// Webinar: section sementara. Isi dan aturannya datang dari _view.js di server.
(function initWebinarSection() {
    var section = document.getElementById('webinar');
    var list = document.getElementById('webinar-home-list');
    if (!section || !list || typeof fetch !== 'function') return;

    function text(tag, className, value) {
        var el = document.createElement(tag);
        el.className = className;
        el.textContent = value;
        return el;
    }

    function poster(view) {
        if (/^https:\/\//i.test(view.poster_url || '')) {
            var img = document.createElement('img');
            img.className = 'webinar-home-poster';
            img.src = view.poster_url;
            img.alt = view.title;
            img.loading = 'lazy';
            return img;
        }
        return text('div', 'webinar-home-poster', view.title);
    }

    function translated(key, fallback) {
        var data = typeof translations !== 'undefined' ? translations[currentLanguage] : null;
        return (data && data.webinar && data.webinar[key]) || fallback;
    }

    function card(view) {
        var a = document.createElement('a');
        a.className = 'webinar-home-card';
        a.href = view.detail_url;
        a.appendChild(poster(view));

        var body = document.createElement('div');
        body.className = 'webinar-home-body';
        var tone = view.tone === 'on_sale' ? ' is-sale' : (view.tone === 'ended' ? ' is-ended' : '');
        body.appendChild(text('span', 'webinar-home-badge' + tone, view.badge));
        body.appendChild(text('div', 'webinar-home-title', view.title));
        if (view.schedule_label) body.appendChild(text('p', 'webinar-home-meta', view.schedule_label));
        if (view.state === 'coming_soon' && view.note) body.appendChild(text('p', 'webinar-home-meta', view.note));
        var speaker = (view.speakers || []).map(function (s) {
            return [s && s.name, s && s.title].filter(Boolean).join(', ');
        }).filter(Boolean).join(' · ');
        if (speaker) body.appendChild(text('p', 'webinar-home-meta', speaker));
        if (view.price_label) {
            var price = text('p', 'webinar-home-price', view.price_label + ' ');
            price.appendChild(text('small', '', '· ' + translated('ppn', 'termasuk PPN')));
            body.appendChild(price);
        }
        var cta = text('span', 'webinar-home-cta', translated('cta', 'Lihat Webinar') + ' →');
        cta.setAttribute('data-i18n', 'webinar.cta');
        body.appendChild(cta);
        a.appendChild(body);
        return a;
    }

    fetch('/api/webinar/events')
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (data) {
            // Menu Webinar tersembunyi sampai server bilang terbuka (masa uji: open:false).
            if (data && data.open === true) {
                document.querySelectorAll('[data-webinar-nav]').forEach(function (el) { el.style.display = ''; });
            }
            var items = data && data.open === true && Array.isArray(data.homepage) ? data.homepage : [];
            if (items.length === 0) return;
            list.className = 'webinar-home-list ' + (items.length === 1 ? 'is-one' : 'is-two');
            items.forEach(function (view) { list.appendChild(card(view)); });
            section.hidden = false;
        })
        .catch(function (err) { console.error('[webinar]', err); });
})();

