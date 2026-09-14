const catalogPackages = (window.SERVER_PACKAGES || []).filter(p => p.type === 'day' && p.status !== 'inactive');
const packagesGrid = document.getElementById('packagesGrid');

renderPackages(catalogPackages);

function renderPackages(list) {
    if (!packagesGrid) return;
    packagesGrid.innerHTML = '';

    if (!list.length) {
        packagesGrid.innerHTML = `<p class="empty-note" style="color:var(--text-muted);padding:2rem;">${window.t('js.trip.nothingYet')}</p>`;
        return;
    }

    list.forEach(pkg => {
        const card = document.createElement('article');
        card.className = 'trip-card trip-card--static';

        const image = pkg.image || '/images/layoutImage.jpg';

        card.innerHTML = `
            <div class="trip-card__media media" style="background-image:url('${image}')">
                <span class="tag">${pkg.city || window.t('js.trip.egypt')}</span>
            </div>
            <div class="trip-card__body">
                <p class="label label--sm trip-card__kind">${window.t('js.trip.kindTal3a')}</p>
                <h3 class="trip-card__title">${pkg.name}</h3>
                <p class="trip-card__desc">${pkg.description || ''}</p>
            </div>
        `;

        packagesGrid.appendChild(card);
    });
}
