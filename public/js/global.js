(function () {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        document.documentElement.classList.add('js-reveal');
    }
})();

// Translate with the page's i18n bundle; admin pages don't load one, so fall back to English.
function tr(key, fallback, vars) {
    return typeof window.t === 'function' ? window.t(key, vars) : fallback;
}

window.buildLoginHref = function () {
    const path = window.location.pathname;
    if (/^\/(login|register)(\/|$)/.test(path)) return '/login';
    const target = path + window.location.search + window.location.hash;
    return '/login?redirect=' + encodeURIComponent(target);
};

function augmentLoginLinks(root) {
    const scope = root || document;
    const path = window.location.pathname;

    if (/^\/(login|register)(\/|$)/.test(path)) {
        const pending = new URLSearchParams(window.location.search).get('redirect');
        if (!pending) return;
        const q = '?redirect=' + encodeURIComponent(pending);
        scope.querySelectorAll('a[href="/login"], a[href="/register"], a[href^="/login?"], a[href^="/register?"]').forEach(a => {
            a.setAttribute('href', a.getAttribute('href').split('?')[0] + q);
        });
        return;
    }

    scope.querySelectorAll('a[href="/login"], a[href^="/login?"]').forEach(a => {
        a.setAttribute('href', window.buildLoginHref());
    });
}
window.augmentLoginLinks = augmentLoginLinks;

document.addEventListener('DOMContentLoaded', () => augmentLoginLinks());

window.AccountChip = {
    init: function () {
        const chips = document.querySelectorAll('[data-account-chip]');
        if (!chips.length) return;

        const session = window.SERVER_USER;
        if (!session) return;

        const name = session.name || session.email?.split('@')[0] || tr('js.common.traveller', 'Traveller');
        const image = session.image || '';

        chips.forEach(chip => {
            const nameEl = chip.querySelector('[data-account-name]');
            const avatarEl = chip.querySelector('[data-account-avatar]');

            if (nameEl) nameEl.textContent = name;

            if (avatarEl) {
                avatarEl.innerHTML = '';
                if (image) {
                    const img = document.createElement('img');
                    img.src = image;
                    img.alt = name;
                    avatarEl.appendChild(img);
                } else {
                    const icon = document.createElement('i');
                    icon.className = 'fas fa-user';
                    avatarEl.appendChild(icon);
                }
            }

            chip.hidden = false;
        });
    }
};

document.addEventListener('DOMContentLoaded', function () {
    if (window.AccountChip) window.AccountChip.init();
});

