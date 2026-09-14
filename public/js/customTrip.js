'use strict';

const ROOM_TYPES = [
    { value: 'single', label: window.t('js.customTrip.roomSingle') },
    { value: 'double', label: window.t('js.customTrip.roomDouble') },
    { value: 'triple', label: window.t('js.customTrip.roomTriple') },
    { value: 'quadruple', label: window.t('js.customTrip.roomQuadruple') },
];

const MAX_STEP = 4;

const state = {
    destId: null,
    destName: '',
    destImage: '',
    start: '',
    end: '',
    nights: 0,
    travelers: 2,
    travellerDetails: [],
    roomCount: 1,
    rooms: [],
};

let currentStep = 0;

const $ = (id) => document.getElementById(id);
const NAME_RE = /^[\p{L}\s'.-]{2,}$/u;
const tt = (k, v) => window.t('js.traveller.' + k, v);
const tc = (k, v) => window.t('js.customTrip.' + k, v);

document.addEventListener('DOMContentLoaded', () => {
    if (window.LoginGate && !LoginGate.requireLogin()) return;
    initDestinations();
    initDates();
    initTravellerDetails();
    initRooms();
    initNav();
    syncTravellerDetails();
    syncRooms();
    updateSummary();
    showStep(0);
});

function initNav() {
    document.querySelectorAll('[data-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const a = btn.dataset.action;
            if (a === 'next') nextStep();
            else if (a === 'prev') prevStep();
            else if (a === 'submit') submitRequest();
        });
    });
}

