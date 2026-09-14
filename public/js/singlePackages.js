document.addEventListener('DOMContentLoaded', renderSingleLocations);

function renderSingleLocations() {
    const container = document.querySelector('.packages-container');
    if (!container) return;

    const singles = (window.SERVER_PACKAGES || []).filter(p => p.type === 'single' && p.status !== 'inactive');

    if (!singles.length) {
        container.innerHTML = `<p class="empty-note" style="color:var(--text-muted);padding:2rem;">${window.t('js.trip.nothingYet')}</p>`;
        return;
    }

    container.innerHTML = '';

    singles.forEach(pkg => {
        const card = document.createElement('article');
        card.className = 'card trip-card trip-card--static reveal-up';

        const image = pkg.image || '/images/layoutImage.jpg';

        card.innerHTML = `
            <div class="trip-card__media media" style="background-image:url('${image}')">
                <span class="tag">${pkg.city || window.t('js.trip.egypt')}</span>
            </div>
            <div class="trip-card__body">
                <p class="label label--sm trip-card__kind">${window.t('js.trip.kindPump')}</p>
                <h3 class="trip-card__title">${pkg.name}</h3>
                <p class="trip-card__desc">${pkg.description || ''}</p>
            </div>
        `;
        container.appendChild(card);
    });

    document.querySelectorAll('.reveal-up').forEach(el => {
        const obs = new IntersectionObserver((entries) => {
            entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('active'); obs.unobserve(e.target); } });
        }, { threshold: 0 });
        obs.observe(el);
    });
}
