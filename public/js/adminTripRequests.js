'use strict';

const REQUESTS = window.SERVER_REQUESTS || [];
let currentId = null;

const $ = (id) => document.getElementById(id);
const modal = $('request-modal');

function fmtDate(str, opts) {
    const d = new Date(str);
    if (isNaN(d)) return str || '–';
    return d.toLocaleDateString('en-GB', opts || { day: 'numeric', month: 'short', year: 'numeric' });
}

function esc(v) {
    return (v == null ? '' : v).toString()
        .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function roomSummary(rooms) {
    const counts = {};
    (rooms || []).forEach((t) => { counts[t] = (counts[t] || 0) + 1; });
    return Object.keys(counts).map((k) => `${counts[k]} ${k}`).join(', ') || '–';
}

function applyFilters() {
    const status = $('status-filter').value;
    const search = $('search-input').value.trim().toLowerCase();
    document.querySelectorAll('.tr-row').forEach((row) => {
        const okStatus = !status || row.dataset.status === status;
        const okSearch = !search || row.dataset.search.includes(search);
        row.hidden = !(okStatus && okSearch);
    });
}

$('status-filter').addEventListener('change', applyFilters);
$('search-input').addEventListener('input', applyFilters);

function openModal(id) {
    const r = REQUESTS.find((x) => x.id === id);
    if (!r) return;
    currentId = id;

    $('m-customer').textContent = r.userName;
    $('m-email').textContent = r.userEmail;
    $('m-date').textContent = fmtDate(r.createdAt);
    $('m-status').value = r.status;
    $('m-destination').textContent = r.destination;
    $('m-dates').textContent = `${fmtDate(r.startDate)} → ${fmtDate(r.endDate)} (${r.nights} night${r.nights === 1 ? '' : 's'})`;
    $('m-travelers').textContent = `${r.travelers} traveller${r.travelers === 1 ? '' : 's'}`;

    const roomsEl = $('m-rooms');
    roomsEl.innerHTML = (r.rooms || []).map((t, i) =>
        `<li><span>Room ${i + 1}</span> <strong>${t}</strong></li>`).join('') || '<li class="tr-muted">No rooms specified</li>';

    const travellersEl = $('m-travellers-list');
    travellersEl.innerHTML = (r.travellerDetails || []).map((t, i) => `
        <li class="tr-traveller">
            <div class="tr-traveller__head">
                <strong>${i + 1}. ${esc(t.name) || 'Unnamed'}</strong>
                ${t.gender ? `<span class="tr-muted">${esc(t.gender)}</span>` : ''}
            </div>
            <div class="tr-traveller__rows">
                ${t.phone ? `<a class="tr-call-link" href="tel:${esc(t.phone)}"><i class="fas fa-phone"></i> ${esc(t.phone)}</a>` : '<span class="tr-muted">No phone on file</span>'}
                ${t.idNumber ? `<span><i class="fas fa-id-card"></i> ${esc(t.idNumber)}</span>` : ''}
                ${t.idPhoto ? `<a href="${esc(t.idPhoto)}" target="_blank" rel="noopener"><i class="fas fa-image"></i> ID photo</a>` : ''}
            </div>
            ${(t.emergencyName || t.emergencyPhone) ? `
            <div class="tr-traveller__emergency">
                <span class="tr-modal__k">Emergency contact</span>
                <span>${esc(t.emergencyName) || '–'}${t.emergencyPhone ? ` &middot; <a class="tr-call-link" href="tel:${esc(t.emergencyPhone)}"><i class="fas fa-phone"></i> ${esc(t.emergencyPhone)}</a>` : ''}</span>
            </div>` : ''}
            ${t.knownDisease ? `<div class="tr-traveller__medical"><i class="fas fa-notes-medical"></i> ${esc(t.knownDisease)}</div>` : ''}
        </li>
    `).join('') || '<li class="tr-muted">No traveller details on file.</li>';

    const notesWrap = $('m-notes-wrap');
    if (r.notes) {
        $('m-notes').textContent = r.notes;
        notesWrap.hidden = false;
    } else {
        notesWrap.hidden = true;
    }

    $('m-admin-note').value = r.adminNote || '';
    $('tr-modal-error').hidden = true;

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
    currentId = null;
}

document.querySelectorAll('.view-btn').forEach((btn) => {
    btn.addEventListener('click', () => openModal(btn.dataset.id));
});

$('tr-close').addEventListener('click', closeModal);
$('tr-cancel').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

$('tr-save').addEventListener('click', async () => {
    if (!currentId) return;
    const btn = $('tr-save');
    const err = $('tr-modal-error');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';
    err.hidden = true;

    try {
        const res = await fetch('/api/trip-requests/' + currentId + '/status', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                status: $('m-status').value,
                adminNote: $('m-admin-note').value.trim(),
            }),
        });
        if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(d.message || 'Save failed');
        }
        window.location.reload();
    } catch (e) {
        err.textContent = e.message;
        err.hidden = false;
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Save';
    }
});
