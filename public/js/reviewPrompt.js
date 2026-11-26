// "How was your trip?" pop-up: the whole review, written right here.
// Loaded by global.js for signed-in travellers, at most once per visit.
(() => {
  const T = (k, v) => (typeof window.t === 'function' ? window.t('js.reviewPrompt.' + k, v) : k);
  const TR = (k, v) => (typeof window.t === 'function' ? window.t('js.review.' + k, v) : k);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MAX_PHOTOS = 5;

  async function run() {
    let trip;
    try {
      const res = await fetch('/api/reviews/prompt', { credentials: 'same-origin' });
      if (!res.ok) return;
      trip = (await res.json()).data.trip;
    } catch (e) { return; }
    if (!trip) return;
    open(trip);
  }

  function stars(name, label) {
    return `<span class="rp-stars" role="radiogroup" aria-label="${esc(label)}">${[1, 2, 3, 4, 5].map((n) =>
      `<button type="button" class="far fa-star" data-stars="${esc(name)}" data-n="${n}" aria-label="${n}"></button>`).join('')}</span>`;
  }

  function open(trip) {
    const ratings = {}; // 'overall' and each usher id -> 1..5
    let files = [];
    let busy = false;
    const lastFocus = document.activeElement;

    const wrap = document.createElement('div');
    wrap.className = 'rp-overlay';
    wrap.innerHTML = `
      <div class="rp-card" role="dialog" aria-modal="true" aria-labelledby="rpTitle">
        <button type="button" class="rp-x" data-act="later" aria-label="${esc(T('later'))}"><i class="fas fa-xmark"></i></button>
        <header class="rp-head" ${trip.image ? `style="--rp-img:url('${esc(trip.image)}')"` : ''}>
          <span class="rp-kicker">${esc(T('kicker'))}</span>
          <h2 id="rpTitle" class="rp-title" dir="auto">${esc(T('title', { trip: trip.title }))}</h2>
          ${trip.sub ? `<p class="rp-sub" dir="auto">${esc(trip.sub)}</p>` : ''}
        </header>
        <form class="rp-body" novalidate>
          <div class="rp-field">
            <span class="rp-label">${esc(T('overall'))}</span>
            ${stars('overall', T('overall'))}
          </div>
          ${trip.buses.length ? `
          <div class="rp-field">
            <span class="rp-label"><i class="fas fa-bus" aria-hidden="true"></i> ${esc(TR('whichBus'))}</span>
            <div class="rp-buses">${trip.buses.map((b) => `<label class="rp-bus"><input type="radio" name="rpBus" value="${esc(b._id)}"><span dir="auto">${esc(b.name)}</span></label>`).join('')}</div>
          </div>
          <div class="rp-ushers" id="rpUshers"></div>` : ''}
          <label class="rp-field"><span class="rp-label">${esc(T('reviewTitle'))}</span>
            <input class="rp-input" name="title" maxlength="100" dir="auto" placeholder="${esc(T('titlePh'))}"></label>
          <label class="rp-field"><span class="rp-label">${esc(T('reviewText'))}</span>
            <textarea class="rp-input" name="text" rows="4" maxlength="2000" dir="auto" placeholder="${esc(T('textPh'))}"></textarea></label>
          <div class="rp-field">
            <label class="rp-photos"><i class="fas fa-camera" aria-hidden="true"></i> <span id="rpPhotoLabel">${esc(T('addPhotos'))}</span>
              <input type="file" accept="image/jpeg,image/png" multiple hidden></label>
          </div>
          <p class="rp-error" role="alert" hidden></p>
          <div class="rp-actions">
            <button type="submit" class="rp-btn rp-btn--go"><i class="fas fa-paper-plane" aria-hidden="true"></i> <span>${esc(T('submit'))}</span></button>
            <button type="button" class="rp-btn rp-btn--ghost" data-act="later">${esc(T('later'))}</button>
          </div>
          <button type="button" class="rp-never" data-act="never">${esc(T('never'))}</button>
        </form>
      </div>`;
    document.body.appendChild(wrap);
    document.documentElement.classList.add('rp-lock');
    requestAnimationFrame(() => wrap.classList.add('is-open'));
    wrap.querySelector('.rp-stars button').focus();

    const card = wrap.querySelector('.rp-card');
    const form = wrap.querySelector('form');
    const err = wrap.querySelector('.rp-error');
    const showErr = (m) => { err.textContent = m; err.hidden = !m; if (m) err.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };

    function paint(name) {
      wrap.querySelectorAll(`[data-stars="${CSS.escape(name)}"]`).forEach((s) => {
        const on = Number(s.dataset.n) <= (ratings[name] || 0);
        s.classList.toggle('fas', on);
        s.classList.toggle('far', !on);
        s.setAttribute('aria-pressed', on);
      });
    }

    function close() {
      wrap.classList.remove('is-open');
      document.documentElement.classList.remove('rp-lock');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => wrap.remove(), 250);
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    function dismiss(forever) {
      fetch(`/api/reviews/prompt/${encodeURIComponent(trip.id)}/dismiss`, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ forever }),
      }).catch(() => {});
      close();
    }

    function onKey(e) {
      if (e.key === 'Escape') dismiss(false);
      if (e.key === 'Tab') { // keep focus inside the pop-up
        const f = [...card.querySelectorAll('button, input, textarea, [tabindex]')].filter((x) => !x.disabled && x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    }
    document.addEventListener('keydown', onKey);

    wrap.addEventListener('click', (e) => {
      const star = e.target.closest('[data-stars]');
      if (star) { ratings[star.dataset.stars] = Number(star.dataset.n); paint(star.dataset.stars); return; }
      const act = e.target.closest('[data-act]');
      if (act && act.dataset.act === 'later') return dismiss(false);
      if (act && act.dataset.act === 'never') return dismiss(true);
      if (act && act.dataset.act === 'done') return close();
    });

    wrap.addEventListener('change', (e) => {
      if (e.target.name === 'rpBus') {
        const bus = trip.buses.find((b) => b._id === e.target.value);
        Object.keys(ratings).forEach((k) => { if (k !== 'overall') delete ratings[k]; });
        wrap.querySelector('#rpUshers').innerHTML = bus && bus.ushers.length ? `
          <span class="rp-label"><i class="fas fa-user-tie" aria-hidden="true"></i> ${esc(TR('rateUshers'))}</span>
          ${bus.ushers.map((u) => `
            <div class="rp-usher">
              <div class="rp-usher__top"><span dir="auto">${esc(u.name)}</span>${stars(u._id, TR('rateUsher', { name: u.name }))}</div>
              <textarea class="rp-input rp-usher__comment" data-comment="${esc(u._id)}" rows="1" maxlength="500" dir="auto" placeholder="${esc(TR('usherComment'))}"></textarea>
            </div>`).join('')}` : '';
      }
      if (e.target.type === 'file') {
        files = [...e.target.files].filter((f) => /^image\/(jpeg|png)$/.test(f.type)).slice(0, MAX_PHOTOS);
        wrap.querySelector('#rpPhotoLabel').textContent = files.length ? T('photosChosen', { n: files.length }) : T('addPhotos');
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      showErr('');
      const title = form.title.value.trim();
      const text = form.text.value.trim();
      if (!ratings.overall) return showErr(TR('errRating'));
      let busData = {};
      if (trip.buses.length) {
        const picked = wrap.querySelector('input[name="rpBus"]:checked');
        if (!picked) return showErr(TR('errBus'));
        const bus = trip.buses.find((b) => b._id === picked.value);
        const missing = bus.ushers.find((u) => !ratings[u._id]);
        if (missing) return showErr(TR('errUsher', { name: missing.name }));
        busData = {
          busId: bus._id,
          usherRatings: bus.ushers.map((u) => ({ usherId: u._id, rating: ratings[u._id], comment: (wrap.querySelector(`[data-comment="${CSS.escape(u._id)}"]`).value || '').trim() })),
        };
      }
      if (!title) return showErr(TR('errTitle'));
      if (text.length < 10) return showErr(TR('errText'));

      busy = true;
      const btn = form.querySelector('.rp-btn--go span');
      btn.textContent = TR('submitting');
      try {
        const res = await fetch('/api/reviews', {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tripId: trip.id, rating: ratings.overall, title, text, photosCount: files.length, ...busData }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || TR('failed'));
        if (files.length && data.data && data.data.review) {
          const fd = new FormData();
          files.forEach((f) => fd.append('photos', f));
          await fetch(`/api/reviews/${data.data.review._id}/photos`, { method: 'POST', credentials: 'same-origin', body: fd }).catch(() => {});
        }
        form.outerHTML = `<div class="rp-body rp-done">
          <span class="rp-done__icon"><i class="fas fa-check"></i></span>
          <h3>${esc(T('thanksTitle'))}</h3>
          <p>${esc(T('thanksText'))}</p>
          <button type="button" class="rp-btn rp-btn--go" data-act="done">${esc(T('close'))}</button>
        </div>`;
        wrap.querySelector('[data-act="done"]').focus();
      } catch (ex) {
        showErr(ex.message);
        btn.textContent = T('submit');
      } finally {
        busy = false;
      }
    });
  }

  run();
})();