function showStep(n) {
    currentStep = n;
    document.querySelectorAll('.wizard-step').forEach((el) => el.classList.remove('active'));
    const done = n === 'done';
    $('step-' + (done ? 'done' : n)).classList.add('active');

    document.querySelectorAll('.stepper-step').forEach((li) => {
        const s = Number(li.dataset.step);
        li.classList.toggle('active', !done && s === n);
        li.classList.toggle('done', done || s < n);
    });
    $('stepper').style.opacity = done ? '0.4' : '';

    if (n === MAX_STEP) buildReview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function nextStep() {
    if (!validateStep(currentStep)) return;
    if (currentStep < MAX_STEP) showStep(currentStep + 1);
}

function prevStep() {
    if (currentStep > 0) showStep(currentStep - 1);
}

function validateStep(step) {
    clearErrors();
    if (step === 0) {
        if (!state.destId) return fail('dest-error', tc('errDest'));
    }
    if (step === 1) {
        if (!state.start) return fail('date-error', tc('errStart'));
        if (!state.end) return fail('date-error', tc('errEnd'));
        if (state.nights < 1) return fail('date-error', tc('errOrder'));
        if (state.nights > 14) return fail('date-error', tc('errMax'));
    }
    if (step === 2) {
        if (state.travelers < 1 || state.travelers > 15) {
            return fail('traveler-error', tc('errTravellers'));
        }
        readTravellerDetailsFromDom();
        let detailsOk = true;
        for (let i = 0; i < state.travelers; i++) { if (!validateTravellerDetail(i)) detailsOk = false; }
        if (!detailsOk) return fail('traveller-details-error', tt('errFix'));
    }
    if (step === 3) {
        if (state.rooms.some((r) => !r)) return fail('room-error', tc('errRoom'));
    }
    if (step === 4) {
        if (!$('terms-check').checked) return fail('review-error', tc('errTerms'));
    }
    return true;
}

function fail(id, msg) {
    const el = $(id);
    if (el) { el.textContent = msg; el.classList.add('show'); }
    return false;
}

function clearErrors() {
    document.querySelectorAll('.error-msg').forEach((el) => { el.textContent = ''; el.classList.remove('show'); });
}

function initDestinations() {
    const grid = $('dest-grid');
    if (!grid) return;

    grid.querySelectorAll('.dest-card').forEach((card) => {
        card.addEventListener('click', () => {
            const alreadyPicked = card.getAttribute('aria-checked') === 'true';
            grid.querySelectorAll('.dest-card').forEach((c) => c.setAttribute('aria-checked', 'false'));
            if (alreadyPicked) {
                state.destId = null;
                state.destName = '';
                state.destImage = '';
            } else {
                card.setAttribute('aria-checked', 'true');
                state.destId = card.dataset.id;
                state.destName = card.dataset.name;
                state.destImage = card.dataset.image || '';
            }
            updateSummary();
        });
    });

    const search = $('dest-search-input');
    if (search) {
        search.addEventListener('input', () => {
            const q = search.value.trim().toLowerCase();
            let visible = 0;
            grid.querySelectorAll('.dest-card').forEach((card) => {
                const match = card.dataset.name.toLowerCase().includes(q);
                card.hidden = !match;
                if (match) visible++;
            });
            const empty = $('dest-no-results');
            if (empty) empty.hidden = visible !== 0;
        });
    }
}

function initDates() {
    const startEl = $('trip-start');
    const endEl = $('trip-end');
    if (!startEl || !endEl) return;

    const today = new Date().toISOString().split('T')[0];
    startEl.min = today;
    endEl.min = today;

    startEl.addEventListener('change', () => {
        if (startEl.value) {
            const min = new Date(startEl.value); min.setDate(min.getDate() + 1);
            const max = new Date(startEl.value); max.setDate(max.getDate() + 14);
            endEl.min = min.toISOString().split('T')[0];
            endEl.max = max.toISOString().split('T')[0];
            if (endEl.value && endEl.value < endEl.min) endEl.value = '';
        }
        onDatesChange();
    });
    endEl.addEventListener('change', onDatesChange);
}

function onDatesChange() {
    state.start = $('trip-start').value;
    state.end = $('trip-end').value;
    state.nights = 0;
    if (state.start && state.end) {
        const diff = Math.round((new Date(state.end) - new Date(state.start)) / 86400000);
        state.nights = diff > 0 ? diff : 0;
    }
    const disp = $('duration-display');
    disp.innerHTML = state.nights > 0
        ? `<i class="fas fa-moon" aria-hidden="true"></i> ${window.tp('js.bookings.nights', state.nights)} · ${window.tp('js.customTrip.days', state.nights + 1)}`
        : `<i class="fas fa-moon" aria-hidden="true"></i> ${tc('selectBoth')}`;
    updateSummary();
}

function initTravellerDetails() {
    wireStepper('traveler-stepper', 'traveler-count', 1, 15, (val) => {
        state.travelers = val;
        syncTravellerDetails();
        updateSummary();
    });
}

function emptyTraveller() {
    return { name: '', phone: '', gender: '', idNumber: '', idPhoto: '', emergencyName: '', emergencyPhone: '', knownDisease: '' };
}

function readTravellerDetailsFromDom() {
    state.travellerDetails.forEach((t, i) => {
        const nameEl = $('tname_' + i);
        if (!nameEl) return;
        t.name = nameEl.value;
        t.phone = $('tphone_' + i).value;
        t.gender = $('tgender_' + i).value;
        t.idNumber = $('tidNumber_' + i).value;
        t.idPhoto = $('tidPhoto_' + i).value;
        t.emergencyName = $('temgName_' + i).value;
        t.emergencyPhone = $('temgPhone_' + i).value;
        t.knownDisease = $('tdisease_' + i).value;
    });
}

function syncTravellerDetails() {
    readTravellerDetailsFromDom();
    const next = [];
    for (let i = 0; i < state.travelers; i++) next.push(state.travellerDetails[i] || emptyTraveller());
    if (next[0] && !next[0].name && window.SERVER_USER) {
        next[0].name = next[0].name || window.SERVER_USER.name || '';
        next[0].phone = next[0].phone || window.SERVER_USER.phone || '';
    }
    state.travellerDetails = next;
    renderTravellerDetails();
}

function renderTravellerDetails() {
    const list = $('traveller-details-list');
    if (!list) return;
    list.innerHTML = state.travellerDetails.map((t, i) => travellerCardHtml(t, i)).join('');
    state.travellerDetails.forEach((t, i) => wireTravellerCard(i));
}

function travellerCardHtml(t, i) {
    const headTitle = i === 0 ? tt('leadHtml') : tt('numbered', { n: i + 1 });
    return `
    <section class="traveller-card">
        <header class="traveller-card__head">
            <span class="traveller-card__num">${i + 1}</span>
            <h3>${headTitle}</h3>
        </header>
        <div class="td-grid">
            <div class="td-field">
                <label for="tname_${i}">${tt('fullName')} <span class="req">*</span></label>
                <input type="text" id="tname_${i}" data-i="${i}" required value="${escapeHtml(t.name)}" placeholder="${tt('namePlaceholder')}" autocomplete="off">
                <span class="traveller-error" id="tname_error_${i}"></span>
            </div>
            <div class="td-field">
                <label for="tphone_${i}">${tt('phone')} <span class="req">*</span></label>
                <input type="tel" id="tphone_${i}" data-i="${i}" required value="${escapeHtml(t.phone)}" placeholder="01x xxxx xxxx" inputmode="tel" dir="ltr">
                <span class="traveller-error" id="tphone_error_${i}"></span>
            </div>
            <div class="td-field">
                <label for="tgender_${i}">${tt('gender')} <span class="req">*</span></label>
                <select id="tgender_${i}" data-i="${i}" required>
                    <option value="" disabled${t.gender ? '' : ' selected'}>${tt('select')}</option>
                    <option value="male"${t.gender === 'male' ? ' selected' : ''}>${tt('male')}</option>
                    <option value="female"${t.gender === 'female' ? ' selected' : ''}>${tt('female')}</option>
                </select>
                <span class="traveller-error" id="tgender_error_${i}"></span>
            </div>
            <div class="td-field">
                <label for="tidNumber_${i}">${tt('idNumber')} <span class="req">*</span></label>
                <input type="text" id="tidNumber_${i}" data-i="${i}" required value="${escapeHtml(t.idNumber)}" placeholder="${tt('idPlaceholder')}" autocomplete="off">
                <span class="traveller-error" id="tidNumber_error_${i}"></span>
            </div>
            <div class="td-field td-field--full">
                <label>${tt('idPhoto')} <span class="req">*</span> <span class="td-field__hint">${tt('idPhotoHint')}</span></label>
                <div class="td-upload" data-i="${i}">
                    <input type="hidden" id="tidPhoto_${i}" data-i="${i}" value="${escapeHtml(t.idPhoto)}">
                    <input type="file" id="tidPhotoFile_${i}" accept="image/jpeg,image/png,image/webp" hidden>
                    <button type="button" class="td-upload__btn" data-i="${i}"><i class="fas fa-camera" aria-hidden="true"></i> <span>${t.idPhoto ? tt('replacePhoto') : tt('choosePhoto')}</span></button>
                    <div class="td-upload__preview" id="tidPhotoPreview_${i}"${t.idPhoto ? '' : ' hidden'}>
                        <img alt="${tt('previewAlt')}" src="${escapeHtml(t.idPhoto)}">
                        <button type="button" class="td-upload__remove" data-i="${i}" aria-label="${tt('removePhoto')}">&times;</button>
                    </div>
                    <span class="td-upload__status" id="tidPhotoStatus_${i}"></span>
                </div>
                <span class="traveller-error" id="tidPhoto_error_${i}"></span>
            </div>
            <div class="td-field">
                <label for="temgName_${i}">${tt('emgName')} <span class="req">*</span></label>
                <input type="text" id="temgName_${i}" data-i="${i}" required value="${escapeHtml(t.emergencyName)}" placeholder="${tt('emgNamePlaceholder')}" autocomplete="off">
                <span class="traveller-error" id="temgName_error_${i}"></span>
            </div>
            <div class="td-field">
                <label for="temgPhone_${i}">${tt('emgPhone')} <span class="req">*</span></label>
                <input type="tel" id="temgPhone_${i}" data-i="${i}" required value="${escapeHtml(t.emergencyPhone)}" placeholder="01x xxxx xxxx" inputmode="tel" dir="ltr">
                <span class="traveller-error" id="temgPhone_error_${i}"></span>
            </div>
            <div class="td-field td-field--full">
                <label for="tdisease_${i}">${tt('disease')}</label>
                <textarea id="tdisease_${i}" data-i="${i}" rows="2" placeholder="${tt('diseasePlaceholder')}">${escapeHtml(t.knownDisease)}</textarea>
            </div>
        </div>
    </section>`;
}

function wireTravellerCard(i) {
    $('tname_' + i)?.addEventListener('input', () => { state.travellerDetails[i].name = $('tname_' + i).value; vtName(i); });
    $('tphone_' + i)?.addEventListener('input', () => { state.travellerDetails[i].phone = $('tphone_' + i).value; vtPhone(i); });
    $('tgender_' + i)?.addEventListener('change', () => { state.travellerDetails[i].gender = $('tgender_' + i).value; vtGender(i); });
    $('tidNumber_' + i)?.addEventListener('input', () => { state.travellerDetails[i].idNumber = $('tidNumber_' + i).value; vtId(i); });
    $('temgName_' + i)?.addEventListener('input', () => { state.travellerDetails[i].emergencyName = $('temgName_' + i).value; vtEmgName(i); });
    $('temgPhone_' + i)?.addEventListener('input', () => { state.travellerDetails[i].emergencyPhone = $('temgPhone_' + i).value; vtEmgPhone(i); });
    $('tdisease_' + i)?.addEventListener('input', () => { state.travellerDetails[i].knownDisease = $('tdisease_' + i).value; });

    const fileInput = $('tidPhotoFile_' + i);
    const chooseBtn = document.querySelector('.td-upload__btn[data-i="' + i + '"]');
    const removeBtn = document.querySelector('.td-upload__remove[data-i="' + i + '"]');
    chooseBtn?.addEventListener('click', () => fileInput.click());
    fileInput?.addEventListener('change', () => {
        const f = fileInput.files[0];
        if (f) uploadTravellerPhoto(i, f);
    });
    removeBtn?.addEventListener('click', () => clearTravellerPhoto(i));
}

async function uploadTravellerPhoto(i, file) {
    const status = $('tidPhotoStatus_' + i);
    const btn = document.querySelector('.td-upload__btn[data-i="' + i + '"]');
    status.textContent = tt('uploading');
    status.className = 'td-upload__status is-loading';
    if (btn) btn.disabled = true;

    try {
        const fd = new FormData();
        fd.append('photo', file);
        const res = await fetch('/api/trip-requests/traveller-photo', {
            method: 'POST', credentials: 'include', body: fd,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || tt('uploadFailed'));

        state.travellerDetails[i].idPhoto = data.data.url;
        $('tidPhoto_' + i).value = data.data.url;
        const preview = $('tidPhotoPreview_' + i);
        preview.querySelector('img').src = data.data.url;
        preview.hidden = false;
        status.textContent = '';
        status.className = 'td-upload__status';
        if (btn) btn.querySelector('span').textContent = tt('replacePhoto');
        setTErr('tidPhoto_error_' + i, '');
    } catch (err) {
        status.textContent = err.message;
        status.className = 'td-upload__status is-error';
    } finally {
        if (btn) btn.disabled = false;
    }
}

function clearTravellerPhoto(i) {
    state.travellerDetails[i].idPhoto = '';
    $('tidPhoto_' + i).value = '';
    $('tidPhotoFile_' + i).value = '';
    const preview = $('tidPhotoPreview_' + i);
    preview.hidden = true;
    preview.querySelector('img').src = '';
    const btn = document.querySelector('.td-upload__btn[data-i="' + i + '"]');
    if (btn) btn.querySelector('span').textContent = tt('choosePhoto');
}

function setTErr(id, msg) { const el = $(id); if (el) el.textContent = msg || ''; }
function tDigits(v) { return String(v || '').replace(/\D/g, ''); }

function vtName(i) {
    const v = (state.travellerDetails[i].name || '').trim();
    if (!NAME_RE.test(v)) { setTErr('tname_error_' + i, tt('errName')); return false; }
    setTErr('tname_error_' + i, ''); return true;
}
function vtPhone(i) {
    const d = tDigits(state.travellerDetails[i].phone);
    if (d.length < 8 || d.length > 15) { setTErr('tphone_error_' + i, tt('errPhone')); return false; }
    setTErr('tphone_error_' + i, ''); return true;
}
function vtGender(i) {
    if (!state.travellerDetails[i].gender) { setTErr('tgender_error_' + i, tt('errGender')); return false; }
    setTErr('tgender_error_' + i, ''); return true;
}
function vtId(i) {
    const v = (state.travellerDetails[i].idNumber || '').trim();
    if (v.replace(/\s/g, '').length < 6) { setTErr('tidNumber_error_' + i, tt('errId')); return false; }
    setTErr('tidNumber_error_' + i, ''); return true;
}
function vtPhoto(i) {
    if (!state.travellerDetails[i].idPhoto) { setTErr('tidPhoto_error_' + i, tt('errPhoto')); return false; }
    setTErr('tidPhoto_error_' + i, ''); return true;
}
function vtEmgName(i) {
    const v = (state.travellerDetails[i].emergencyName || '').trim();
    if (v.length < 2) { setTErr('temgName_error_' + i, tt('errEmgName')); return false; }
    setTErr('temgName_error_' + i, ''); return true;
}
function vtEmgPhone(i) {
    const d = tDigits(state.travellerDetails[i].emergencyPhone);
    if (d.length < 8 || d.length > 15) { setTErr('temgPhone_error_' + i, tt('errPhone')); return false; }
    setTErr('temgPhone_error_' + i, ''); return true;
}
function validateTravellerDetail(i) {
    let ok = true;
    [vtName, vtPhone, vtGender, vtId, vtPhoto, vtEmgName, vtEmgPhone].forEach((fn) => { if (!fn(i)) ok = false; });
    return ok;
}

function wireStepper(wrapId, inputId, min, max, onChange) {
    const wrap = $(wrapId);
    const input = $(inputId);
    if (!wrap || !input) return;

    const clamp = (n) => Math.max(min, Math.min(max, n));
    const apply = () => {
        let n = parseInt(input.value, 10);
        if (isNaN(n)) n = min;
        n = clamp(n);
        input.value = n;
        wrap.querySelector('[data-delta="-1"]').disabled = n <= min;
        wrap.querySelector('[data-delta="1"]').disabled = n >= max;
        onChange(n);
    };

    wrap.querySelectorAll('.stepper-input__btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            input.value = clamp((parseInt(input.value, 10) || min) + Number(btn.dataset.delta));
            apply();
        });
    });
    input.addEventListener('input', apply);
    input.addEventListener('blur', apply);
    apply();
}

