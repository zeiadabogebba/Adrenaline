const showError = (id, msg) => { const el = document.getElementById(id); if (el) el.textContent = msg; };
const clearError = (id)       => { const el = document.getElementById(id); if (el) el.textContent = ''; };

// Letters from any script (Arabic names included), spaces, apostrophes and hyphens.
const LETTERS_ONLY = /^[\p{L}\s'-]+$/u;

function validateFirstname() {
  const val = (document.getElementById('firstname')?.value || '').trim();
  if (val.length < 2)             { showError('firstname_error', window.t('js.auth.firstMin')); return false; }
  if (!LETTERS_ONLY.test(val))    { showError('firstname_error', window.t('js.auth.firstLetters'));     return false; }
  clearError('firstname_error'); return true;
}

function validateLastname() {
  const val = (document.getElementById('lastname')?.value || '').trim();
  if (val.length < 2)             { showError('lastname_error', window.t('js.auth.lastMin')); return false; }
  if (!LETTERS_ONLY.test(val))    { showError('lastname_error', window.t('js.auth.lastLetters'));     return false; }
  clearError('lastname_error'); return true;
}

function validateDob() {
  const val = document.getElementById('dob')?.value || '';
  if (!val) { showError('dob_error', window.t('js.auth.dobRequired')); return false; }
  const age = (Date.now() - new Date(val)) / (1000 * 60 * 60 * 24 * 365.25);
  if (age < 18)  { showError('dob_error', window.t('js.auth.age18')); return false; }
  if (age > 100) { showError('dob_error', window.t('js.auth.age100')); return false; }
  clearError('dob_error'); return true;
}

function validateNationality() {
  const val = document.getElementById('nationality')?.value || '';
  if (!val) { showError('nationality_error', window.t('js.auth.nationalityRequired')); return false; }
  clearError('nationality_error'); return true;
}

function validatePhone() {
  const digits = (document.getElementById('phone')?.value || '').replace(/\D/g, '');
  if (digits.length < 7)  { showError('phone_error', window.t('js.auth.phoneMin')); return false; }
  if (digits.length > 12) { showError('phone_error', window.t('js.auth.phoneMax')); return false; }
  clearError('phone_error'); return true;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validateEmail() {
  const val = (document.getElementById('email')?.value || '').trim();
  if (!EMAIL_RE.test(val)) { showError('email_error', window.t('js.auth.emailInvalid')); return false; }
  clearError('email_error'); return true;
}

function validatePassword() {
  const val = document.getElementById('password')?.value || '';
  if (val.length < 6)                        { showError('password_error', window.t('js.auth.passMin')); return false; }
  if (!/\p{L}/u.test(val))                   { showError('password_error', window.t('js.auth.passLetter')); return false; }
  if (!/\d/.test(val))                       { showError('password_error', window.t('js.auth.passNumber')); return false; }
  if (!/[!@#$%^&*()\-+_=]/.test(val))       { showError('password_error', window.t('js.auth.passSymbol')); return false; }
  clearError('password_error'); return true;
}

function validateConfirmPassword() {
  const pass = document.getElementById('password')?.value         || '';
  const conf = document.getElementById('confirm_password')?.value || '';
  if (pass !== conf) { showError('confirm_password_error', window.t('js.auth.passMismatch')); return false; }
  clearError('confirm_password_error'); return true;
}

let onTermsAgreed = null;

function openTermsModal(onAgree, opts) {
  onTermsAgreed = onAgree;
  const requireDetails = !!(opts && opts.requireDetails);
  const overlay = document.getElementById('termsModalOverlay');
  const checkbox = document.getElementById('termsAgreeCheckbox');
  const continueBtn = document.getElementById('termsContinueBtn');
  const detailsBlock = document.getElementById('googleDetailsFields');
  if (checkbox) checkbox.checked = false;
  if (continueBtn) continueBtn.disabled = true;
  if (detailsBlock) detailsBlock.hidden = !requireDetails;
  if (overlay) {
    overlay.dataset.requireDetails = requireDetails ? '1' : '';
    overlay.hidden = false;

    overlay.classList.add('active');
  }
}

function closeTermsModal() {
  const overlay = document.getElementById('termsModalOverlay');
  if (overlay) {
    overlay.hidden = true;
    overlay.classList.remove('active');
  }
  onTermsAgreed = null;
}

function validateGoogleDetails() {
  let ok = true;

  const dob = document.getElementById('g_dob')?.value || '';
  if (!dob) { showError('g_dob_error', window.t('js.auth.dobRequired')); ok = false; }
  else {
    const age = (Date.now() - new Date(dob)) / (1000 * 60 * 60 * 24 * 365.25);
    if (age < 18) { showError('g_dob_error', window.t('js.auth.age18')); ok = false; }
    else if (age > 100) { showError('g_dob_error', window.t('js.auth.age100')); ok = false; }
    else clearError('g_dob_error');
  }

  const nationality = document.getElementById('g_nationality')?.value || '';
  if (!nationality) { showError('g_nationality_error', window.t('js.auth.nationalityRequired')); ok = false; }
  else clearError('g_nationality_error');

  const digits = (document.getElementById('g_phone')?.value || '').replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 12) { showError('g_phone_error', window.t('js.auth.phoneInvalid')); ok = false; }
  else clearError('g_phone_error');

  return ok;
}

function initTermsModal() {
  const overlay = document.getElementById('termsModalOverlay');
  const checkbox = document.getElementById('termsAgreeCheckbox');
  const continueBtn = document.getElementById('termsContinueBtn');
  const cancelBtn = document.getElementById('termsCancelBtn');
  const closeBtn = document.getElementById('termsModalClose');
  if (!overlay || !checkbox || !continueBtn) return;

  checkbox.addEventListener('change', () => { continueBtn.disabled = !checkbox.checked; });
  continueBtn.addEventListener('click', () => {
    if (overlay.dataset.requireDetails === '1' && !validateGoogleDetails()) return;
    const cb = onTermsAgreed;
    closeTermsModal();
    if (cb) cb();
  });
  cancelBtn?.addEventListener('click', closeTermsModal);
  closeBtn?.addEventListener('click', closeTermsModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeTermsModal(); });
}

function resolveRegisterDest() {
  const wanted = new URLSearchParams(window.location.search).get('redirect');
  return wanted && wanted.startsWith('/') && !wanted.startsWith('//')
    && !/^\/(login|register)(\/|\?|#|$)/.test(wanted) ? wanted : '/dashboard';
}

let pendingGoogleCredential = null;

async function submitGoogleCredential(credential, agreedToTerms) {
  const errDiv = document.getElementById('google-auth-error');
  if (errDiv) errDiv.style.display = 'none';
  try {
    const body = { credential, agreedToTerms: !!agreedToTerms };
    if (agreedToTerms) {
      const countryCode = document.getElementById('g_country_code')?.value || '';
      const phoneNum = document.getElementById('g_phone')?.value || '';
      body.dob = document.getElementById('g_dob')?.value || '';
      body.nationality = document.getElementById('g_nationality')?.value || '';
      body.phone = countryCode ? `${countryCode} ${phoneNum}` : phoneNum;
    }
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok && data.needsTermsAgreement) {
      pendingGoogleCredential = credential;
      openTermsModal(() => submitGoogleCredential(pendingGoogleCredential, true), { requireDetails: true });
      return;
    }
    if (!res.ok) throw new Error(data.message || window.t('js.auth.googleSignupFailed'));

    window.location.href = resolveRegisterDest();
  } catch (err) {
    if (errDiv) { errDiv.style.display = 'block'; errDiv.textContent = err.message; }
  }
}

window.handleGoogleCredential = function (response) {
  if (!response || !response.credential) return;
  submitGoogleCredential(response.credential, false);
};

function renderGoogleButton() {
  const el = document.getElementById('googleSignInBtn');
  if (!el || !window.google?.accounts?.id || !window.GOOGLE_CLIENT_ID) return;

  google.accounts.id.initialize({
    client_id: window.GOOGLE_CLIENT_ID,
    callback: window.handleGoogleCredential,
  });

  el.innerHTML = '';
  google.accounts.id.renderButton(el, {
    type: 'standard',
    theme: 'filled_black',
    shape: 'rectangular',
    size: 'large',
    text: 'signup_with',
    logo_alignment: 'left',
    locale: (window.I18N && window.I18N.lang) || 'en',
    width: el.clientWidth || 300,
  });
}
window.onGoogleLibraryLoad = renderGoogleButton;
window.addEventListener('resize', () => {
  clearTimeout(window._gBtnResizeT);
  window._gBtnResizeT = setTimeout(renderGoogleButton, 200);
});

document.addEventListener('DOMContentLoaded', () => {
  initAtmosphericReveal();
  initGlowInputs();
  initTermsModal();

  const pendingRedirect = new URLSearchParams(window.location.search).get('redirect');
  if (pendingRedirect && pendingRedirect.startsWith('/') && !pendingRedirect.startsWith('//')) {
    document.querySelectorAll('a[href="/login"]').forEach(a => {
      a.setAttribute('href', '/login?redirect=' + encodeURIComponent(pendingRedirect));
    });
  }

  document.getElementById('firstname')?.addEventListener('input', validateFirstname);
  document.getElementById('lastname')?.addEventListener('input', validateLastname);
  document.getElementById('dob')?.addEventListener('change', validateDob);
  document.getElementById('nationality')?.addEventListener('change', validateNationality);
  const phoneInput = document.getElementById('phone');
  phoneInput?.addEventListener('input', () => {
    phoneInput.value = phoneInput.value.replace(/[a-zA-Z]/g, '').slice(0, 12);
    validatePhone();
  });
  document.getElementById('email')?.addEventListener('input', validateEmail);
  document.getElementById('password')?.addEventListener('input', () => { validatePassword(); validateConfirmPassword(); });
  document.getElementById('confirm_password')?.addEventListener('input', validateConfirmPassword);

  const form   = document.getElementById('registrationForm');
  const errDiv = document.getElementById('register-error');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const allValid = [
      validateFirstname(), validateLastname(), validateDob(), validateNationality(),
      validatePhone(), validateEmail(), validatePassword(), validateConfirmPassword()
    ].every(Boolean);
    if (!allValid) return;

    const countryCode = document.getElementById('country_code')?.value || '';
    const phoneNum    = document.getElementById('phone')?.value        || '';
    const fd = {
      firstname:        document.getElementById('firstname')?.value.trim()        || '',
      lastname:         document.getElementById('lastname')?.value.trim()         || '',
      email:            document.getElementById('email')?.value.trim()            || '',
      password:         document.getElementById('password')?.value                || '',
      dob:              document.getElementById('dob')?.value                     || '',
      nationality:      document.getElementById('nationality')?.value             || '',
      phone:            countryCode ? `${countryCode} ${phoneNum}` : phoneNum,
    };

    const submitBtn = form.querySelector('button[type="submit"]');
    if (errDiv) errDiv.style.display = 'none';

    openTermsModal(async () => {
      if (submitBtn) { submitBtn.textContent = window.t('js.auth.creating'); submitBtn.disabled = true; }
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name: `${fd.firstname} ${fd.lastname}`, email: fd.email, password: fd.password, phone: fd.phone, nationality: fd.nationality, dob: fd.dob }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || window.t('js.auth.registrationFailed'));

        if (data.needsVerification) {
          openOtpModal(data.data.email);
          if (submitBtn) { submitBtn.textContent = window.t('js.auth.createAccount'); submitBtn.disabled = false; }
          return;
        }

        window.location.href = resolveRegisterDest();
      } catch (err) {
        if (errDiv) { errDiv.style.display = 'block'; errDiv.textContent = err.message; }
        if (submitBtn) { submitBtn.textContent = window.t('js.auth.createAccount'); submitBtn.disabled = false; }
      }
    });
  });
});

