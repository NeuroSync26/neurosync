'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const api = async (m, u, b) => {
  const r = await fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { data: j });
  return j;
};
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('show'), 3500); }
const ago = t => { const m = Math.floor((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + 'm ago' : m < 1440 ? Math.floor(m / 60) + 'h ago' : Math.floor(m / 1440) + 'd ago'; };
const ICON = { pothole: '🕳️', bridge: '🌉', water_leak: '💧', sewage: '🚰', pollution: '🏭', garbage: '🗑️', streetlight: '💡', electric_hazard: '⚡', other: '📍' };
const STAT = { open: 'Open', acknowledged: 'Acknowledged', in_progress: 'In progress', resolved: 'Verified fixed', claimed: 'Claimed fixed', reopened: 'Reopened' };

let H, ME, page, GPS = null, useGps = false, filters = { radius: 5, sort: 'priority', status: 'open', cat: '', q: '' };

// ---------- boot ----------
(async function () {
  H = await api('GET', '/api/hierarchy');
  const id = localStorage.getItem('uid');
  if (id) { try { ME = await api('GET', '/api/users/' + id); } catch (e) { localStorage.removeItem('uid'); } }
  nav(ME ? 'feed' : 'welcome');
})();

function nav(p) { page = p; renderTop(); ({ welcome, register, feed, report, profile, dashboardPage, notices })[p](); window.scrollTo(0, 0); }
// ---------- icons (inline SVG) ----------
const ICP = {
  home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
  msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
  xcircle: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
  landmark: '<path d="M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7"/><path d="m12 2 8 5H4z"/>',
  gps: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>'
};
const ic = n => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICP[n] || ''}</svg>`;
// ---------- theme (light / dark, remembers the choice; follows the system until changed) ----------
let themePref = null; try { themePref = localStorage.getItem('theme'); } catch (e) { }
const sysDark = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
function applyTheme() { document.documentElement.dataset.theme = themePref || (sysDark && sysDark.matches ? 'dark' : 'light'); }
if (sysDark && sysDark.addEventListener) sysDark.addEventListener('change', () => { if (!themePref) applyTheme(); });
applyTheme();
function toggleTheme() {
  themePref = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('theme', themePref); } catch (e) { }
  applyTheme(); renderTop();
}
// sorted option lists (alphabetical; "Other" last)
const catsSorted = () => Object.entries(H.cats).sort((a, b) => a[0] === 'other' ? 1 : b[0] === 'other' ? -1 : a[1].label.localeCompare(b[1].label));
const deptsSorted = () => Object.entries(H.depts).sort((a, b) => a[1].localeCompare(b[1]));
const TABS_C = [['feed', 'home', 'Issues'], ['report', 'plus', 'Report'], ['dashboardPage', 'chart', 'Dashboard'], ['profile', 'user', 'Account']];
const TABS_A = [['feed', 'inbox', 'Queue'], ['notices', 'bell', 'Notices'], ['dashboardPage', 'chart', 'Dashboard'], ['profile', 'user', 'Account']];
function renderTop() {
  const tabs = !ME ? [] : ME.role === 'citizen' ? TABS_C : TABS_A;
  const btns = tabs.map(([k, i, l]) => `<button class="${page === k ? 'on' : ''}" onclick="nav('${k}')">${ic(i)}<span>${l}</span></button>`).join('');
  const dark = document.documentElement.dataset.theme === 'dark';
  $('#top').innerHTML = `<div class="topbar"><a class="brand" onclick="nav(ME ? 'feed' : 'welcome')"><span class="logo">${ic('shield')}</span><b>Nagrik Sahayak</b></a>
  <nav class="topnav">${btns}</nav>
  <button class="iconbtn" onclick="toggleTheme()" title="Switch to ${dark ? 'light' : 'dark'} mode" aria-label="Switch to ${dark ? 'light' : 'dark'} mode">${ic(dark ? 'sun' : 'moon')}</button></div>`;
  $('#bottom').innerHTML = tabs.length ? `<nav class="tabbar">${btns}</nav>` : '';
  document.body.classList.toggle('has-tabs', !!tabs.length);
}
function modal(html) { const m = $('#modal'); m.hidden = false; m.innerHTML = `<div class="modal"><button class="mclose" onclick="closeModal()" aria-label="Close">${ic('x')}</button>${html}</div>`; m.onclick = e => { if (e.target === m) closeModal(); }; }
function closeModal() { $('#modal').hidden = true; }

// ---------- location picker (hierarchy) ----------
function nodeAt(p) { let n = H.tree; for (let i = 1; i < p.length; i++) { n = (n.c || []).find(x => x.n === p[i]); if (!n) return null; } return n; }
function mountPicker(el, o) {
  // Only places from the official list can be chosen (no free text); options are alphabetical.
  const st = { path: (o.initial || ['India']).slice() };
  const done = () => st.path.length >= o.min && st.path.every(Boolean);
  function draw() {
    el.innerHTML = '';
    for (let i = 1; i < o.max; i++) {
      const parent = nodeAt(st.path.slice(0, i));
      if (!parent || st.path.length < i) break;
      const kids = (parent.c || []).slice().sort((a, b) => a.n.localeCompare(b.n, 'en'));
      if (!kids.length) break;
      const cur = st.path[i] || '';
      el.insertAdjacentHTML('beforeend', `<div class="field"><label>${H.levels[i]}</label><select data-i="${i}">
        <option value="">${i >= o.min ? 'All' : 'Select'}</option>
        ${kids.map(k => `<option ${k.n === cur ? 'selected' : ''}>${esc(k.n)}</option>`).join('')}</select></div>`);
      if (!cur) break;
    }
    el.querySelectorAll('select').forEach(s => s.onchange = () => {
      const i = +s.dataset.i; st.path.length = i;
      if (s.value) st.path[i] = s.value;
      draw(); o.onChange(st.path.slice(), done());
    });
    o.onChange(st.path.slice(), done());
  }
  draw();
}

// ---------- welcome / register ----------
async function welcome() {
  $('#app').innerHTML = `<section class="hero">
   <div class="kicker">Civic grievance platform</div>
   <h1>Every complaint closed with proof.</h1>
   <p class="lead">Citizens report issues with a photo. An AI agent checks, classifies and routes each report to the responsible authority. A complaint counts as fixed only after the AI matches before and after photos taken at the same spot.</p>
   <div class="cta"><button class="btn pri lg" onclick="register('citizen')">Report an issue ${ic('arrow')}</button><button class="btn lg" onclick="register('authority')">Register as authority</button></div>
   <div class="signin"><span>Have an ID?</span><input id="oldid" placeholder="CZ-1A2B3C" aria-label="Your ID"><button class="btn" onclick="signin()">Sign in</button></div>
  </section>
  <section class="stats" id="hstats"></section>
  <section class="how">
   <div><span class="mono">01</span><b>Report</b><p>Photo and location from GPS, the photo itself, or a map pin.</p></div>
   <div><span class="mono">02</span><b>AI triage</b><p>Content check, image analysis, second review, duplicate check and routing. Every step is recorded.</p></div>
   <div><span class="mono">03</span><b>Verified fix</b><p>Before/after photo comparison plus a distance check. Claimed and verified closures are reported separately.</p></div>
  </section>`;
  try {
    const s = (await api('GET', '/api/dashboard?path=India')).summary;
    if (page === 'welcome' && $('#hstats')) $('#hstats').innerHTML = `<div><b class="mono">${s.total}</b><span>Issues reported</span></div><div><b class="mono">${s.claimed}</b><span>Claimed fixed</span></div><div><b class="mono">${s.verified}</b><span>Verified fixed</span></div><div><b class="mono">${s.rejected}</b><span>False closures caught</span></div>`;
  } catch (e) { /* stats are optional */ }
}
async function signin() {
  try { ME = await api('GET', '/api/users/' + $('#oldid').value.trim()); localStorage.setItem('uid', ME.id); nav('feed'); } catch (e) { toast(e.message); }
}
let regState;
function register(role) {
  if (typeof role !== 'string') role = 'citizen';
  regState = { role, path: ['India'], ok: false, level: 3 };
  const au = role === 'authority';
  $('#app').innerHTML = `<div class="narrow"><button class="back" onclick="nav('welcome')">← Back</button>
  <div class="card form"><h2>${au ? 'Register as authority' : 'Create citizen account'}</h2><p class="meta sub">${au ? 'Reports in your jurisdiction and department are routed to you.' : 'Your ID is stored on this device. Other citizens see you under an anonymous name.'}</p>
  ${au ? `<div class="field"><label>Level</label><select id="lvl">${H.levelNames.map((n, i) => `<option value="${i}" ${i === 3 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
  <div class="field"><label>Department</label><select id="dept"><option value="all">All departments</option>${deptsSorted().map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
  <div class="field"><label>Office name <span class="opt">optional</span></label><input id="office" placeholder="As officially published"></div>` : ''}
  <div id="pick"></div>
  <div class="two"><div class="field"><label>Phone</label><input id="phone" inputmode="numeric" maxlength="14" placeholder="10-digit mobile number"></div>
  <div class="field"><label>Email</label><input id="email" type="email" placeholder="name@example.com"></div></div>
  <button class="btn pri lg block" id="go" onclick="doRegister()">Create account</button></div></div>`;
  const mount = () => mountPicker($('#pick'), { min: au ? regState.level + 1 : 4, max: au ? regState.level + 1 : 5, initial: ['India'], onChange: (p, ok) => { regState.path = p; regState.ok = ok; } });
  if (au) { $('#lvl').onchange = e => { regState.level = +e.target.value; mount(); }; }
  mount();
}
async function doRegister() {
  if (!regState.ok) return toast('Select your location');
  const b = { role: regState.role, path: regState.path, phone: $('#phone').value, email: $('#email').value };
  if (regState.role === 'authority') Object.assign(b, { level: regState.level, dept: $('#dept').value, office: $('#office').value });
  try { ME = await api('POST', '/api/users', b); localStorage.setItem('uid', ME.id); toast('Profile created: ' + ME.id); nav('feed'); } catch (e) { toast(e.message); }
}

// ---------- geolocation ----------
function getGps() {
  return new Promise(res => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res(null), { timeout: 8000, maximumAge: 60000 });
  });
}
async function curPos() { if (!GPS) GPS = await getGps(); return GPS; }

// ---------- maps (Leaflet + OpenStreetMap tiles) ----------
// Centre on the viewer's real location if known; else fit existing reports; else all of India. Never a hardcoded city.
const SEVCOL = { Critical: '#991b1b', High: '#ea580c', Medium: '#ca8a04', Low: '#16a34a', Unrated: '#64748b' };
const INDIA = [[6.5, 68.0], [35.7, 97.4]];
const maps = {};
function makeMap(id) {
  const el = document.getElementById(id);
  if (!window.L || !el) return null;
  if (maps[id]) { try { maps[id].remove(); } catch (e) { } }
  const m = L.map(el, { scrollWheelZoom: false });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(m);
  maps[id] = m; setTimeout(() => m.invalidateSize(), 60);
  return m;
}
function showPins(id, list, center) {
  const m = makeMap(id); if (!m) return;
  const pts = list.filter(r => r.lat != null && r.lng != null);
  for (const r of pts) {
    L.circleMarker([r.lat, r.lng], { radius: 8, color: '#fff', weight: 2, fillColor: SEVCOL[r.severity] || SEVCOL.Unrated, fillOpacity: .95 }).addTo(m)
      .bindPopup(`<b>${esc(r.caption)}</b><br>${esc(r.severity)}${r.sev ? ' · ' + r.sev + '/5' : ''} · ${esc(STAT[r.status] || r.status)}`);
  }
  if (center) { m.setView([center.lat, center.lng], 14); L.circleMarker([center.lat, center.lng], { radius: 6, color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }).addTo(m).bindTooltip('You are here'); }
  else if (pts.length) m.fitBounds(L.latLngBounds(pts.map(r => [r.lat, r.lng])).pad(0.3), { maxZoom: 16 });
  else m.fitBounds(INDIA);
}
const legendHtml = () => window.L ? `<div class="legend">${Object.entries(SEVCOL).map(([k, c]) => `<span><i style="background:${c}"></i>${k}</span>`).join('')}</div>` : '';
// report page: tap the map to drop / move the pin (labelled "location set manually")
function mountPinMap() {
  const m = makeMap('r-map'); if (!m) return;
  let mk = null;
  const place = p => { if (!mk) mk = L.marker([p.lat, p.lng], { draggable: true }).addTo(m).on('dragend', e => { const q = e.target.getLatLng(); setRpos({ lat: q.lat, lng: q.lng }, 'manual', 'pin moved on map'); }); else mk.setLatLng([p.lat, p.lng]); };
  window.onRposChange = p => { if (page !== 'report') return; place(p); m.setView([p.lat, p.lng], Math.max(m.getZoom() || 0, 16)); };
  m.on('click', e => setRpos({ lat: e.latlng.lat, lng: e.latlng.lng }, 'manual', 'pin dropped on map'));
  if (rpos) window.onRposChange(rpos); else if (GPS) m.setView([GPS.lat, GPS.lng], 16); else m.fitBounds(INDIA);
  m.getContainer().insertAdjacentHTML('afterend', '<div class="meta" id="r-maphint" style="margin-top:6px">Tap the map to place the pin. Drag it to adjust.</div>');
}

// ---------- feed ----------
async function feed() {
  const cit = ME.role === 'citizen';
  const opt = (arr, cur) => arr.map(([v, l]) => `<option value="${v}" ${cur == v ? 'selected' : ''}>${l}</option>`).join('');
  $('#app').innerHTML = `${cit && ME.suspendedUntil > Date.now() ? `<div class="note warn">Account suspended until ${new Date(ME.suspendedUntil).toLocaleString()} after repeated false reports. You can read but not post.</div>` : ''}
  <div class="pagehead"><div><h1>${cit ? 'Issues' : 'Queue'}</h1>
   <p class="meta">${cit ? (useGps ? `Within ${filters.radius} km of your location` : esc(ME.path.slice(-1)[0])) : `${esc(ME.office)} · ${esc(ME.path.slice(1).join(' / '))}`}</p></div>
   ${cit ? `<button class="btn pri" onclick="nav('report')">${ic('plus')} New report</button>` : ''}</div>
  <div class="filters">
   ${cit ? `<button class="sel ${useGps ? 'on' : ''}" onclick="toggleGps()">${ic('gps')} ${useGps ? 'Near me' : 'Use location'}</button>${useGps ? `<select id="f-rad" class="sel">${opt([1, 2, 5, 10, 25].map(r => [r, r + ' km']), filters.radius)}</select>` : ''}`
      : `<select id="f-scope" class="sel"><option value="mine">Assigned to my level</option><option value="all">All in jurisdiction</option><option value="removed">Removed posts</option></select>`}
   <select id="f-st" class="sel">${opt([['open', 'Unresolved'], ['', 'All statuses'], ['claimed', 'Claimed fixed'], ['resolved', 'Verified fixed'], ['in_progress', 'In progress']], filters.status)}</select>
   <select id="f-sort" class="sel">${opt([['priority', 'Priority'], ['votes', 'Most upvoted'], ['new', 'Newest'], ['old', 'Oldest']], filters.sort)}</select>
   <select id="f-cat" class="sel"><option value="">All categories</option>${catsSorted().map(([k, c]) => `<option value="${k}" ${filters.cat === k ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select>
   <label class="search">${ic('search')}<input id="f-q" placeholder="Search" value="${esc(filters.q)}"></label></div>
  <div class="feed-grid"><div id="list"><div class="skel"></div><div class="skel"></div></div>
   <aside class="side"><div class="card mapcard"><div id="fmap" class="map"></div>${legendHtml()}</div></aside></div>`;
  ['f-rad', 'f-sort', 'f-st', 'f-cat', 'f-scope'].forEach(id => { const e = $('#' + id); if (e) e.onchange = () => { filters.radius = +($('#f-rad') || {}).value || filters.radius; filters.sort = $('#f-sort').value; filters.status = $('#f-st').value; filters.cat = $('#f-cat').value; loadList(); }; });
  $('#f-q').oninput = e => { filters.q = e.target.value; clearTimeout(feed.t); feed.t = setTimeout(loadList, 300); };
  loadList();
  if (cit && !feed.asked) { feed.asked = true; curPos().then(p => { if (p && !useGps && page === 'feed') { useGps = true; feed(); } }); }
}
async function toggleGps() {
  if (!useGps) { const p = await curPos(); if (!p) return toast('Location access is off. Allow it in your browser settings.'); useGps = true; } else useGps = false;
  feed();
}
async function loadList() {
  const cit = ME.role === 'citizen';
  const p = new URLSearchParams({ user: ME.id, sort: filters.sort, status: filters.status, cat: filters.cat, q: filters.q, radius: filters.radius });
  if (cit && useGps && GPS) { p.set('lat', GPS.lat); p.set('lng', GPS.lng); }
  if (!cit) { const sc = ($('#f-scope') || {}).value || 'mine'; p.set('scope', sc === 'mine' ? 'mine' : 'all'); if (sc === 'removed') p.set('removed', '1'); }
  try {
    const l = await api('GET', '/api/reports?' + p);
    showPins('fmap', l, cit && useGps && GPS ? GPS : null);
    $('#list').innerHTML = l.length ? l.map(card).join('') : `<div class="empty">${ic('inbox')}<b>No reports yet</b><span>${cit ? 'Nothing matches these filters.' : 'Nothing is waiting in this view.'}</span>${cit ? `<button class="btn pri" onclick="nav('report')">${ic('plus')} New report</button>` : ''}</div>`;
  } catch (e) { $('#list').innerHTML = `<div class="note bad">${esc(e.message)}</div>`; if (/Unknown profile/.test(e.message)) signout(); }
}
function mediaHtml(l) {
  if (!l.length) return '';
  return `<div class="media">${l.map(m => m.type === 'image' ? `<img loading="lazy" src="${m.url}" onclick="window.open('${m.url}')" alt="">` : m.type === 'video' ? `<video src="${m.url}" controls preload="metadata"></video>` : `<audio src="${m.url}" controls></audio>`).join('')}</div>`;
}
const VLABEL = { verified: 'Fix verified', not_fixed: 'Not fixed', inconclusive: 'Verification inconclusive' };
const VICON = { verified: 'check', not_fixed: 'xcircle', inconclusive: 'alert' };
function card(r) {
  const cit = ME.role === 'citizen';
  const img = r.media.find(m => m.type === 'image');
  const dept = r.deptSource ? `<a href="${esc(r.deptSource)}" target="_blank" rel="noopener">${esc(r.deptLabel)}</a>` : esc(r.deptLabel);
  return `<article class="rcard" id="c-${r.id}">
  <div class="thumb">${img ? `<img loading="lazy" src="${img.url}" onclick="window.open('${img.url}')" alt="Report photo">` : ic('camera')}${r.media.length > 1 ? `<span class="count">+${r.media.length - 1}</span>` : ''}</div>
  <div class="rbody">
   <div class="rtop"><span class="badge st-${r.status}">${STAT[r.status]}</span><span class="badge sev-${r.severity}">${r.severity}${r.sev ? ' ' + r.sev + '/5' : ''}</span>${r.needsReview ? '<span class="badge st-claimed">Needs review</span>' : ''}<span class="cat">${esc(r.categoryLabel)}</span><span class="time">${ago(r.createdAt)}</span></div>
   <h3>${esc(r.caption)}</h3>
   ${r.description ? `<p class="desc">${esc(r.description)}</p>` : ''}
   ${r.ai ? `<p class="ai"><span class="tag">AI ${Math.round(r.ai.confidence * 100)}%</span>${esc(r.ai.reasoning)}</p>` : ''}
   <div class="metas"><span>${ic('pin')}${esc(r.address || 'Pinned location')}${r.distanceKm != null ? ` · ${r.distanceKm} km` : ''}</span><span>${ic('landmark')}${r.assignedName} · ${dept} · SLA ${r.slaDays}d</span></div>
   ${r.afterMedia.length ? `<div class="ba"><figure>${img ? `<img src="${img.url}" alt="">` : ''}<figcaption>Before</figcaption></figure><figure><img src="${r.afterMedia[0].url}" alt=""><figcaption>After</figcaption></figure></div>` : ''}
   ${r.verdict ? `<div class="verdict v-${esc(r.verdict.result)}">${ic(VICON[r.verdict.result] || 'alert')}<div><b>${VLABEL[r.verdict.result] || esc(r.verdict.result)}</b><span class="vmeta">${r.verdict.by === 'ai' ? `Confidence ${Math.round(r.verdict.confidence * 100)}%` : r.verdict.by === 'integrity' ? 'Integrity check' : 'Not checked by AI'}${r.verdict.distanceM != null ? ` · ${r.verdict.distanceM} m from the reported spot` : ''}</span><span>${esc(r.verdict.reason)}</span></div></div>` : ''}
   ${(r.status === 'resolved' || r.status === 'claimed') && cit ? `<div class="confirm"><span>Is it fixed? ${r.resolutionVotes.ok} yes · ${r.resolutionVotes.bad} no</span><button class="btn sm ${r.myResVote === true ? 'on' : ''}" onclick="resVote('${r.id}',true)">Yes</button><button class="btn sm ${r.myResVote === false ? 'on' : ''}" onclick="resVote('${r.id}',false)">No</button></div>` : ''}
   <div class="actions">
    ${cit ? `<button class="ghost ${r.voted ? 'on' : ''}" onclick="upvote('${r.id}')" title="Upvote">${ic('up')}${r.votes}</button>` : `<span class="ghost">${ic('up')}${r.votes}</span>`}
    <button class="ghost" onclick="openThread('${r.id}')" title="Comments">${ic('msg')}${r.comments}</button>
    <button class="ghost" onclick="openTimeline('${r.id}')">${ic('layers')}AI trace</button>
    <span class="grow"></span>
    ${r.confirmed ? `<span class="meta">${r.confirmed} confirmed on site</span>` : ''}${r.merged ? `<span class="meta">${r.reporters} reports merged</span>` : ''}
    ${cit && !r.mine && !r.flagged ? `<button class="ghost danger" onclick="flag('${r.id}')" title="Report as false">${ic('flag')}</button>` : ''}
   </div>
   ${!cit && r.status !== 'resolved' ? `<div class="authbar">${authActions(r)}</div>` : ''}
  </div></article>`;
}
function authActions(r) {
  return `${r.status === 'open' || r.status === 'reopened' ? `<button class="btn sm" onclick="act('${r.id}','acknowledge')">Acknowledge</button>` : ''}
  ${r.status !== 'in_progress' ? `<button class="btn sm" onclick="act('${r.id}','start')">Start work</button>` : ''}
  <button class="btn sm pri" onclick="resolveDialog('${r.id}')">${ic('camera')} Resolve with photo</button>`;
}
async function upvote(id) {
  const body = { user: ME.id };
  if (useGps && GPS) Object.assign(body, { gps: true, lat: GPS.lat, lng: GPS.lng });
  else { const p = await curPos(); if (p) Object.assign(body, { gps: true, lat: p.lat, lng: p.lng }); }
  try { const v = await api('POST', `/api/reports/${id}/upvote`, body); $('#c-' + id).outerHTML = card({ ...v, distanceKm: null }); await loadList(); } catch (e) { toast(e.message); }
}
async function flag(id) {
  if (!confirm('Flag this post as false / misleading? Posts flagged by ' + H.config.flagsToRemove + ' citizens are removed and the author is reported to authorities.')) return;
  try { const r = await api('POST', `/api/reports/${id}/flag`, { user: ME.id }); toast(r.removed ? 'Post removed and authorities notified' : 'Thanks – flagged'); loadList(); } catch (e) { toast(e.message); }
}
async function resVote(id, ok) { try { await api('POST', `/api/reports/${id}/community-verify`, { user: ME.id, ok }); loadList(); } catch (e) { toast(e.message); } }
async function act(id, action) { try { await api('POST', `/api/reports/${id}/status`, { user: ME.id, action }); toast('Updated'); loadList(); } catch (e) { toast(e.message); } }
async function openTimeline(id) {
  const r = await api('GET', `/api/reports/${id}?user=${ME.id}`);
  modal(`<h3>${esc(r.caption)}</h3><div class="rtop" style="margin-bottom:10px"><span class="badge st-${r.status}">${STAT[r.status]}</span><span class="badge sev-${r.severity}">${r.severity}${r.sev ? ' ' + r.sev + '/5' : ''}</span><span class="cat">${esc(r.categoryLabel)}</span></div>
  ${r.needsReview ? `<div class="note warn">Queued for human review: ${esc(r.reviewWhy.join('; '))}</div>` : ''}
  ${r.ai && r.ai.evidence && r.ai.evidence.length ? `<dl class="kv"><dt>Visual evidence</dt><dd>${r.ai.evidence.map(esc).join('; ')}</dd></dl>` : ''}
  ${traceHtml(r.trace)}
  <dl class="kv">${r.verdict && r.verdict.evidence && r.verdict.evidence.length ? `<dt>Fix evidence</dt><dd>${r.verdict.evidence.map(esc).join('; ')}${r.verdict.model ? ` <span class="meta">(${esc(r.verdict.model)})</span>` : ''}</dd>` : ''}
  ${r.geo ? `<dt>Address source</dt><dd>${esc(r.geo.source)}, ${new Date(r.geo.t).toLocaleString()}</dd>` : ''}
  <dt>Location</dt><dd>${{ gps: 'Device GPS', exif: 'Photo GPS (EXIF)', manual: 'Set manually' }[r.locSource] || '–'}</dd></dl>
  <h4>Timeline</h4><div class="tl">${r.timeline.map(t => `<div><span class="mono">${new Date(t.t).toLocaleString()}</span>${esc(t.text)}</div>`).join('')}</div>`);
}
async function openThread(id) {
  const r = await api('GET', `/api/reports/${id}?user=${ME.id}`);
  modal(`<h3>Comments</h3><p class="meta">Citizens appear under anonymous names. Official replies are marked.</p>
  <div id="msgs">${r.thread.length ? r.thread.map(m => `<div class="msg ${m.official ? 'off' : ''}"><div><b>${esc(m.name.replace(/^🏛 /, ''))}</b>${m.official ? ' <span class="badge st-in_progress">Official</span>' : ''}${m.mine ? ' <span class="meta">(you)</span>' : ''} <span class="meta">${ago(m.t)}</span></div>${esc(m.text)}</div>`).join('') : '<div class="meta">No comments yet.</div>'}</div>
  <div class="row" style="margin-top:10px"><input id="mtext" class="grow" placeholder="Write a comment" maxlength="500"><button class="btn pri" onclick="sendMsg('${id}')">Send</button></div>`);
}
async function sendMsg(id) { const t = $('#mtext').value; if (!t.trim()) return; try { await api('POST', `/api/reports/${id}/comments`, { user: ME.id, text: t }); openThread(id); } catch (e) { toast(e.message); } }

// ---------- photo GPS (EXIF) ----------
// Reads GPS coordinates from a JPEG's EXIF block before the image is resized (resizing strips EXIF).
async function exifGps(file) {
  try {
    if (!/jpe?g/i.test(file.type)) return null;
    const v = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (v.getUint16(0) !== 0xFFD8) return null;
    let o = 2;
    while (o < v.byteLength - 10) {
      const marker = v.getUint16(o), len = v.getUint16(o + 2);
      if ((marker & 0xFF00) !== 0xFF00) return null;
      if (marker === 0xFFE1 && v.getUint32(o + 4) === 0x45786966) return tiffGps(v, o + 10);
      o += 2 + len;
    }
  } catch (e) { /* unreadable EXIF: ignore */ }
  return null;
}
function tiffGps(v, t) {
  const le = v.getUint16(t) === 0x4949, u16 = o => v.getUint16(o, le), u32 = o => v.getUint32(o, le);
  const ifd0 = t + u32(t + 4); let gps = null;
  for (let i = 0, n = u16(ifd0); i < n; i++) { const e = ifd0 + 2 + i * 12; if (u16(e) === 0x8825) gps = t + u32(e + 8); }
  if (!gps) return null;
  const g = {};
  for (let i = 0, n = u16(gps); i < n; i++) {
    const e = gps + 2 + i * 12, tag = u16(e), type = u16(e + 2), cnt = u32(e + 4);
    if (tag === 1 || tag === 3) g[tag] = String.fromCharCode(v.getUint8(e + 8));
    if ((tag === 2 || tag === 4) && type === 5 && cnt === 3) { const p = t + u32(e + 8), r = k => u32(p + k * 8) / u32(p + k * 8 + 4); g[tag] = r(0) + r(1) / 60 + r(2) / 3600; }
  }
  if (g[2] == null || g[4] == null) return null;
  const lat = g[2] * (g[1] === 'S' ? -1 : 1), lng = g[4] * (g[3] === 'W' ? -1 : 1);
  return isFinite(lat) && isFinite(lng) && !(lat === 0 && lng === 0) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

// ---------- image helpers ----------
function readFile(f) {
  return new Promise((res, rej) => {
    if (f.type.startsWith('image/')) {
      const img = new Image(), u = URL.createObjectURL(f);
      img.onload = () => { const s = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = img.width * s; c.height = img.height * s; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); res({ type: 'image', data: c.toDataURL('image/jpeg', .75) }); };
      img.onerror = () => rej(new Error('Cannot read image')); img.src = u;
    } else {
      if (f.size > 10e6) return rej(new Error(f.name + ' is larger than 10 MB'));
      const fr = new FileReader(); fr.onload = () => res({ type: f.type.split('/')[0], data: fr.result }); fr.onerror = rej; fr.readAsDataURL(f);
    }
  });
}
let pending = [];
async function addFiles(inp) {
  for (const f of inp.files) {
    if (pending.length >= 8) break;
    if (page === 'report') { const g = await exifGps(f); if (g && (!rpos || rpos.source !== 'exif')) setRpos(g, 'exif'); }
    try { pending.push(await readFile(f)); } catch (e) { toast(e.message); }
  }
  inp.value = ''; renderPrev();
}
function renderPrev() {
  const p = $('#prev'); if (!p) return;
  p.innerHTML = pending.map((m, i) => `<div style="position:relative;flex:none">${m.type === 'image' ? `<img src="${m.data}">` : m.type === 'video' ? `<video src="${m.data}" controls></video>` : `<audio src="${m.data}" controls></audio>`}<button class="iconbtn" style="position:absolute;top:4px;right:4px;width:24px;height:24px" onclick="pending.splice(${i},1);renderPrev()" aria-label="Remove">${ic('x')}</button></div>`).join('');
  const h = $('#mhint'); if (h) h.textContent = pending.length ? `${pending.length} of 8 files` : '';
}

// ---------- report ----------
// Location priority: photo GPS (EXIF) > device GPS > manual (map pin or address search). Never a default location.
let rpos = null;
const LOCSRC = { gps: 'Device GPS', exif: 'Photo GPS', manual: 'Set manually' };
function setRpos(p, source, label) {
  rpos = { lat: p.lat, lng: p.lng, source };
  const el = $('#r-loc'); if (el) el.innerHTML = `<b>${LOCSRC[source]}</b> · <span class="mono">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</span>${label ? ' · ' + esc(label) : ''}`;
  if (window.onRposChange) window.onRposChange(rpos);
}
function report() {
  if (ME.role !== 'citizen') return nav('feed');
  pending = []; rpos = null;
  $('#app').innerHTML = `<div class="narrow"><div class="pagehead"><div><h1>New report</h1><p class="meta">The AI agent reviews your report and routes it to the responsible authority.</p></div></div>
  <div class="card form">
   <section class="fsec"><div class="fsec-h"><span class="mono">01</span><b>Photo</b></div>
    <label class="drop">${ic('camera')}<span>Take or upload a photo</span><small>At least one photo. Up to 8 files.</small><input type="file" accept="image/*,video/*,audio/*" multiple onchange="addFiles(this)"></label>
    <div class="meta" id="mhint"></div><div class="media" id="prev"></div></section>
   <section class="fsec"><div class="fsec-h"><span class="mono">02</span><b>Details</b></div>
    <div class="field"><label>Title</label><input id="r-cap" maxlength="140" placeholder="e.g. Deep pothole outside the main gate"></div>
    <div class="field"><label>Description <span class="opt">optional</span></label><textarea id="r-desc" rows="3" maxlength="1000"></textarea></div>
    <div class="field"><label>Category</label><select id="r-cat"><option value="">Detect automatically</option>${catsSorted().map(([k, c]) => `<option value="${k}">${esc(c.label)}</option>`).join('')}</select></div></section>
   <section class="fsec"><div class="fsec-h"><span class="mono">03</span><b>Location</b></div>
    <div class="locbox" id="r-loc">Not set</div>
    <div class="row locrow"><button class="btn" onclick="pinGps()">${ic('gps')} Use my location</button>
     <label class="search grow">${ic('search')}<input id="r-addr" maxlength="200" placeholder="Search an address or landmark" onkeydown="if(event.key==='Enter')findAddr()"></label><button class="btn" onclick="findAddr()">Search</button></div>
    <div id="r-results"></div><div id="r-map" class="map small"></div></section>
   <div class="formfoot"><button class="btn" onclick="nav('feed')">Cancel</button><button class="btn pri lg" id="r-go" onclick="submitReport()">Submit report</button></div>
  </div></div>`;
  if (window.mountPinMap) mountPinMap();
  getGps().then(p => { if (p && !rpos && page === 'report') { GPS = p; setRpos(p, 'gps'); } });
}
async function pinGps() { const p = await getGps(); if (!p) return toast('Location access is off. Search an address or drop a pin instead.'); GPS = p; setRpos(p, 'gps'); }
async function findAddr() {
  const q = $('#r-addr').value.trim(); if (q.length < 3) return toast('Type an address or landmark');
  $('#r-results').innerHTML = '<div class="meta">Searching…</div>';
  try {
    const r = await api('GET', '/api/geocode?q=' + encodeURIComponent(q));
    if (!r.results.length) { $('#r-results').innerHTML = '<div class="meta">No results. Try a nearby landmark or drop a pin on the map.</div>'; return; }
    window._geo = r.results;
    $('#r-results').innerHTML = r.results.map((x, i) => `<div class="pick" onclick="pickAddr(${i})">${ic('pin')}<span>${esc(x.display)}</span></div>`).join('');
  } catch (e) { $('#r-results').innerHTML = `<div class="note bad">${esc(e.message)}</div>`; }
}
function pickAddr(i) { const x = window._geo[i]; setRpos(x, 'manual', x.display); $('#r-results').innerHTML = ''; }
const STEPS = [['guardrail', 'Content check'], ['perceive', 'Image analysis'], ['critic', 'Second review'], ['geolocate', 'Address lookup'], ['dedupe', 'Duplicate check'], ['route', 'Priority and routing'], ['publish', 'Publish']];
const STEPNAME = Object.fromEntries(STEPS);
const SICON = { ok: 'check', warn: 'alert', fail: 'xcircle', rejected: 'xcircle', skipped: 'arrow' };
function traceHtml(trace, live) {
  if (!trace || (!trace.length && !live)) return '';
  const rows = live ? STEPS.map(([k]) => trace.find(t => t.step === k) || { step: k, status: 'pending' }) : trace;
  let running = false;
  return `<ol class="trace">${rows.map(t => {
    let st = t.status;
    if (live && st === 'pending' && !running && !trace.some(x => x.status === 'rejected')) { st = 'running'; running = true; }
    return `<li class="ts-${st}"><span class="tdot">${st === 'running' ? '<span class="mini-spin"></span>' : st === 'pending' ? '' : ic(SICON[st] || 'check')}</span><div class="tmain"><div class="th"><b>${STEPNAME[t.step] || esc(t.step)}</b><span class="mono tsrc">${t.ms != null ? (t.ms / 1000).toFixed(1) + 's' : ''}${t.source ? ' · ' + esc(t.source) : ''}</span></div>${t.output ? `<p>${esc(t.output)}</p>` : ''}</div></li>`;
  }).join('')}</ol>`;
}
async function submitReport() {
  if (!pending.some(m => m.type === 'image')) return toast('Add at least one photo');
  if (!$('#r-cap').value.trim()) return toast('Add a title');
  if (!rpos) return toast('Set the location');
  const clientId = 'sub-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const b = { clientId, user: ME.id, category: $('#r-cat').value, caption: $('#r-cap').value, description: $('#r-desc').value, address: $('#r-addr').value, media: pending, lat: rpos.lat, lng: rpos.lng, locSource: rpos.source, gps: rpos.source === 'gps' };
  $('#r-go').disabled = true; $('#r-go').textContent = 'Submitting…';
  modal(`<h3>Processing report</h3><p class="meta">Usually takes 5–20 seconds.</p><div id="prog">${traceHtml([], true)}</div>`);
  let finished = false;
  const done = (r, e) => {
    if (finished) return; finished = true; clearInterval(timer);
    const trace = (r && r.trace) || (e && e.data && e.data.trace) || [];
    if (r) {
      const rep = r.report;
      modal(`<h3>${r.merged ? 'Merged with an existing report' : 'Report submitted'}</h3>
      <p>${r.merged ? `This issue was already reported nearby. Your photos were added to it (${rep.reporters} reports combined) and its priority was raised.` : rep.sev ? `${esc(rep.categoryLabel)} · <span class="badge sev-${rep.severity}">${rep.severity} ${rep.sev}/5</span> · routed to the ${rep.assignedName} authority (${esc(rep.deptLabel)}) with an SLA of ${rep.slaDays} days.` : 'The AI could not assess this report with confidence, so it was queued for human review.'}</p>
      ${traceHtml(trace)}<button class="btn pri lg block" onclick="closeModal();nav('feed')">View issues</button>`);
    } else {
      modal(`<h3>Report not submitted</h3><div class="note bad">${esc(e.message)}</div>${traceHtml(trace)}<button class="btn lg block" onclick="closeModal()">Back to form</button>`);
      if ($('#r-go')) { $('#r-go').disabled = false; $('#r-go').textContent = 'Submit report'; }
    }
  };
  const started = Date.now();
  const timer = setInterval(async () => {
    try {
      const p = await api('GET', '/api/progress/' + clientId);
      if (!finished && $('#prog')) $('#prog').innerHTML = traceHtml(p.trace, true);
      if (p.done) p.error ? done(null, Object.assign(new Error(p.error.message), { data: { trace: p.trace } })) : done(p.result);
    } catch (e) { /* not registered yet, keep polling */ }
    if (Date.now() - started > 180000) done(null, new Error('No response from the server. Check your connection; if the report was saved it will appear under Account.'));
  }, 900);
  try { done(await api('POST', '/api/reports', b)); }
  catch (e) { if (e.data && e.data.error) done(null, e); /* otherwise the connection dropped: keep polling for the result */ }
}

// ---------- authority resolve ----------
function resolveDialog(id) {
  pending = [];
  modal(`<h3>Resolve with proof</h3><p class="meta">Upload a photo taken at the spot after the work. The AI compares it with the original photo and checks the distance before the issue can be marked fixed.</p>
  <label class="drop">${ic('camera')}<span>Upload after photo</span><input type="file" accept="image/*" multiple onchange="addFiles(this)"></label><div class="meta" id="mhint"></div><div class="media" id="prev"></div>
  <div class="field"><label>Work done <span class="opt">optional</span></label><input id="rnote" placeholder="e.g. Pothole filled and levelled"></div>
  <div class="formfoot" style="margin-top:18px"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" id="rgo" onclick="doResolve('${id}')">Submit for verification</button></div>`);
}
async function doResolve(id) {
  $('#rgo').disabled = true; $('#rgo').textContent = 'Verifying…';
  const p = await getGps();
  try {
    const r = await api('POST', `/api/reports/${id}/status`, { user: ME.id, action: 'resolve', note: $('#rnote').value, media: pending, lat: p && p.lat, lng: p && p.lng });
    closeModal(); const v = r.verdict || {}; toast(v.result === 'verified' ? 'Fix verified. Issue closed.' : v.result === 'not_fixed' ? 'Not fixed: ' + v.reason : 'Inconclusive. Recorded as claimed, not verified.'); loadList();
  } catch (e) { toast(e.message); $('#rgo').disabled = false; $('#rgo').textContent = 'Submit for verification'; }
}

// ---------- notices (authority) ----------
async function notices() {
  $('#app').innerHTML = '<div class="pagehead"><div><h1>Notices</h1><p class="meta">Abuse reports, suspensions and disputed closures in your jurisdiction.</p></div></div><div id="nl"><div class="skel"></div></div>';
  const l = await api('GET', '/api/notices?user=' + ME.id);
  $('#nl').innerHTML = l.length ? l.map(n => `<div class="card"><div class="row"><span class="badge ${n.kind === 'suspension' || n.kind === 'abuse' ? 'st-open' : ''}">${n.kind}</span><span class="badge">${n.status}</span><span class="meta">${ago(n.t)} · ${esc(n.path.slice(2).join(' › '))}</span></div><p>${esc(n.text)}</p>
  ${n.status === 'new' && n.kind === 'abuse' ? `<button class="btn danger" onclick="nres('${n.id}','uphold')">Uphold removal</button> <button class="btn" onclick="nres('${n.id}','dismiss')">Dismiss & restore post</button>` : ''}</div>`).join('') : `<div class="empty">${ic('bell')}<b>No notices</b><span>Nothing needs your attention.</span></div>`;
}
async function nres(id, action) { try { await api('POST', `/api/notices/${id}/resolve`, { user: ME.id, action }); notices(); } catch (e) { toast(e.message); } }

// ---------- account ----------
async function profile() {
  ME = await api('GET', '/api/users/' + ME.id);
  const cit = ME.role === 'citizen', loc = ME.path.slice(1);
  const mine = cit ? (await api('GET', `/api/reports?user=${ME.id}&radius=100&status=&sort=new`)).filter(r => r.mine) : [];
  $('#app').innerHTML = `<div class="narrow"><div class="pagehead"><div><h1>Account</h1></div><button class="btn" onclick="signout()">${ic('logout')} Sign out</button></div>
  <div class="card"><dl class="kv wide"><dt>ID</dt><dd class="mono">${esc(ME.id)}</dd><dt>Role</dt><dd>${cit ? 'Citizen' : `${esc(ME.office)} · ${H.levelNames[ME.level]} level · ${esc(ME.dept === 'all' ? 'All departments' : H.depts[ME.dept])}`}</dd>
   <dt>${cit ? 'Area' : 'Jurisdiction'}</dt><dd>${esc(loc.join(' / '))}</dd><dt>Phone</dt><dd>${esc(ME.phone)}</dd><dt>Email</dt><dd>${esc(ME.email)}</dd><dt>Member since</dt><dd>${new Date(ME.createdAt).toLocaleDateString()}</dd></dl>
  ${ME.suspendedUntil > Date.now() ? `<div class="note warn">Suspended until ${new Date(ME.suspendedUntil).toLocaleString()}</div>` : ''}</div>
  ${cit ? `<div class="stats small"><div><b class="mono">${ME.stats.reports}</b><span>Reports</span></div><div><b class="mono">${ME.stats.resolved}</b><span>Verified fixed</span></div><div><b class="mono">${ME.stats.upvotes}</b><span>Upvotes received</span></div><div><b class="mono">${ME.strikes}</b><span>Strikes</span></div></div>
  <h2 class="sec">Your reports</h2>${mine.map(card).join('') || `<div class="empty">${ic('inbox')}<b>No reports yet</b><span>Reports you submit appear here.</span></div>`}` : ''}</div>`;
}
function signout() { localStorage.removeItem('uid'); ME = null; nav('welcome'); }

// ---------- dashboard ----------
let dpath = null, ddepth = 0;
async function dashboardPage() {
  dashboardPage.init = false;
  if (!dpath) dpath = ME.role === 'authority' ? ME.path.slice() : ME.path.slice(0, 3);
  $('#app').innerHTML = `<div class="pagehead"><div><h1>Dashboard</h1><p class="meta">Claimed: marked fixed by the department. Verified: confirmed by AI from before and after photos at the same spot.</p></div></div>
  <div class="card scope"><div id="dpick" class="pickrow"></div><div class="field"><label>Group by</label><select id="ddepth"></select></div></div><div id="dbody"><div class="skel"></div></div>`;
  mountPicker($('#dpick'), { min: 1, max: 5, initial: dpath, onChange: (p) => { const changed = p.join() !== dpath.join(); dpath = p; if (changed || !dashboardPage.init) { dashboardPage.init = true; fillDepth(); loadDash(); } } });
  $('#ddepth').onchange = e => { ddepth = +e.target.value; loadDash(); };
}
function fillDepth() {
  const opts = []; for (let d = dpath.length + 1; d <= 5; d++) opts.push(`<option value="${d}" ${ddepth === d ? 'selected' : ''}>${['', 'State', 'District', 'City', 'Locality'][d - 1]}</option>`);
  if (!opts.length) opts.push('<option value="5">–</option>');
  if (ddepth < dpath.length + 1 || ddepth > 5) ddepth = dpath.length + 1;
  $('#ddepth').innerHTML = opts.join('');
  $('#ddepth').value = Math.min(5, ddepth);
}
async function loadDash() {
  const d = await api('GET', `/api/dashboard?path=${encodeURIComponent(dpath.join('|'))}&depth=${ddepth || ''}`);
  const s = d.summary, mine = ME.path.join('>'), gap = Math.max(0, s.claimedRate - s.verifiedRate);
  const tw = html => `<div class="tablewrap"><table>${html}</table></div>`;
  const sorted = d.depts.slice().sort((a, b) => a.label.localeCompare(b.label)), cats = d.cats.slice().sort((a, b) => a.label.localeCompare(b.label));
  $('#dbody').innerHTML = `<div class="stats">
   <div><b class="mono">${s.total}</b><span>Issues</span></div><div><b class="mono">${s.claimedRate}%</b><span>Claimed closure rate</span></div>
   <div><b class="mono ok">${s.verifiedRate}%</b><span>Verified closure rate</span></div><div><b class="mono ${gap ? 'bad' : ''}">${gap} pts</b><span>Verification gap</span></div>
   <div><b class="mono">${s.rejected}</b><span>Closures rejected by AI</span></div><div><b class="mono">${s.overdue}</b><span>Past SLA</span></div></div>
  <div class="dash-top"><div class="card truth"><h3>Claimed vs verified</h3><p class="meta">${esc(d.path.slice(1).join(' / ') || 'India')}</p>
    <div class="cmprow"><span>Claimed</span><div class="bar"><i style="width:${s.claimedRate}%"></i></div><b class="mono">${s.claimedRate}%</b></div>
    <div class="cmprow"><span>Verified</span><div class="bar ok"><i style="width:${s.verifiedRate}%"></i></div><b class="mono">${s.verifiedRate}%</b></div>
    <dl class="kv"><dt>Open</dt><dd class="mono">${s.pending}</dd><dt>In progress</dt><dd class="mono">${s.inProgress}</dd><dt>Critical open</dt><dd class="mono">${s.critical}</dd><dt>In human review</dt><dd class="mono">${s.needsReview || 0}</dd><dt>Avg. days to verified fix</dt><dd class="mono">${s.avgDays ?? '–'}</dd><dt>Performance</dt><dd class="mono">${s.perf ?? '–'} / 100</dd></dl></div>
   <div class="card mapcard"><div id="dmap" class="map"></div>${legendHtml()}</div></div>
  <div class="card"><h3>Departments</h3>${sorted.length ? tw(`<tr><th>Department</th><th>Claimed</th><th>Verified</th><th>Gap</th><th>Rejected</th><th>Open</th><th>Past SLA</th></tr>${sorted.map(x => `<tr><td>${esc(x.label)}</td><td class="mono">${x.claimed}/${x.total}</td><td><span class="mono">${x.verified}/${x.total}</span><div class="bar ok thin"><i style="width:${x.verifiedRate}%"></i></div></td><td class="mono">${Math.max(0, x.claimedRate - x.verifiedRate)} pts</td><td class="mono">${x.rejected}</td><td class="mono">${x.pending}</td><td class="mono">${x.overdue}</td></tr>`).join('')}`) : '<p class="meta">No reports yet.</p>'}</div>
  <div class="card"><h3>Ranking by ${['', 'state', 'district', 'city', 'locality'][d.depth - 1]}</h3><p class="meta">Performance: 50% verified-fix rate, 30% within SLA, 20% speed.</p>
  ${d.ranking.length ? tw(`<tr><th>#</th><th>Area</th><th>Performance</th><th>Verified</th><th>Open</th><th>Past SLA</th><th>Avg. days</th></tr>${d.ranking.map(x => `<tr class="${mine.startsWith(x.path.join('>')) ? 'me' : ''}"><td class="mono">${x.rank}</td><td>${esc(x.name)}${x.trail ? `<div class="meta">${esc(x.trail)}</div>` : ''}</td>
  <td style="min-width:110px"><span class="mono">${x.perf ?? '–'}</span><div class="bar thin"><i style="width:${x.perf || 0}%"></i></div></td><td class="mono">${x.resolved}/${x.total}</td><td class="mono">${x.pending}</td><td class="mono">${x.overdue}</td><td class="mono">${x.avgDays ?? '–'}</td></tr>`).join('')}`) : '<p class="meta">No reports yet.</p>'}</div>
  <div class="card"><h3>Categories</h3>${cats.length ? tw(`<tr><th>Category</th><th>Total</th><th>Verified</th><th>Rate</th></tr>${cats.map(x => `<tr><td>${esc(x.label)}</td><td class="mono">${x.total}</td><td class="mono">${x.resolved}</td><td class="mono">${x.rate}%</td></tr>`).join('')}`) : '<p class="meta">No reports yet.</p>'}</div>`;
  showPins('dmap', d.points || [], GPS);
}
window.nav = nav;
