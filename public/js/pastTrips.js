'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const filter = document.getElementById('gallery-filter');
    const grid = document.getElementById('gallery-grid');
    const empty = document.getElementById('gallery-empty');
    if (!filter || !grid) return;

    const items = Array.from(grid.querySelectorAll('.gallery-item'));

    function apply(loc) {
        let shown = 0;
        items.forEach((el) => {
            const match = loc === 'all' || el.dataset.location === loc;
            el.hidden = !match;
            if (match) shown++;
        });
        if (empty) empty.hidden = shown !== 0;
    }

    filter.addEventListener('click', (e) => {
        const btn = e.target.closest('.gallery-chip');
        if (!btn) return;
        filter.querySelectorAll('.gallery-chip').forEach((b) => b.classList.toggle('is-active', b === btn));
        apply(btn.dataset.location);
    });

    grid.addEventListener('click', (e) => {
        const fig = e.target.closest('.gallery-item');
        if (!fig) return;
        openLightbox(fig.querySelector('img'));
    });

    function openLightbox(img) {
        const box = document.createElement('div');
        box.className = 'gallery-lightbox';
        box.innerHTML = '<button class="gallery-lightbox__close" aria-label="' + window.t('js.trip.close') + '">&times;</button><img src="' + img.src + '" alt="' + img.alt + '">';
        const close = () => { box.remove(); document.body.style.overflow = ''; };
        box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('.gallery-lightbox__close')) close(); });
        document.addEventListener('keydown', function esc(ev) {
            if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
        });
        document.body.appendChild(box);
        document.body.style.overflow = 'hidden';
    }
});