let otpEmail = null;

function openOtpModal(email) {
  otpEmail = email;
  const overlay = document.getElementById('otpModalOverlay');
  const display = document.getElementById('otp-email-display');
  const input = document.getElementById('otp-input');
  if (display) display.textContent = email;
  if (input) { input.value = ''; }
  clearError('otp_error');
  const errBanner = document.getElementById('otp-modal-error');
  if (errBanner) errBanner.style.display = 'none';
  if (overlay) {
    overlay.hidden = false;
    overlay.classList.add('active');
  }
  input?.focus();
}

function closeOtpModal() {
  const overlay = document.getElementById('otpModalOverlay');
  if (overlay) {
    overlay.hidden = true;
    overlay.classList.remove('active');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('otp-input');
  input?.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 6);
  });

  document.getElementById('otpModalClose')?.addEventListener('click', closeOtpModal);
  document.getElementById('otpModalOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'otpModalOverlay') closeOtpModal();
  });

  document.getElementById('otp-resend-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('otp-resend-btn');
    const errBanner = document.getElementById('otp-modal-error');
    if (!otpEmail) return;
    btn.disabled = true;
    btn.textContent = window.t('js.auth.sending');
    try {
      const res = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: otpEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || window.t('js.auth.resendFailed'));
      errBanner.style.display = 'none';
    } catch (err) {
      errBanner.style.display = 'block';
      errBanner.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = window.t('js.auth.resend');
    }
  });

  document.getElementById('otp-submit-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('otp-submit-btn');
    const input = document.getElementById('otp-input');
    const errBanner = document.getElementById('otp-modal-error');
    const code = (input?.value || '').trim();

    clearError('otp_error');
    if (code.length !== 6) { showError('otp_error', window.t('js.auth.enterCode')); return; }

    btn.disabled = true;
    btn.textContent = window.t('js.auth.verifying');
    errBanner.style.display = 'none';
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: otpEmail, otp: code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || window.t('js.auth.verifyFailed'));

      window.location.href = resolveRegisterDest();
    } catch (err) {
      errBanner.style.display = 'block';
      errBanner.textContent = err.message;
      btn.disabled = false;
      btn.textContent = window.t('js.auth.verifyContinue');
    }
  });
});

function initAtmosphericReveal() {
  document.querySelectorAll('.reveal-item').forEach((el, i) => {
    el.style.opacity    = '0';
    el.style.transform  = 'translateY(20px)';
    el.style.transition = `all 0.8s cubic-bezier(0.16,1,0.3,1) ${0.2 + i * 0.1}s`;
    requestAnimationFrame(() => {
      el.style.opacity   = '1';
      el.style.transform = 'translateY(0)';
    });
  });
}

function initGlowInputs() {
  document.querySelectorAll('input, select, textarea').forEach(input => {
    input.addEventListener('focus', () => input.parentElement.classList.add('glow-active'));
    input.addEventListener('blur',  () => input.parentElement.classList.remove('glow-active'));
  });
}
