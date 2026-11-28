(() => {
  const I18N = window.TH_I18N || {};
  const T = (key, vars) => String(I18N[key] ?? key).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] !== undefined ? vars[k] : m));
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function fmt(ms) {
    ms = Math.max(0, Math.floor(ms || 0));
    const tenths = Math.floor((ms % 1000) / 100);
    const sec = Math.floor(ms / 1000);
    const h = Math.floor(sec / 3600);
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}.${tenths}`;
  }

  // Shelf page: finish times.
  document.querySelectorAll('.th-ms[data-ms]').forEach((el) => { el.textContent = fmt(Number(el.dataset.ms)); el.dir = 'ltr'; });

  const H = window.TREASURE_HUNT;
  const app = document.getElementById('thApp');
  if (!H || !app) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let state = H.state;
  let board = H.board;
  let open = H.open;
  let offset = state ? state.serverNow - Date.now() : (board ? board.serverNow - Date.now() : 0);
  let pending = H.pendingScan || '';
  let busy = false;
  let lifelineAsk = false; // QR hunts: true while confirming. Selfie hunts: the stop index.
  let clockRaf = null;
  const SELFIE = H.mode === 'selfie';
  let uploadingLeg = null;

  if (pending && history.replaceState) history.replaceState(null, '', location.pathname);

  // ── Sound and touch feedback ──
  let ctx = null;
  function tone(freqs, { type = 'triangle', step = 0.07, len = 0.22, vol = 0.12 } = {}) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = ctx || new AC();
      if (ctx.state === 'suspended') ctx.resume();
      freqs.forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const t = ctx.currentTime + i * step;
        o.type = type;
        o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + len);
        o.connect(g); g.connect(ctx.destination);
        o.start(t); o.stop(t + len + 0.02);
      });
    } catch (e) { /* no audio */ }
  }
  const sfx = {
    capture: () => tone([659.25, 783.99, 1046.5]),
    finish: () => tone([523.25, 659.25, 783.99, 1046.5, 1318.5], { step: 0.09, len: 0.35 }),
    error: () => tone([260, 196], { type: 'sawtooth', step: 0.1, len: 0.16, vol: 0.08 }),
  };
  const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* ignore */ } };

  async function api(path, body) {
    const res = await fetch(`/api/treasure-hunt/${encodeURIComponent(H.tripId)}/${path}`, {
      method: body ? 'POST' : 'GET',
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  function messageFor(d) {
    switch (d && d.event) {
      case 'invalid': return T('invalid');
      case 'other_route': return T('otherRoute', { route: d.routeName });
      case 'wrong_order': return T('wrongOrder', { scanned: d.scanned, expected: d.expected });
      case 'need_team': return T('needTeam');
      case 'closed': return T('closedScan');
      case 'team_not_found': return T('teamNotFound');
      case 'team_full': return T('teamFull', { n: d.max });
      case 'closed_start': return T('closedTitle');
      case 'pick_bus': return T('pickBus');
      case 'cant_leave': return T('cantLeave');
      case 'no_lifelines': return T('noLifelines');
      case 'selfie_hunt': return T('selfieHuntNoQr');
      case 'selfie_approved':
      case 'selfie_locked': return T('selfieLocked');
      case 'locked_stop': return T('lockedStop');
      default: return (d && d.message) || T('failed');
    }
  }

  // ═══════════════ Views ═══════════════
  const ROUTE_STOPS = H.routes.reduce((n, r) => Math.max(n, r.stops), 0);
  const ridge = '<svg class="th-ridge" viewBox="0 0 64 56" aria-hidden="true"><path d="M4 51 L25 7 L37 30 L45 18.5 L60 51" fill="none" stroke="currentColor" stroke-width="4"/><path d="M9 40 H17.5 L20.5 33.5 L23.5 45 L27 21.5 L30.5 48.5 L33.5 37 L36.5 40 H55" fill="none" stroke="#fff" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg>';

  function heroHtml() {
    const badge = open ? `<span class="th-badge th-badge--live">${esc(T('live'))}</span>` : `<span class="th-badge">${esc(T('standby'))}</span>`;
    return `<section class="th-hero">
      <div class="th-hero__topo" aria-hidden="true"></div>
      <div class="th-hero__copy">
        <div class="th-hero__meta">${badge}<span>${esc(T('routesStops', { routes: H.routes.length, stops: ROUTE_STOPS }))}</span></div>
        <p class="th-kicker">${esc(T('kicker'))}</p>
        <h2 class="th-hero__title">${esc(T('title'))}</h2>
        <p class="th-hero__trip">${esc(H.tripTitle)}</p>
      </div>
      <div class="th-hero__mark" aria-hidden="true">${ridge}<span class="th-compass"><i class="fas fa-compass"></i></span></div>
    </section>`;
  }

  function rulesHtml() {
    const rules = SELFIE
      ? [['fa-stopwatch', T('selfieRule1')], ['fa-images', T('selfieRule2')], ['fa-camera', T('selfieRule3')], ['fa-users', T('rule6', { n: H.maxMembers })], ['fa-life-ring', T('rule4', { n: H.lifelines })], ['fa-user-check', T('selfieRule5')]]
      : [['fa-stopwatch', T('rule1')], ['fa-route', T('rule2')], ['fa-qrcode', T('rule3')], ['fa-users', T('rule6', { n: H.maxMembers })], ['fa-life-ring', T('rule4', { n: H.lifelines })], ['fa-hand', T('rule5')]];
    const shown = H.lifelines > 0 ? rules : rules.filter(([i]) => i !== 'fa-life-ring'); // lifelines off
    return `<ul class="th-rules">${shown.map(([i, txt]) => `<li><i class="fas ${i}" aria-hidden="true"></i><span>${esc(txt)}</span></li>`).join('')}</ul>`;
  }

  const teamId = (c) => (c && c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c || '');

  const busMode = (H.options || []).some((o) => o.kind === 'bus');

  function startHtml() {
    const join = `<section class="th-panel">
      <h3 class="th-panel__title"><i class="fas fa-right-to-bracket" aria-hidden="true"></i> ${esc(T('joinTitle'))}</h3>
      <p class="th-panel__text">${esc(T('joinText'))}</p>
      <form id="thJoin" class="th-join" novalidate>
        <label class="sr-only" for="thTeamId">${esc(T('teamIdLabel'))}</label>
        <input id="thTeamId" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${esc(T('teamIdPh'))}" dir="ltr">
        <button type="submit" class="th-btn th-btn--solid">${esc(T('joinBtn'))}</button>
      </form>
      <p class="th-error" id="thJoinErr" role="alert" hidden></p>
    </section>`;
    if (!open) {
      return `<section class="th-panel th-panel--closed"><i class="fas fa-lock" aria-hidden="true"></i><div><h3>${esc(T('closedTitle'))}</h3><p>${esc(T('closedText'))}</p></div></section>` + join;
    }
    return `${pending ? `<p class="th-flash"><i class="fas fa-qrcode" aria-hidden="true"></i> ${esc(T('pendingScan'))}</p>` : ''}
    <section class="th-panel th-panel--new">
      <h3 class="th-panel__title"><i class="fas fa-flag" aria-hidden="true"></i> ${esc(T('newTitle'))}</h3>
      <p class="th-panel__text">${esc(T('newText', { n: H.maxMembers }))}</p>
      <fieldset class="th-buses"><legend>${esc(T(busMode ? 'chooseBus' : 'chooseRoute'))}</legend>
        ${H.options.map((o) => `<label class="th-bus"><input type="radio" name="bus" value="${esc(o._id)}" ${H.options.length === 1 ? 'checked' : ''}><i class="fas ${o.kind === 'bus' ? 'fa-bus' : 'fa-route'}" aria-hidden="true"></i><span dir="auto">${esc(o.name)}</span></label>`).join('')}
      </fieldset>
      <p class="th-error" id="thStartErr" role="alert" hidden></p>
      <button type="button" class="th-btn th-btn--go" data-act="new-team"><i class="fas fa-stopwatch" aria-hidden="true"></i><span>${esc(T('startBtn'))}</span></button>
    </section>
    <div class="th-or"><span>${esc(T('or'))}</span></div>
    ${join}`;
  }

  function teamHtml() {
    const r = state.route;
    const members = state.members.map((m) => `<li class="${m.me ? 'is-me' : ''}"><i class="fas fa-user" aria-hidden="true"></i><span dir="auto">${esc(m.name)}</span>${m.me ? ` <em>${esc(T('you'))}</em>` : ''}</li>`).join('');
    return `<section class="th-team" style="--route:${esc(r.color)}">
      <div class="th-team__id">
        <span class="th-hud__label">${esc(T('teamIdLabel'))}</span>
        <strong dir="ltr" id="thTeamCode">${esc(teamId(state.code))}</strong>
        <button type="button" class="th-btn th-btn--ghost th-btn--copy" data-act="copy-id"><i class="fas fa-copy" aria-hidden="true"></i><span>${esc(T('copy'))}</span></button>
      </div>
      <p class="th-team__share">${esc(T('shareId'))}</p>
      <p class="th-team__route">${state.bus ? `<span class="th-team__bus"><i class="fas fa-bus" aria-hidden="true"></i> <span dir="auto">${esc(state.bus)}</span></span>` : ''}<span class="th-chip" dir="auto">${esc(r.name)}</span></p>
      <h4 class="th-team__head">${esc(T('members'))} <span dir="ltr">${state.members.length} / ${state.maxMembers}</span></h4>
      ${state.members.length >= state.maxMembers ? `<p class="th-team__full">${esc(T('teamIsFull'))}</p>` : ''}
      <ul class="th-team__members">${members}</ul>
      ${state.progress === 0 && !state.finished ? `<button type="button" class="th-leave" data-act="leave">${esc(T('leaveTeam'))}</button>` : ''}
    </section>`;
  }

  function hudHtml() {
    const r = state.route;
    return `<div class="th-hud" style="--route:${esc(r.color)}">
      <div class="th-hud__clock"><span class="th-hud__label">${esc(T('elapsed'))}</span><span id="thClock" class="th-time" dir="ltr">00:00.0</span></div>
      <div class="th-hud__team"><span class="th-hud__label">${esc(T('team'))}</span><strong dir="ltr">${esc(teamId(state.code))}</strong><span class="th-chip" dir="auto">${esc(r.label || r.name)}</span></div>
    </div>`;
  }

  // ── The trail: from START at the bottom up to the treasure ──
  const ROW = 96;
  const TOP = 74;
  const BOTTOM = 62;

  function trailPoints(width) {
    const pts = [];
    for (let i = 0; i <= state.total; i++) {
      const fx = i === 0 || i === state.total ? 0.5 : (i % 2 ? 0.28 : 0.72);
      pts.push({ x: Math.round(width * fx), y: TOP + (state.total - i) * ROW });
    }
    return pts;
  }
  const seg = (a, b) => { const k = ROW * 0.6; return `M${a.x} ${a.y} C${a.x} ${a.y - k} ${b.x} ${b.y + k} ${b.x} ${b.y}`; };

  function mapHtml() {
    return `<section class="th-map-wrap" style="--route:${esc(state.route.color)}">
      <div class="th-map-head"><span><i class="fas fa-mountain-sun" aria-hidden="true"></i> <span dir="auto">${esc(state.route.name)}</span></span><span class="th-chip" id="thProgress">${esc(T('unlocked', { done: state.progress, total: state.total }))}</span></div>
      <div class="th-map" id="thMap" role="img" aria-label="${esc(T('unlocked', { done: state.progress, total: state.total }))}"></div>
    </section>`;
  }

  function drawMap(animateFrom) {
    const host = document.getElementById('thMap');
    if (!host) return;
    const width = host.clientWidth || 340;
    const height = TOP + state.total * ROW + BOTTOM;
    host.style.height = height + 'px';
    const pts = trailPoints(width);
    const done = state.progress;
    const anim = typeof animateFrom === 'number' && animateFrom < done && !reduceMotion;
    const full = pts.slice(1).map((p, i) => seg(pts[i], p)).join(' ');
    let svg = `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <path d="${full}" class="th-trail-bed"/>
      <path d="${full}" class="th-trail-dash"/>`;
    for (let i = 0; i < done; i++) {
      const fresh = anim && i >= animateFrom;
      svg += `<path d="${seg(pts[i], pts[i + 1])}" class="th-trail-done${fresh ? ' is-drawing' : ''}" pathLength="1"/>`;
    }
    svg += '</svg>';

    let html = svg + `<div class="th-node th-node--start" style="left:${pts[0].x}px;top:${pts[0].y}px"><span class="th-node__dot"></span><span class="th-node__label">${esc(T('start'))}</span></div>`;
    for (let n = 1; n <= state.total; n++) {
      const p = pts[n];
      const isFinal = n === state.total;
      const st = n <= done ? 'done' : n === done + 1 ? 'current' : 'locked';
      const c = state.cleared[n - 1];
      let face;
      const redo = st === 'done' && c && c.status === 'rejected';
      if (redo) face = '<i class="fas fa-rotate-left"></i>';
      else if (st === 'done') face = '<i class="fas fa-check"></i>';
      else if (isFinal) face = '<i class="fas fa-flag-checkered"></i>';
      else if (st === 'current') face = `<b dir="ltr">${n}</b>`;
      else face = '<i class="fas fa-lock"></i>';
      let label;
      if (redo) label = `<span class="th-node__label th-node__label--redo">${esc(T('redoNode'))}</span>`;
      else if (st === 'done') label = `<span class="th-node__label th-node__label--done"><b dir="ltr">${fmt(c && c.split)}</b>${c && c.place ? `<em dir="auto">${esc(c.place)}</em>` : ''}</span>`;
      else if (st === 'current') label = `<span class="th-node__label th-node__label--current">${esc(isFinal ? T('treasure') : T('findMe'))}</span>`;
      else label = `<span class="th-node__label">${esc(isFinal ? T('treasure') : T('stop', { n }))}</span>`;
      const fresh = anim && n > animateFrom && n <= done;
      html += `<div class="th-node${isFinal ? ' th-node--final' : ''} th-node--${st}${redo ? ' th-node--redo' : ''}${fresh ? ' is-fresh' : ''}" style="left:${p.x}px;top:${p.y}px"><span class="th-node__gem">${face}</span>${label}</div>`;
    }
    if (!state.finished && done < state.total) {
      const p = pts[done];
      html += `<div class="th-pin" style="left:${p.x}px;top:${p.y}px" aria-hidden="true"><span><i class="fas fa-person-hiking"></i></span></div>`;
    }
    host.innerHTML = html;
  }

  function clueHtml() {
    const c = state.clue;
    if (!c) return '';
    const head = c.isFinish ? T('clueFinal') : T('clueFor', { n: c.n });
    let life = '';
    if (c.hasExtra) {
      if (c.extra) {
        life = `<div class="th-extra"><span class="th-extra__label"><i class="fas fa-life-ring" aria-hidden="true"></i> ${esc(T('extraHint'))}</span><p dir="auto">${esc(c.extra)}</p></div>`;
      } else if (state.lifelinesLeft > 0 && open) {
        life = lifelineAsk
          ? `<div class="th-confirm" role="alertdialog"><p><i class="fas fa-triangle-exclamation" aria-hidden="true"></i> ${esc(T('lifelineConfirm'))}</p><div class="th-confirm__row"><button type="button" class="th-btn th-btn--solid" data-act="hint-yes">${esc(T('reveal'))}</button><button type="button" class="th-btn th-btn--ghost" data-act="hint-no">${esc(T('keep'))}</button></div></div>`
          : `<button type="button" class="th-life" data-act="hint-ask"><i class="fas fa-life-ring" aria-hidden="true"></i><span>${esc(T('lifeline'))}</span><span class="th-chip" dir="auto">${esc(T('lifelinesLeft', { n: state.lifelinesLeft }))}</span></button>`;
      } else if (state.lifelinesLeft <= 0) {
        life = `<p class="th-note"><i class="fas fa-life-ring" aria-hidden="true"></i> ${esc(T('noLifelines'))}</p>`;
      }
    }
    return `<article class="th-clue" style="--route:${esc(state.route.color)}">
      <header class="th-clue__head"><span><i class="fas ${c.isFinish ? 'fa-gem' : 'fa-key'}" aria-hidden="true"></i> ${esc(head)}</span><span dir="ltr">${c.n} / ${state.total}</span></header>
      <div class="th-clue__body">
        ${c.riddle ? `<p class="th-clue__riddle" dir="auto">${esc(c.riddle)}</p>` : ''}
        ${c.photo ? `<button type="button" class="th-photo" data-act="photo" data-src="${esc(c.photo)}"><img src="${esc(c.photo)}" alt="${esc(T(c.riddle ? 'photoAlt' : 'cluePhotoAlt'))}" loading="lazy"><i class="fas fa-expand" aria-hidden="true"></i></button>` : ''}
        ${c.guide ? `<div class="th-guide"><span class="th-guide__label"><i class="fas fa-signs-post" aria-hidden="true"></i> ${esc(T('directions'))}</span><p dir="auto">${esc(c.guide)}</p></div>` : ''}
        ${life}
      </div>
    </article>`;
  }

  function actionsHtml() {
    if (!open) return `<p class="th-flash th-flash--bad"><i class="fas fa-lock" aria-hidden="true"></i> ${esc(T('closedScan'))}</p>`;
    return `<div class="th-actions">
      <button type="button" class="th-btn th-btn--scan" data-act="scan"><i class="fas fa-qrcode" aria-hidden="true"></i><span>${esc(T('scanBtn'))}</span></button>
      <form id="thCode" class="th-code" novalidate>
        <input id="thCodeInput" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${esc(T('codePh'))}" dir="ltr">
        <button type="submit" class="th-btn th-btn--solid">${esc(T('claim'))}</button>
      </form>
      <p class="th-error" id="thScanErr" role="alert" hidden></p>
    </div>`;
  }

  // ── Selfie hunts: same trail as QR; the selfie (or the answer, on stops the admin set
  // to ask for one) replaces the scan. A stop clears when it is sent; the review comes later.
  function proofActionsHtml(stop, small) {
    const i = stop.index;
    if (uploadingLeg === i) return `<p class="th-sending"><i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i> ${esc(T(stop.proof === 'answer' ? 'sendingAnswer' : 'sendingSelfie'))}</p><p class="th-error" id="thSelfieErr-${i}" role="alert" hidden></p>`;
    if (stop.proof === 'answer') {
      const id = `thAnswer-${i}`;
      return `<form class="th-answer" data-answer="${i}" novalidate>
          <label for="${id}">${esc(stop.answerPrompt || T('answerLabel'))}</label>
          <div class="th-answer__row"><input id="${id}" maxlength="300" autocomplete="off" dir="auto" placeholder="${esc(T('answerPh'))}">
          <button type="submit" class="th-btn th-btn--solid">${esc(T('sendAnswer'))}</button></div>
        </form><p class="th-error" id="thSelfieErr-${i}" role="alert" hidden></p>`;
    }
    return `<button type="button" class="th-btn ${small ? 'th-btn--solid' : 'th-btn--scan'}" data-act="camera" data-leg="${i}"><i class="fas fa-camera" aria-hidden="true"></i><span>${esc(T(small ? 'retakeSelfie' : 'takeSelfie'))}</span></button>
      <label class="th-btn th-btn--ghost th-btn--attach"><i class="fas fa-paperclip" aria-hidden="true"></i><span>${esc(T('attachPhoto'))}</span><input type="file" accept="image/*" data-attach="${i}" hidden></label>
      <p class="th-error" id="thSelfieErr-${i}" role="alert" hidden></p>`;
  }

  function selfieActionsHtml() {
    if (!open) return `<p class="th-flash th-flash--bad"><i class="fas fa-lock" aria-hidden="true"></i> ${esc(T('closedSelfie'))}</p>`;
    if (!state.clue) return '';
    return `<div class="th-actions">${proofActionsHtml(state.clue, false)}</div>`;
  }

  // Stops the organisers rejected: the team goes back and sends them again.
  function retakesHtml() {
    if (!state.retakes || !state.retakes.length) return '';
    return state.retakes.map((r) => {
      const sf = r.selfie || {};
      const head = r.isFinish ? T('selfieFinal') : T('selfieStop', { n: r.n });
      return `<article class="th-clue th-retake" style="--route:${esc(state.route.color)}">
        <header class="th-clue__head"><span><i class="fas fa-rotate-left" aria-hidden="true"></i> ${esc(T('retakeTitle', { stop: head }))}</span><span dir="ltr">${r.n} / ${state.total}</span></header>
        <div class="th-clue__body">
          <p class="th-retake__why"><i class="fas fa-circle-xmark" aria-hidden="true"></i> ${esc(T(r.proof === 'answer' ? 'answerRejected' : 'selfieRejected'))}${sf.answer ? ` <span dir="auto">(${esc(sf.answer)})</span>` : ''}</p>
          ${r.riddle ? `<p class="th-clue__riddle" dir="auto">${esc(r.riddle)}</p>` : ''}
          ${r.photo ? `<button type="button" class="th-photo" data-act="photo" data-src="${esc(r.photo)}"><img src="${esc(r.photo)}" alt="${esc(T('cluePhotoAlt'))}" loading="lazy"><i class="fas fa-expand" aria-hidden="true"></i></button>` : ''}
          ${open ? `<div class="th-actions">${proofActionsHtml(r, true)}</div>` : ''}
        </div>
      </article>`;
    }).join('');
  }

  function myRank() {
    if (!state || !board) return null;
    const i = board.finished.findIndex((t) => t.teamId === state.teamId);
    return i === -1 ? null : i + 1;
  }

  function victoryHtml() {
    const rank = myRank();
    const legs = state.cleared.map((c, i) => {
      const prev = i ? state.cleared[i - 1].split : 0;
      return `<li><span class="th-legs__n" dir="ltr">${c.isFinish ? '<i class="fas fa-flag-checkered"></i>' : c.n}</span><span class="th-legs__place" dir="auto">${esc(c.place || T('stop', { n: c.n }))}${c.hintUsed ? ' <i class="fas fa-life-ring" aria-hidden="true"></i>' : ''}</span><span class="th-legs__t" dir="ltr">+${fmt(Math.max(0, c.split - prev))}</span></li>`;
    }).join('');
    return `<section class="th-victory" style="--route:${esc(state.route.color)}">
      <div class="th-hero__topo" aria-hidden="true"></div>
      <p class="th-kicker">${esc(T('yourTeam', { n: teamId(state.code) }))} · <span dir="auto">${esc(state.route.name)}</span></p>
      <h2 class="th-victory__title">${esc(T('victory'))}</h2>
      ${state.finishMessage ? `<p class="th-victory__msg" dir="auto">${esc(state.finishMessage)}</p>` : ''}
      <div class="th-victory__time"><span>${esc(T('finalTime'))}</span><strong dir="ltr">${fmt(state.elapsedMs)}</strong></div>
      ${rank ? `<p class="th-victory__rank"><i class="fas fa-trophy" aria-hidden="true"></i> ${esc(T('place', { n: rank }))}</p>` : ''}
      ${SELFIE ? `<p class="th-victory__review${state.verified ? ' is-ok' : ''}"><i class="fas ${state.verified ? 'fa-circle-check' : 'fa-hourglass-half'}" aria-hidden="true"></i> ${esc(T(state.verified ? 'verifiedAll' : 'underReview'))}</p>` : ''}
      <h3 class="th-subhead">${esc(T('legByLeg'))}</h3>
      <ol class="th-legs">${legs}</ol>
    </section>`;
  }

  function boardHtml() {
    if (!board) return '';
    const mine = state && state.teamId;
    const rows = board.finished.map((t, i) => {
      const lead = board.finished[0].elapsedMs;
      return `<li class="th-lb__row${t.teamId === mine ? ' is-me' : ''}${i < 3 ? ' is-top' : ''}" style="--route:${esc(t.route.color)}">
        <span class="th-lb__rank" dir="ltr">${i + 1}</span>
        <span class="th-lb__who"><strong dir="ltr">${esc(teamId(t.code))}${t.teamId === mine ? ` <em>${esc(T('you'))}</em>` : ''}${t.verified === true ? ` <i class="fas fa-circle-check th-lb__ok" title="${esc(T('verified'))}" aria-label="${esc(T('verified'))}"></i>` : t.verified === false ? ` <i class="fas fa-hourglass-half th-lb__wait" title="${esc(T('underReviewShort'))}" aria-label="${esc(T('underReviewShort'))}"></i>` : ''}</strong><small dir="auto">${esc(t.members.join('، ') || t.route.name)}</small></span>
        <span class="th-lb__time"><b dir="ltr">${fmt(t.elapsedMs)}</b><small dir="ltr">${i === 0 ? esc(T('fastest')) : '+' + fmt(t.elapsedMs - lead)}</small></span>
      </li>`;
    }).join('') || `<li class="th-lb__empty">${esc(T('noFinishers'))}</li>`;
    const trail = board.onTrail.map((t) => {
      const pct = Math.round((t.progress / Math.max(1, t.total)) * 100);
      return `<li class="th-trail-row${t.teamId === mine ? ' is-me' : ''}" style="--route:${esc(t.route.color)}">
        <span class="th-trail-row__team" dir="ltr">${esc(teamId(t.code))}</span>
        <span class="th-trail-row__bar"><span style="width:${pct}%"></span></span>
        <span class="th-trail-row__n" dir="ltr">${t.progress}/${t.total}</span>
      </li>`;
    }).join('');
    return `<section class="th-lb">
      <header class="th-lb__head"><div><h3><i class="fas fa-trophy" aria-hidden="true"></i> ${esc(T('leaderboard'))}</h3><p>${esc(T('leaderboardSub'))}</p></div>${open ? `<span class="th-badge th-badge--live">${esc(T('live'))}</span>` : ''}</header>
      <ol class="th-lb__list">${rows}</ol>
      ${board.onTrail.length ? `<h4 class="th-lb__sub">${esc(T('onTrail'))} <span dir="ltr">${board.onTrail.length}</span></h4><ul class="th-trail-list">${trail}</ul>` : (!board.finished.length ? `<p class="th-lb__empty">${esc(T('noTeams'))}</p>` : '')}
    </section>`;
  }

  function render(animateFrom) {
    let main;
    if (!state) main = heroHtml() + startHtml() + rulesHtml();
    else if (state.finished) main = victoryHtml() + teamHtml() + mapHtml();
    else if (SELFIE) main = hudHtml() + teamHtml() + mapHtml() + retakesHtml() + clueHtml() + selfieActionsHtml();
    else main = hudHtml() + teamHtml() + mapHtml() + clueHtml() + actionsHtml();
    // Rebuilding the panel briefly shrinks the page, which would throw the reader back to the
    // top. Hold the height and put the scroll back (the page scrolls on phones, the panel on desktop).
    const scroller = document.querySelector('.dash-scroll-area');
    const keepY = scroller ? scroller.scrollTop : 0;
    const keepWin = window.scrollY;
    app.style.minHeight = app.offsetHeight + 'px';
    app.innerHTML = `<div class="th-grid"><div class="th-main">${main}</div><aside class="th-side" id="thBoard">${boardHtml()}</aside></div>`;
    if (state) drawMap(animateFrom);
    app.style.minHeight = '';
    if (scroller) scroller.scrollTop = keepY;
    window.scrollTo(window.scrollX, keepWin);
    bind();
    if (state && !state.finished) startClock(); else stopClock();
  }

  function renderBoard() {
    const el = document.getElementById('thBoard');
    if (el) el.innerHTML = boardHtml();
  }

  // ── Clock ──
  function startClock() {
    stopClock();
    const el = document.getElementById('thClock');
    if (!el) return;
    let last = '';
    const tick = () => {
      const txt = fmt(Date.now() + offset - state.startedAt);
      if (txt !== last) { el.textContent = txt; last = txt; }
      clockRaf = requestAnimationFrame(tick);
    };
    tick();
  }
  function stopClock() { if (clockRaf) cancelAnimationFrame(clockRaf); clockRaf = null; }

  function applyState(next, opts = {}) {
    const before = state ? state.progress : 0;
    const wasFinished = state && state.finished;
    if (next) offset = next.serverNow - Date.now();
    const clueChanged = !state || !next || state.progress !== next.progress;
    state = next;
    if (clueChanged) lifelineAsk = false;
    render(opts.animate ? before : undefined);
    if (state && state.finished && !wasFinished && opts.animate) celebrate();
  }

  // ── Events ──
  function bind() {
    const join = document.getElementById('thJoin');
    if (join) join.addEventListener('submit', onJoin);
    const code = document.getElementById('thCode');
    if (code) code.addEventListener('submit', (e) => { e.preventDefault(); const v = document.getElementById('thCodeInput').value; if (v.trim()) claim(v); });
    app.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', onAct));
    app.querySelectorAll('input[data-attach]').forEach((i) => i.addEventListener('change', onAttach));
    app.querySelectorAll('form[data-answer]').forEach((f) => f.addEventListener('submit', (e) => {
      e.preventDefault();
      const leg = Number(f.dataset.answer);
      const answer = f.querySelector('input').value.trim();
      if (!answer) return showErr(`thSelfieErr-${leg}`, T('typeAnswer'));
      sendSelfie(leg, null, answer);
    }));
  }

  function showErr(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.hidden = !msg;
    if (msg) { el.classList.remove('th-shake'); void el.offsetWidth; el.classList.add('th-shake'); }
  }

  async function afterJoin(data) {
    buzz(30);
    applyState(data.state);
    const back = document.querySelector('.th-back') || app;
    back.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
    refresh();
    if (pending) { const c = pending; pending = ''; claim(c); }
  }

  async function startNew(btn) {
    if (busy) return;
    const bus = app.querySelector('input[name=bus]:checked');
    if (!bus) return showErr('thStartErr', T(busMode ? 'pickBus' : 'pickRoute'));
    busy = true;
    const label = btn.querySelector('span');
    label.textContent = T('starting');
    try {
      const { ok, data } = await api('start', { busId: bus.value });
      if (!ok) { showErr('thStartErr', messageFor(data)); sfx.error(); return; }
      await afterJoin(data);
    } catch (err) {
      showErr('thStartErr', T('failed'));
    } finally {
      busy = false;
      if (label.isConnected) label.textContent = T('startBtn');
    }
  }

  async function onJoin(e) {
    e.preventDefault();
    if (busy) return;
    const code = document.getElementById('thTeamId').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 6) return showErr('thJoinErr', T('pickTeamId'));
    busy = true;
    try {
      const { ok, data } = await api('join', { code });
      if (!ok) { showErr('thJoinErr', messageFor(data)); sfx.error(); return; }
      await afterJoin(data);
    } catch (err) {
      showErr('thJoinErr', T('failed'));
    } finally {
      busy = false;
    }
  }

  async function onAct(e) {
    const act = e.currentTarget.dataset.act;
    if (act === 'scan') return openScanner();
    if (act === 'new-team') return startNew(e.currentTarget);
    if (act === 'copy-id') {
      const btn = e.currentTarget;
      try { await navigator.clipboard.writeText(teamId(state.code)); } catch (err) { /* clipboard blocked: the ID is on screen */ }
      btn.querySelector('span').textContent = T('copied');
      setTimeout(() => { if (btn.isConnected) btn.querySelector('span').textContent = T('copy'); }, 1800);
      return;
    }
    if (act === 'leave') {
      const btn = e.currentTarget;
      if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = T('leaveConfirm'); setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = ''; btn.textContent = T('leaveTeam'); } }, 3500); return; }
      if (busy) return;
      busy = true;
      try {
        const { ok, data } = await api('leave', {});
        if (!ok) { showErr('thScanErr', messageFor(data)); return; }
        stopClock();
        state = null;
        render();
        refresh();
      } finally {
        busy = false;
      }
      return;
    }
    const leg = e.currentTarget.dataset.leg;
    if (act === 'camera') return openCamera(Number(leg));
    if (act === 'hint-ask') { lifelineAsk = true; return render(); }
    if (act === 'hint-no') { lifelineAsk = false; return render(); }
    if (act === 'photo') return openLightbox(e.currentTarget.dataset.src || state.clue.photo);
    if (act === 'hint-yes') {
      if (busy) return;
      busy = true;
      try {
        const { ok, data } = await api('hint', SELFIE ? { leg: state.clue.index } : {});
        lifelineAsk = false;
        if (data.state) { state = data.state; offset = state.serverNow - Date.now(); }
        render();
        if (!ok) showErr(SELFIE ? `thSelfieErr-${state.clue ? state.clue.index : ''}` : 'thScanErr', messageFor(data));
      } catch (err) {
        showErr('thScanErr', T('failed'));
      } finally {
        busy = false;
      }
    }
  }

  function extractCode(text) {
    const raw = String(text || '').trim();
    try {
      const u = new URL(raw);
      const p = u.searchParams.get('scan');
      if (p) return p;
    } catch (e) { /* not a URL */ }
    return raw;
  }

  async function claim(raw) {
    if (busy) return;
    const code = extractCode(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code) return;
    busy = true;
    showErr('thScanErr', '');
    try {
      const { ok, data } = await api('scan', { code });
      if (!ok) {
        sfx.error(); buzz([60, 40, 60]);
        showErr('thScanErr', messageFor(data));
        return;
      }
      if (data.event === 'already' || data.event === 'already_finished') {
        if (data.state) applyState(data.state);
        showErr('thScanErr', T('already'));
        return;
      }
      const input = document.getElementById('thCodeInput');
      if (input) input.value = '';
      if (data.event === 'finished') { sfx.finish(); buzz([80, 50, 80, 50, 160]); } else { sfx.capture(); buzz(60); }
      showCapture(data.number, data.split, data.event === 'finished');
      await refresh(true);
      applyState(data.state, { animate: true });
    } catch (err) {
      showErr('thScanErr', T('failed'));
    } finally {
      busy = false;
    }
  }

  // ── Selfies: shrink on the phone, then upload ──
  // A photo the browser can't decode (e.g. HEIC on some phones) is sent as is; the server converts it.
  async function shrink(file) {
    let url = '';
    try {
      url = URL.createObjectURL(file);
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.naturalWidth * k);
      cv.height = Math.round(img.naturalHeight * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.85));
      return blob || file;
    } catch (e) {
      return file;
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  async function onAttach(e) {
    const input = e.currentTarget;
    const file = input.files && input.files[0];
    const leg = Number(input.dataset.attach);
    input.value = '';
    if (file) sendSelfie(leg, await shrink(file));
  }

  // Sends a stop's selfie (blob) and/or written answer.
  async function sendSelfie(leg, blob, answer) {
    if (busy) return;
    if (blob && blob.size > 12 * 1024 * 1024) return showErr(`thSelfieErr-${leg}`, T('selfieTooBig'));
    busy = true;
    uploadingLeg = leg;
    render();
    let err = '';
    try {
      const fd = new FormData();
      if (answer) fd.append('answer', answer);
      if (blob) fd.append('photo', blob, 'selfie.jpg');
      const res = await fetch(`/api/treasure-hunt/${encodeURIComponent(H.tripId)}/selfie/${leg}`, { method: 'POST', credentials: 'same-origin', body: fd });
      const data = await res.json().catch(() => ({}));
      uploadingLeg = null;
      if (!res.ok) {
        sfx.error(); buzz([60, 40, 60]);
        err = messageFor(data);
        if (data.state) applyState(data.state); else render();
        return;
      }
      if (data.event === 'already_finished') { applyState(data.state); return; }
      if (data.event === 'finished') { sfx.finish(); buzz([80, 50, 80, 50, 160]); } else { sfx.capture(); buzz(60); }
      showCapture(leg + 1, data.split, data.event === 'finished', T(blob ? 'selfieSent' : 'answerSent'));
      await refresh(true);
      applyState(data.state, { animate: true });
    } catch (e) {
      uploadingLeg = null;
      render();
      err = T('selfieFailed');
    } finally {
      busy = false;
      uploadingLeg = null;
      if (err) showErr(`thSelfieErr-${leg}`, err);
    }
  }

  // ── Overlays ──
  const overlays = document.createElement('div');
  overlays.innerHTML = `
    <div class="th-capture" id="thCapture" data-open="false" aria-live="assertive"><div class="th-capture__card"><span class="th-capture__gem"><i class="fas fa-check"></i></span><span class="th-kicker" id="thCapKick"></span><strong id="thCapTitle"></strong><span class="th-capture__split"><span>${esc(T('split'))}</span> <b id="thCapSplit" dir="ltr"></b></span></div></div>
    <div class="th-scanner" id="thScanner" data-open="false" role="dialog" aria-modal="true" aria-label="${esc(T('scannerTitle'))}">
      <div class="th-sheet"><div class="th-sheet__head"><h3><i class="fas fa-qrcode" aria-hidden="true"></i> ${esc(T('scannerTitle'))}</h3><button type="button" class="th-x" id="thScanClose" aria-label="${esc(T('close'))}"><i class="fas fa-xmark"></i></button></div>
      <div class="th-reader-wrap"><div id="thReader"></div><div class="th-reader-status" id="thReaderStatus"><i class="fas fa-circle-notch fa-spin"></i><span>${esc(T('scannerStarting'))}</span></div><span class="th-reader-frame" aria-hidden="true"></span></div></div>
    </div>
    <div class="th-scanner th-cam" id="thCam" data-open="false" role="dialog" aria-modal="true" aria-label="${esc(T('cameraTitle'))}">
      <div class="th-sheet"><div class="th-sheet__head"><h3><i class="fas fa-camera" aria-hidden="true"></i> <span id="thCamTitle">${esc(T('cameraTitle'))}</span></h3><button type="button" class="th-x" id="thCamClose" aria-label="${esc(T('close'))}"><i class="fas fa-xmark"></i></button></div>
      <div class="th-cam__view"><video id="thCamVideo" playsinline muted autoplay></video><img id="thCamShot" alt="${esc(T('yourSelfie'))}" hidden><div class="th-reader-status" id="thCamStatus"></div></div>
      <div class="th-cam__row" id="thCamLive"><button type="button" class="th-btn th-btn--ghost th-cam__flip" id="thCamFlip" aria-label="${esc(T('flipCamera'))}"><i class="fas fa-camera-rotate"></i></button><button type="button" class="th-cam__snap" id="thCamSnap" aria-label="${esc(T('snap'))}"><span></span></button><span class="th-cam__spacer"></span></div>
      <div class="th-cam__row th-cam__row--review" id="thCamReview" hidden><button type="button" class="th-btn th-btn--ghost" id="thCamRetake"><i class="fas fa-rotate-left" aria-hidden="true"></i> ${esc(T('retake'))}</button><button type="button" class="th-btn th-btn--solid" id="thCamUse"><i class="fas fa-paper-plane" aria-hidden="true"></i> ${esc(T('useSelfie'))}</button></div>
      </div>
    </div>
    <div class="th-lightbox" id="thLightbox" data-open="false" role="dialog" aria-modal="true"><button type="button" class="th-x" id="thLightClose" aria-label="${esc(T('close'))}"><i class="fas fa-xmark"></i></button><div id="thLightHost"></div></div>
    <canvas class="th-confetti" id="thConfetti" aria-hidden="true"></canvas>`;
  document.body.appendChild(overlays);

  let capTimer = null;
  function showCapture(n, split, isFinal, kicker) {
    const el = document.getElementById('thCapture');
    document.getElementById('thCapKick').textContent = isFinal ? T('treasure') : (kicker || T('cleared'));
    document.getElementById('thCapTitle').textContent = isFinal ? T('victory') : T('stop', { n });
    document.getElementById('thCapSplit').textContent = fmt(split);
    el.dataset.open = 'true';
    clearTimeout(capTimer);
    capTimer = setTimeout(() => { el.dataset.open = 'false'; }, isFinal ? 2200 : 1500);
  }

  function openLightbox(src) {
    const lb = document.getElementById('thLightbox');
    const img = document.createElement('img');
    img.src = src;
    img.alt = T('photoAlt');
    document.getElementById('thLightHost').replaceChildren(img);
    lb.dataset.open = 'true';
  }
  document.getElementById('thLightClose').addEventListener('click', () => { document.getElementById('thLightbox').dataset.open = 'false'; });
  document.getElementById('thLightbox').addEventListener('click', (e) => { if (e.target.id === 'thLightbox') e.currentTarget.dataset.open = 'false'; });

  // ── QR scanner (html5-qrcode, loaded on first use) ──
  let qr = null;
  function loadScanner() {
    if (window.Html5Qrcode) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  function scannerStatus(html) {
    const el = document.getElementById('thReaderStatus');
    el.innerHTML = html;
    el.hidden = !html;
  }
  async function openScanner() {
    const sc = document.getElementById('thScanner');
    sc.dataset.open = 'true';
    scannerStatus(`<i class="fas fa-circle-notch fa-spin"></i><span>${esc(T('scannerStarting'))}</span>`);
    try {
      await loadScanner();
      qr = qr || new window.Html5Qrcode('thReader', { verbose: false });
      await qr.start({ facingMode: 'environment' }, { fps: 10, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.72); return { width: s, height: s }; } }, (text) => {
        closeScanner();
        claim(text);
      }, () => {});
      scannerStatus('');
    } catch (err) {
      scannerStatus(`<i class="fas fa-video-slash"></i><span>${esc(T('scannerBlocked'))}</span>`);
    }
  }
  async function closeScanner() {
    document.getElementById('thScanner').dataset.open = 'false';
    try { if (qr && qr.isScanning) await qr.stop(); } catch (e) { /* already stopped */ }
  }
  document.getElementById('thScanClose').addEventListener('click', closeScanner);
  // ── Selfie camera: front camera in the page, with the phone's own camera as a fallback ──
  let camLeg = null;
  let camStream = null;
  let camFacing = 'user';
  let camBlob = null;
  const camEl = (id) => document.getElementById(id);
  function camStatus(html) { const el = camEl('thCamStatus'); el.innerHTML = html; el.hidden = !html; }
  function camMode(review) {
    camEl('thCamLive').hidden = review;
    camEl('thCamReview').hidden = !review;
    camEl('thCamShot').hidden = !review;
    camEl('thCamVideo').hidden = review;
  }
  function stopStream() { if (camStream) camStream.getTracks().forEach((t) => t.stop()); camStream = null; }
  async function startStream() {
    stopStream();
    camStatus(`<i class="fas fa-circle-notch fa-spin"></i><span>${esc(T('scannerStarting'))}</span>`);
    const video = camEl('thCamVideo');
    video.classList.toggle('is-mirror', camFacing === 'user');
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('no camera api');
      camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: camFacing, width: { ideal: 1600 }, height: { ideal: 1600 } }, audio: false });
      if (camEl('thCam').dataset.open !== 'true') { stopStream(); return; }
      video.srcObject = camStream;
      await video.play().catch(() => {});
      camStatus('');
    } catch (err) {
      // No camera access in the page: let the phone's camera app take it instead.
      camStatus(`<i class="fas fa-video-slash"></i><span>${esc(T('cameraBlocked'))}</span><label class="th-btn th-btn--solid"><i class="fas fa-camera" aria-hidden="true"></i> ${esc(T('openPhoneCamera'))}<input type="file" accept="image/*" capture="user" id="thCamNative" hidden></label>`);
      const nat = camEl('thCamNative');
      nat.addEventListener('change', async () => {
        const f = nat.files && nat.files[0];
        if (!f) return;
        const leg = camLeg;
        closeCamera();
        sendSelfie(leg, await shrink(f));
      });
    }
  }
  function openCamera(leg) {
    const s = state && [state.clue, ...(state.retakes || [])].find((x) => x && x.index === leg);
    if (!s) return;
    camLeg = leg;
    camBlob = null;
    camEl('thCamTitle').textContent = s.isFinish ? T('selfieFinal') : T('selfieStop', { n: s.n });
    camMode(false);
    camEl('thCam').dataset.open = 'true';
    startStream();
  }
  function closeCamera() {
    camEl('thCam').dataset.open = 'false';
    stopStream();
    const shot = camEl('thCamShot');
    if (shot.src && shot.src.startsWith('blob:')) URL.revokeObjectURL(shot.src);
    shot.removeAttribute('src');
    camBlob = null;
  }
  camEl('thCamClose').addEventListener('click', closeCamera);
  camEl('thCamFlip').addEventListener('click', () => { camFacing = camFacing === 'user' ? 'environment' : 'user'; startStream(); });
  camEl('thCamSnap').addEventListener('click', () => {
    const video = camEl('thCamVideo');
    if (!camStream || !video.videoWidth) return;
    const k = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
    const cv = document.createElement('canvas');
    cv.width = Math.round(video.videoWidth * k);
    cv.height = Math.round(video.videoHeight * k);
    const c = cv.getContext('2d');
    // Save the selfie the way it looked on screen (mirrored for the front camera).
    if (camFacing === 'user') { c.translate(cv.width, 0); c.scale(-1, 1); }
    c.drawImage(video, 0, 0, cv.width, cv.height);
    buzz(20);
    // Hold the last frame on screen until the photo has loaded, so the view never goes blank.
    video.pause();
    cv.toBlob((blob) => {
      if (!blob) { video.play().catch(() => {}); return; }
      camBlob = blob;
      const shot = camEl('thCamShot');
      shot.onload = () => { shot.onload = null; camMode(true); stopStream(); };
      shot.src = URL.createObjectURL(blob);
    }, 'image/jpeg', 0.88);
  });
  camEl('thCamRetake').addEventListener('click', () => { camBlob = null; camMode(false); startStream(); });
  camEl('thCamUse').addEventListener('click', () => {
    if (!camBlob) return;
    const blob = camBlob;
    const leg = camLeg;
    closeCamera();
    sendSelfie(leg, blob);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeScanner();
    if (camEl('thCam').dataset.open === 'true') closeCamera();
    document.getElementById('thLightbox').dataset.open = 'false';
  });

  // ── Confetti in the brand colours ──
  function celebrate() {
    if (reduceMotion) return;
    const cv = document.getElementById('thConfetti');
    const c = cv.getContext('2d');
    cv.width = innerWidth; cv.height = innerHeight;
    const colors = ['#DC2626', '#FFFFFF', '#F59E0B', '#EF4444'];
    const bits = Array.from({ length: 140 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 13, vy: -Math.random() * 13 - 4,
      w: 5 + Math.random() * 6, h: 3 + Math.random() * 4, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      color: colors[(Math.random() * colors.length) | 0],
    }));
    const t0 = performance.now();
    (function frame(now) {
      c.clearRect(0, 0, cv.width, cv.height);
      bits.forEach((b) => {
        b.vy += 0.35; b.x += b.vx; b.y += b.vy; b.r += b.vr;
        c.save(); c.translate(b.x, b.y); c.rotate(b.r); c.fillStyle = b.color; c.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); c.restore();
      });
      if (now - t0 < 3200) requestAnimationFrame(frame); else c.clearRect(0, 0, cv.width, cv.height);
    })(t0);
  }

  // ── Live updates: the leaderboard, and teammates' scans on other phones ──
  async function refresh(silent) {
    try {
      const { ok, data } = await api('state');
      if (!ok) return;
      board = data.board;
      const openChanged = data.open !== open;
      open = data.open;
      const sig = (st) => (st && st.cleared ? st.cleared.map((x) => x.status || '').join('|') + st.verified : '');
      const moved = data.state && state && (data.state.progress !== state.progress || data.state.finished !== state.finished || (SELFIE && sig(data.state) !== sig(state)));
      const joined = data.state && !state;
      if (silent) return;
      if (moved || joined) applyState(data.state, { animate: true });
      else if (openChanged) { if (data.state) state = data.state; render(); }
      else {
        const membersChanged = data.state && state && data.state.members.length !== state.members.length;
        if (data.state) { state = Object.assign(state || {}, { members: data.state.members, lifelinesLeft: data.state.lifelinesLeft }); }
        if (membersChanged) render(); else renderBoard();
      }
    } catch (e) { /* offline for a moment */ }
  }
  setInterval(() => { if (!document.hidden && !busy) refresh(); }, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

  let resizeTimer = null;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => drawMap(), 150); });

  render();
  if (pending && state && !state.finished && open) { const c = pending; pending = ''; claim(c); }
})();
