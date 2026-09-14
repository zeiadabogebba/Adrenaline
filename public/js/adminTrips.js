'use strict';

let trips = [];
let currentDeleteId = null;

const g = id => document.getElementById(id);

function loadData() {
    trips = (window.SERVER_DATA && window.SERVER_DATA.trips) ? window.SERVER_DATA.trips : [];
    updateStats();
    renderTrips();
}

function updateStats() {
    const total = trips.length;
    const upcoming = trips.filter(t => t.kind === 'upcoming').length;
    const seats = trips.reduce((sum, t) => sum + (t.kind === 'upcoming' && t.spotsLeft != null ? t.spotsLeft : 0), 0);
    if (g('totalTrips')) g('totalTrips').textContent = total;
    if (g('upcomingTrips')) g('upcomingTrips').textContent = upcoming;
    if (g('seatsOpen')) g('seatsOpen').textContent = seats;
}

function esc(v) {
    return (v || '').toString()
        .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderTrips() {
    const container = g('tripsContainer');
    if (!container) return;

    let filtered = [...trips];
    const kindVal = g('kindFilter').value;
    const statusVal = g('statusFilter').value;
    const search = (g('searchInput').value || '').toLowerCase();

    if (kindVal !== 'all') filtered = filtered.filter(t => t.kind === kindVal);
    if (statusVal !== 'all') filtered = filtered.filter(t => t.status === statusVal);
    if (search) filtered = filtered.filter(t =>
        t.title.toLowerCase().includes(search) || (t.location || '').toLowerCase().includes(search));

    if (!filtered.length) {
        container.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:60px 0;">
                <i class="fas fa-rocket" style="font-size:3rem;color:var(--color-border);margin-bottom:20px;display:block;"></i>
                <p style="color:var(--color-text-muted);font-size:1.1rem;">No trips match your filters.</p>
            </div>`;
        return;
    }

    container.innerHTML = filtered.map(createTripCard).join('');
}

function createTripCard(trip) {
    const statusClass = trip.status === 'active' ? 'status-active' : 'status-inactive';
    const kindLabel = trip.kind === 'upcoming' ? 'Upcoming' : 'Past';
    const seats = trip.spotsLeft != null
        ? `${trip.spotsLeft}${trip.capacity != null ? ' / ' + trip.capacity : ''} seats`
        : 'Seats untracked';
    return `
    <article class="package-card-refined">
        <div class="package-media">
            <img src="${esc(trip.image) || '/images/WebsiteBanner.png'}" alt="${esc(trip.title)}" onerror="this.src='/images/WebsiteBanner.png'">
            <span class="package-status-tag ${statusClass}">${trip.status}</span>
        </div>
        <div class="package-content">
            <div class="package-meta">${kindLabel}${trip.date ? ' &middot; ' + esc(trip.date) : ''}</div>
            <h4 class="package-title">${esc(trip.title)}</h4>
            <div class="package-location"><i class="fas fa-map-marker-alt" style="color:var(--crimson)"></i> ${esc(trip.location) || '–'}</div>
            <p style="font-size:0.8rem;color:var(--color-text-muted);line-height:1.5;margin-bottom:12px;">
                ${esc((trip.description || '').substring(0, 85))}${(trip.description || '').length > 85 ? '…' : ''}
            </p>
            <p style="font-size:0.78rem;color:var(--color-text-muted);margin-bottom:16px;"><i class="fas fa-users"></i> ${seats}</p>
            ${trip.kind === 'upcoming'
                ? `<button class="btn-ghost trip-kind-toggle" onclick="toggleTripKind('${trip.id}','past')" title="Move this trip to Past Trips - its photos will appear in the Gallery"><i class="fas fa-images"></i> Mark as Past Trip</button>`
                : `<button class="btn-ghost trip-kind-toggle" onclick="toggleTripKind('${trip.id}','upcoming')" title="Move this trip back to Upcoming Trips"><i class="fas fa-rocket"></i> Move to Upcoming</button>`}
            <div class="package-footer">
                <div class="price-display">
                    <span class="price-value">EGP ${(trip.price || 0).toLocaleString()}</span>
                </div>
                <div class="action-buttons">
                    <button class="btn-ghost" onclick="openEditModal('${trip.id}')">Edit</button>
                    <button class="btn-danger" onclick="openDeleteModal('${trip.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        </div>
    </article>`;
}

function openModal(id) { g(id)?.classList.add('open'); }
function closeModal(id) { g(id)?.classList.remove('open'); }

function createPhotoManager(gridId, statusId) {
    const manager = { urls: [] };

    manager.render = function () {
        const grid = g(gridId);
        grid.innerHTML = manager.urls.map((url, i) =>
            '<div class="trip-gallery-thumb"><img src="' + url + '" alt="Trip photo">' +
            '<button type="button" class="trip-gallery-remove" data-idx="' + i + '" aria-label="Remove">&times;</button></div>'
        ).join('');
        grid.querySelectorAll('.trip-gallery-remove').forEach((btn) => {
            btn.addEventListener('click', () => {
                manager.urls.splice(Number(btn.dataset.idx), 1);
                manager.render();
            });
        });
    };

    manager.upload = async function (files) {
        const status = g(statusId);
        const list = Array.from(files);
        let done = 0;
        status.textContent = 'Uploading ' + list.length + ' photo' + (list.length === 1 ? '' : 's') + '…';
        for (const file of list) {
            try {
                const fd = new FormData();
                fd.append('image', file);
                const res = await fetch('/api/trips/gallery-photo', { method: 'POST', credentials: 'include', body: fd });
                const body = await res.json();
                if (res.ok && body.data && body.data.url) {
                    manager.urls.push(body.data.url);
                    manager.render();
                }
            } catch (e) {  }
            done++;
            status.textContent = done < list.length ? ('Uploaded ' + done + ' of ' + list.length + '…') : '';
        }
        status.textContent = '';
    };

    manager.reset = function (urls) {
        manager.urls = Array.isArray(urls) ? urls.slice() : [];
        manager.render();
        g(statusId).textContent = '';
    };

    return manager;
}

const galleryPhotos = createPhotoManager('galleryGrid', 'galleryStatus');
const experiencePhotos = createPhotoManager('experienceGrid', 'experienceStatus');

function resetForm() {
    g('tripForm').reset();
    g('tripId').value = '';
    g('formError').style.display = 'none';
    g('imagePreview').src = '';
    g('imagePreview').style.display = 'none';
    g('imageUploadPlaceholder').style.display = 'block';
    g('itinBuilder').innerHTML = '';
    g('arItinBuilder').innerHTML = '';
    g('promoBuilder').innerHTML = '';
    galleryPhotos.reset();
    experiencePhotos.reset();
}

function addItinRow(day, title, desc, builderId = 'itinBuilder') {
    const wrap = g(builderId);
    const rtl = builderId === 'arItinBuilder' ? ' dir="rtl" lang="ar"' : '';
    const n = wrap.querySelectorAll('.daily-row').length + 1;
    const row = document.createElement('div');
    row.className = 'daily-row';
    row.innerHTML =
        '<div class="daily-row-top">' +
        '<input type="number" class="itin-day" min="1" value="' + (day || n) + '">' +
        '<input type="text" class="itin-title"' + rtl + ' placeholder="Day title, e.g. Desert crossing">' +
        '<button type="button" class="itin-remove-btn" title="Remove">&times;</button>' +
        '</div>' +
        '<textarea class="daily-desc itin-desc" rows="2"' + rtl + ' placeholder="What happens this day (optional)"></textarea>';
    row.querySelector('.itin-title').value = title || '';
    row.querySelector('.itin-desc').value = desc || '';
    row.querySelector('.itin-remove-btn').addEventListener('click', () => row.remove());
    wrap.appendChild(row);
}

function collectItin(builderId = 'itinBuilder') {
    return Array.from(g(builderId).querySelectorAll('.daily-row')).map((row, i) => ({
        day: Number(row.querySelector('.itin-day').value) || i + 1,
        title: row.querySelector('.itin-title').value.trim(),
        desc: row.querySelector('.itin-desc').value.trim(),
    })).filter((r) => r.title || r.desc);
}

function addPromoRow(code, discount) {
    const wrap = g('promoBuilder');
    const row = document.createElement('div');
    row.className = 'daily-row';
    row.innerHTML =
        '<div class="promo-row-top">' +
        '<input type="text" class="promo-code" placeholder="Code, e.g. SUMMER10">' +
        '<input type="number" class="promo-discount" placeholder="% off" min="1" max="99">' +
        '<button type="button" class="itin-remove-btn" title="Remove">&times;</button>' +
        '</div>';
    row.querySelector('.promo-code').value = code || '';
    row.querySelector('.promo-discount').value = discount != null ? discount : '';
    row.querySelector('.itin-remove-btn').addEventListener('click', () => row.remove());
    wrap.appendChild(row);
}

function collectPromos() {
    const rows = Array.from(g('promoBuilder').querySelectorAll('.daily-row'));
    const codes = new Set();
    for (const row of rows) {
        const code = row.querySelector('.promo-code').value.trim().toUpperCase();
        const discount = Number(row.querySelector('.promo-discount').value);
        if (!code && !row.querySelector('.promo-discount').value) continue;
        if (!code) throw new Error('Every promo code needs a code.');
        if (!Number.isFinite(discount) || discount < 1 || discount > 99) {
            throw new Error('Promo code "' + code + '" needs a discount between 1 and 99%.');
        }
        if (codes.has(code)) throw new Error('Promo code "' + code + '" is entered more than once.');
        codes.add(code);
    }
    return Array.from(codes).map((code) => {
        const row = rows.find((r) => r.querySelector('.promo-code').value.trim().toUpperCase() === code);
        return { code, discount: Number(row.querySelector('.promo-discount').value) };
    });
}

function openCreateModal() {
    resetForm();
    g('modalTitle').textContent = 'Create Trip';
    openModal('tripModal');
}

function openEditModal(id) {
    const trip = trips.find(t => t.id === id);
    if (!trip) return;
    resetForm();
    g('modalTitle').textContent = 'Edit Trip';
    g('tripId').value = trip.id;
    g('tripTitle').value = trip.title || '';
    g('tripKind').value = trip.kind || 'upcoming';
    g('tripCategory').value = trip.category || 'other';
    g('tripDate').value = trip.date || '';
    g('tripLocation').value = trip.location || '';
    g('tripDuration').value = trip.durationText || '';
    g('tripStatus').value = trip.status || 'active';
    g('tripDescription').value = trip.description || '';
    g('tripPrice').value = trip.price != null ? trip.price : '';
    g('tripCapacity').value = trip.capacity != null ? trip.capacity : '';
    g('tripSpotsLeft').value = trip.spotsLeft != null ? trip.spotsLeft : '';
    g('tripIncluded').value = trip.includedServices || '';
    g('tripHighlights').value = trip.highlights || '';
    (trip.promoCodes || []).forEach((p) => addPromoRow(p.code, p.discount));
    (trip.itinerary || []).forEach((r) => addItinRow(r.day, r.title, r.desc));
    const ar = trip.ar || {};
    g('arTripTitle').value = ar.title || '';
    g('arTripDate').value = ar.date || '';
    g('arTripLocation').value = ar.location || '';
    g('arTripDuration').value = ar.durationText || '';
    g('arTripDescription').value = ar.description || '';
    g('arTripIncluded').value = ar.includedServices || '';
    g('arTripHighlights').value = ar.highlights || '';
    (ar.itinerary || []).forEach((r) => addItinRow(r.day, r.title, r.desc, 'arItinBuilder'));
    galleryPhotos.reset(trip.gallery);
    experiencePhotos.reset(trip.experiencePhotos);
    if (trip.image) {
        g('imagePreview').src = trip.image;
        g('imagePreview').style.display = 'block';
        g('imageUploadPlaceholder').style.display = 'none';
    }
    openModal('tripModal');
}

function numOrNull(val) {
    const s = String(val).trim();
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

async function saveTrip() {
    const id = g('tripId').value;
    const title = g('tripTitle').value.trim();
    const price = numOrNull(g('tripPrice').value);

    const errDiv = g('formError');
    const errMsg = g('formErrorMsg');
    const showErr = msg => { errMsg.textContent = msg; errDiv.style.display = 'block'; };

    if (title.length < 3) { showErr('Trip title must be at least 3 characters.'); return; }
    if (price == null || price < 0) { showErr('Price must be 0 or a positive number.'); return; }

    let promoCodes;
    try {
        promoCodes = collectPromos();
    } catch (err) {
        showErr(err.message); return;
    }

    const data = {
        title,
        kind: g('tripKind').value,
        category: g('tripCategory').value,
        date: g('tripDate').value.trim(),
        location: g('tripLocation').value.trim(),
        durationText: g('tripDuration').value.trim(),
        status: g('tripStatus').value,
        description: g('tripDescription').value.trim(),
        price,
        capacity: numOrNull(g('tripCapacity').value),
        spotsLeft: numOrNull(g('tripSpotsLeft').value),
        includedServices: g('tripIncluded').value.trim(),
        highlights: g('tripHighlights').value.trim(),
        promoCodes,
        itinerary: collectItin(),
        ar: {
            title: g('arTripTitle').value.trim(),
            date: g('arTripDate').value.trim(),
            location: g('arTripLocation').value.trim(),
            durationText: g('arTripDuration').value.trim(),
            description: g('arTripDescription').value.trim(),
            includedServices: g('arTripIncluded').value.trim(),
            highlights: g('arTripHighlights').value.trim(),
            itinerary: collectItin('arItinBuilder'),
        },
        gallery: galleryPhotos.urls,
        experiencePhotos: experiencePhotos.urls,
    };

    const saveBtn = g('saveTripBtn');
    saveBtn.textContent = 'Saving…';
    saveBtn.disabled = true;
    errDiv.style.display = 'none';

    try {
        const url = id ? '/api/trips/' + id : '/api/trips';
        const method = id ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.message || 'Save failed');

        const tripId = id || body.data.trip._id;
        const imageFile = g('tripImageFile').files[0];
        if (imageFile && tripId) {
            const fd = new FormData();
            fd.append('image', imageFile);
            await fetch('/api/trips/' + tripId + '/image', { method: 'POST', credentials: 'include', body: fd });
        }

        window.location.reload();
    } catch (err) {
        showErr(err.message);
        saveBtn.textContent = 'Save Trip';
        saveBtn.disabled = false;
    }
}

function openDeleteModal(id) {
    const trip = trips.find(t => t.id === id);
    if (!trip) return;
    currentDeleteId = id;
    g('deleteTripName').textContent = trip.title;
    openModal('deleteModal');
}

async function confirmDelete() {
    if (!currentDeleteId) return;
    try {
        const res = await fetch('/api/trips/' + currentDeleteId, { method: 'DELETE', credentials: 'include' });
        if (res.ok || res.status === 204) { window.location.reload(); return; }
        const d = await res.json();
        alert(d.message || 'Delete failed');
    } catch (err) {
        alert('An error occurred: ' + err.message);
    }
}

async function toggleTripKind(id, newKind) {
    const trip = trips.find(t => t.id === id);
    if (!trip) return;
    const msg = newKind === 'past'
        ? `Mark "${trip.title}" as a Past Trip? It will move out of Upcoming Trips and its photos (cover + gallery) will start appearing in the public Gallery.`
        : `Move "${trip.title}" back to Upcoming Trips? It will stop appearing in the Gallery.`;
    if (!confirm(msg)) return;

    try {
        const res = await fetch('/api/trips/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ kind: newKind }),
        });
        if (!res.ok) {
            const d = await res.json();
            throw new Error(d.message || 'Could not update this trip.');
        }
        window.location.reload();
    } catch (err) {
        alert('An error occurred: ' + err.message);
    }
}
window.toggleTripKind = toggleTripKind;

function init() {
    loadData();

    g('searchInput').addEventListener('input', renderTrips);
    g('kindFilter').addEventListener('change', renderTrips);
    g('statusFilter').addEventListener('change', renderTrips);

    g('createTripBtn').onclick = openCreateModal;
    g('saveTripBtn').onclick = saveTrip;
    g('confirmDeleteBtn').onclick = confirmDelete;
    g('addItinBtn').onclick = () => addItinRow();
    g('addArItinBtn').onclick = () => addItinRow(undefined, '', '', 'arItinBuilder');
    g('addPromoBtn').onclick = () => addPromoRow();
    g('addGalleryBtn').onclick = () => g('galleryFile').click();
    g('galleryFile').addEventListener('change', function () {
        if (this.files.length) galleryPhotos.upload(this.files);
        this.value = '';
    });

    g('addExperienceBtn').onclick = () => g('experienceFile').click();
    g('experienceFile').addEventListener('change', function () {
        if (this.files.length) experiencePhotos.upload(this.files);
        this.value = '';
    });

    g('tripImageFile').addEventListener('change', function () {
        const file = this.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            g('imagePreview').src = e.target.result;
            g('imagePreview').style.display = 'block';
            g('imageUploadPlaceholder').style.display = 'none';
        };
        reader.readAsDataURL(file);
    });
}

window.openEditModal = openEditModal;
window.openDeleteModal = openDeleteModal;
window.closeModal = closeModal;

document.addEventListener('DOMContentLoaded', init);
