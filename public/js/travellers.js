'use strict';

const TD = window.TD || { draftId: '', travelers: 1, totalPrice: 0, backUrl: '/' };
const NAME_RE = /^[\p{L}\s'.-]{2,}$/u;
const tt = (k, v) => window.t('js.traveller.' + k, v);

const $ = (id) => document.getElementById(id);

function setErr(id, msg) { const el = $(id); if (el) el.textContent = msg || ''; }

function digits(v) { return String(v || '').replace(/\D/g, ''); }

function money(n) { return window.t('js.common.money', { amount: Number(n || 0).toLocaleString('en-US') }); }

function vName(i) {
    const v = ($('name_' + i)?.value || '').trim();
    if (!NAME_RE.test(v)) { setErr('name_error_' + i, tt('errName')); return false; }
    setErr('name_error_' + i, ''); return true;
}
function vPhone(i) {
    const d = digits($('phone_' + i)?.value);
    if (d.length < 8 || d.length > 15) { setErr('phone_error_' + i, tt('errPhone')); return false; }
    setErr('phone_error_' + i, ''); return true;
}
function vGender(i) {
    if (!$('gender_' + i)?.value) { setErr('gender_error_' + i, tt('errGender')); return false; }
    setErr('gender_error_' + i, ''); return true;
}
function vId(i) {
    const v = ($('idNumber_' + i)?.value || '').trim();
    if (v.replace(/\s/g, '').length < 6) { setErr('idNumber_error_' + i, tt('errId')); return false; }
    setErr('idNumber_error_' + i, ''); return true;
}
function vPhoto(i) {
    if (!$('idPhoto_' + i)?.value) { setErr('idPhoto_error_' + i, tt('errPhoto')); return false; }
    setErr('idPhoto_error_' + i, ''); return true;
}
function vEmgName(i) {
    const v = ($('emgName_' + i)?.value || '').trim();
    if (v.length < 2) { setErr('emergencyName_error_' + i, tt('errEmgName')); return false; }
    setErr('emergencyName_error_' + i, ''); return true;
}
function vEmgPhone(i) {
    const d = digits($('emgPhone_' + i)?.value);
    if (d.length < 8 || d.length > 15) { setErr('emergencyPhone_error_' + i, tt('errPhone')); return false; }
    setErr('emergencyPhone_error_' + i, ''); return true;
}

function validateTraveller(i) {
    let ok = true;
    [vName, vPhone, vGender, vId, vPhoto, vEmgName, vEmgPhone].forEach((fn) => { if (!fn(i)) ok = false; });
    return ok;
}

function validatePayment() {
    let ok = true;
    if (!document.querySelector('input[name="paymentMethod"]:checked')) {
        setErr('paymentMethod_error', window.t('js.travellers.errMethod')); ok = false;
    } else setErr('paymentMethod_error', '');
    if (!document.querySelector('input[name="paymentPlan"]:checked')) {
        setErr('paymentPlan_error', window.t('js.travellers.errPlan')); ok = false;
    } else setErr('paymentPlan_error', '');
    return ok;
}

async function uploadPhoto(i, file) {
    const status = $('idPhotoStatus_' + i);
    const btn = document.querySelector('.td-upload__btn[data-i="' + i + '"]');
    status.textContent = tt('uploading');
    status.className = 'td-upload__status is-loading';
    if (btn) btn.disabled = true;

    try {
        const fd = new FormData();
        fd.append('photo', file);
        const res = await fetch('/api/bookings/draft/' + TD.draftId + '/traveller-photo', {
            method: 'POST', credentials: 'include', body: fd,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || tt('uploadFailed'));

        $('idPhoto_' + i).value = data.data.url;
        const preview = $('idPhotoPreview_' + i);
        preview.querySelector('img').src = data.data.url;
        preview.hidden = false;
        status.textContent = '';
        status.className = 'td-upload__status';
        if (btn) btn.querySelector('span').textContent = tt('replacePhoto');
        setErr('idPhoto_error_' + i, '');
    } catch (err) {
        status.textContent = err.message;
        status.className = 'td-upload__status is-error';
    } finally {
        if (btn) btn.disabled = false;
    }
}

function clearPhoto(i) {
    $('idPhoto_' + i).value = '';
    $('idPhotoFile_' + i).value = '';
    const preview = $('idPhotoPreview_' + i);
    preview.hidden = true;
    preview.querySelector('img').src = '';
    const btn = document.querySelector('.td-upload__btn[data-i="' + i + '"]');
    if (btn) btn.querySelector('span').textContent = tt('choosePhoto');
}

document.addEventListener('DOMContentLoaded', () => {
    const N = TD.travelers;

    const deposit = Math.round((TD.totalPrice || 0) / 2);
    if ($('depositAmt')) $('depositAmt').textContent = TD.totalPrice ? '· ' + money(deposit) : '';
    if ($('fullAmt')) $('fullAmt').textContent = TD.totalPrice ? '· ' + money(TD.totalPrice) : '';

    for (let i = 0; i < N; i++) {
        $('name_' + i)?.addEventListener('input', () => vName(i));
        $('phone_' + i)?.addEventListener('input', () => vPhone(i));
        $('gender_' + i)?.addEventListener('change', () => vGender(i));
        $('idNumber_' + i)?.addEventListener('input', () => vId(i));
        $('emgName_' + i)?.addEventListener('input', () => vEmgName(i));
        $('emgPhone_' + i)?.addEventListener('input', () => vEmgPhone(i));

        const fileInput = $('idPhotoFile_' + i);
        const chooseBtn = document.querySelector('.td-upload__btn[data-i="' + i + '"]');
        const removeBtn = document.querySelector('.td-upload__remove[data-i="' + i + '"]');
        chooseBtn?.addEventListener('click', () => fileInput.click());
        fileInput?.addEventListener('change', () => {
            const f = fileInput.files[0];
            if (f) uploadPhoto(i, f);
        });
        removeBtn?.addEventListener('click', () => clearPhoto(i));
    }

    document.querySelectorAll('input[name="paymentMethod"], input[name="paymentPlan"]').forEach((el) => {
        el.addEventListener('change', validatePayment);
    });

    $('travelers-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errDiv = $('form-error');
        errDiv.style.display = 'none';

        let ok = true;
        for (let i = 0; i < N; i++) { if (!validateTraveller(i)) ok = false; }
        if (!validatePayment()) ok = false;
        if (!ok) {
            errDiv.style.display = 'block';
            errDiv.textContent = tt('errFix');
            document.querySelector('.traveller-error:not(:empty)')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            return;
        }

        const travellerDetails = [];
        for (let i = 0; i < N; i++) {
            travellerDetails.push({
                name: $('name_' + i).value.trim(),
                phone: $('phone_' + i).value.trim(),
                gender: $('gender_' + i).value,
                idNumber: $('idNumber_' + i).value.trim(),
                idPhoto: $('idPhoto_' + i).value,
                emergencyName: $('emgName_' + i).value.trim(),
                emergencyPhone: $('emgPhone_' + i).value.trim(),
                knownDisease: $('disease_' + i).value.trim(),
            });
        }

        const btn = $('continue-btn');
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${window.t('js.travellers.saving')}`;

        try {
            const res = await fetch('/api/bookings/draft/' + TD.draftId, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    travellerDetails,
                    paymentMethod: document.querySelector('input[name="paymentMethod"]:checked').value,
                    paymentPlan: document.querySelector('input[name="paymentPlan"]:checked').value,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || window.t('js.travellers.saveFailed'));
            window.location.href = '/booking/summary?draftId=' + TD.draftId;
        } catch (err) {
            errDiv.style.display = 'block';
            errDiv.textContent = err.message;
            btn.disabled = false;
            btn.innerHTML = `${window.t('js.travellers.continue')} <i class="fas fa-arrow-right"></i>`;
        }
    });
});