window.LoginGate = {
    isLoggedIn: function () {
        const u = window.SERVER_USER || (window.SERVER_DATA && window.SERVER_DATA.user);
        return !!(u && (u.email || u._id));
    },

    getMessageForPage: function () {
        const p = window.location.pathname.toLowerCase();
        if (p.includes('dashboard')) return tr('js.loginGate.dashboard', 'You must be logged in to view the dashboard.');
        if (p.includes('my-bookings') || p.includes('mybookings')) return tr('js.loginGate.bookings', 'You must be logged in to view your bookings.');
        if (p.includes('profile') || p.includes('userprofile')) return tr('js.loginGate.profile', 'You must be logged in to view profile settings.');
        if (p.includes('reviews') || p.includes('writing-reviews') || p.includes('customerreviews')) {
            return tr('js.loginGate.reviews', 'You must be logged in to write reviews.');
        }
        if (p.includes('custom-trip') || p.includes('customtripbuilder')) {
            return tr('js.loginGate.customTrip', 'You must be logged in to build your own trip.');
        }
        return tr('js.loginGate.default', 'You must be logged in to view this page.');
    },

    ensureModal: function () {
        if (document.getElementById('login-required-modal')) return;

        const modal = document.createElement('div');
        modal.id = 'login-required-modal';
        modal.className = 'modal-overlay hidden';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'login-modal-title');
        modal.innerHTML = `
            <div class="modal-content login-required-modal">
                <div class="modal-header">
                    <h2 id="login-modal-title"><i class="fas fa-lock"></i> ${tr('js.loginGate.title', 'Login Required')}</h2>
                </div>
                <p id="login-required-message" class="login-required-message"></p>
                <div class="modal-actions">
                    <button type="button" id="login-gate-go-back-btn" class="btn btn--outline">${tr('js.loginGate.goBack', 'Go Back')}</button>
                    <a href="/login" id="login-gate-login-btn" class="btn btn--primary">${tr('js.loginGate.logIn', 'Log In')}</a>
                </div>
            </div>`;
        document.body.appendChild(modal);

        const self = this;
        document.getElementById('login-gate-go-back-btn').addEventListener('click', (e) => {
            e.preventDefault();
            self.hide();
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) self.hide();
        });
    },

    hide: function () {
        const modal = document.getElementById('login-required-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
        }
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        const shell = document.querySelector('.page-shell, .dashboard-shell');
        if (shell) shell.removeAttribute('aria-hidden');
    },

    show: function (options) {
        const opts = options || {};
        const message = opts.message || this.getMessageForPage();
        this.ensureModal();

        const msgEl = document.getElementById('login-required-message');
        if (msgEl) msgEl.textContent = message;

        const loginBtn = document.getElementById('login-gate-login-btn');
        if (loginBtn) loginBtn.href = window.buildLoginHref();

        const modal = document.getElementById('login-required-modal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            modal.style.cssText = [
                'position:fixed',
                'inset:0',
                'z-index:10000',
                'display:flex',
                'align-items:center',
                'justify-content:center',
                'background:rgba(0,0,0,0.6)',
                'backdrop-filter:blur(12px)'
            ].join(';');
        }

        const shell = document.querySelector('.page-shell, .dashboard-shell');
        if (shell) shell.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = 'hidden';
    },

    requireLogin: function (options) {
        if (this.isLoggedIn()) return true;
        this.show(options);
        return false;
    },

    updateSidebarAuth: function () {
        const loggedIn = this.isLoggedIn();
        document.querySelectorAll('.dashboard-sidebar .logout-link, .page-sidebar .logout-link').forEach(link => {
            link.style.display = loggedIn ? '' : 'none';
        });
    },

    getProtectedSegments: function () {
        return [
            { segment: '/dashboard',     message: tr('js.loginGate.dashboard', 'You must be logged in to view the dashboard.') },
            { segment: '/my-bookings',   message: tr('js.loginGate.bookings', 'You must be logged in to view your bookings.') },
            { segment: '/profile',       message: tr('js.loginGate.profile', 'You must be logged in to view profile settings.') },
            { segment: '/reviews/write', message: tr('js.loginGate.reviews', 'You must be logged in to write reviews.') },
            { segment: '/custom-trip',   message: tr('js.loginGate.customTrip', 'You must be logged in to build your own trip.') },
        ];
    },

    guardProtectedNavLinks: function () {
        if (this.isLoggedIn()) return;

        const protectedSegments = this.getProtectedSegments();

        const selector = [
            '.dashboard-sidebar a[href]',
            '.page-sidebar a[href]',
            '.navbar .nav-menu a[href]',
            '.nav-menu a[href]',
            'nav a[href]'
        ].join(', ');

        const seen = new WeakSet();
        document.querySelectorAll(selector).forEach(anchor => {
            if (seen.has(anchor)) return;
            seen.add(anchor);

            const href = anchor.getAttribute('href') || '';
            const match = protectedSegments.find(item => {
                if (item.segment.startsWith('/')) {
                    return href === item.segment || href.startsWith(item.segment + '?') || href.startsWith(item.segment + '/');
                }
                return href.includes(item.segment);
            });
            if (!match) return;

            anchor.addEventListener('click', (e) => {
                e.preventDefault();
                this.show({ message: match.message });
            });
        });
    }
};

window.addEventListener('pageshow', () => {
    if (window.LoginGate) LoginGate.hide();
});

