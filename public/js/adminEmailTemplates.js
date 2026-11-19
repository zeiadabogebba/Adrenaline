'use strict';

// Admin · Email Campaigns · Templates (trip announcement + login code wording).
(function adminEmailTemplates() {
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // Labels, hints and grouping for each editable field.
    const FIELDS = {
        trip: [
            { group: 'Starting point for new trip emails', hint: 'Fills in when you pick a trip. You can still change it per email.' },
            { k: 'subject', label: 'Subject line', hint: '{title} and {date} are filled in from the trip' },
            { k: 'previewText', label: 'Preview text', hint: 'shown next to the subject in the inbox · {title}, {date}' },
            { k: 'kicker', label: 'Tag', hint: 'small label at the top' },
            { k: 'closing', label: 'Closing line', hint: 'added after the trip description' },
            { k: 'ctaText', label: 'Button text' },
            { group: 'In every trip email', hint: 'Changes here also apply to drafts that haven\'t been sent yet.' },
            { k: 'greeting', label: 'Greeting', hint: '{name} = the subscriber\'s first name · leave empty to hide' },
            { k: 'urgency', label: 'Line under the button', hint: 'leave empty to hide' },
            { k: 'gmailTip', label: 'Footer tip', hint: 'leave empty to hide' },
        ],
        otp: [
            { k: 'subject', label: 'Subject line', hint: '{otp} = the 6-digit code' },
            { k: 'kicker', label: 'Tag', hint: 'small label at the top · leave empty to hide' },
            { k: 'title', label: 'Top line' },
            { k: 'greeting', label: 'Headline', hint: '{name} = their first name' },
            { k: 'intro', label: 'Message', hint: 'shown above the code' },
            { k: 'expiry', label: 'Small print', hint: '{minutes} = how long the code works' },
        ],
    };
    const TITLES = { trip: 'Trip announcement template', otp: 'Login code template' };

    const st = { data: null, key: null, lang: 'en', values: null, dirty: false };

    async function api(method, url, body) {
        const res = await fetch(url, {
            method,
            credentials: 'same-origin',
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || 'Something went wrong.');
        return data.data;
    }

    function note(text, kind) {
        const n = $('tplNote');
        n.textContent = text || '';
        n.className = `em-note${kind ? ` is-${kind}` : ''}`;
    }

    function badge(text, kind) {
        const b = $('tplStateBadge');
        b.textContent = text;
        b.className = `em-badge em-badge--${kind}`;
    }

    function renderCards() {
        ['trip', 'otp'].forEach((key) => {
            const el = document.querySelector(`[data-tpl-state="${key}"]`);
            const custom = st.data && st.data.customized[key];
            el.textContent = custom ? 'Edited' : 'Default';
            el.className = `em-badge${custom ? ' em-badge--sent' : ''}`;
        });
    }

    // The object currently being edited: trip -> values, otp -> values[lang].
    const current = () => (st.key === 'otp' ? st.values[st.lang] : st.values);

    function renderFields() {
        const specs = st.data.specs[st.key];
        const vals = current();
        const rtl = st.key === 'otp' && st.lang === 'ar';
        $('tplFields').innerHTML = FIELDS[st.key].map((f) => {
            if (f.group) return `<div class="em-tpl-group"><h3>${esc(f.group)}</h3><p class="em-hint">${esc(f.hint)}</p></div>`;
            const s = specs[f.k];
            const id = `tpl_${f.k}`;
            const attrs = `id="${id}" data-k="${f.k}" maxlength="${s.max}" dir="${rtl ? 'rtl' : 'auto'}"`;
            const input = s.multiline
                ? `<textarea ${attrs} rows="3">${esc(vals[f.k])}</textarea>`
                : `<input ${attrs} value="${esc(vals[f.k])}">`;
            return `<div class="form-group"><label for="${id}">${esc(f.label)}${s.required ? '' : ' <span class="em-hint">optional</span>'}${f.hint ? ` <span class="em-hint">${esc(f.hint)}</span>` : ''}</label>${input}</div>`;
        }).join('');
    }

    let timer = null;
    function schedulePreview() { clearTimeout(timer); timer = setTimeout(renderPreview, 300); }
    async function renderPreview() {
        const body = st.key === 'otp' ? { ...st.values, lang: st.lang } : st.values;
        try {
            const d = await api('POST', `/api/admin/email-templates/${st.key}/preview`, body);
            $('tplPreviewFrame').srcdoc = d.html;
            $('tplPreviewSubject').textContent = d.subject;
        } catch (err) {
            $('tplPreviewFrame').srcdoc = `<p style="font-family:sans-serif;padding:24px;color:#b91c1c">${esc(err.message)}</p>`;
        }
    }

    function setLang(lang) {
        st.lang = lang;
        document.querySelectorAll('#tplLangs [data-lang]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.lang === lang)));
        renderFields();
        renderPreview();
    }

    function open(key) {
        if (st.dirty && st.key && st.key !== key && !window.confirm('Discard your unsaved template changes?')) return;
        st.key = key;
        st.lang = 'en';
        st.values = JSON.parse(JSON.stringify(st.data[key]));
        st.dirty = false;
        $('tplTitle').textContent = TITLES[key];
        $('tplLangs').hidden = key !== 'otp';
        $('tplTestBtn').hidden = key !== 'otp';
        badge(st.data.customized[key] ? 'Saved' : 'Default wording', 'draft');
        note('');
        document.querySelectorAll('#tplLangs [data-lang]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.lang === 'en')));
        renderFields();
        $('tplEditor').hidden = false;
        renderPreview();
        $('tplEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function close() {
        if (st.dirty && !window.confirm('Discard your unsaved template changes?')) return;
        st.dirty = false;
        st.key = null;
        $('tplEditor').hidden = true;
    }

    function busy(btn, on, label) {
        if (on) { btn.dataset.label = btn.innerHTML; btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${label}`; btn.disabled = true; }
        else { btn.innerHTML = btn.dataset.label || btn.innerHTML; btn.disabled = false; }
    }

    async function load() {
        st.data = await api('GET', '/api/admin/email-templates');
        renderCards();
    }

    // ── Events ─────────────────────────────────────────────────────────
    $('tplFields').addEventListener('input', (e) => {
        const k = e.target.dataset.k;
        if (!k) return;
        current()[k] = e.target.value;
        st.dirty = true;
        badge('Unsaved changes', 'dirty');
        schedulePreview();
    });

    $('tplLangs').addEventListener('click', (e) => {
        const b = e.target.closest('[data-lang]');
        if (b && b.dataset.lang !== st.lang) setLang(b.dataset.lang);
    });

    $('tplForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('tplSaveBtn');
        busy(btn, true, 'Saving…');
        try {
            const data = await api('PUT', `/api/admin/email-templates/${st.key}`, st.values);
            st.data = { ...data, specs: st.data.specs };
            st.values = JSON.parse(JSON.stringify(st.data[st.key]));
            st.dirty = false;
            renderCards();
            badge('Saved', 'draft');
            note(st.key === 'otp' ? 'Saved. New login codes use this wording now.' : 'Saved. New trip emails start from this wording.', 'ok');
        } catch (err) {
            note(err.message, 'error');
        } finally { busy(btn, false); }
    });

    $('tplResetBtn').addEventListener('click', async () => {
        if (!window.confirm('Go back to the original wording? Your edits to this template will be lost.')) return;
        const btn = $('tplResetBtn');
        busy(btn, true, 'Resetting…');
        try {
            const data = await api('DELETE', `/api/admin/email-templates/${st.key}`);
            st.data = { ...data, specs: st.data.specs };
            st.values = JSON.parse(JSON.stringify(st.data[st.key]));
            st.dirty = false;
            renderCards();
            renderFields();
            renderPreview();
            badge('Default wording', 'draft');
            note('Back to the original wording.', 'ok');
        } catch (err) {
            note(err.message, 'error');
        } finally { busy(btn, false); }
    });

    $('tplTestBtn').addEventListener('click', async () => {
        const btn = $('tplTestBtn');
        busy(btn, true, 'Sending…');
        try {
            const d = await api('POST', '/api/admin/email-templates/otp/test', { ...st.values, lang: st.lang });
            note(`Test sent to ${d.to} with the code 000000. It shows exactly what's on screen, even if you haven't saved.`, 'ok');
        } catch (err) {
            note(err.message, 'error');
        } finally { busy(btn, false); }
    });

    $('tplCloseBtn').addEventListener('click', close);

    document.querySelector('.em-templates').addEventListener('click', (e) => {
        const edit = e.target.closest('[data-tpl-edit]');
        const use = e.target.closest('[data-tpl-use]');
        if (edit) {
            if (!st.data) return;
            open(edit.dataset.tplEdit);
        } else if (use) {
            $('newEmailBtn').click();
            const picker = $('tripPicker');
            picker.focus();
            if (typeof picker.showPicker === 'function') { try { picker.showPicker(); } catch (_) { /* not allowed */ } }
        }
    });

    window.addEventListener('beforeunload', (e) => { if (st.dirty && !$('tplEditor').hidden) { e.preventDefault(); e.returnValue = ''; } });

    load().catch((err) => {
        const b = $('emBanner');
        b.hidden = false;
        b.textContent = `Templates: ${err.message}`;
        b.className = 'em-banner em-banner--error';
    });
})();
