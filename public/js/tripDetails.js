let trip = null;
let travelers = 1;
let maxTravelers = 15;

document.addEventListener('DOMContentLoaded', () => {
    if (!window.SERVER_TRIP) { renderNotFound(); return; }
    trip = window.SERVER_TRIP;

    if (trip.spotsLeft != null) {
        maxTravelers = Math.max(1, Math.min(15, trip.spotsLeft));
    }
    travelers = Math.min(travelers, maxTravelers);

    renderPage();
});

function money(n) {
    return Number(n || 0).toLocaleString('en-US');
}

function splitList(str, sep) {
    if (!str) return [];
    return String(str).split(sep).map(s => s.trim()).filter(Boolean);
}

function renderPage() {
    document.title = window.t('js.trip.pageTitle', { title: trip.title });
    document.getElementById('trip-root').innerHTML = buildHTML();

    requestAnimationFrame(() => {
        requestAnimationFrame(() => document.querySelector('.pkg-hero')?.classList.add('is-visible'));
    });

    initTravellerCounter();
    initBookingAction();
    updateTotal();
}

function buildHTML() {
    const included = splitList(trip.includedServices, /[,،]/);
    const highlights = splitList(trip.highlights, '|');
    const soldOut = trip.spotsLeft != null && trip.spotsLeft <= 0;
    const image = trip.image || '/images/layoutImage.jpg';

    return `
    <section class="pkg-hero" role="banner">
        <div class="pkg-hero__bg" style="background-image: url('${image}');"></div>
        <div class="pkg-hero__overlay"></div>
        <div class="pkg-hero__tear">
            <svg viewBox="0 0 1440 80" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M0,40 C120,80 200,0 360,40 C520,80 600,20 720,40 C840,60 920,10 1080,40 C1200,65 1350,15 1440,35 L1440,80 L0,80 Z"/>
            </svg>
        </div>
        <div class="pkg-hero__content">
            <div class="pkg-hero__eyebrow">
                <span class="pkg-badge"><i class="fas fa-rocket"></i> ${window.t('js.trip.upcomingTrip')}</span>
                ${trip.date ? `<span class="pkg-badge"><i class="fas fa-calendar-day"></i> ${trip.date}</span>` : ''}
                ${trip.durationText ? `<span class="pkg-badge"><i class="fas fa-clock"></i> ${trip.durationText}</span>` : ''}
                ${trip.location ? `<span class="pkg-badge"><i class="fas fa-map-pin"></i> ${trip.location}</span>` : ''}
            </div>
            <h1 class="pkg-hero__title">${trip.title}</h1>
        </div>
    </section>

    <div class="pkg-layout">
        <article class="pkg-content">
            ${trip.description ? `
            <div class="pkg-section">
                <p class="pkg-lead">${trip.description}</p>
                ${highlights.length ? `
                <div class="pkg-highlights">
                    ${highlights.map(h => `<span class="pkg-highlight-pill"><i class="fas fa-check"></i> ${h}</span>`).join('')}
                </div>` : ''}
            </div>` : ''}

            ${included.length ? `
            <section class="pkg-section" aria-label="${window.t('js.trip.whatsIncluded')}">
                <h2 class="pkg-section-title"><i class="fas fa-circle-check"></i> ${window.t('js.trip.whatsIncluded')}</h2>
                <div class="pkg-services">
                    <div class="pkg-services-box included">
                        <h3><i class="fas fa-check-circle"></i> ${window.t('js.trip.included')}</h3>
                        <ul>${included.map(i => `<li><i class="fas fa-check"></i> ${i}</li>`).join('')}</ul>
                    </div>
                </div>
            </section>` : ''}

            ${Array.isArray(trip.itinerary) && trip.itinerary.length ? `
            <section class="pkg-section" aria-label="${window.t('js.trip.itineraryAria')}">
                <h2 class="pkg-section-title"><i class="fas fa-route"></i> ${window.t('js.trip.dayByDay')}</h2>
                <ol class="trip-itinerary">
                    ${trip.itinerary.map(d => `
                    <li class="trip-itinerary__item">
                        <span class="trip-itinerary__day">${window.t('js.trip.day', { n: d.day || '' })}</span>
                        <div class="trip-itinerary__body">
                            ${d.title ? `<h3>${d.title}</h3>` : ''}
                            ${d.desc ? `<p>${d.desc}</p>` : ''}
                        </div>
                    </li>`).join('')}
                </ol>
            </section>` : ''}

            ${Array.isArray(trip.experiencePhotos) && trip.experiencePhotos.length ? `
            <section class="pkg-section" aria-label="${window.t('js.trip.photosAria')}">
                <h2 class="pkg-section-title"><i class="fas fa-camera-retro"></i> ${window.t('js.trip.whatToExpect')}</h2>
                <div class="trip-experience-grid">
                    ${trip.experiencePhotos.map(src => `
                    <a href="${src}" target="_blank" rel="noopener" class="trip-experience-photo">
                        <img src="${src}" alt="${window.t('js.trip.photoAlt', { title: trip.title })}" loading="lazy">
                    </a>`).join('')}
                </div>
            </section>` : ''}

            <section class="pkg-section" aria-label="${window.t('js.trip.tripDetails')}">
                <h2 class="pkg-section-title"><i class="fas fa-info-circle"></i> ${window.t('js.trip.tripDetails')}</h2>
                <div class="pkg-highlights">
                    ${trip.date ? `<span class="pkg-highlight-pill"><i class="fas fa-calendar-day"></i> ${window.t('js.trip.departs', { date: trip.date })}</span>` : ''}
                    ${trip.location ? `<span class="pkg-highlight-pill"><i class="fas fa-location-dot"></i> ${trip.location}</span>` : ''}
                    ${trip.durationText ? `<span class="pkg-highlight-pill"><i class="fas fa-clock"></i> ${trip.durationText}</span>` : ''}
                    ${trip.spotsLeft != null ? `<span class="pkg-highlight-pill"><i class="fas fa-users"></i> ${window.tp('js.trip.spotsLeft', trip.spotsLeft)}</span>` : ''}
                </div>
            </section>
        </article>

        <aside class="pkg-rail" aria-label="${window.t('js.trip.bookingPanel')}">
            <div class="pkg-rail__body">
                <h2 class="pkg-rail__title">${window.t('js.trip.claimSpot')}</h2>
                <p class="pkg-rail__subtitle">${window.t('js.trip.fixedDeparture')}</p>

                <div class="pkg-price-block" id="pkg-price-block">
                    <span class="pkg-price-block__label"><i class="fas fa-compass"></i> ${window.t('js.trip.pricePerPerson')}</span>
                    <span class="pkg-price-block__value">${money(trip.price)} <small>${window.t('js.trip.egp')}</small></span>
                </div>

                <div class="pkg-rail__divider"></div>
                <p class="pkg-rail__label"><i class="fas fa-calendar-days"></i> ${window.t('js.trip.departureDate')}</p>
                <div class="pkg-fixed-date">${trip.date || window.t('js.trip.tba')}</div>

                <div class="pkg-rail__divider"></div>
                <p class="pkg-rail__label"><i class="fas fa-users"></i> ${window.t('js.trip.travellers')}</p>
                <div class="pkg-counter">
                    <button class="pkg-counter-btn" id="traveller-minus" aria-label="${window.t('js.trip.decrease')}"><i class="fas fa-minus"></i></button>
                    <span class="pkg-counter-val" id="traveller-count">1</span>
                    <button class="pkg-counter-btn" id="traveller-plus" aria-label="${window.t('js.trip.increase')}"><i class="fas fa-plus"></i></button>
                </div>
                ${trip.spotsLeft != null ? `<p class="pkg-rail__note" id="spots-note">${window.tp('js.trip.spotsRemaining', trip.spotsLeft)}</p>` : ''}

                <div class="pkg-rail__divider"></div>
                <div class="pkg-total-line">
                    ${window.t('js.trip.total')} <strong id="total-display">–</strong>
                </div>

                <button class="pkg-book-btn" id="book-now-btn" ${soldOut ? 'disabled' : ''}>
                    ${soldOut ? '<i class="fas fa-ban"></i> ' + window.t('js.trip.soldOut') : '<i class="fas fa-suitcase-rolling"></i> ' + window.t('js.trip.continue')}
                </button>

                <div class="pkg-guarantees">
                    <div class="pkg-guarantee-item"><i class="fas fa-wallet"></i> ${window.t('js.trip.guaranteeDeposit')}</div>
                    <div class="pkg-guarantee-item"><i class="fas fa-headset"></i> ${window.t('js.trip.guaranteeSupport')}</div>
                    <div class="pkg-guarantee-item"><i class="fas fa-user-group"></i> ${window.t('js.trip.guaranteeTransfer')}</div>
                </div>
            </div>
        </aside>
    </div>
    `;
}

