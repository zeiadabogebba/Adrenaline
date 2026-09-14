document.addEventListener('DOMContentLoaded', () => {
    initSmoothScroll();
    initNavbarScroll();
    initRevealAnimations();
    initHeroParallax();
});

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function initNavbarScroll() {
    const nav = document.getElementById('main-nav');
    if (!nav) return;

    const handleScroll = () => {
        nav.classList.toggle('navbar--scrolled', window.scrollY > 40);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
}

function initRevealAnimations() {
    const targets = document.querySelectorAll('.reveal-up');
    if (!targets.length) return;

    if (reducedMotion.matches || !('IntersectionObserver' in window)) {
        targets.forEach(el => el.classList.add('active'));
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('active');
            observer.unobserve(entry.target);
        });
    }, { threshold: 0, rootMargin: '0px 0px -40px 0px' });

    targets.forEach(el => observer.observe(el));
}

function initHeroParallax() {
    if (reducedMotion.matches) return;

    const video = document.querySelector('.hero-video');
    const content = document.querySelector('.hero-content');
    if (!video && !content) return;

    let ticking = false;

    const update = () => {
        const scrolled = window.pageYOffset;
        const limit = window.innerHeight;

        if (scrolled < limit) {
            if (video) video.style.transform = `scale(${1 + scrolled * 0.00025})`;
            if (content) {
                content.style.transform = `translateY(${scrolled * 0.32}px)`;
                content.style.opacity = String(Math.max(0, 1 - scrolled / (limit * 0.75)));
            }
        }
        ticking = false;
    };

    window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(update);
    }, { passive: true });
}

function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (!targetId || targetId === '#') return;

            const target = document.querySelector(targetId);
            if (!target) return;

            e.preventDefault();
            const navHeight = document.getElementById('main-nav')?.offsetHeight || 0;
            const top = target.getBoundingClientRect().top + window.pageYOffset - navHeight;
            window.scrollTo({
                top,
                behavior: reducedMotion.matches ? 'auto' : 'smooth'
            });
        });
    });
}

function initAdrenalineMetric() {
    const tiers = document.querySelectorAll('.tier');
    if (!tiers.length) return;

    const ring = document.getElementById('dialRing');
    const value = document.getElementById('dialValue');
    const status = document.getElementById('dialStatus');
    if (!ring || !value || !status) return;

    const CIRCUMFERENCE = 264;
    const MAX_BPM = 190;

    const apply = (tier) => {
        const bpm = Number(tier.dataset.bpm) || 0;
        tiers.forEach(t => t.classList.toggle('is-active', t === tier));
        ring.style.strokeDashoffset = String(
            CIRCUMFERENCE * (1 - Math.min(bpm / MAX_BPM, 1))
        );
        value.textContent = String(bpm);
        status.textContent = tier.dataset.status || '';
    };

    tiers.forEach(tier => {
        tier.addEventListener('click', () => apply(tier));
        tier.addEventListener('mouseenter', () => apply(tier));
    });

    const initial = document.querySelector('.tier.is-active') || tiers[0];
    apply(initial);
}

document.addEventListener('DOMContentLoaded', initAdrenalineMetric);
