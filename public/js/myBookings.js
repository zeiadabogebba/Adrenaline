let currentBookings = [];
let filteredBookings = [];

const bookingsList = document.getElementById('bookingsList');
const statusFilter = document.getElementById('statusFilter');
const typeFilter   = document.getElementById('typeFilter');
const modal        = document.getElementById('detailsModal');
const modalBody    = document.getElementById('modalBody');
const closeModal   = document.querySelector('.close-modal');

const statusClasses = {
    'verifying':            'status--verifying',
    'half-paid':            'status--half-paid',
    'verifying-payment-2':  'status--verifying-payment-2',
    'fully-paid':           'status--fully-paid',
    'cancelled':            'status--cancelled',
    'request-new':          'status--request-new',
    'request-contacted':    'status--request-contacted',
    'request-closed':       'status--request-closed',
    'request-cancelled':    'status--cancelled',
};

// Labels come from locales/<lang>/js.json (js.bookings.status.*).
const statusLabels = Object.fromEntries(Object.keys(statusClasses).map(s => [s, window.t('js.bookings.status.' + s)]));

const dateLocale = window.dateLocale || 'en-US';
const money = (n) => window.t('js.common.money', { amount: Number(n || 0).toLocaleString('en-US') });

document.addEventListener('DOMContentLoaded', function() {
    const bookings = (window.SERVER_BOOKINGS || []).map(normaliseServerBooking);
    const requests = (window.SERVER_TRIP_REQUESTS || []).map(normaliseTripRequest);
    currentBookings = [...requests, ...bookings];
    filteredBookings = [...currentBookings];
    renderBookings();
    attachEventListeners();
});

function normaliseTripRequest(r) {
    return {
        id:             r._id,
        bookingId:      r._id,
        bookingNumber:  'REQ-' + String(r._id).slice(-6).toUpperCase(),
        packageName:    r.destination,
        tripName:       r.destination,
        date:           r.startDate + ' to ' + r.endDate,
        travelDate:     r.startDate,
        travelers:      r.travelers,
        peopleCount:    r.travelers,
        totalPrice:     null,
        status:         r.status,
        computedStatus: 'request-' + (r.status || 'new'),
        location:       r.destination,
        image:          '',
        type:           'request',
        isTripRequest:  true,
        nights:         r.nights,
        rooms:          r.rooms,
        notes:          r.notes,
        createdAt:      r.createdAt,
        _id:            r._id,
    };
}

function normaliseServerBooking(b) {
    return {
        id:             b._id || b.id,
        bookingId:      b._id || b.id,
        bookingNumber:  b.bookingNumber,
        packageName:    b.packageName,
        tripName:       b.packageName,
        date:           b.date,
        travelDate:     b.date,
        travelers:      b.travelers,
        peopleCount:    b.travelers,
        totalPrice:     b.totalPrice,
        paymentPlan:    b.paymentPlan,
        status:         b.status,
        computedStatus: String(b.computedStatus || b.status || 'verifying').replace(/\s+/g, '-'),
        location:       b.packageId && b.packageId.city  ? b.packageId.city  : '',
        image:          b.packageId && b.packageId.image ? b.packageId.image : '',
        type:           b.packageId && b.packageId.type  ? b.packageId.type  : 'day',
        _id:            b._id,
    };
}

function formatDate(dateString) {
    if (!dateString) return window.t('js.bookings.na');
    if (typeof dateString === 'string' && dateString.includes(' to ')) {
        const parts = dateString.split(' to ');
        const fmt = s => {
            const d = new Date(s.trim());
            return isNaN(d) ? s.trim() : d.toLocaleDateString(dateLocale, { month: 'short', day: 'numeric', year: 'numeric' });
        };
        return fmt(parts[0]) + ' – ' + fmt(parts[1]);
    }
    const d = new Date(dateString);
    if (isNaN(d)) return dateString;
    return d.toLocaleDateString(dateLocale, { year: 'numeric', month: 'long', day: 'numeric' });
}