function initTravellerCounter() {
    const minus = document.getElementById('traveller-minus');
    const plus = document.getElementById('traveller-plus');
    const display = document.getElementById('traveller-count');
    if (!minus || !plus) return;

    const sync = () => {
        display.textContent = travelers;
        minus.disabled = travelers <= 1;
        plus.disabled = travelers >= maxTravelers;
        updateTotal();
    };

    minus.addEventListener('click', () => { if (travelers > 1) { travelers--; sync(); } });
    plus.addEventListener('click', () => { if (travelers < maxTravelers) { travelers++; sync(); } });
    sync();
}

function updateTotal() {
    const total = (trip.price || 0) * travelers;
    const el = document.getElementById('total-display');
    if (el) el.textContent = window.t('js.common.money', { amount: money(total) });
}

function initBookingAction() {
    const btn = document.getElementById('book-now-btn');
    if (!btn || btn.disabled) return;

    btn.addEventListener('click', async () => {
        const session = window.SERVER_USER;
        if (!session || !(session.email || session._id)) {
            const loginHref = window.buildLoginHref ? window.buildLoginHref() : '/login';
            showToast(`<i class="fas fa-lock"></i> <span>${window.t('js.trip.mustLoginHtml', { href: loginHref })}</span>`);
            return;
        }

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + window.t('js.trip.preparing');
        btn.disabled = true;

        try {
            const res = await fetch('/api/bookings/draft', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ tripId: trip._id, travelers })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || window.t('js.trip.bookingFailed'));

            const draftId = data.data.draftId;
            window.location.href = '/booking/travellers?draftId=' + draftId;
        } catch (err) {
            btn.innerHTML = '<i class="fas fa-suitcase-rolling"></i> ' + window.t('js.trip.tryAgain');
            btn.disabled = false;
            showToast(`<i class="fas fa-exclamation-triangle"></i> <span>${err.message}</span>`);
        }
    });
}

function showToast(html) {
    document.getElementById('login-gate-msg')?.remove();
    const btn = document.getElementById('book-now-btn');
    const toast = document.createElement('div');
    toast.id = 'login-gate-msg';
    toast.className = 'login-gate-toast';
    toast.innerHTML = html;
    btn.parentNode.insertBefore(toast, btn);
    setTimeout(() => toast.remove(), 6000);
}

function renderNotFound() {
    document.getElementById('trip-root').innerHTML = `
    <div class="pkg-not-found">
        <i class="fas fa-magnifying-glass"></i>
        <h2>${window.t('js.trip.notFoundTitle')}</h2>
        <p>${window.t('js.trip.notFoundDesc')}</p>
        <br>
        <a href="/trips/upcoming" class="btn btn--primary" style="margin-top:1rem;">${window.t('nav.upcomingTrips')}</a>
    </div>`;
}
