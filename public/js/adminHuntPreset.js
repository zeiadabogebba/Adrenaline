(() => {
  const host = document.getElementById('thxEditor');
  if (!host) return;
  const LOCKED = Boolean(window.HUNT_LOCKED);
  const COLORS = ['#DC2626', '#2563EB', '#16A34A', '#EAB308', '#9333EA', '#EA580C'];

  const blankLeg = () => ({ place: '', placement: '', riddle: '', guide: '', extraHint: '', photo: '', photoPublicId: '', code: '', proof: 'photo', answerPrompt: '', answerKey: '' });
  const blankRoute = (i) => ({ name: `Route ${i + 1}`, color: COLORS[i % COLORS.length], label: `R${i + 1}`, legs: [blankLeg()], finishRiddle: '', finishGuide: '', finishExtraHint: '', finishPhoto: '', finishPhotoPublicId: '' });

  let p = window.HUNT_PRESET || {
    name: '', description: '', mode: 'qr', lifelines: 1, maxTeamSize: 5,
    finish: { place: '', placement: '', message: '', code: '' },
    routes: [blankRoute(0)],
  };
  if (p.maxTeamSize == null) p.maxTeamSize = 5; // presets made before this setting
  if (!p.mode) p.mode = 'qr';
  p.routes.forEach((r) => { r.finishProof = r.finishProof || 'photo'; r.legs.forEach((l) => { l.proof = l.proof || 'photo'; }); });
  const selfie = () => p.mode === 'selfie';

  // Selfie hunts: what teams send at a stop, and the answer fields when one is asked for.
  // `pre` is the field prefix: `routes.0.legs.1.` for a stop, `routes.0.finish` for the finish.
  const proofFields = (pre, isFinish) => {
    const k = (name) => (isFinish ? pre + name[0].toUpperCase() + name.slice(1) : pre + name);
    const proof = get(k('proof')) === 'answer' ? 'answer' : 'photo';
    const opt = (v, label) => `<option value="${v}" ${proof === v ? 'selected' : ''}>${label}</option>`;
    return `<label class="thx-f thx-f--wide"><span>Teams send <small>${LOCKED ? 'locked: teams have played' : 'checked by you on the results page'}</small></span>
        <select data-path="${k('proof')}" ${LOCKED ? 'disabled' : ''}>${opt('photo', 'A selfie')}${opt('answer', 'A written answer (a text box instead of the selfie)')}</select></label>
      ${proof === 'photo' ? '' : `${input(k('answerPrompt'), 'Question teams answer', { wide: true, maxlength: 300, hint: 'leave empty to just ask for the answer', ph: 'e.g. What year is carved above the door?' })}
      ${input(k('answerKey'), 'Correct answer', { wide: true, maxlength: 300, hint: 'admin only, shown next to what teams write' })}`}`;
  };

  // A clue photo; `path` points at the photo URL and the public id sits next to it (…PublicId).
  const photoBox = (path, alt) => {
    const url = get(path);
    const label = selfie() ? 'Clue photo' : 'Photo';
    const hint = selfie() ? 'shown with the clue; it can be the whole clue' : 'a close-up, or the whole clue if the riddle is empty';
    return `<div class="thx-photo">
      ${url ? `<img src="${esc(url.replace('/upload/', '/upload/c_limit,w_480,q_auto,f_auto/'))}" alt="${esc(alt)}">` : '<span class="thx-photo__none"><i class="fas fa-image"></i></span>'}
      <div><span class="thx-code__label">${label} <small>(${hint})</small></span>
        <label class="thx-btn thx-btn--sm"><i class="fas fa-upload"></i> ${url ? 'Replace' : 'Upload'}<input type="file" accept="image/jpeg,image/png,image/webp" data-photo="${path}" hidden></label>
        ${url ? `<button type="button" class="thx-btn thx-btn--sm" data-unphoto="${path}">Remove</button>` : ''}
      </div>
    </div>`;
  };
  let dirty = false;
  let saving = false;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = document.getElementById('thxToast');
  let toastTimer = null;
  function say(msg, bad) {
    toast.textContent = msg;
    toast.classList.toggle('is-bad', !!bad);
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 4500);
  }
  function markDirty() {
    dirty = true;
    document.getElementById('thxDirty').textContent = 'Unsaved changes';
  }
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  // ── Field helpers: data-path is a dotted path into the preset ──
  const get = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), p);
  function set(path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const obj = keys.reduce((o, k) => o[k], p);
    obj[last] = value;
  }
  const input = (path, label, opts = {}) => `<label class="thx-f${opts.wide ? ' thx-f--wide' : ''}"><span>${esc(label)}${opts.hint ? ` <small>${esc(opts.hint)}</small>` : ''}</span>
    <input data-path="${path}" type="${opts.type || 'text'}" value="${esc(get(path))}" ${opts.dir ? `dir="${opts.dir}"` : 'dir="auto"'} ${opts.step ? `step="${opts.step}"` : ''} ${opts.min != null ? `min="${opts.min}"` : ''} ${opts.max != null ? `max="${opts.max}"` : ''} ${opts.maxlength ? `maxlength="${opts.maxlength}"` : ''} placeholder="${esc(opts.ph || '')}"></label>`;
  const area = (path, label, opts = {}) => `<label class="thx-f thx-f--wide"><span>${esc(label)}${opts.hint ? ` <small>${esc(opts.hint)}</small>` : ''}</span>
    <textarea data-path="${path}" rows="${opts.rows || 2}" dir="auto" maxlength="${opts.maxlength || 600}" placeholder="${esc(opts.ph || '')}">${esc(get(path))}</textarea></label>`;
  const codeBox = (path, label) => {
    const code = get(path);
    return `<div class="thx-code"><span class="thx-code__label">${esc(label)}</span><b dir="ltr">${code ? esc(code) : 'New code on save'}</b>
      <button type="button" class="thx-btn thx-btn--sm" data-newcode="${path}" title="The printed QR for this stop stops working"><i class="fas fa-rotate"></i> New code</button></div>`;
  };

  function legHtml(ri, li, route) {
    const base = `routes.${ri}.legs.${li}`;
    const leg = route.legs[li];
    const label = `${route.label || 'R' + (ri + 1)}-${li + 1}`;
    return `<article class="thx-leg">
      <header class="thx-leg__head">
        <span class="thx-leg__n" style="--route:${esc(route.color)}"><b>${li + 1}</b></span>
        <h4>Stop ${li + 1} ${selfie() ? '<small>selfie</small>' : `<small>QR ${esc(label)}</small>`}</h4>
        ${LOCKED ? '' : `<span class="thx-leg__tools">
          <button type="button" class="thx-icon" data-move="${ri}.${li}.-1" ${li === 0 ? 'disabled' : ''} aria-label="Move up"><i class="fas fa-arrow-up"></i></button>
          <button type="button" class="thx-icon" data-move="${ri}.${li}.1" ${li === route.legs.length - 1 ? 'disabled' : ''} aria-label="Move down"><i class="fas fa-arrow-down"></i></button>
          <button type="button" class="thx-icon thx-icon--danger" data-remove-leg="${ri}.${li}" ${route.legs.length === 1 ? 'disabled' : ''} aria-label="Remove stop"><i class="fas fa-trash"></i></button>
        </span>`}
      </header>
      <div class="thx-grid">
        ${area(`${base}.riddle`, selfie() ? `Clue for stop ${li + 1}` : li === 0 ? 'Riddle on the start card' : `Riddle on QR ${route.label || 'R' + (ri + 1)}-${li}`, { hint: leg.photo ? 'optional, the photo is the clue' : 'or upload a clue photo instead', rows: 3 })}
        ${area(`${base}.guide`, 'Route guide', { hint: 'direction, distance, streets', maxlength: 600 })}
        ${area(`${base}.extraHint`, 'Extra hint', { hint: 'costs a lifeline', maxlength: 400 })}
        ${input(`${base}.place`, 'The answer: place', { hint: selfie() ? 'admin only, helps you check selfies' : 'admin and volunteers only', maxlength: 120 })}
        ${selfie() ? '' : input(`${base}.placement`, 'Where the QR is stuck', { wide: true, maxlength: 200 })}
        ${photoBox(`${base}.photo`, `Photo for stop ${li + 1}`)}
        ${selfie() ? proofFields(`${base}.`, false) : ''}
        ${selfie() ? '' : codeBox(`${base}.code`, 'Code under the QR')}
      </div>
    </article>`;
  }

  function routeHtml(route, ri) {
    const base = `routes.${ri}`;
    return `<section class="thx-route" style="--route:${esc(route.color)}">
      <header class="thx-route__head">
        <label class="thx-color" title="Route colour"><input type="color" data-path="${base}.color" value="${esc(route.color)}"></label>
        ${input(`${base}.name`, 'Route name', { maxlength: 80 })}
        ${input(`${base}.label`, 'QR prefix', { maxlength: 8, dir: 'ltr', ph: 'R1' })}
        ${LOCKED ? '' : `<button type="button" class="thx-icon thx-icon--danger" data-remove-route="${ri}" ${p.routes.length === 1 ? 'disabled' : ''} aria-label="Remove route"><i class="fas fa-trash"></i></button>`}
      </header>
      <div class="thx-legs">${route.legs.map((_, li) => legHtml(ri, li, route)).join('')}</div>
      ${LOCKED ? '' : `<button type="button" class="thx-btn thx-btn--sm" data-add-leg="${ri}"><i class="fas fa-plus"></i> Add a stop</button>`}
      <article class="thx-leg thx-leg--finish">
        <header class="thx-leg__head"><span class="thx-leg__n"><i class="fas fa-flag-checkered"></i></span><h4>Last leg to the finish${selfie() ? ' <small>selfie</small>' : ''}</h4></header>
        <div class="thx-grid">
          ${area(`${base}.finishRiddle`, selfie() ? 'Clue for the finish' : `Riddle on QR ${route.label || 'R' + (ri + 1)}-${route.legs.length}`, { hint: route.finishPhoto ? 'optional, the photo is the clue' : 'leads teams to the finish, or upload a clue photo instead', rows: 3 })}
          ${area(`${base}.finishGuide`, 'Route guide')}
          ${area(`${base}.finishExtraHint`, 'Extra hint', { hint: 'costs a lifeline', maxlength: 400 })}
          ${photoBox(`${base}.finishPhoto`, 'Photo for the finish')}
          ${selfie() ? proofFields(`${base}.finish`, true) : ''}
        </div>
      </article>
    </section>`;
  }

  function render() {
    const qr = p.routes.reduce((n, r) => n + r.legs.length, 0) + 1;
    const printLink = document.getElementById('thxPrint');
    if (printLink) printLink.hidden = selfie();
    const modeOpt = (value, icon, title, text) => `<label class="thx-mode__opt${p.mode === value ? ' is-on' : ''}">
        <input type="radio" name="thxMode" value="${value}" data-mode ${p.mode === value ? 'checked' : ''} ${LOCKED ? 'disabled' : ''}>
        <i class="fas ${icon}" aria-hidden="true"></i><span><b>${title}</b><small>${text}</small></span></label>`;
    host.innerHTML = `
      <section class="thx-card">
        <h2 class="thx-card__title">Basics</h2>
        <fieldset class="thx-mode"><legend>How teams prove they reached a stop${LOCKED ? ' <small>(locked: teams have played)</small>' : ''}</legend>
          ${modeOpt('qr', 'fa-qrcode', 'QR codes', 'Teams scan a QR at each stop. Clues unlock one by one.')}
          ${modeOpt('selfie', 'fa-camera', 'Selfies', 'Every clue shows at once. Teams take a selfie at each stop and you approve them.')}
        </fieldset>
        <div class="thx-grid">
          ${input('name', 'Preset name', { wide: true, maxlength: 100 })}
          ${input('lifelines', 'Lifelines per team', { type: 'number', min: 0, max: 10, dir: 'ltr' })}
          ${input('maxTeamSize', 'Most people per team', { type: 'number', min: 1, max: 20, dir: 'ltr' })}
          ${area('description', 'Notes for the organisers', { rows: 3, maxlength: 1000 })}
        </div>
        <p class="thx-summary">${p.routes.length} route${p.routes.length === 1 ? '' : 's'} &middot; ${selfie() ? 'selfie stops, nothing to print' : `${qr} QR code${qr === 1 ? '' : 's'} to print (the finish QR is shared)`}</p>
      </section>
      <h2 class="thx-section">Routes</h2>
      ${p.routes.map(routeHtml).join('')}
      ${LOCKED ? '' : '<button type="button" class="thx-btn" data-add-route><i class="fas fa-plus"></i> Add a route</button>'}
      <h2 class="thx-section">The finish <small>shared by every route</small></h2>
      <section class="thx-card thx-card--finish">
        <div class="thx-grid">
          ${input('finish.place', 'Place', { maxlength: 120 })}
          ${selfie() ? '' : input('finish.placement', 'Where the QR is stuck', { wide: true, maxlength: 200 })}
          ${area('finish.message', selfie() ? 'Message when a team has sent every selfie' : 'Message when a team scans the finish', { rows: 2 })}
          ${selfie() ? '' : codeBox('finish.code', 'Code under the finish QR')}
        </div>
      </section>`;
  }

  // ── Events (delegated, so re-renders don't need re-binding) ──
  host.addEventListener('input', (e) => {
    const path = e.target.dataset.path;
    if (!path) return;
    set(path, e.target.value);
    markDirty();
    if (path === 'name') document.getElementById('thePresetTitle').textContent = e.target.value || 'New preset';
    if (/^routes\.\d+\.color$/.test(path)) e.target.closest('.thx-route').style.setProperty('--route', e.target.value);
  });
  host.addEventListener('change', (e) => {
    if ('mode' in e.target.dataset) { p.mode = e.target.value; markDirty(); render(); return; }
    const path = e.target.dataset.path;
    if (path && /\.(label|color)$/.test(path)) render(); // the QR labels shown on each stop
    if (path && /(proof|Proof)$/.test(path)) { set(path, e.target.value); markDirty(); render(); } // shows or hides the answer fields
    if (e.target.dataset.photo) uploadPhoto(e.target);
  });
  host.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.newcode) {
      if (d.armed !== '1') { d.armed = '1'; b.innerHTML = 'Tap again: the printed QR will stop working'; setTimeout(() => { if (b.isConnected) { d.armed = ''; b.innerHTML = '<i class="fas fa-rotate"></i> New code'; } }, 4000); return; }
      set(d.newcode, ''); markDirty(); render(); return;
    }
    if ('addRoute' in d) { p.routes.push(blankRoute(p.routes.length)); markDirty(); render(); return; }
    if (d.removeRoute) {
      if (d.armed !== '1') { d.armed = '1'; b.innerHTML = '<i class="fas fa-check"></i>'; b.title = 'Tap again to remove this route'; setTimeout(() => { if (b.isConnected) { d.armed = ''; b.innerHTML = '<i class="fas fa-trash"></i>'; } }, 3500); return; }
      p.routes.splice(Number(d.removeRoute), 1); markDirty(); render(); return;
    }
    if (d.addLeg) { p.routes[Number(d.addLeg)].legs.push(blankLeg()); markDirty(); render(); return; }
    if (d.removeLeg) {
      if (d.armed !== '1') { d.armed = '1'; b.innerHTML = '<i class="fas fa-check"></i>'; b.title = 'Tap again to remove this stop'; setTimeout(() => { if (b.isConnected) { d.armed = ''; b.innerHTML = '<i class="fas fa-trash"></i>'; } }, 3500); return; }
      const [ri, li] = d.removeLeg.split('.').map(Number);
      p.routes[ri].legs.splice(li, 1); markDirty(); render(); return;
    }
    if (d.move) {
      const [ri, li, dir] = d.move.split('.').map(Number);
      const legs = p.routes[ri].legs;
      const to = li + dir;
      if (to < 0 || to >= legs.length) return;
      [legs[li], legs[to]] = [legs[to], legs[li]];
      markDirty(); render(); return;
    }
    if (d.unphoto) { set(d.unphoto, ''); set(`${d.unphoto}PublicId`, ''); markDirty(); render(); }
  });

  async function uploadPhoto(inputEl) {
    const file = inputEl.files && inputEl.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { say('That photo is too large. Please choose one under 8 MB.', true); return; }
    const path = inputEl.dataset.photo;
    const fd = new FormData();
    fd.append('photo', file);
    say('Uploading photo…');
    try {
      const res = await fetch('/api/admin/treasure-hunt/photo', { method: 'POST', body: fd, credentials: 'same-origin' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message || 'The photo could not be uploaded.');
      set(path, j.data.url);
      set(`${path}PublicId`, j.data.publicId);
      markDirty(); render(); say('Photo added. Save the preset to keep it.');
    } catch (err) {
      say(err.message, true);
    }
  }

  document.getElementById('thxSave').addEventListener('click', async () => {
    if (saving) return;
    saving = true;
    const btn = document.getElementById('thxSave');
    btn.disabled = true;
    try {
      const isNew = !p._id;
      const res = await fetch(isNew ? '/api/admin/treasure-hunt/presets' : `/api/admin/treasure-hunt/presets/${p._id}`, {
        method: isNew ? 'POST' : 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message || 'Could not save. Please try again.');
      dirty = false;
      document.getElementById('thxDirty').textContent = 'Saved';
      if (isNew) { location.href = `/admin/treasure-hunt/presets/${j.data.id}`; return; }
      p = j.data.preset;
      render();
      say('Preset saved.');
    } catch (err) {
      say(err.message, true);
    } finally {
      saving = false;
      btn.disabled = false;
    }
  });

  render();
})();