function getBookingType(booking) {
    if (booking.isTripRequest) return 'request';
    if (booking.isCustom) return 'custom';

    const rawType = [
        booking.tripType,
        booking.packageType,
        booking.type,
        booking.category,
        booking.packageName,
        booking.tripName
    ].filter(Boolean).join(' ').toLowerCase();

    if (rawType.includes('custom') || rawType.includes('architect')) return 'custom';
    if (rawType.includes('single') || rawType.includes('location'))  return 'single';
    if (rawType.includes('week')   || rawType.includes('weekly') || rawType.includes('multi')) return 'week';
    return 'day';
}

function getBookingTypeLabel(type) {
    return window.t('js.bookings.types.' + (type || 'day'));
}

function renderBookings() {
    if (filteredBookings.length === 0) {
        bookingsList.innerHTML = `
            <div class="empty-state glass-card" style="text-align:center; padding:4rem 2rem;">
                <i class="fas fa-suitcase-rolling" style="font-size:3rem; color:var(--color-text-muted); margin-bottom:1rem; opacity:0.5;"></i>
                <h3 style="margin-bottom:0.5rem; font-size:1.5rem;">${window.t('js.bookings.noTripsTitle')}</h3>
                <p style="color:var(--color-text-secondary); margin-bottom:1.5rem;">${window.t('js.bookings.noTripsDesc')}</p>
                <a href="/packages/day" class="btn btn--primary">${window.t('js.bookings.explorePackages')}</a>
            </div>
        `;
        return;
    }

    bookingsList.innerHTML = '';
    filteredBookings.forEach(booking => {
        const card = createBookingCard(booking);
        bookingsList.appendChild(card);
    });
}

function createBookingCard(booking) {
    const card = document.createElement('div');
    card.className = 'booking-card glass-card';
    card.setAttribute('data-id', booking.id || booking.bookingId || '');

    const rawDate = booking.date || booking.travelDate || booking.bookingDate || booking.timestamp;
    const computedStatus = booking.computedStatus;
    const statusClass = statusClasses[computedStatus] || '';
    const statusLabel = statusLabels[computedStatus] || computedStatus.toUpperCase();

    const title  = booking.packageName || booking.tripName || window.t('js.bookings.packageBooking');
    const type   = getBookingTypeLabel(getBookingType(booking));
    const refId  = booking.bookingNumber || booking.id || booking.bookingId || window.t('js.bookings.na');
    const pCount = booking.travelers || booking.peopleCount || 1;
    const tPrice = booking.isTripRequest ? window.t('js.bookings.pending') : (booking.totalPrice ? money(booking.totalPrice) : window.t('js.bookings.na'));
    const priceLabel = booking.isTripRequest ? window.t('js.bookings.pricing') : window.t('js.bookings.totalInvestment');

    let placesText = booking.location || booking.city;
    if (!placesText && booking.places) {
        placesText = Array.isArray(booking.places) ? booking.places.join(', ') : booking.places;
    }
    if (!placesText) placesText = window.t('js.bookings.variousLocations');

    const canCancel = booking.isTripRequest
        ? ['request-new', 'request-contacted'].includes(computedStatus)
        : computedStatus !== 'cancelled';
    const typeClass = booking.isTripRequest ? ' type--request' : '';

    const canPayRest = !booking.isTripRequest && computedStatus === 'half-paid'
        && booking.paymentPlan === 'deposit' && booking.totalPrice;
    const remaining = canPayRest ? Number(booking.totalPrice) - Math.round(Number(booking.totalPrice) / 2) : 0;

    card.innerHTML = `
        <div class="booking-header">
            <div class="booking-main-info">
                <span class="booking-type${typeClass}">${type}</span>
                <span class="booking-status ${statusClass}">${statusLabel}</span>
            </div>
            <div class="booking-id">${window.t('js.bookings.ref', { id: refId })}</div>
        </div>
        <div class="booking-body">
            <h3 style="margin-bottom:0.5rem;">${title}</h3>
            <p style="color:var(--color-text-secondary); font-size:var(--text-sm);">${placesText}</p>
            <div class="booking-info-grid">
                <div class="info-item">
                    <span class="info-label">${window.t('js.bookings.arrival')}</span>
                    <span class="info-value">${formatDate(rawDate)}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">${window.t('js.bookings.travellers')}</span>
                    <span class="info-value">${window.tp('js.bookings.people', pCount)}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">${priceLabel}</span>
                    <span class="info-value" style="color:var(--crimson); font-weight:700;">${tPrice}</span>
                </div>
            </div>
        </div>
        <div class="booking-footer">
            <button class="view-details-btn btn btn--outline" data-id="${booking.id || booking._id}">${booking.isTripRequest ? window.t('js.bookings.viewRequest') : window.t('js.bookings.viewManifesto')}</button>
            ${canPayRest
                ? `<button class="pay-rest-btn btn btn--primary" data-id="${booking._id}">${window.t('js.bookings.payRest', { amount: money(remaining) })}</button>`
                : ''}
            ${canCancel && booking._id
                ? `<button class="cancel-booking-btn btn btn--outline btn--cancel" data-id="${booking._id}" data-type="${booking.isTripRequest ? 'request' : 'booking'}">${booking.isTripRequest ? window.t('js.bookings.cancelRequest') : window.t('js.bookings.cancelBooking')}</button>`
                : ''}
        </div>
    `;

    return card;
}

