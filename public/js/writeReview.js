document.addEventListener('DOMContentLoaded', function () {
    if (window.LoginGate && !LoginGate.requireLogin({ message: window.t('js.loginGate.reviews') })) {
        return;
    }

    displayUserName();
    setupStarRating();
    setupPhotoUpload();
    setupFormSubmission();

    initAnimations();
    loadMyReviews();
});

function displayUserName() {
    const userName = document.getElementById('user-name');
    const avatar   = document.getElementById('reviewer-avatar');
    const session  = window.SERVER_USER || null;
    const displayName = session?.name || session?.email?.split('@')[0] || window.t('js.review.traveler');
    const image = session?.image || '';

    if (userName) userName.textContent = displayName;
    if (avatar && image) {
        avatar.innerHTML = `<img src="${image}" alt="${displayName}">`;
    }
}

// The trips (and packages) this traveller booked, from the page.
function getReviewables() {
    return window.SERVER_REVIEWABLES || [];
}

function setupStarRating() {
    const stars = document.querySelectorAll('.stars-glamour i');
    let currentRating = 0;

    stars.forEach(star => {
        star.addEventListener('mouseenter', function () {
            const rating = parseInt(this.getAttribute('data-rating'));
            highlightStars(rating);
        });

        star.addEventListener('mouseleave', function () {
            highlightStars(currentRating);
        });

        star.addEventListener('click', function () {
            currentRating = parseInt(this.getAttribute('data-rating'));
            highlightStars(currentRating);
        });
    });

    function highlightStars(rating) {
        stars.forEach((star, index) => {
            if (index < rating) {
                star.classList.add('fas');
                star.classList.remove('far');
            } else {
                star.classList.add('far');
                star.classList.remove('fas');
            }
        });
    }
}

let selectedFiles = [];

function setupPhotoUpload() {
    const uploadArea = document.getElementById('upload-area');
    const photoInput = document.getElementById('photo-input');
    const photoPreview = document.getElementById('photo-preview');

    if (uploadArea) {
        uploadArea.addEventListener('click', function () {
            photoInput.click();
        });

        uploadArea.addEventListener('dragover', function (e) {
            e.preventDefault();
            uploadArea.classList.add('is-dragover');
        });

        uploadArea.addEventListener('dragleave', function () {
            uploadArea.classList.remove('is-dragover');
        });

        uploadArea.addEventListener('drop', function (e) {
            e.preventDefault();
            uploadArea.classList.remove('is-dragover');
            selectedFiles = Array.from(e.dataTransfer.files).filter(file => /^image\/(jpeg|png)$/.test(file.type));
            displayPhotoPreviews();
        });
    }

    if (photoInput) {
        photoInput.addEventListener('change', function (e) {
            selectedFiles = Array.from(e.target.files);
            displayPhotoPreviews();
        });
    }

    function displayPhotoPreviews() {
        photoPreview.innerHTML = '';

        selectedFiles.forEach((file, index) => {
            const reader = new FileReader();
            reader.onload = function (e) {
                const preview = document.createElement('div');
                preview.className = 'preview-item';
                preview.innerHTML = `
                    <img src="${e.target.result}" alt="${window.t('js.review.previewAlt')}">
                    <button class="remove-photo" data-index="${index}" aria-label="${window.t('js.traveller.removePhoto')}">
                        <i class="fas fa-times"></i>
                    </button>
                `;
                photoPreview.appendChild(preview);

                preview.querySelector('.remove-photo').addEventListener('click', function () {
                    selectedFiles.splice(index, 1);
                    displayPhotoPreviews();
                    photoInput.value = '';
                });
            };
            reader.readAsDataURL(file);
        });
    }
}

