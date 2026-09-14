const getDashboard = (role) => {
  return role === 'Admin' ? '/admin' : '/dashboard';
};

const sanitizeInternalPath = (path) => {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return null;
  const base = path.split('?')[0].split('#')[0].toLowerCase();
  if (base === '/login' || base === '/register') return null;
  return path;
};

const sameOriginPath = (ref) => {
  if (!ref) return null;
  try {
    const u = new URL(ref);
    if (u.origin !== window.location.origin) return null;
    return sanitizeInternalPath(u.pathname + u.search + u.hash);
  } catch (e) {
    return null;
  }
};

const resolvePostLoginDest = (role) => {
  if (role === 'Admin') return '/admin';
  const wanted = new URLSearchParams(window.location.search).get('redirect');
  return sanitizeInternalPath(wanted) || sameOriginPath(document.referrer) || getDashboard(role);
};

window.handleGoogleCredential = async function (response) {
  const errDiv = document.getElementById('google-auth-error');
  if (!response || !response.credential) return;
  if (errDiv) errDiv.style.display = 'none';

  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ credential: response.credential }),
    });
    const data = await res.json();

    if (!res.ok && data.needsTermsAgreement) {
      if (errDiv) {
        errDiv.style.display = 'block';
        errDiv.textContent = window.t('js.auth.googleNoAccount');
      }
      const q = window.location.search || '';
      setTimeout(() => { window.location.href = '/register' + q; }, 1500);
      return;
    }
    if (!res.ok) throw new Error(data.message || window.t('js.auth.googleFailed'));

    window.location.href = resolvePostLoginDest(data.data.user.role);
  } catch (err) {
    if (errDiv) { errDiv.style.display = 'block'; errDiv.textContent = err.message; }
  }
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
    text: 'signin_with',
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

  const pending = new URLSearchParams(window.location.search).get('redirect');
  if (pending && sanitizeInternalPath(pending)) {
    document.querySelectorAll('a[href="/register"]').forEach(a => {
      a.setAttribute('href', '/register?redirect=' + encodeURIComponent(pending));
    });
  }

  const form = document.getElementById('login-form');
  const errDiv = document.getElementById('login-error');
  const toggleBtn = document.getElementById('togglePasswordBtn');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const pwd = document.getElementById('password');
      const icon = toggleBtn.querySelector('i');
      if (pwd.type === 'password') { pwd.type = 'text'; icon.className = 'far fa-eye-slash'; }
      else { pwd.type = 'password'; icon.className = 'far fa-eye'; }
    });
  }

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errDiv) errDiv.style.display = 'none';

    const email      = document.getElementById('username').value.trim();
    const password   = document.getElementById('password').value;
    const submitBtn  = form.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.textContent = window.t('js.auth.signingIn'); submitBtn.disabled = true; }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });
      const data = await res.json();

      if (!res.ok && data.needsVerification) {
        openOtpModal(data.data.email);
        if (submitBtn) { submitBtn.textContent = window.t('js.auth.logIn'); submitBtn.disabled = false; }
        return;
      }
      if (!res.ok) throw new Error(data.message || window.t('js.auth.invalidLogin'));

      const { data: { user } } = data;
      window.location.href = resolvePostLoginDest(user.role);
    } catch (err) {
      if (errDiv) { errDiv.style.display = 'block'; errDiv.textContent = err.message; }
      if (submitBtn) { submitBtn.textContent = window.t('js.auth.logIn'); submitBtn.disabled = false; }
    }
  });
});

let otpEmail = null;

function openOtpModal(email) {
  otpEmail = email;
  const overlay = document.getElementById('otpModalOverlay');
  const display = document.getElementById('otp-email-display');
  const input = document.getElementById('otp-input');
  if (display) display.textContent = email;
  if (input) input.value = '';
  const codeErr = document.getElementById('otp_error');
  if (codeErr) codeErr.textContent = '';
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

    const codeErr = document.getElementById('otp_error');
    if (codeErr) codeErr.textContent = '';
    if (code.length !== 6) { if (codeErr) codeErr.textContent = window.t('js.auth.enterCode'); return; }

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

      window.location.href = resolvePostLoginDest(data.data.user.role);
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