document.addEventListener('DOMContentLoaded', () => {
    if (!document.querySelector('.scroll-progress')) {
        const progress = document.createElement('div');
        progress.className = 'scroll-progress';
        document.body.appendChild(progress);
    }
    if (!document.querySelector('.noise-overlay')) {
        const noise = document.createElement('div');
        noise.className = 'noise-overlay';
        document.body.appendChild(noise);
    }

    const progressBar = document.querySelector('.scroll-progress');
    if (progressBar) {
        let progressTicking = false;
        const updateProgress = () => {
            const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
            const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            progressBar.style.transform = `scaleX(${height > 0 ? winScroll / height : 0})`;
            progressTicking = false;
        };
        window.addEventListener('scroll', () => {
            if (progressTicking) return;
            progressTicking = true;
            requestAnimationFrame(updateProgress);
        }, { passive: true });
        updateProgress();
    }

    // Reveal as soon as any part is on screen: a ratio threshold never fires for
    // blocks much taller than the viewport (e.g. a long bookings list on mobile),
    // which left them invisible until the user scrolled.
    const observerOptions = {
        threshold: 0,
        rootMargin: '0px 0px -50px 0px'
    };

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                revealObserver.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.reveal-up').forEach(el => {
        revealObserver.observe(el);
    });

    const sidebarLinks = document.querySelectorAll('.dashboard-sidebar a, .sidebar a');
    const currentPath = window.location.pathname.split('/').pop();

    sidebarLinks.forEach(link => {
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('active');
        }
    });

    if (window.LoginGate) {
        LoginGate.hide();
        LoginGate.updateSidebarAuth();
        LoginGate.guardProtectedNavLinks();
    }
    updateAuthUI();

    populateDashboardAvatar();
    initGlobalThemeToggle();
    initHamburgerMenus();
});

function populateDashboardAvatar() {
    const avatarEl = document.getElementById('user-avatar');
    if (!avatarEl) return;

    const user = window.SERVER_USER;
    if (!user) return;

    const displayName = user.name || user.email?.split('@')[0] || tr('js.common.traveller', 'Traveller');
    const photoUrl    = user.image || null;

    if (photoUrl) {
        avatarEl.innerHTML = `
            <img src="${photoUrl}" alt="${displayName}"
                style="width:100%;height:100%;object-fit:cover;border-radius:50%;"
                onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
            <span style="display:none;align-items:center;justify-content:center;width:100%;height:100%;">
                <i class="fas fa-user-circle" style="font-size:1.5rem;color:var(--crimson);"></i>
            </span>`;
    } else {
        avatarEl.innerHTML = `<i class="fas fa-user-circle" style="font-size:1.5rem;color:var(--crimson);"></i>`;
    }
    avatarEl.title = displayName;
}

function initGlobalThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle || themeToggle.dataset.themeBound === 'true') return;
    themeToggle.dataset.themeBound = 'true';

    function applyThemeToUI(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);

        const sunIcon = themeToggle.querySelector('.sun-icon');
        const moonIcon = themeToggle.querySelector('.moon-icon');
        if (sunIcon && moonIcon) {
            if (theme === 'dark') {
                sunIcon.style.display = 'block';
                moonIcon.style.display = 'none';
                themeToggle.setAttribute('aria-label', tr('js.theme.toLight', 'Switch to Light Mode'));
            } else {
                sunIcon.style.display = 'none';
                moonIcon.style.display = 'block';
                themeToggle.setAttribute('aria-label', tr('js.theme.toDark', 'Switch to Dark Mode'));
            }
        }

        const icon = themeToggle.querySelector('i:not(.sun-icon):not(.moon-icon)');
        const span = themeToggle.querySelector('span');

        if (icon) icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        if (span) span.textContent = theme === 'dark' ? tr('nav.lightMode', 'Light Mode') : tr('nav.darkMode', 'Dark Mode');
    }

    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const currentTheme = document.documentElement.getAttribute('data-theme')
        || savedTheme
        || (prefersDark ? 'dark' : 'light');
    applyThemeToUI(currentTheme);

    themeToggle.addEventListener('click', () => {
        const activeTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        const newTheme = activeTheme === 'dark' ? 'light' : 'dark';
        applyThemeToUI(newTheme);
    });

    window.addEventListener('storage', function (e) {
        if (e.key === 'theme' && e.newValue) applyThemeToUI(e.newValue);
    });
}

