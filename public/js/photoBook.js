// Electronic photo book: a flip-page book of one traveller's memories for one trip.
// Wide screens show a two-page spread; phones show one page at a time.
(function () {
  const PB = window.PHOTO_BOOK;
  const book = document.getElementById('pbBook');
  if (!PB || !book) return;

  const T = PB.i18n || {};
  const tr = (k, v) => String(T[k] || k).replace(/\{(\w+)\}/g, (m, n) => (v && v[n] !== undefined ? v[n] : m));
  const pagesLabel = (n) => {
    const forms = T.pages || {};
    let cat = 'other';
    try { cat = new Intl.PluralRules(PB.dir === 'rtl' ? 'ar' : 'en').select(n); } catch (_) { /* default */ }
    return String(forms[cat] || forms.other || '{n}').replace('{n}', n);
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Cloudinary can resize on the fly; ask for a page-sized, auto-format image.
  const sized = (url) => String(url || '').replace('/upload/', '/upload/f_auto,q_auto,w_1000/');

  const MARK = '<svg class="wordmark__mark" viewBox="0 0 64 56" aria-hidden="true" focusable="false"><path class="wordmark__ridge" d="M4 51 L25 7 L37 30 L45 18.5 L60 51"/><path class="wordmark__pulse" d="M9 40 H17.5 L20.5 33.5 L23.5 45 L27 21.5 L30.5 48.5 L33.5 37 L36.5 40 H55"/></svg>';
  const WORDMARK = `<span class="wordmark">${MARK}<span class="wordmark__text"><em>A</em>DREN<em>A</em>LINE</span></span>`;
  const PULSE = '<svg class="pb-pulse" viewBox="0 0 120 14" preserveAspectRatio="none" aria-hidden="true"><path d="M0 7 H44 L48 2 L52 12 L56 0 L60 14 L64 5 L68 7 H120"/></svg>';

  const pages = PB.pages.slice();
  let draft = { destination: '', caption: '', file: null, preview: '' };

  // ── Page list ──
  function pageList() {
    const list = [{ type: 'cover' }];
    pages.forEach((p, i) => list.push({ type: 'memory', page: p, n: i + 1 }));
    if (PB.open) list.push(pages.length >= PB.maxPages ? { type: 'full' } : { type: 'form' });
    else if (!pages.length) list.push({ type: 'closedEmpty' });
    list.push({ type: 'end' });
    return list;
  }

  const dirAttr = `dir="${PB.dir === 'rtl' ? 'rtl' : 'ltr'}"`;

  function frame(inner, extraClass, footLeft) {
    return `<div class="pb-page ${extraClass || ''}" ${dirAttr}>${inner}`
      + (footLeft !== undefined ? `<div class="pb-page__foot"><span>${footLeft}</span>${PULSE}<span>Adrenaline</span></div>` : '')
      + '</div>';
  }

  function renderPage(p) {
    switch (p.type) {
      case 'cover': {
        const slogan = esc(T.slogan || '').split(/[,،]/);
        const sloganHtml = slogan.length === 2 ? `${slogan[0]},<b>${slogan[1]}</b>` : esc(T.slogan || '');
        return frame(
          `${WORDMARK}<p class="pb-cover__slogan">${sloganHtml}</p><span class="pb-cover__rule"></span>`
          + `<p class="pb-cover__label">${esc(T.coverLabel)}</p><p class="pb-cover__owner">${esc(PB.owner)}</p>`
          + `<p class="pb-cover__trip">${esc(PB.tripTitle)}${PB.tripDate ? ' · ' + esc(PB.tripDate) : ''}</p>`,
          'pb-cover'
        );
      }
      case 'memory': {
        const m = p.page;
        return frame(
          `<div class="pb-page__head"><span>${esc(PB.tripTitle)}</span><span>${String(p.n).padStart(2, '0')}</span></div>`
          + `<h3 class="pb-memory__dest" dir="auto">${m.destination ? '<i class="fas fa-location-dot" aria-hidden="true"></i>' + esc(m.destination) : '&nbsp;'}</h3>`
          + `<div class="pb-memory__photo" role="img" aria-label="${esc(m.destination || PB.tripTitle)}" style="background-image:url('${esc(sized(m.photo))}')">`
          + (PB.open ? `<button type="button" class="pb-remove" data-remove="${esc(m._id)}"><i class="fas fa-trash" aria-hidden="true"></i> <span>${esc(T.remove)}</span></button>` : '')
          + '</div>'
          + (m.caption ? `<p class="pb-memory__caption" dir="auto">${esc(m.caption)}</p>` : ''),
          'pb-memory', esc(PB.tripDate || '')
        );
      }
      case 'form':
        return frame(
          `<div class="pb-page__head"><span>${esc(T.newPage)}</span><span>${String(pages.length + 1).padStart(2, '0')}</span></div>`
          + '<form class="pb-form" novalidate>'
          + `<input class="pb-input" dir="auto" name="destination" maxlength="60" autocomplete="off" placeholder="${esc(T.destinationPh)}" value="${esc(draft.destination)}">`
          + `<label class="pb-drop${draft.preview ? ' has-photo' : ''}"${draft.preview ? ` style="background-image:url('${draft.preview}')"` : ''}>`
          + `<i class="fas fa-camera" aria-hidden="true"></i><span>${esc(T.photoPh)}</span><small>${esc(T.photoHint)}</small>`
          + `<span class="pb-drop__change">${esc(T.changePhoto)}</span>`
          + '<input type="file" name="photo" accept="image/jpeg,image/png,image/webp"></label>'
          + `<textarea class="pb-textarea" dir="auto" name="caption" maxlength="200" rows="2" placeholder="${esc(T.captionPh)}">${esc(draft.caption)}</textarea>`
          + '<p class="pb-error" role="alert"></p>'
          + `<button type="submit" class="pb-save"><i class="fas fa-floppy-disk" aria-hidden="true"></i> <span>${esc(T.save)}</span></button>`
          + '</form>',
          'pb-formpage'
        );
      case 'full':
        return frame(`${MARK}<h3>${esc(T.full)}</h3><p>${esc(tr('fullText', { n: PB.maxPages }))}</p>`, 'pb-message');
      case 'closedEmpty':
        return frame(`${MARK}<p>${esc(T.closedEmpty)}</p>`, 'pb-message');
      case 'end':
        return frame(`${WORDMARK}<p class="pb-cover__slogan">${esc(T.theEnd)}</p>`, 'pb-cover pb-message');
      default:
        return frame(MARK, 'pb-blank');
    }
  }

  // ── Leaves ──
  const media = window.matchMedia('(max-width: 760px)');
  let single = media.matches;
  let list = [];
  let leaves = [];
  let current = 0; // number of leaves turned

  function build(targetPage) {
    list = pageList();
    single = media.matches;
    book.classList.toggle('is-single', single);
    book.innerHTML = '';
    leaves = [];
    const perLeaf = single ? 1 : 2;
    const count = Math.ceil(list.length / perLeaf);
    for (let i = 0; i < count; i++) {
      const leaf = document.createElement('div');
      leaf.className = 'pb-leaf';
      const front = list[i * perLeaf];
      const back = single ? { type: 'blank' } : (list[i * perLeaf + 1] || { type: 'blank' });
      leaf.innerHTML = `<div class="pb-face pb-face--front">${renderPage(front)}</div><div class="pb-face pb-face--back">${renderPage(back)}</div>`;
      book.appendChild(leaf);
      leaves.push(leaf);
    }
    const p = Math.max(0, Math.min(targetPage || 0, list.length - 1));
    current = Math.min(single ? p : Math.ceil(p / 2), lastIndex());
    // Place leaves without animating.
    leaves.forEach((l) => { l.style.transition = 'none'; });
    layout();
    void book.offsetWidth;
    leaves.forEach((l) => { l.style.transition = ''; });
    wireForm();
  }

  function layout() {
    const n = leaves.length;
    leaves.forEach((leaf, i) => {
      const flipped = i < current;
      leaf.classList.toggle('is-flipped', flipped);
      leaf.style.zIndex = flipped ? i + 1 : n - i;
      leaf.setAttribute('aria-hidden', String(!visibleLeaf(i)));
      leaf.inert = !visibleLeaf(i);
    });
    book.classList.toggle('at-start', current === 0);
    book.classList.toggle('at-end', !single && current === n);
    updateControls();
  }

  // Which leaves have a face showing right now.
  function visibleLeaf(i) {
    if (single) return i === current;
    return i === current || i === current - 1;
  }

  // Page indexes on screen: one in single mode, up to two (left, right) on a spread.
  function visiblePages() {
    if (single) return [current];
    return [current * 2 - 1, current * 2].filter((i) => i >= 0 && i < list.length);
  }

  function firstVisiblePage() { return visiblePages()[0] || 0; }

  // How far the book can be turned. On a spread, when the back cover is a
  // right-hand page there is nothing to turn past it.
  function lastIndex() {
    if (single) return leaves.length - 1;
    return list.length % 2 === 0 ? leaves.length : leaves.length - 1;
  }

  function updateControls() {
    const prev = document.getElementById('pbPrev');
    const next = document.getElementById('pbNext');
    const counter = document.getElementById('pbCounter');
    if (prev) prev.disabled = current === 0;
    if (next) next.disabled = current >= lastIndex();
    if (counter) {
      const shown = visiblePages().map((i) => i + 1);
      counter.textContent = tr('pageOf', { n: shown.join('–'), total: list.length });
    }
  }

  function go(delta) {
    const target = Math.max(0, Math.min(current + delta, lastIndex()));
    if (target === current) return;
    const turning = delta > 0 ? leaves[current] : leaves[current - 1];
    if (turning) turning.style.zIndex = leaves.length + 5; // keep the turning page on top mid-flip
    current = target;
    requestAnimationFrame(() => {
      layout();
      if (turning) turning.style.zIndex = leaves.length + 5;
      setTimeout(layout, 820);
    });
  }

  function goToPage(p) {
    const target = single ? p : Math.ceil(p / 2);
    go(target - current);
  }

  // The book turns like a physical book in both languages (next page comes from
  // the right), so the controls and arrow keys keep that physical direction.
  document.getElementById('pbPrev')?.addEventListener('click', () => go(-1));
  document.getElementById('pbNext')?.addEventListener('click', () => go(1));

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
  });

  // Swipe to turn pages (ignored when the gesture starts on a form field).
  let startX = null;
  book.addEventListener('pointerdown', (e) => {
    startX = e.target.closest('input, textarea, button, label') ? null : e.clientX;
  });
  book.addEventListener('pointerup', (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 45) go(dx < 0 ? 1 : -1);
  });

  media.addEventListener('change', () => build(firstVisiblePage()));

  // ── Form ──
  function wireForm() {
    const form = book.querySelector('.pb-form');
    if (form) {
      const drop = form.querySelector('.pb-drop');
      const file = form.querySelector('input[type=file]');
      const err = form.querySelector('.pb-error');
      form.destination.addEventListener('input', () => { draft.destination = form.destination.value; });
      form.caption.addEventListener('input', () => { draft.caption = form.caption.value; });
      file.addEventListener('change', () => {
        const f = file.files && file.files[0];
        if (!f) return;
        if (f.size > 8 * 1024 * 1024) { err.textContent = T.tooBig; file.value = ''; return; }
        err.textContent = '';
        if (draft.preview) URL.revokeObjectURL(draft.preview);
        draft.file = f;
        draft.preview = URL.createObjectURL(f);
        drop.style.backgroundImage = `url('${draft.preview}')`;
        drop.classList.add('has-photo');
      });
      form.addEventListener('submit', (e) => { e.preventDefault(); save(form); });
    }
    book.querySelectorAll('[data-remove]').forEach((btn) => btn.addEventListener('click', () => removePage(btn)));
  }

  async function save(form) {
    const err = form.querySelector('.pb-error');
    const btn = form.querySelector('.pb-save');
    if (!draft.file) { err.textContent = T.needPhoto; return; }
    err.textContent = '';
    btn.disabled = true;
    btn.querySelector('span').textContent = T.saving;
    const body = new FormData();
    body.append('destination', form.destination.value.trim());
    body.append('caption', form.caption.value.trim());
    body.append('photo', draft.file);
    try {
      const res = await fetch(`/api/photo-book/${encodeURIComponent(PB.tripId)}/pages`, { method: 'POST', body, credentials: 'same-origin' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || T.failed);
      pages.push(json.data.page);
      if (draft.preview) URL.revokeObjectURL(draft.preview);
      draft = { destination: '', caption: '', file: null, preview: '' };
      build(pages.length); // show the page just saved
      toast(T.saved, pages.length < PB.maxPages ? T.addAnother : null);
    } catch (e) {
      err.textContent = e.message || T.failed;
      btn.disabled = false;
      btn.querySelector('span').textContent = T.save;
    }
  }

  async function removePage(btn) {
    if (!btn.classList.contains('is-armed')) {
      btn.classList.add('is-armed');
      btn.querySelector('span').textContent = T.confirmRemove;
      setTimeout(() => {
        if (btn.isConnected) { btn.classList.remove('is-armed'); btn.querySelector('span').textContent = T.remove; }
      }, 3500);
      return;
    }
    const id = btn.dataset.remove;
    btn.disabled = true;
    try {
      const res = await fetch(`/api/photo-book/${encodeURIComponent(PB.tripId)}/pages/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || T.failed);
      const at = pages.findIndex((p) => p._id === id);
      if (at > -1) pages.splice(at, 1);
      build(Math.max(1, at + 1));
    } catch (e) {
      btn.disabled = false;
      toast(e.message || T.failed);
    }
  }

  let toastTimer = null;
  function toast(message, actionLabel) {
    const el = document.getElementById('pbToast');
    if (!el) return;
    el.innerHTML = `<span>${esc(message)}</span>` + (actionLabel ? `<button type="button">${esc(actionLabel)}</button>` : '');
    el.hidden = false;
    const action = el.querySelector('button');
    if (action) action.addEventListener('click', () => { el.hidden = true; goToPage(list.findIndex((p) => p.type === 'form')); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 6000);
  }

  build(0);
  // Let screen readers and the counter know how many memories there are.
  book.setAttribute('aria-label', `${PB.tripTitle} · ${pagesLabel(pages.length)}`);
})();
