'use strict';

// City guide reader: keeps the floating counter in sync with the page in view and
// lets the toolbar (or the arrow keys) jump between pages.
document.addEventListener('DOMContentLoaded', () => {
    const pages = Array.from(document.querySelectorAll('.guide-page'));
    const current = document.querySelector('[data-current]');
    const toolbar = document.querySelector('.guide-toolbar');
    if (!pages.length || !current || !toolbar) return;

    const prevBtn = toolbar.querySelector('[data-go="prev"]');
    const nextBtn = toolbar.querySelector('[data-go="next"]');
    const topBtn = toolbar.querySelector('[data-go="top"]');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let index = -1;

    const setIndex = (i, updateHash) => {
        if (i === index) return;
        index = i;
        current.textContent = String(i + 1);
        prevBtn.disabled = i === 0;
        nextBtn.disabled = i === pages.length - 1;
        // Remember the page so a refresh or shared link opens at the same spot.
        if (updateHash) history.replaceState(null, '', i === 0 ? location.pathname + location.search : '#page-' + (i + 1));
    };

    // The page crossing the middle of the viewport is the one being read.
    const pageInView = () => {
        const mid = window.innerHeight / 2;
        let best = 0;
        let bestDistance = Infinity;
        pages.forEach((page, i) => {
            const rect = page.getBoundingClientRect();
            const distance = rect.top <= mid && rect.bottom >= mid ? 0 : Math.min(Math.abs(rect.top - mid), Math.abs(rect.bottom - mid));
            if (distance < bestDistance) { bestDistance = distance; best = i; }
        });
        return best;
    };

    const goTo = (i) => {
        const target = pages[Math.max(0, Math.min(pages.length - 1, i))];
        target.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
    };

    let ticking = false;
    let userScrolled = false;
    window.addEventListener('scroll', () => {
        userScrolled = true;
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => { ticking = false; setIndex(pageInView(), userScrolled); });
    }, { passive: true });

    prevBtn.addEventListener('click', () => goTo(index - 1));
    nextBtn.addEventListener('click', () => goTo(index + 1));
    topBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' }));

    document.addEventListener('keydown', (e) => {
        if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest('input, textarea, select, [contenteditable]')) return;
        const rtl = document.documentElement.dir === 'rtl';
        const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
        const back = rtl ? 'ArrowRight' : 'ArrowLeft';
        if (e.key === forward) { e.preventDefault(); goTo(index + 1); }
        else if (e.key === back) { e.preventDefault(); goTo(index - 1); }
    });

    setIndex(pageInView(), false);
});