function setupFormSubmission() {
    const submitBtn = document.getElementById('submit-review');
    const feedback = document.getElementById('form-feedback');

    function showFeedback(message, type = 'error') {
        if (!feedback) return;
        feedback.textContent = message;
        feedback.classList.toggle('success', type === 'success');
    }

    if (submitBtn) {
        submitBtn.addEventListener('click', async function () {
            showFeedback('');
            const picked = document.querySelector('input[name="reviewTarget"]:checked');

            const filledStars = document.querySelectorAll('.stars-glamour i.fas');
            const rating = filledStars.length;

            const reviewText = document.getElementById('review-text').value.trim();

            if (!picked) { showFeedback(window.t('js.review.errTrip')); return; }
            if (rating === 0) { showFeedback(window.t('js.review.errRating')); return; }
            if (reviewText.length < 10) { showFeedback(window.t('js.review.errText')); return; }

            submitBtn.disabled = true;
            submitBtn.textContent = window.t('js.review.submitting');

            const reviewTitle = document.getElementById('review-title')?.value.trim() || '';
            if (!reviewTitle) { showFeedback(window.t('js.review.errTitle')); submitBtn.disabled = false; submitBtn.textContent = window.t('js.review.submit'); return; }

            try {
                const res = await fetch('/api/reviews', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        [picked.dataset.kind === 'package' ? 'packageId' : 'tripId']: picked.value,
                        rating,
                        title:       reviewTitle,
                        text:        reviewText,
                        photosCount: selectedFiles.length,
                    }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || window.t('js.review.failed'));

                if (selectedFiles.length > 0 && data.data?.review?._id) {
                    const formData = new FormData();
                    selectedFiles.forEach(file => formData.append('photos', file));
                    await fetch('/api/reviews/' + data.data.review._id + '/photos', {
                        method: 'POST',
                        credentials: 'include',
                        body: formData,
                    });
                }

                showFeedback(window.t('js.review.submitted'), 'success');
                document.getElementById('success-modal').style.display = 'flex';
            } catch (err) {
                showFeedback(err.message, 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = window.t('js.review.submit');
            }
        });
    }
}

function closeModal() {
    window.location.href = '/dashboard';
}

async function loadMyReviews() {
    try {
        const res = await fetch('/api/reviews/mine', { credentials: 'include' });
        const data = await res.json();
        renderMyReviews(data.data?.reviews || []);
    } catch (e) {}
}

function renderMyReviews(reviews) {
    const list = document.getElementById('my-reviews-list');
    if (!list) return;
    if (!reviews.length) {
        list.innerHTML = '<p style="color:var(--color-text-muted);padding:1rem 0;">' + window.t('js.review.none') + '</p>';
        return;
    }
    list.innerHTML = reviews.map(r => `
        <div class="review-item" id="my-review-${r._id}">
            <div class="review-header">
                <strong>${escapeHtml(reviewName(r) || window.t('js.review.package'))}</strong>
                <span style="color:#F1C40F;">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
                <span class="review-date">${r.date ? r.date.slice(0, 10) : ''}</span>
            </div>
            <p class="review-text">"${escapeHtml(r.title)}": ${escapeHtml(r.text)}</p>
            <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
                <button class="btn btn--sm" style="color:#dc3545" onclick="deleteMyReview('${r._id}')">${window.t('js.review.delete')}</button>
            </div>
        </div>
    `).join('');
}

// The review API returns English names; prefer the localized copy the page already has.
function reviewName(r) {
    const target = r.tripId || r.packageId;
    if (!target) return '';
    const id = target._id || target;
    const local = getReviewables().find(x => x.id === id);
    return (local && local.title) || target.title || target.name || '';
}

function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function deleteMyReview(id) {
    if (!confirm(window.t('js.review.deleteConfirm'))) return;
    const res = await fetch('/api/reviews/' + id, { method: 'DELETE', credentials: 'include' });
    if (res.ok || res.status === 204) document.getElementById('my-review-' + id)?.remove();
}

function initAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0 });

    document.querySelectorAll('.reveal-up').forEach(el => observer.observe(el));
}