function filterBookings() {
    const statusValue = statusFilter?.value || 'all';
    const typeValue   = typeFilter?.value   || 'all';

    filteredBookings = currentBookings.filter(booking => {
        const matchesStatus = statusValue === 'all' || booking.computedStatus === statusValue;
        const matchesType   = typeValue   === 'all' || getBookingType(booking) === typeValue;
        return matchesStatus && matchesType;
    });

    renderBookings();
}

function showDetails(bookingId) {
    const booking = currentBookings.find(b => (b.id === bookingId || b.bookingId === bookingId || b.bookingNumber === bookingId));
    if (!booking) return;

    if (booking.isTripRequest) return showRequestDetails(booking);

    const rawDate = booking.date || booking.travelDate || booking.bookingDate || booking.timestamp;
    const computedStatus = booking.computedStatus;
    const statusLabel = statusLabels[computedStatus] || computedStatus.toUpperCase();

    let placesText = booking.location || booking.city;
    if (!placesText && booking.places) {
        placesText = Array.isArray(booking.places) ? booking.places.join(', ') : booking.places;
    }
    if (!placesText) placesText = window.t('js.bookings.variousLocations');

    const title  = booking.packageName || booking.tripName || window.t('js.bookings.packageBooking');
    const type   = getBookingTypeLabel(getBookingType(booking));
    const refId  = booking.bookingNumber || booking.id || booking.bookingId || window.t('js.bookings.na');
    const pCount = booking.travelers || booking.peopleCount || 1;
    const tPrice = booking.totalPrice ? money(booking.totalPrice) : window.t('js.bookings.na');

    modalBody.innerHTML = `
        <div class="detail-row" style="display:flex; justify-content:space-between; margin-bottom:1rem; border-bottom:1px solid var(--color-border-light); padding-bottom:0.5rem;">
            <span style="color:var(--color-text-secondary);">${window.t('js.bookings.referenceId')}</span>
            <span style="font-weight:600;">${refId}</span>
        </div>
        <div class="detail-row" style="display:flex; justify-content:space-between; margin-bottom:1rem; border-bottom:1px solid var(--color-border-light); padding-bottom:0.5rem;">
            <span style="color:var(--color-text-secondary);">${window.t('js.bookings.packageType')}</span>
            <span style="font-weight:600;">${type}</span>
        </div>
        <div class="detail-row" style="display:flex; justify-content:space-between; margin-bottom:1rem; border-bottom:1px solid var(--color-border-light); padding-bottom:0.5rem;">
            <span style="color:var(--color-text-secondary);">${window.t('js.bookings.designation')}</span>
            <span style="font-weight:600;">${title}</span>
        </div>
        <div class="detail-row" style="display:flex; justify-content:space-between; margin-bottom:1rem; border-bottom:1px solid var(--color-border-light); padding-bottom:0.5rem;">
            <span style="color:var(--color-text-secondary);">${window.t('js.bookings.landmarks')}</span>
            <span style="font-weight:600; text-align:end;">${placesText}</span>
        </div>
        <div class="detail-row" style="display:flex; justify-content:space-between; margin-bottom:1rem; border-bottom:1px solid var(--color-border-light); padding-bottom:0.5rem;">
            <span style="color:var(--color-text-secondary);">${window.t('js.bookings.arrivalDate')}</span>
            <span style="font-weight:600;">${formatDate(rawDate)}</span>
        </div>
        <div class="detail-row" style="display:flex; justify-content:space-between; margin-bottom:1rem; border-bottom:1px solid var(--color-border-light); padding-bottom:0.5rem;">
            <span style="color:var(--color-text-secondary);">${window.t('js.bookings.statusLabel')}</span>
            <span style="font-weight:600;">${statusLabel}</span>
        </div>
        <div class="detail-row" style="display:flex; justify-content:space-between; margin-bottom:1rem; border-bottom:1px solid var(--color-border-light); padding-bottom:0.5rem;">
            <span style="color:var(--color-text-secondary);">${window.t('js.bookings.partySize')}</span>
            <span style="font-weight:600;">${window.tp('js.bookings.travellersCount', pCount)}</span>
        </div>
        <div class="detail-row" style="display:flex; justify-content:space-between; margin-bottom:1rem;">
            <span style="color:var(--color-text-secondary);">${window.t('js.bookings.totalValue')}</span>
            <span style="font-weight:700; color:var(--crimson);">${tPrice}</span>
        </div>
    `;

    modal.style.display = 'flex';
}

