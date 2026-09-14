document.addEventListener("DOMContentLoaded", function() {
    const contactForm = document.getElementById("contact-form");
    const submitBtn = document.querySelector(".btn--primary");

    function showFieldError(input, msg) {
        let errEl = input.parentElement.querySelector('.field-error');
        if (!errEl) {
            errEl = document.createElement('span');
            errEl.className = 'field-error';
            errEl.style.cssText = 'color:#e05260;font-size:0.78rem;display:block;margin-top:4px;';
            input.parentElement.appendChild(errEl);
        }
        errEl.textContent = msg;
        input.style.borderColor = 'var(--color-danger, #e05260)';
    }

    function clearFieldError(input) {
        const errEl = input.parentElement.querySelector('.field-error');
        if (errEl) errEl.textContent = '';
        input.style.borderColor = '';
    }

    function validateContactForm() {
        let valid = true;

        const name    = document.getElementById('name');
        const email   = document.getElementById('email');
        const subject = document.getElementById('subject');
        const message = document.getElementById('message');

        clearFieldError(name); clearFieldError(email);
        clearFieldError(subject); clearFieldError(message);

        if (!name.value.trim()) {
            showFieldError(name, window.t('js.contact.nameRequired')); valid = false;
        } else if (name.value.trim().length < 2) {
            showFieldError(name, window.t('js.contact.nameMin')); valid = false;
        }

        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email.value.trim()) {
            showFieldError(email, window.t('js.contact.emailRequired')); valid = false;
        } else if (!emailPattern.test(email.value.trim())) {
            showFieldError(email, window.t('js.contact.emailInvalid')); valid = false;
        }

        if (!subject.value.trim()) {
            showFieldError(subject, window.t('js.contact.subjectRequired')); valid = false;
        } else if (subject.value.trim().length < 3) {
            showFieldError(subject, window.t('js.contact.subjectMin')); valid = false;
        }

        if (!message.value.trim()) {
            showFieldError(message, window.t('js.contact.messageRequired')); valid = false;
        } else if (message.value.trim().length < 10) {
            showFieldError(message, window.t('js.contact.messageMin')); valid = false;
        }

        return valid;
    }

    ['name', 'email', 'subject', 'message'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('blur', () => validateContactForm());
            el.addEventListener('input', () => {
                clearFieldError(el);
                el.style.borderColor = '';
            });
        }
    });

    if (contactForm) {
        contactForm.addEventListener("submit", async function(event) {
            event.preventDefault();
            if (!validateContactForm()) return;

            const originalText = submitBtn.textContent;
            submitBtn.textContent = window.t('js.contact.sending');
            submitBtn.disabled = true;

            try {
                const res = await fetch('/api/contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        name:     document.getElementById('name').value.trim(),
                        email:    document.getElementById('email').value.trim(),
                        subject:  document.getElementById('subject').value.trim(),
                        message:  document.getElementById('message').value.trim(),
                        category: document.getElementById('category')?.value || 'General',
                    }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || window.t('js.contact.failed'));

                showInquirySuccess();
                contactForm.reset();
                loadMyTickets();
            } catch (err) {
                const msgEl = document.getElementById('message');
                if (msgEl) showFieldError(msgEl, err.message);
            } finally {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        });
    }

    function escHtml(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function loadMyTickets() {
        const container = document.getElementById('my-tickets-container');
        if (!container) return;
        fetch('/api/contact/my-tickets', { credentials: 'include' })
            .then(r => r.json())
            .then(data => {
                const tickets = data.data?.tickets || [];
                if (!tickets.length) {
                    container.innerHTML = `<p style="opacity:0.6;">${window.t('js.contact.noTickets')}</p>`;
                    return;
                }
                container.innerHTML = tickets.map(t => `
                    <div class="glass-card" style="margin-bottom:1rem;padding:1.25rem;">
                        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.5rem;">
                            <strong>${escHtml(t.subject)}</strong>
                            <span style="padding:4px 14px;border-radius:20px;font-size:0.78rem;font-weight:600;
                                background:${t.status==='resolved'?'rgba(52,199,89,0.15)':'rgba(255,149,0,0.15)'};
                                color:${t.status==='resolved'?'#34c759':'#ff9500'};">
                                ${t.status==='resolved' ? window.t('js.contact.resolved') : window.t('js.contact.open')}
                            </span>
                        </div>
                        <p style="font-size:0.85rem;opacity:0.7;margin:0;">${escHtml(t.message)}</p>
                        ${t.adminReply ? `<div style="border-inline-start:1px solid var(--crimson);padding-inline-start:0.75rem;margin-top:0.75rem;font-size:0.85rem;">
                            <strong>${window.t('js.contact.adminReply')}</strong><br>${escHtml(t.adminReply)}
                        </div>` : ''}
                    </div>
                `).join('');
            })
            .catch(() => { container.innerHTML = `<p style="opacity:0.6;">${window.t('js.contact.loadFailed')}</p>`; });
    }

    loadMyTickets();

    function showInquirySuccess() {
        const alertDiv = document.createElement('div');
        alertDiv.className = 'glass-card inquiry-success-alert';
        alertDiv.style.cssText = 'position:fixed;top:100px;inset-inline-end:20px;padding:20px 30px;border-inline-start:1px solid var(--crimson);box-shadow:var(--shadow-lg);z-index:10000;color:var(--text-primary);animation:revealUp 0.5s ease forwards;';
        alertDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 15px;">
                <i class="fas fa-check-circle" style="color: var(--crimson); font-size: 1.5rem;"></i>
                <div>
                    <strong style="display: block; font-family: var(--font-display);">${window.t('js.contact.successTitle')}</strong>
                    <span style="font-size: 14px; opacity: 0.8;">${window.t('js.contact.successBody')}</span>
                </div>
            </div>
        `;
        document.body.appendChild(alertDiv);
        setTimeout(() => {
            alertDiv.style.opacity = '0';
            alertDiv.style.transform = 'translateY(-20px)';
            alertDiv.style.transition = 'all 0.5s ease';
            setTimeout(() => alertDiv.remove(), 500);
        }, 4000);
    }
});
