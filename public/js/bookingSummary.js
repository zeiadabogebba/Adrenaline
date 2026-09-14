let activeBooking = null;

document.addEventListener('DOMContentLoaded', () => {
    const serverBooking = (typeof SERVER_DATA !== 'undefined') ? SERVER_DATA.booking : null;
    activeBooking = serverBooking;

    const cancelBtn = document.getElementById('cancel-booking');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => showCancelRequestModal());
    }
});

function showCancelRequestModal() {
    const existing = document.getElementById('cancel-request-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cancel-request-modal';
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'cancel-modal-title');

    overlay.innerHTML = `
        <div class="modal-content login-required-modal">
            <div class="modal-header">
                <h2 id="cancel-modal-title"><i class="fas fa-rotate-left"></i> ${window.t('js.bookingSummary.cancelRequest')}</h2>
            </div>
            <p class="login-required-message">${window.t('js.bookingSummary.modalDesc')}</p>
            <div class="modal-actions">
                <button type="button" id="cancel-modal-keep-btn" class="btn btn--outline">${window.t('js.bookings.keepBooking')}</button>
                <button type="button" id="cancel-modal-confirm-btn" class="btn btn--primary">${window.t('js.bookingSummary.returnToTrip')}</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    const closeModal = () => {
        overlay.remove();
        document.body.style.overflow = '';
    };

    document.getElementById('cancel-modal-keep-btn')?.addEventListener('click', closeModal);
    document.getElementById('cancel-modal-confirm-btn')?.addEventListener('click', () => {
        window.location.href = getCancelReturnUrl();
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });
}

function getCancelReturnUrl() {
    if (!activeBooking) return '/trips/upcoming';

    if (activeBooking.isCustom) return '/custom-trip';

    const tripId = activeBooking.tripId?._id || activeBooking.tripId;
    if (tripId) return '/trips/' + tripId;

    return '/trips/upcoming';
}
