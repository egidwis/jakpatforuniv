// ========================================
// Internationalization (i18n) System
// ========================================

// Get current language from localStorage (defaults to Indonesian 'id')
function getInitialLanguage() {
    const savedLang = localStorage.getItem('jakpat-language');
    if (savedLang && (savedLang === 'id' || savedLang === 'en')) {
        return savedLang;
    }
    return 'id';
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

    // University trust anchor ARIA label
    const logoStrip = document.querySelector('.university-trust');
    if (logoStrip && data.trust.marqueeAriaLabel1) {
        logoStrip.setAttribute('aria-label', data.trust.marqueeAriaLabel1);
    }

    // Floating Webinar Card
    const webinarFloat = document.getElementById('webinar-float');
    if (webinarFloat && data.webinar && data.webinar.regionAriaLabel) {
        webinarFloat.setAttribute('aria-label', data.webinar.regionAriaLabel);
    }
    const webinarClose = document.getElementById('webinar-float-close');
    if (webinarClose && data.webinar && data.webinar.closeAriaLabel) {
        webinarClose.setAttribute('aria-label', data.webinar.closeAriaLabel);
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

// Navigation background on scroll + active link state
window.addEventListener('scroll', () => {
    const nav = document.querySelector('.nav');

    // Add scrolled class for navbar elevation effect
    if (nav) {
        if (window.scrollY > 50) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }
    }

    // Keep Home highlighted on the landing page (Webinar & Survey link to separate routes)
    const homeLink = document.querySelector('.nav-links a[href="#beranda"]');
    if (homeLink && !homeLink.classList.contains('active')) {
        homeLink.classList.add('active');
    }
});

// Testimonials toggle functionality
function toggleTestimonials() {
    const container = document.querySelector('.testimonials-container');
    const button = document.querySelector('.show-more-btn');
    if (!container || !button) return;
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

// Webinar floating card: diisi dinamis dari /api/webinar/events; bisa ditutup per sesi.
(function initWebinarFloat() {
    var widget = document.getElementById('webinar-float');
    var inner = document.getElementById('webinar-float-inner');
    var closeBtn = document.getElementById('webinar-float-close');
    if (!widget || !inner || typeof fetch !== 'function') return;

    var supportsDisplayTransition;
    function canTransitionDisplay() {
        if (supportsDisplayTransition !== undefined) return supportsDisplayTransition;
        if (!window.CSS || !CSS.supports || !CSS.supports('transition-behavior', 'allow-discrete') || !document.body) {
            supportsDisplayTransition = false;
            return false;
        }
        var probe = document.createElement('div');
        probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
        document.body.appendChild(probe);
        getComputedStyle(probe).display;
        probe.style.display = 'none';
        supportsDisplayTransition = getComputedStyle(probe).display === 'block';
        probe.remove();
        return supportsDisplayTransition;
    }

    function hideWebinarFloat() {
        if (canTransitionDisplay()) {
            widget.hidden = true;
            return;
        }
        widget.setAttribute('data-closing', '');
        var animations = typeof widget.getAnimations === 'function' ? widget.getAnimations() : [];
        if (animations.length === 0) {
            widget.removeAttribute('data-closing');
            widget.hidden = true;
            return;
        }
        Promise.race([
            Promise.allSettled(animations.map(function (a) { return a.finished; })),
            new Promise(function (resolve) { setTimeout(resolve, 600); })
        ]).then(function () {
            if (widget.hasAttribute('data-closing')) {
                widget.removeAttribute('data-closing');
                widget.hidden = true;
            }
        });
    }

    function isDismissed(key) {
        try {
            return sessionStorage.getItem(key) === '1';
        } catch (e) {
            return false;
        }
    }

    function markDismissed(key) {
        try {
            sessionStorage.setItem(key, '1');
        } catch (e) {
            // Ignore storage restrictions
        }
    }

    function text(tag, className, value) {
        var el = document.createElement(tag);
        if (className) el.className = className;
        el.textContent = value;
        return el;
    }

    function translated(key, fallback) {
        var data = typeof translations !== 'undefined' ? translations[currentLanguage] : null;
        return (data && data.webinar && data.webinar[key]) || fallback;
    }

    function createPoster(view) {
        if (/^https:\/\//i.test(view.poster_url || '')) {
            var img = document.createElement('img');
            img.className = 'wf-poster';
            img.src = view.poster_url;
            img.alt = view.title || 'Poster Kelas JFU';
            img.width = 1280;
            img.height = 720;
            img.decoding = 'async';
            img.addEventListener('load', function () {
                if (img.naturalWidth && img.naturalHeight) {
                    img.style.aspectRatio = img.naturalWidth + ' / ' + img.naturalHeight;
                }
            });
            return img;
        }
        var fallback = document.createElement('div');
        fallback.className = 'wf-poster-fallback';
        fallback.setAttribute('aria-hidden', 'true');
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '28');
        svg.setAttribute('height', '28');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', '3');
        rect.setAttribute('y', '4');
        rect.setAttribute('width', '18');
        rect.setAttribute('height', '18');
        rect.setAttribute('rx', '2');
        var p1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        p1.setAttribute('x1', '16'); p1.setAttribute('y1', '2'); p1.setAttribute('x2', '16'); p1.setAttribute('y2', '6');
        var p2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        p2.setAttribute('x1', '8'); p2.setAttribute('y1', '2'); p2.setAttribute('x2', '8'); p2.setAttribute('y2', '6');
        var p3 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        p3.setAttribute('x1', '3'); p3.setAttribute('y1', '10'); p3.setAttribute('x2', '21'); p3.setAttribute('y2', '10');
        svg.appendChild(rect);
        svg.appendChild(p1);
        svg.appendChild(p2);
        svg.appendChild(p3);
        fallback.appendChild(svg);
        return fallback;
    }

    function renderWidget(view) {
        inner.textContent = '';

        var top = document.createElement('div');
        top.className = 'wf-topbar';
        var toneClass = view.tone === 'on_sale'
            ? ' is-sale'
            : (view.tone === 'soon' ? ' is-soon' : (view.tone === 'held' ? ' is-held' : ''));
        top.appendChild(text('span', 'wf-badge' + toneClass, view.badge || 'Kelas JFU'));
        if (view.seats_label) {
            top.appendChild(text('span', 'wf-seats', view.seats_label));
        }
        inner.appendChild(top);

        var content = document.createElement('div');
        content.className = 'wf-content';
        content.appendChild(createPoster(view));

        var body = document.createElement('div');
        body.className = 'wf-body';

        var heading = document.createElement('h3');
        heading.className = 'wf-title';
        heading.id = 'webinar-float-title';
        var link = document.createElement('a');
        link.className = 'wf-link';
        link.href = view.detail_url || '/webinar';
        link.textContent = view.title;
        heading.appendChild(link);
        body.appendChild(heading);

        var metaText = view.schedule_label || view.kind_label || view.note || '';
        if (metaText) {
            body.appendChild(text('p', 'wf-meta', metaText));
        }

        var footer = document.createElement('div');
        footer.className = 'wf-footer';
        if (view.price_label) {
            footer.appendChild(text('span', 'wf-price', view.price_label));
        }
        var ctaWrap = document.createElement('span');
        ctaWrap.className = 'wf-cta';
        ctaWrap.setAttribute('aria-hidden', 'true');
        var ctaSpan = text('span', '', translated('cta', 'Lihat Kelas JFU'));
        ctaSpan.setAttribute('data-i18n', 'webinar.cta');
        ctaWrap.appendChild(ctaSpan);
        ctaWrap.appendChild(document.createTextNode(' →'));
        footer.appendChild(ctaWrap);
        body.appendChild(footer);

        content.appendChild(body);
        inner.appendChild(content);
    }

    fetch('/api/webinar/events')
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (data) {
            var items = data && data.open === true && Array.isArray(data.homepage) ? data.homepage : [];
            if (items.length === 0) return;

            var primary = items[0];
            var dismissKey = 'jfu-webinar-dismissed-' + (primary.slug || primary.id || 'active');
            if (isDismissed(dismissKey)) return;

            renderWidget(primary);

            if (closeBtn) {
                closeBtn.addEventListener('click', function () {
                    markDismissed(dismissKey);
                    hideWebinarFloat();
                });
            }

            widget.removeAttribute('data-closing');
            widget.hidden = false;
        })
        .catch(function (err) { console.error('[webinar]', err); });
})();