function showRequestDetails(booking) {
    const statusLabel = statusLabels[booking.computedStatus] || booking.computedStatus.toUpperCase();
    const roomsText = Array.isArray(booking.rooms) && booking.rooms.length
        ? booking.rooms.map(r => window.t('js.bookings.rooms.' + r.type)).join('، ')
        : window.t('js.bookings.notSpecified');

    modalBody.innerHTML = `
        <div class="detail-row" style="display:flex; justify-content:space-between; margin-bottom:1rem; border-bottom:1px solid var(--color-border-light); padding-bottom:0.5rem;">
            <span style="color:var(--color-text-secondary);">${window.t('js.bookings.referenceId')}</span>
            <span style="font-weight:600;">${booking.bookingNumber}</span>
        </div>
        <div class="detail-row" style="display:flex; justify-content:space-between; margin-bottom:1rem; border-bottom:1px solid var(--color-border-light); padding-bottom:0.5rem;">
            <span style="color:var(--color-text-secondary);">${window.t('js.bookings.type')}</span>
            <span style="font-weight:600;">${window.t('js.bookings.types.request')}</span>
        </div>
        <div class="detail-row" style="display:flex; justify-content:space-between; margin-bottom:1rem; border-bottom:1px solid var(--color-border-light); padding-bottom:0.5rem;">
            <span style="color:var(--color-text-secondary);">${window.t('js.bookings.destination')}</span>
            <span style="font-weight:600;">${booking.packageName || window.t('js.bookings.na')}</span>
        </div>
        <div class="detail-row" style="display:flex; justify-content:space-between; margin-bottom:1rem; border-bottom:1px solid var(--color-border-light); padding-bottom:0.5rem;">
            <span style="color:var(--color-text-secondary);">${window.t('js.bookings.dates')}</span>
            <span style="font-weight:600;">${formatDate(booking.travelDate)} &ndash; ${booking.nights ? window.tp('js.bookings.nights', booking.nights) : window.t('js.bookings.na')}</span>
        </div>
        <div class="detail-row" style="display:flex; justify-content:space-between; margin-bottom:1rem; border-bottom:1px solid var(--color-border-light); padding-bottom:0.5rem;">
            <span style="color:var(--color-text-secondary);">${window.t('js.bookings.travellers')}</span>
            <span style="font-weight:600;">${window.tp('js.bookings.travellersCount', booking.travelers)}</span>
        </div>
        <div class="detail-row" style="display:flex; justify-content:space-between; margin-bottom:1rem; border-bottom:1px solid var(--color-border-light); padding-bottom:0.5rem;">
            <span style="color:var(--color-text-secondary);">${window.t('js.bookings.roomsLabel')}</span>
            <span style="font-weight:600; text-align:end;">${roomsText}</span>
        </div>
        <div class="detail-row" style="display:flex; justify-content:space-between; margin-bottom:1rem; ${booking.notes ? 'border-bottom:1px solid var(--color-border-light); padding-bottom:0.5rem;' : ''}">
            <span style="color:var(--color-text-secondary);">${window.t('js.bookings.statusLabel')}</span>
            <span style="font-weight:600;">${statusLabel}</span>
        </div>
        ${booking.notes ? `
        <div class="detail-row" style="display:flex; flex-direction:column; gap:0.35rem;">
            <span style="color:var(--color-text-secondary);">${window.t('js.bookings.notes')}</span>
            <span style="font-weight:500;">${booking.notes}</span>
        </div>` : ''}
        <p style="margin-top:1.25rem; color:var(--color-text-secondary); font-size:var(--text-sm);">
            <i class="fas fa-circle-info" style="color:var(--crimson);"></i> ${window.t('js.bookings.requestNote')}
        </p>
    `;

    modal.style.display = 'flex';
}

