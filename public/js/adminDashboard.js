'use strict';

function updateSystemHealth() {
    const statuses  = ['Excellent', 'Stable', 'Running Smoothly'];
    const statusText = document.getElementById('health-text');
    setInterval(() => {
        if (statusText) {
            statusText.textContent = statuses[Math.floor(Math.random() * statuses.length)];
        }
    }, 10000);
}

document.addEventListener('DOMContentLoaded', () => {
    updateSystemHealth();
});

// ── Brevo trip-email panel ──────────────────────────────────────────────
(function brevoPanel() {
    const $ = (id) => document.getElementById(id);
    const btn = $('brevo-sync-btn');
    const note = $('brevo-note');
    if (!btn || !note) return;

    const setNote = (text, kind) => {
        note.textContent = text;
        note.classList.toggle('is-error', kind === 'error');
        note.classList.toggle('is-ok', kind === 'ok');
    };
    const fmtTime = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

    async function load() {
        try {
            const res = await fetch('/api/admin/brevo/status', { credentials: 'same-origin' });
            const body = await res.json();
            if (!res.ok) throw new Error(body.message || 'Could not load status');
            const d = body.data;
            $('brevo-opted-in').textContent = d.optedIn;
            $('brevo-opted-out').textContent = d.optedOut;
            $('brevo-unverified').textContent = d.unverified;
            $('brevo-list-count').textContent = d.listCount == null ? '—' : d.listCount;

            if (!d.enabled) {
                btn.disabled = true;
                setNote('Not connected: add BREVO_API_KEY to the server environment.', 'error');
            } else if (d.listError) {
                btn.disabled = false;
                setNote(d.listError, 'error');
            } else {
                btn.disabled = false;
                setNote(d.lastSync
                    ? `Updates automatically. Last full sync ${fmtTime(d.lastSync.at)}.`
                    : 'Updates automatically when users sign up or change their setting.');
            }
        } catch (err) {
            setNote(err.message, 'error');
        }
    }

    btn.addEventListener('click', async () => {
        btn.disabled = true;
        setNote('Syncing with Brevo…');
        try {
            const res = await fetch('/api/admin/brevo/sync', { method: 'POST', credentials: 'same-origin' });
            const body = await res.json();
            if (!res.ok) throw new Error(body.message || 'Sync failed');
            const r = body.data;
            await load();
            setNote(`Synced: ${r.eligible} subscribed, ${r.removedFromList} removed from list, ${r.optedOutFromBrevo} unsubscribes copied from Brevo. Brevo may take a minute to update its count.`, 'ok');
        } catch (err) {
            setNote(err.message, 'error');
        } finally {
            btn.disabled = false;
        }
    });

    load();
})();