function updateAuthUI() {
    const userSession = window.SERVER_USER;
    if (!userSession) return;

    const heroStartJourney = document.getElementById('hero-start-journey');
    if (heroStartJourney) heroStartJourney.style.display = 'none';

    const displayName = userSession.name || userSession.email?.split('@')[0] || 'Traveller';

    const welcomeStrong = document.querySelector('.welcome-text strong, .top-bar-left strong');
    if (welcomeStrong) welcomeStrong.textContent = displayName;

    const userGreeting = document.getElementById('userGreeting');
    if (userGreeting) userGreeting.textContent = displayName;

    const logoutHandler = async e => {
        e.preventDefault();
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
        window.location.href = '/';
    };

    ['logout-btn', 'logout-link'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.dataset.wired) { el.dataset.wired = 'true'; el.addEventListener('click', logoutHandler); }
    });

    document.querySelectorAll('.dashboard-sidebar .logout-link, .page-sidebar .logout-link').forEach(link => {
        if (link.dataset.wired) return;
        link.dataset.wired = 'true';
        link.addEventListener('click', logoutHandler);
    });

    if (window.LoginGate) LoginGate.updateSidebarAuth();
}

function initHamburgerMenus() {
    const sidebar = document.querySelector('.dashboard-sidebar, .page-sidebar');
    const mainContent = document.querySelector('.dashboard-main, .page-content');

    if (sidebar && mainContent) {
        const overlay = document.createElement('div');
        overlay.id = 'sidebar-overlay';
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);

        const mobileBar = document.createElement('div');
        mobileBar.className = 'mobile-topbar';
        mobileBar.innerHTML = `
            <button class="hamburger-btn" id="sidebar-hamburger" aria-label="${tr('nav.openMenu', 'Toggle menu')}">
                <span></span><span></span><span></span>
            </button>
            <a href="/" class="mobile-topbar__brand wordmark" aria-label="${tr('js.topbar.homeAria', 'Adrenaline home')}">
                <svg class="wordmark__mark" viewBox="0 0 64 56" aria-hidden="true" focusable="false">
                    <path class="wordmark__ridge" d="M4 51 L25 7 L37 30 L45 18.5 L60 51"/>
                    <path class="wordmark__pulse" d="M9 40 H17.5 L20.5 33.5 L23.5 45 L27 21.5 L30.5 48.5 L33.5 37 L36.5 40 H55"/>
                </svg>
                <span class="wordmark__text"><em>A</em>DREN<em>A</em>LINE</span>
            </a>`;
        // On mobile the sidebar (and the theme toggle inside it) is off-canvas, so
        // mirror the toggle in the top bar. It clicks the sidebar button so
        // global.js / admin-theme.js keep owning the theme logic.
        // Customer pages (the ones with an i18n bundle) get the language switch here too.
        if (window.I18N) {
            const url = new URL(window.location.href);
            url.searchParams.set('lang', window.I18N.lang === 'ar' ? 'en' : 'ar');
            const langBtn = document.createElement('a');
            langBtn.className = 'mobile-topbar__lang';
            langBtn.href = url.pathname + url.search;
            langBtn.setAttribute('aria-label', tr('nav.langAria', 'Switch language'));
            langBtn.textContent = tr('nav.langShort', 'عربي');
            mobileBar.appendChild(langBtn);
        }

        const sidebarTheme = document.getElementById('admin-theme-toggle') || document.getElementById('theme-toggle');
        if (sidebarTheme) {
            const themeBtn = document.createElement('button');
            themeBtn.type = 'button';
            themeBtn.className = 'mobile-topbar__theme';
            themeBtn.setAttribute('aria-label', tr('nav.toggleTheme', 'Toggle theme'));
            const syncThemeIcon = () => {
                const dark = document.documentElement.getAttribute('data-theme') === 'dark';
                themeBtn.innerHTML = `<i class="fas ${dark ? 'fa-sun' : 'fa-moon'}" aria-hidden="true"></i>`;
            };
            syncThemeIcon();
            new MutationObserver(syncThemeIcon).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
            themeBtn.addEventListener('click', () => sidebarTheme.click());
            mobileBar.appendChild(themeBtn);
        }

        // Every sidebar layout (public pages, customer dashboard, admin) gets the
        // signed-in chip; the desktop header chip is hidden on mobile.
        const user = window.SERVER_USER;
        if (user) {
            const chipEl = document.createElement('div');
            chipEl.className = 'mobile-account-chip';
            const name = user.name ? user.name.split(' ')[0] : (user.email || '').split('@')[0];
            const avatarHtml = user.image
                ? `<img src="${user.image}" alt="${name}" onerror="this.style.display='none'">`
                : `<i class="fas fa-user"></i>`;
            chipEl.innerHTML = `
                <div class="mobile-account-chip__avatar">${avatarHtml}</div>
                <div class="mobile-account-chip__info">
                    <span class="mobile-account-chip__label">${tr('nav.signedInAs', 'Signed in as')}</span>
                    <strong class="mobile-account-chip__name">${name}</strong>
                </div>`;
            mobileBar.appendChild(chipEl);
        }

        mainContent.insertBefore(mobileBar, mainContent.firstChild);

        document.getElementById('sidebar-hamburger').addEventListener('click', () => {
            const open = sidebar.classList.toggle('sidebar--open');
            overlay.classList.toggle('active', open);
        });

        overlay.addEventListener('click', () => {
            sidebar.classList.remove('sidebar--open');
            overlay.classList.remove('active');
        });

        sidebar.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                sidebar.classList.remove('sidebar--open');
                overlay.classList.remove('active');
            });
        });
    }

    const navContainer = document.querySelector('.nav-container');
    const navMenu = document.querySelector('.nav-menu');
    if (!navContainer || !navMenu) return;

    const navHamburger = document.createElement('button');
    navHamburger.className = 'hamburger-btn nav-hamburger';
    navHamburger.id = 'nav-hamburger';
    navHamburger.setAttribute('aria-label', tr('js.topbar.toggleNav', 'Toggle navigation'));
    navHamburger.innerHTML = '<span></span><span></span><span></span>';
    navContainer.appendChild(navHamburger);

    const navOverlay = document.createElement('div');
    navOverlay.id = 'mobile-nav-overlay';
    navOverlay.className = 'mobile-nav-overlay';
    document.body.appendChild(navOverlay);

    navHamburger.style.display = 'none';
    const _logoW = (navContainer.querySelector('.logo') || {}).offsetWidth || 0;
    const _actionsW = (navContainer.querySelector('.nav-actions') || {}).offsetWidth || 0;
    const _menuW = navMenu.scrollWidth;
    navHamburger.style.display = '';
    const _neededWidth = _logoW + _menuW + _actionsW + 80;

    function checkNavCollapse() {
        document.body.classList.toggle('nav-collapsing', _neededWidth > navContainer.offsetWidth);
    }

    const navRO = new ResizeObserver(checkNavCollapse);
    navRO.observe(document.querySelector('.navbar') || navContainer);
    checkNavCollapse();

    const navActions = navContainer.querySelector('.nav-actions');

    function openNav() {
        document.body.classList.add('nav-open');
        navHamburger.classList.add('hamburger--open');
        navOverlay.classList.add('active');
        const navButtons = navContainer.querySelector('.nav-buttons');
        if (navButtons) navMenu.appendChild(navButtons);
    }

    function closeNav() {
        document.body.classList.remove('nav-open');
        navHamburger.classList.remove('hamburger--open');
        navOverlay.classList.remove('active');
        const navButtons = navMenu.querySelector('.nav-buttons');
        if (navButtons && navActions) navActions.appendChild(navButtons);
    }

    navHamburger.addEventListener('click', () => {
        document.body.classList.contains('nav-open') ? closeNav() : openNav();
    });

    navOverlay.addEventListener('click', closeNav);

    document.querySelectorAll('.nav-menu .nav-link').forEach(link => {
        link.addEventListener('click', closeNav);
    });
}