function closeModalWindow() {
    modal.style.display = 'none';
}

function confirmCancel(bookingId, bookingTitle, type) {
    const isRequest = type === 'request';
    const existing = document.getElementById('cancel-confirm-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cancel-confirm-overlay';
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);backdrop-filter:blur(12px)';
    overlay.innerHTML = `
        <div class="modal-content login-required-modal">
            <div class="modal-header">
                <h2><i class="fas fa-exclamation-triangle" style="color:var(--bad);"></i> ${isRequest ? window.t('js.bookings.cancelRequest') : window.t('js.bookings.cancelBooking')}</h2>
            </div>
            <p class="login-required-message">${window.t('js.bookings.cancelConfirmHtml', { title: bookingTitle })}</p>
            <div class="modal-actions">
                <button type="button" id="cancel-no-btn" class="btn btn--outline">${isRequest ? window.t('js.bookings.keepRequest') : window.t('js.bookings.keepBooking')}</button>
                <button type="button" id="cancel-yes-btn" class="btn btn--danger">${window.t('js.bookings.yesCancel')}</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    const close = () => { overlay.remove(); document.body.style.overflow = ''; };

    document.getElementById('cancel-no-btn').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    document.getElementById('cancel-yes-btn').addEventListener('click', async () => {
        const btn = document.getElementById('cancel-yes-btn');
        btn.disabled = true;
        btn.textContent = window.t('js.bookings.cancelling');
        try {
            const url = isRequest ? `/api/trip-requests/${bookingId}/cancel` : `/api/bookings/${bookingId}/cancel`;
            const res = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ reason: 'Cancelled by user' }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || window.t('js.bookings.cancellationFailed'));

            const newStatus = isRequest ? 'request-cancelled' : 'cancelled';
            const b = currentBookings.find(x => x._id === bookingId || x.id === bookingId);
            if (b) { b.status = 'cancelled'; b.computedStatus = newStatus; }
            filteredBookings = filteredBookings.map(x =>
                (x._id === bookingId || x.id === bookingId) ? { ...x, status: 'cancelled', computedStatus: newStatus } : x
            );
            renderBookings();
            close();
        } catch (err) {
            btn.disabled = false;
            btn.textContent = window.t('js.bookings.yesCancel');
            alert(err.message);
        }
    });
}

function payRestModal(bookingId) {
    const booking = currentBookings.find(b => b._id === bookingId || b.id === bookingId);
    if (!booking) return;
    const remaining = Number(booking.totalPrice) - Math.round(Number(booking.totalPrice) / 2);

    const existing = document.getElementById('pay-rest-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'pay-rest-overlay';
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);backdrop-filter:blur(12px)';
    overlay.innerHTML = `
        <div class="modal-content login-required-modal">
            <div class="modal-header">
                <h2><i class="fas fa-camera" style="color:var(--crimson);"></i> ${window.t('js.bookings.payRestTitle')}</h2>
            </div>
            <p class="login-required-message">${window.t('js.bookings.payRestDescHtml', { amount: money(remaining) })}</p>
            <input type="file" id="pay-rest-file" accept="image/jpeg,image/png,image/webp" hidden>
            <div id="pay-rest-error" style="color:var(--bad);font-size:0.85rem;margin-top:0.5rem;"></div>
            <div class="modal-actions">
                <button type="button" id="pay-rest-cancel-btn" class="btn btn--outline">${window.t('js.bookings.cancel')}</button>
                <button type="button" id="pay-rest-upload-btn" class="btn btn--primary">${window.t('js.bookings.chooseScreenshot')}</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    const close = () => { overlay.remove(); document.body.style.overflow = ''; };

    document.getElementById('pay-rest-cancel-btn').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    document.getElementById('pay-rest-upload-btn').addEventListener('click', () => {
        document.getElementById('pay-rest-file').click();
    });

    document.getElementById('pay-rest-file').addEventListener('change', async function () {
        const file = this.files[0];
        if (!file) return;

        const uploadBtn = document.getElementById('pay-rest-upload-btn');
        const errDiv = document.getElementById('pay-rest-error');
        errDiv.textContent = '';
        uploadBtn.disabled = true;
        uploadBtn.textContent = window.t('js.bookings.uploading');

        try {
            const fd = new FormData();
            fd.append('screenshot', file);
            const res = await fetch('/api/bookings/' + bookingId + '/payment-2-screenshot', {
                method: 'POST', credentials: 'include', body: fd,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || window.t('js.bookings.uploadFailed'));

            const newStatus = 'verifying-payment-2';
            const b = currentBookings.find(x => x._id === bookingId || x.id === bookingId);
            if (b) { b.computedStatus = newStatus; }
            filteredBookings = filteredBookings.map(x =>
                (x._id === bookingId || x.id === bookingId) ? { ...x, computedStatus: newStatus } : x
            );
            renderBookings();
            close();
        } catch (err) {
            uploadBtn.disabled = false;
            uploadBtn.textContent = window.t('js.bookings.chooseScreenshot');
            errDiv.textContent = err.message;
        }
    });
}

function attachEventListeners() {
    statusFilter?.addEventListener('change', filterBookings);
    typeFilter?.addEventListener('change', filterBookings);
    closeModal?.addEventListener('click', closeModalWindow);

    bookingsList?.addEventListener('click', (e) => {
        if (e.target.classList.contains('view-details-btn')) {
            const bookingId = e.target.dataset.id || e.target.closest('.booking-card')?.dataset.id;
            showDetails(bookingId);
        }
        if (e.target.classList.contains('pay-rest-btn')) {
            payRestModal(e.target.dataset.id);
        }
        if (e.target.classList.contains('cancel-booking-btn')) {
            const bookingId = e.target.dataset.id;
            const type = e.target.dataset.type || 'booking';
            const booking = currentBookings.find(b => b._id === bookingId || b.id === bookingId);
            const title = booking ? (booking.packageName || window.t('js.bookings.thisBooking')) : window.t('js.bookings.thisBooking');
            confirmCancel(bookingId, title, type);
        }
    });

    window.addEventListener('click', function(e) {
        if (e.target === modal) closeModalWindow();
    });
}
