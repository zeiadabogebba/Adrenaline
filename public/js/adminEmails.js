'use strict';

(function adminEmails() {
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmtDate = (d) => (d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');

    const state = { id: null, dirty: false, testedSig: null, listSize: null, enabled: false, trips: [] };

    async function api(method, url, body) {
        const res = await fetch(url, {
            method,
            credentials: 'same-origin',
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined,
        });
        if (res.status === 204) return null;
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || 'Something went wrong.');
        return data.data;
    }

    // ── Form <-> fields ────────────────────────────────────────────────
    const inputs = {
        subject: $('fSubject'), previewText: $('fPreview'), headline: $('fHeadline'), message: $('fMessage'),
        imageUrl: $('fImage'), ctaText: $('fCtaText'), ctaUrl: $('fCtaUrl'),
    };

    function addDetailRow(d = {}) {
        const row = document.createElement('div');
        row.className = 'em-detail';
        row.innerHTML = `<input class="em-detail__label" maxlength="40" placeholder="Label" aria-label="Detail label" value="${esc(d.label)}">
            <input class="em-detail__value" maxlength="120" placeholder="Value" aria-label="Detail value" dir="auto" value="${esc(d.value)}">
            <button type="button" class="em-detail__remove" aria-label="Remove row">&times;</button>`;
        row.querySelector('.em-detail__remove').addEventListener('click', () => { row.remove(); changed(); });
        $('detailRows').appendChild(row);
    }

    function getFields() {
        const f = {};
        Object.entries(inputs).forEach(([k, el]) => { f[k] = el.value; });
        f.details = [...document.querySelectorAll('#detailRows .em-detail')].map((r) => ({
            label: r.querySelector('.em-detail__label').value.trim(),
            value: r.querySelector('.em-detail__value').value.trim(),
        })).filter((d) => d.label && d.value);
        f.tripId = $('tripPicker').value || null;
        return f;
    }

    function setFields(f = {}) {
        Object.entries(inputs).forEach(([k, el]) => { el.value = f[k] || ''; });
        $('detailRows').innerHTML = '';
        (f.details || []).forEach(addDetailRow);
        $('tripPicker').value = f.tripId ? String(f.tripId) : '';
    }

    const signature = () => JSON.stringify(getFields());

    function setComposerState(text, kind) {
        const b = $('composerState');
        b.textContent = text;
        b.className = `em-badge em-badge--${kind}`;
    }

    function changed() {
        state.dirty = true;
        setComposerState('Unsaved changes', 'dirty');
        schedulePreview();
    }

    // ── Preview ────────────────────────────────────────────────────────
    let previewTimer = null;
    function schedulePreview() {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(renderPreview, 350);
    }
    async function renderPreview() {
        const f = getFields();
        $('previewSubject').textContent = f.subject;
        try {
            const { html } = await api('POST', '/api/admin/emails/preview', f);
            $('previewFrame').srcdoc = html;
        } catch (err) {
            $('previewFrame').srcdoc = `<p style="font-family:sans-serif;padding:24px;color:#b91c1c">${esc(err.message)}</p>`;
        }
    }

    // ── Composer open/close ────────────────────────────────────────────
    function openComposer(fields, doc) {
        state.id = doc ? doc._id : null;
        state.dirty = !doc;
        state.testedSig = null;
        setFields(fields);
        $('composerTitle').textContent = doc ? 'Edit draft' : 'New email';
        if (doc) setComposerState(doc.testSentAt ? `Draft · test sent ${fmtDate(doc.testSentAt)}` : 'Draft saved', 'draft');
        else setComposerState('Not saved', 'dirty');
        if (doc && doc.testSentTo && doc.testSentTo.length) $('testEmails').value = doc.testSentTo.join(', ');
        $('testNote').textContent = '';
        $('composer').hidden = false;
        renderPreview();
        $('composer').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function closeComposer() {
        if (state.dirty && !window.confirmLeave) {
            // Keep the draft visible; a second click closes it.
            window.confirmLeave = true;
            setComposerState('Unsaved changes. Click Close again to discard', 'dirty');
            setTimeout(() => { window.confirmLeave = false; }, 4000);
            return;
        }
        window.confirmLeave = false;
        $('composer').hidden = true;
        state.id = null;
        state.dirty = false;
    }

    async function save() {
        const f = getFields();
        const doc = state.id ? await api('PUT', `/api/admin/emails/${state.id}`, f) : await api('POST', '/api/admin/emails', f);
        state.id = doc._id;
        state.dirty = false;
        $('composerTitle').textContent = 'Edit draft';
        setComposerState('Draft saved', 'draft');
        loadList();
        return doc;
    }

    function busy(btn, on, label) {
        if (on) { btn.dataset.label = btn.innerHTML; btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${label}`; btn.disabled = true; }
        else { btn.innerHTML = btn.dataset.label || btn.innerHTML; btn.disabled = false; }
    }

    function banner(text, kind) {
        const b = $('emBanner');
        b.hidden = !text;
        b.textContent = text || '';
        b.className = `em-banner${kind ? ` em-banner--${kind}` : ''}`;
    }

    // ── List ───────────────────────────────────────────────────────────
    function resultsCell(c) {
        if (c.status === 'draft') return c.testSentAt ? `<span class="em-muted">Test sent</span>` : '<span class="em-muted">—</span>';
        const s = c.brevo && c.brevo.stats;
        if (!s) return `<span class="em-muted">${c.sentCount != null ? `${c.sentCount} recipients` : 'Sending…'}</span>`;
        const pct = (n) => (s.delivered ? `${Math.round((n / s.delivered) * 100)}%` : '0%');
        return `<span class="em-results"><b>${s.delivered}</b> delivered · <b>${pct(s.opened)}</b> opened · <b>${pct(s.clicked)}</b> clicked${s.unsubscribed ? ` · ${s.unsubscribed} unsubscribed` : ''}</span>`;
    }

    function renderList(campaigns) {
        $('emptyList').hidden = campaigns.length > 0;
        $('emailList').innerHTML = campaigns.map((c) => `
            <tr>
                <td class="em-subject">${esc(c.subject)}</td>
                <td><span class="em-badge em-badge--${c.status}">${c.status}</span></td>
                <td class="em-muted">${fmtDate(c.sentAt || c.updatedAt)}</td>
                <td>${resultsCell(c)}</td>
                <td class="em-row-actions">
                    ${c.status === 'draft'
                        ? `<button class="btn-ghost em-small" data-edit="${c._id}">Edit</button>
                           <button class="btn-ghost em-small em-icon" data-delete="${c._id}" aria-label="Delete draft"><i class="fas fa-trash"></i></button>`
                        : `<button class="btn-ghost em-small" data-reuse="${c._id}">Reuse</button>`}
                </td>
            </tr>`).join('');
    }

    let campaignsCache = [];
    async function loadList() {
        try {
            const d = await api('GET', '/api/admin/emails');
            campaignsCache = d.campaigns;
            state.listSize = d.listSize;
            state.enabled = d.enabled;
            $('statSubscribers').textContent = d.listSize == null ? '—' : d.listSize;
            $('statLimit').textContent = `${d.dailyLimit}/day`;
            $('statSent').textContent = d.campaigns.filter((c) => c.status === 'sent').length;
            if (!d.enabled) banner('Brevo is not connected: add BREVO_API_KEY to the server environment. You can still write drafts.', 'error');

            const picker = $('tripPicker');
            const current = picker.value;
            picker.innerHTML = '<option value="">— Write from scratch —</option>' + d.trips.map((t) =>
                `<option value="${t._id}">${esc(t.title)}${t.date && t.date !== '0000' ? ` · ${esc(t.date)}` : ''}${t.status !== 'active' ? ' (inactive)' : ''}</option>`).join('');
            picker.value = current;
            renderList(d.campaigns);
        } catch (err) {
            banner(err.message, 'error');
        }
    }

    // ── Events ─────────────────────────────────────────────────────────
    $('emailForm').addEventListener('input', (e) => { if (e.target.id !== 'testEmails' && e.target.id !== 'tripPicker') changed(); });
    $('addDetailBtn').addEventListener('click', () => { addDetailRow(); changed(); });
    $('closeComposerBtn').addEventListener('click', closeComposer);
    $('newEmailBtn').addEventListener('click', () => openComposer({}, null));

    $('tripPicker').addEventListener('change', async (e) => {
        const tripId = e.target.value;
        if (!tripId) return;
        try {
            const f = await api('GET', `/api/admin/emails/trip/${tripId}`);
            setFields(f);
            changed();
        } catch (err) { banner(err.message, 'error'); }
    });

    $('emailForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('saveBtn');
        busy(btn, true, 'Saving…');
        try { await save(); } catch (err) { setComposerState(err.message, 'error'); } finally { busy(btn, false); }
    });

    $('testBtn').addEventListener('click', async () => {
        const emails = $('testEmails').value.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
        const note = $('testNote');
        if (!emails.length) { note.textContent = 'Add at least one address.'; note.className = 'em-note is-error'; return; }
        const btn = $('testBtn');
        busy(btn, true, 'Sending…');
        try {
            await save();
            const sig = signature();
            await api('POST', `/api/admin/emails/${state.id}/test`, { emails });
            state.testedSig = sig;
            note.textContent = `Test sent to ${emails.join(', ')}. Check the inbox and the spam folder.`;
            note.className = 'em-note is-ok';
            setComposerState('Draft · test sent', 'draft');
            loadList();
        } catch (err) {
            note.textContent = err.message;
            note.className = 'em-note is-error';
        } finally { busy(btn, false); }
    });

    const modal = (id, open) => $(id).classList.toggle('open', open);
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { modal('sendModal', false); modal('deleteModal', false); }));

    $('sendAllBtn').addEventListener('click', async () => {
        const btn = $('sendAllBtn');
        busy(btn, true, 'Saving…');
        try {
            await save();
            $('confirmSubject').textContent = inputs.subject.value;
            $('confirmCount').textContent = state.listSize == null ? 'all' : state.listSize;
            $('confirmNoTest').hidden = state.testedSig === signature();
            modal('sendModal', true);
        } catch (err) {
            setComposerState(err.message, 'error');
        } finally { busy(btn, false); }
    });

    $('confirmSendBtn').addEventListener('click', async () => {
        const btn = $('confirmSendBtn');
        busy(btn, true, 'Sending…');
        try {
            const doc = await api('POST', `/api/admin/emails/${state.id}/send`, { confirm: true });
            modal('sendModal', false);
            state.dirty = false;
            $('composer').hidden = true;
            banner(`Sent "${doc.subject}" to ${doc.sentCount} subscribers. Results appear below within a few minutes.`, 'ok');
            loadList();
        } catch (err) {
            modal('sendModal', false);
            setComposerState(err.message, 'error');
        } finally { busy(btn, false); }
    });

    let pendingDelete = null;
    $('emailList').addEventListener('click', async (e) => {
        const t = e.target.closest('button');
        if (!t) return;
        const id = t.dataset.edit || t.dataset.delete || t.dataset.reuse;
        try {
            if (t.dataset.edit) {
                const doc = await api('GET', `/api/admin/emails/${id}`);
                openComposer(doc, doc);
            } else if (t.dataset.reuse) {
                const doc = await api('GET', `/api/admin/emails/${id}`);
                openComposer({ ...doc, subject: doc.subject }, null);
            } else if (t.dataset.delete) {
                pendingDelete = id;
                const c = campaignsCache.find((x) => x._id === id);
                $('deleteSubject').textContent = c ? c.subject : '';
                modal('deleteModal', true);
            }
        } catch (err) { banner(err.message, 'error'); }
    });

    $('confirmDeleteBtn').addEventListener('click', async () => {
        try {
            await api('DELETE', `/api/admin/emails/${pendingDelete}`);
            if (state.id === pendingDelete) { state.dirty = false; closeComposer(); }
            modal('deleteModal', false);
            loadList();
        } catch (err) { modal('deleteModal', false); banner(err.message, 'error'); }
    });

    window.addEventListener('beforeunload', (e) => { if (state.dirty && !$('composer').hidden) { e.preventDefault(); e.returnValue = ''; } });

    // ── Start ──────────────────────────────────────────────────────────
    (async () => {
        await loadList();
        const tripId = (window.EMAIL_PAGE || {}).tripId;
        if (tripId) {
            try {
                const f = await api('GET', `/api/admin/emails/trip/${tripId}`);
                openComposer(f, null);
                $('tripPicker').value = tripId;
            } catch (err) { banner(err.message, 'error'); }
        }
    })();
})();