function initRooms() {
    wireStepper('room-stepper', 'room-count', 1, 10, (val) => {
        state.roomCount = val;
        syncRooms();
        updateSummary();
    });
}

function syncRooms() {
    const list = $('room-list');
    if (!list) return;

    const next = [];
    for (let i = 0; i < state.roomCount; i++) next.push(state.rooms[i] || '');
    state.rooms = next;

    list.innerHTML = '';
    for (let i = 0; i < state.roomCount; i++) {
        const row = document.createElement('div');
        row.className = 'room-row';

        const label = document.createElement('span');
        label.className = 'room-row__label';
        label.innerHTML = `<i class="fas fa-bed" aria-hidden="true"></i> ${tc('room', { n: i + 1 })}`;

        const select = document.createElement('select');
        select.className = 'room-row__select';
        select.dataset.index = String(i);
        select.innerHTML = `<option value="">${tc('selectRoomType')}</option>` +
            ROOM_TYPES.map((t) => `<option value="${t.value}">${t.label}</option>`).join('');
        select.value = state.rooms[i] || '';
        select.addEventListener('change', () => {
            state.rooms[Number(select.dataset.index)] = select.value;
            updateSummary();
        });

        row.appendChild(label);
        row.appendChild(select);
        list.appendChild(row);
    }
}