// Hero Interactive Layers: Cursor Parallax & Scroll Fallback (Clean Editorial Focus)
(function initHeroInteractions() {
    var hero = document.getElementById('beranda');
    if (!hero) return;

    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    // 1. Subtle Desktop Cursor Parallax (fine pointer only)
    var finePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    if (finePointer) {
        var targetX = 0;
        var targetY = 0;
        var currentX = 0;
        var currentY = 0;
        var rafId = null;

        function animateCursor() {
            currentX += (targetX - currentX) * 0.12;
            currentY += (targetY - currentY) * 0.12;

            hero.style.setProperty('--hero-mx', currentX.toFixed(2) + 'px');
            hero.style.setProperty('--hero-my', currentY.toFixed(2) + 'px');

            if (Math.abs(targetX - currentX) > 0.05 || Math.abs(targetY - currentY) > 0.05) {
                rafId = window.requestAnimationFrame(animateCursor);
            } else {
                currentX = targetX;
                currentY = targetY;
                hero.style.setProperty('--hero-mx', currentX.toFixed(2) + 'px');
                hero.style.setProperty('--hero-my', currentY.toFixed(2) + 'px');
                rafId = null;
            }
        }

        function scheduleCursorUpdate() {
            if (rafId === null) {
                rafId = window.requestAnimationFrame(animateCursor);
            }
        }

        hero.addEventListener('pointermove', function (e) {
            if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
            var rect = hero.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            var normX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
            var normY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
            targetX = normX * 14;
            targetY = normY * 10;
            scheduleCursorUpdate();
        });

        hero.addEventListener('pointerleave', function () {
            targetX = 0;
            targetY = 0;
            scheduleCursorUpdate();
        });
    }

    // 2. Scroll Parallax Fallback when CSS Scroll-Driven Animations are unavailable
    var supportsScrollTimeline = window.CSS && CSS.supports && CSS.supports('(animation-timeline: view()) and (animation-range: entry)');
    if (!supportsScrollTimeline) {
        var topCopy = hero.querySelector('.hero-top-copy');
        var orbitSvg = hero.querySelector('.hero-orbit-svg');
        var scrollLayers = [
            ['.hero-portrait-wrap', 16],
            ['.hero-q-slot.c1', -44],
            ['.hero-q-slot.c2', -58],
            ['.hero-q-slot.c3', -30]
        ].map(function (pair) {
            return [hero.querySelector(pair[0]), pair[1]];
        }).filter(function (pair) {
            return Boolean(pair[0]);
        });

        var scrollTicking = false;
        function updateHeroScrollFallback() {
            scrollTicking = false;
            var rect = hero.getBoundingClientRect();
            var h = Math.max(rect.height, 1);
            var progress = Math.min(1, Math.max(0, -rect.top / h));

            if (topCopy) {
                topCopy.style.opacity = String((1 - 0.65 * progress).toFixed(3));
            }
            if (orbitSvg) {
                var scale = (1 + 0.04 * progress).toFixed(3);
                orbitSvg.style.transform = 'translate3d(0,' + (16 * progress).toFixed(1) + 'px,0) scale(' + scale + ')';
            }
            scrollLayers.forEach(function (pair) {
                pair[0].style.transform = 'translate3d(0,' + (pair[1] * progress).toFixed(1) + 'px,0)';
            });
        }

        function onHeroScroll() {
            if (!scrollTicking) {
                scrollTicking = true;
                window.requestAnimationFrame(updateHeroScrollFallback);
            }
        }

        if (typeof IntersectionObserver === 'function') {
            var observer = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        window.addEventListener('scroll', onHeroScroll, { passive: true });
                        onHeroScroll();
                    } else {
                        window.removeEventListener('scroll', onHeroScroll);
                    }
                });
            }, { threshold: 0 });
            observer.observe(hero);
        } else {
            window.addEventListener('scroll', onHeroScroll, { passive: true });
        }
        updateHeroScrollFallback();
    }
})();