function roomsSummary() {
    const counts = {};
    state.rooms.forEach((r) => { if (r) counts[r] = (counts[r] || 0) + 1; });
    const parts = ROOM_TYPES
        .filter((t) => counts[t.value])
        .map((t) => `${counts[t.value]} ${window.t('js.bookings.rooms.' + t.value)}`);
    return parts.length ? parts.join(', ') : '';
}

function buildReview() {
    const rows = [
        [tc('destination'), state.destName || '–'],
        [tc('dates'), state.start && state.end ? `${fmtDate(state.start)} ${arrow()} ${fmtDate(state.end)} (${window.tp('js.bookings.nights', state.nights)})` : '–'],
        [tc('travellersLabel'), String(state.travelers)],
        [tc('roomsLabel'), `${window.tp('js.customTrip.rooms', state.roomCount)} · ${roomsSummary() || tc('typeNotSet')}`],
    ];
    $('review-body').innerHTML = rows.map(([k, v]) =>
        `<div class="review-row"><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join('');
}

function updateSummary() {
    const hero = $('summary-hero');
    if (state.destName) {
        hero.hidden = false;
        $('summary-hero-media').style.backgroundImage = `url('${state.destImage || '/images/layoutImage.jpg'}')`;
        $('summary-hero-name').textContent = state.destName;
    } else {
        hero.hidden = true;
    }
    $('sum-dest').textContent = state.destName || '–';
    $('sum-dates').textContent = state.start && state.end
        ? `${fmtDate(state.start)} ${arrow()} ${fmtDate(state.end)}`
        : '–';
    $('sum-travelers').textContent = state.travelers ? window.tp('js.customTrip.travellers', state.travelers) : '–';
    const rs = roomsSummary();
    $('sum-rooms').textContent = `${window.tp('js.customTrip.rooms', state.roomCount)}${rs ? ` · ${rs}` : ''}`;
}

async function submitRequest() {
    if (!validateStep(4)) return;

    const btn = $('submit-btn');
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${tc('sending')}`;

    try {
        const res = await fetch('/api/trip-requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                destinationId: state.destId,
                startDate: state.start,
                endDate: state.end,
                travelers: state.travelers,
                rooms: state.rooms.map((type) => ({ type })),
                notes: $('notes').value.trim(),
                travellerDetails: state.travellerDetails,
            }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || window.t('js.common.error'));
        showStep('done');
    } catch (err) {
        fail('review-error', err.message);
        btn.disabled = false;
        btn.innerHTML = `<i class="fas fa-paper-plane"></i> ${tc('sendRequest')}`;
    }
}

function fmtDate(str) {
    const d = new Date(str);
    if (isNaN(d)) return str;
    return d.toLocaleDateString(window.I18N && window.I18N.lang === 'ar' ? window.dateLocale : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function arrow() {
    return document.documentElement.dir === 'rtl' ? '←' : '→';
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}
