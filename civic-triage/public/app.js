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
const STAT = { open: 'Open', acknowledged: 'Acknowledged', in_progress: 'In progress', resolved: 'AI-verified fixed', claimed: 'Claimed fixed (unverified)', reopened: 'Reopened' };

let H, ME, page, GPS = null, useGps = false, filters = { radius: 5, sort: 'priority', status: 'open', cat: '', q: '' };

// ---------- boot ----------
(async function () {
  H = await api('GET', '/api/hierarchy');
  const id = localStorage.getItem('uid');
  if (id) { try { ME = await api('GET', '/api/users/' + id); } catch (e) { localStorage.removeItem('uid'); } }
  nav(ME ? 'feed' : 'welcome');
})();

function nav(p) { page = p; renderTop(); ({ welcome, register, feed, report, profile, dashboardPage, notices })[p](); window.scrollTo(0, 0); }
// ---------- icons (inline SVG, Lucide-style strokes) ----------
const ICP = {
  home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  plus: '<circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
  spark: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
  msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m22 4-10 10.01-3-3"/>',
  landmark: '<path d="M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7"/><path d="m12 2 8 5H4z"/>',
  gps: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'
};
const ic = n => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICP[n] || ''}</svg>`;
const TABS_C = [['feed', 'home', 'Feed'], ['report', 'plus', 'Report'], ['dashboardPage', 'chart', 'Dashboard'], ['profile', 'user', 'Profile']];
const TABS_A = [['feed', 'inbox', 'Issues'], ['notices', 'bell', 'Notices'], ['dashboardPage', 'chart', 'Performance'], ['profile', 'landmark', 'Profile']];
function renderTop() {
  const tabs = !ME ? [] : ME.role === 'citizen' ? TABS_C : TABS_A;
  const btns = tabs.map(([k, i, l]) => `<button class="${page === k ? 'on' : ''}" onclick="nav('${k}')">${ic(i)}<span>${l}</span></button>`).join('');
  $('#top').innerHTML = `<div class="topbar"><a class="brand" onclick="nav(ME ? 'feed' : 'welcome')"><span class="logo">${ic('shield')}</span><span><b>Nagrik Sahayak</b><small>AI-verified civic grievances</small></span></a>
  <nav class="topnav">${btns}</nav>${H ? `<span class="aichip ${H.ai ? '' : 'off'}" title="${H.ai ? 'AI agent connected' : 'AI not configured: reports go to human review'}">${ic('spark')}${H.ai ? 'AI live' : 'AI offline'}</span>` : ''}</div>`;
  $('#bottom').innerHTML = tabs.length ? `<nav class="tabbar">${btns}</nav>` : '';
  document.body.classList.toggle('has-tabs', !!tabs.length);
}
function modal(html) { const m = $('#modal'); m.hidden = false; m.innerHTML = `<div class="modal"><button class="mclose" onclick="closeModal()" aria-label="Close">${ic('x')}</button>${html}</div>`; m.onclick = e => { if (e.target === m) closeModal(); }; }
function closeModal() { $('#modal').hidden = true; }

// ---------- location picker (hierarchy) ----------
function nodeAt(p) { let n = H.tree; for (let i = 1; i < p.length; i++) { n = (n.c || []).find(x => x.n === p[i]); if (!n) return null; } return n; }
function mountPicker(el, o) {
  const st = { path: (o.initial || ['India']).slice(), custom: -1 };
  const done = () => st.path.length >= o.min && st.path.every(Boolean);
  function draw() {
    el.innerHTML = '';
    for (let i = 1; i < o.max; i++) {
      const parent = st.custom >= 0 && i > st.custom ? null : nodeAt(st.path.slice(0, i));
      if (st.custom >= 0 && i === st.custom) {
        el.insertAdjacentHTML('beforeend', `<label>${H.levels[i]} (type your own)</label><input data-c="${i}" value="${esc(st.path[i] || '')}" placeholder="Enter name">`);
        break;
      }
      if (!parent || (st.path.length < i)) break;
      const kids = parent.c || [];
      if (!kids.length && i >= o.min) break;
      const cur = st.path[i] || '';
      el.insertAdjacentHTML('beforeend', `<label>${H.levels[i]}</label><select data-i="${i}">
        <option value="">${i >= o.min ? '— stop here —' : '— choose —'}</option>
        ${kids.map(k => `<option ${k.n === cur ? 'selected' : ''}>${esc(k.n)}</option>`).join('')}
        <option value="__c">✏️ Not listed – type my own</option></select>`);
      if (!cur) break;
    }
    el.querySelectorAll('select').forEach(s => s.onchange = () => {
      const i = +s.dataset.i; st.path.length = i; st.custom = -1;
      if (s.value === '__c') { st.custom = i; st.path[i] = ''; } else if (s.value) st.path[i] = s.value;
      draw(); o.onChange(st.path.slice(), done());
    });
    el.querySelectorAll('input[data-c]').forEach(inp => inp.oninput = () => { st.path.length = st.custom; if (inp.value.trim()) st.path[st.custom] = inp.value.trim(); o.onChange(st.path.slice(), done()); });
    o.onChange(st.path.slice(), done());
  }
  draw();
}

// ---------- welcome / register ----------
async function welcome() {
  $('#app').innerHTML = `<section class="hero"><div class="hero-txt">
   <span class="eyebrow">${ic('spark')} Gen AI civic triage · Team NeuroSync</span>
   <h1>Complaints close only when <em>AI verifies the fix</em>.</h1>
   <p class="lead">Report a civic issue with a photo. An AI agent checks it, scores severity, merges duplicates and routes it to the right authority. When they claim it's fixed, the AI compares before and after photos taken at the same spot, so fake closures can't hide.</p>
   <div class="hero-stats" id="hstats"></div></div>
   <div class="roles">
    <button class="role" onclick="register('citizen')"><span class="ri">${ic('users')}</span><b>I'm a citizen</b><span>Report issues, upvote, track the fix</span></button>
    <button class="role" onclick="register('authority')"><span class="ri">${ic('landmark')}</span><b>I'm an authority</b><span>Get routed issues, resolve with proof</span></button>
    <div class="signin"><span class="meta">Already have an ID?</span><div class="row"><input id="oldid" placeholder="e.g. CZ-1A2B3C"><button class="btn" onclick="signin()">Continue</button></div></div>
   </div></section>
  <section class="how">
   <div class="step"><span class="num">1</span><b>Snap & report</b><p>Photo and location. No password; you stay anonymous to other citizens.</p></div>
   <div class="step"><span class="num">2</span><b>AI agent triages</b><p>Guardrail, vision, critic, geolocation, duplicate check and routing, with every step shown.</p></div>
   <div class="step"><span class="num">3</span><b>AI verifies the fix</b><p>Before/after photo comparison plus a distance check. Claimed is not the same as verified.</p></div>
  </section>`;
  try {
    const s = (await api('GET', '/api/dashboard?path=India')).summary;
    if (page === 'welcome' && $('#hstats')) $('#hstats').innerHTML = `<div><b>${s.total}</b><span>issues reported</span></div><div><b>${s.claimed}</b><span>claimed fixed</span></div><div><b class="ok">${s.verified}</b><span>AI-verified fixed</span></div><div><b class="bad">${s.rejected}</b><span>false closure claims caught</span></div>`;
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
  <div class="card form"><div class="formhead"><span class="ri">${ic(au ? 'landmark' : 'users')}</span><div><h2>${au ? 'Register as an authority' : 'Join as a citizen'}</h2><p class="meta">${au ? 'Issues in your jurisdiction and department are routed to you automatically.' : 'No password. Your ID is saved on this device; other citizens only see an anonymous name.'}</p></div></div>
  ${au ? `<label>Level of authority</label><select id="lvl">${H.levelNames.map((n, i) => `<option value="${i}" ${i === 3 ? 'selected' : ''}>${n} (${['India', 'State / UT', 'District', 'City / Block / ULB'][i]})</option>`).join('')}</select>
  <label>Department</label><select id="dept"><option value="all">All departments</option>${Object.entries(H.depts).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
  <label>Office name (optional)</label><input id="office" placeholder="Your office name, exactly as officially published">` : ''}
  <div id="pick"></div>
  <div class="two"><div><label>Phone (10 digits)</label><input id="phone" inputmode="numeric" maxlength="14" placeholder="9876543210"></div>
  <div><label>Email</label><input id="email" type="email" placeholder="you@example.com"></div></div>
  <button class="btn pri lg block" id="go" onclick="doRegister()">Create profile</button></div></div>`;
  const mount = () => mountPicker($('#pick'), { min: au ? regState.level + 1 : 4, max: au ? regState.level + 1 : 5, initial: ['India'], onChange: (p, ok) => { regState.path = p; regState.ok = ok; } });
  if (au) { $('#lvl').onchange = e => { regState.level = +e.target.value; mount(); }; }
  mount();
}
async function doRegister() {
  if (!regState.ok) return toast('Please complete your location selection');
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
  m.getContainer().insertAdjacentHTML('afterend', '<div class="meta" id="r-maphint">Tap the map to drop a pin on the exact spot (drag to adjust).</div>');
}

// ---------- feed ----------
async function feed() {
  const cit = ME.role === 'citizen';
  const opt = (arr, cur) => arr.map(([v, l]) => `<option value="${v}" ${cur == v ? 'selected' : ''}>${l}</option>`).join('');
  $('#app').innerHTML = `${cit && ME.suspendedUntil > Date.now() ? `<div class="warn">Your account is suspended until ${new Date(ME.suspendedUntil).toLocaleString()} for repeated false reports. You can read but not post, vote or comment.</div>` : ''}
  <div class="pagehead"><div><h1>${cit ? (useGps ? 'Issues near you' : 'Community feed') : 'Issue queue'}</h1>
   <p class="meta">${cit ? (useGps ? `Within ${filters.radius} km of your live location. "On-site" means upvoted by someone within ${H.config.confirmM} m.` : `In ${esc(ME.path.slice(-1)[0])}. Allow location access to see issues near you.`) : `${esc(ME.office)} · ${esc(ME.path.slice(1).join(' › '))} · ${esc(ME.dept === 'all' ? 'All departments' : H.depts[ME.dept])}. Issues escalate automatically when the SLA lapses.`}</p></div>
   ${cit ? `<button class="btn pri lg" onclick="nav('report')">${ic('plus')} Report issue</button>` : ''}</div>
  <div class="filters">
   ${cit ? `<button class="pill ${useGps ? 'on' : ''}" onclick="toggleGps()">${ic('gps')} ${useGps ? 'Near me' : 'Use my location'}</button>${useGps ? `<select id="f-rad" class="pill">${opt([1, 2, 5, 10, 25].map(r => [r, r + ' km']), filters.radius)}</select>` : ''}`
      : `<select id="f-scope" class="pill"><option value="mine">Assigned to my level</option><option value="all">Everything in jurisdiction</option><option value="removed">Removed (flagged) posts</option></select>`}
   <select id="f-st" class="pill">${opt([['open', 'Unresolved'], ['', 'All statuses'], ['claimed', 'Claimed fixed'], ['resolved', 'AI-verified fixed'], ['in_progress', 'In progress']], filters.status)}</select>
   <select id="f-sort" class="pill">${opt([['priority', 'Top priority'], ['votes', 'Most upvoted'], ['new', 'Newest'], ['old', 'Oldest']], filters.sort)}</select>
   <select id="f-cat" class="pill"><option value="">All categories</option>${Object.entries(H.cats).map(([k, c]) => `<option value="${k}" ${filters.cat === k ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select>
   <label class="search">${ic('search')}<input id="f-q" placeholder="Search issues" value="${esc(filters.q)}"></label></div>
  <div class="feed-grid"><div id="list"><div class="skel"></div><div class="skel"></div></div>
   <aside class="side"><div class="card mapcard"><div id="fmap" class="map"></div>${legendHtml()}</div></aside></div>`;
  ['f-rad', 'f-sort', 'f-st', 'f-cat', 'f-scope'].forEach(id => { const e = $('#' + id); if (e) e.onchange = () => { filters.radius = +($('#f-rad') || {}).value || filters.radius; filters.sort = $('#f-sort').value; filters.status = $('#f-st').value; filters.cat = $('#f-cat').value; loadList(); }; });
  $('#f-q').oninput = e => { filters.q = e.target.value; clearTimeout(feed.t); feed.t = setTimeout(loadList, 300); };
  loadList();
  if (cit && !feed.asked) { feed.asked = true; curPos().then(p => { if (p && !useGps && page === 'feed') { useGps = true; feed(); } }); }
}
async function toggleGps() {
  if (!useGps) { const p = await curPos(); if (!p) return toast('Location permission denied or unavailable'); useGps = true; } else useGps = false;
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
    $('#list').innerHTML = l.length ? l.map(card).join('') : `<div class="empty">${ic('inbox')}<b>No reports yet</b><span>${cit ? 'Try a bigger radius or other filters, or be the first to report an issue here.' : 'Nothing is waiting in this view.'}</span>${cit ? `<button class="btn pri" onclick="nav('report')">${ic('plus')} Report an issue</button>` : ''}</div>`;
  } catch (e) { $('#list').innerHTML = `<div class="warn">${esc(e.message)}</div>`; if (/Unknown profile/.test(e.message)) signout(); }
}
function mediaHtml(l) {
  if (!l.length) return '';
  return `<div class="media">${l.map(m => m.type === 'image' ? `<img loading="lazy" src="${m.url}" onclick="window.open('${m.url}')" alt="">` : m.type === 'video' ? `<video src="${m.url}" controls preload="metadata"></video>` : `<audio src="${m.url}" controls></audio>`).join('')}</div>`;
}
const VLABEL = { verified: 'AI-verified fixed', not_fixed: 'Not fixed', inconclusive: 'Inconclusive' };
function card(r) {
  const cit = ME.role === 'citizen';
  const img = r.media.find(m => m.type === 'image');
  const dept = r.deptSource ? `<a href="${esc(r.deptSource)}" target="_blank" rel="noopener">${esc(r.deptLabel)}</a>` : esc(r.deptLabel);
  return `<article class="rcard" id="c-${r.id}">
  <div class="rmedia">${img ? `<img loading="lazy" src="${img.url}" onclick="window.open('${img.url}')" alt="Report photo">` : `<div class="ph">${ICON[r.category]}</div>`}
   <span class="badge st-${r.status}">${STAT[r.status]}</span>${r.media.length > 1 ? `<span class="count">+${r.media.length - 1}</span>` : ''}</div>
  <div class="rbody">
   <div class="chips"><span class="chip">${ICON[r.category]} ${esc(r.categoryLabel)}</span><span class="chip sev-${r.severity}">${r.severity}${r.sev ? ' · ' + r.sev + '/5' : ''}</span>${r.needsReview ? '<span class="chip st-claimed">Needs human review</span>' : ''}${r.confirmed ? `<span class="chip st-resolved">✓ ${r.confirmed} on-site</span>` : ''}${r.merged ? `<span class="chip">${r.reporters} reports merged</span>` : ''}${r.removed ? '<span class="chip st-open">Removed</span>' : ''}</div>
   <h3>${esc(r.caption)}</h3>
   ${r.description ? `<p class="desc">${esc(r.description)}</p>` : ''}
   ${r.ai ? `<div class="insight">${ic('spark')}<div><b>AI triage · ${Math.round(r.ai.confidence * 100)}% confident</b><span>${esc(r.ai.reasoning)}</span></div></div>` : ''}
   <div class="metas"><span>${ic('pin')}${esc(r.address || 'Pinned location')}${r.distanceKm != null ? ` · ${r.distanceKm} km away` : ''}${r.locSource ? ` · ${LOCSRC[r.locSource] || ''}` : ''}</span>
    <span>${ic('landmark')}${r.assignedName} authority · ${dept} · SLA ${r.slaDays} days</span>
    <span>${ic('clock')}${ago(r.createdAt)} · ${esc(r.author)}${r.mine ? ' (you)' : ''}</span></div>
   ${r.afterMedia.length ? `<div class="ba"><figure>${img ? `<img src="${img.url}" alt="">` : ''}<figcaption>Before</figcaption></figure><figure><img src="${r.afterMedia[0].url}" alt=""><figcaption>After</figcaption></figure></div>` : ''}
   ${r.verdict ? `<div class="verdict v-${esc(r.verdict.result)}">${ic(r.verdict.result === 'verified' ? 'check' : 'spark')}<div><b>${VLABEL[r.verdict.result] || esc(r.verdict.result)}</b><span class="vmeta">${r.verdict.by === 'ai' ? `AI confidence ${Math.round(r.verdict.confidence * 100)}%` : esc(r.verdict.by)}${r.verdict.distanceM != null ? ` · after-photo ${r.verdict.distanceM} m from spot` : ''}</span><span>${esc(r.verdict.reason)}</span></div></div>` : ''}
   ${(r.status === 'resolved' || r.status === 'claimed') && cit ? `<div class="confirm"><span>Is it really fixed? 👍 ${r.resolutionVotes.ok} · 👎 ${r.resolutionVotes.bad}</span>
    <button class="btn sm ${r.myResVote === true ? 'on' : ''}" onclick="resVote('${r.id}',true)">Yes, fixed</button><button class="btn sm ${r.myResVote === false ? 'on' : ''}" onclick="resVote('${r.id}',false)">Not fixed</button></div>` : ''}
   <div class="actions">
    ${cit ? `<button class="ghost ${r.voted ? 'on' : ''}" onclick="upvote('${r.id}')" title="Upvote">${ic('up')}${r.votes}</button>` : `<span class="ghost">${ic('up')}${r.votes}</span>`}
    <button class="ghost" onclick="openThread('${r.id}')" title="Messages">${ic('msg')}${r.comments}</button>
    <button class="ghost" onclick="openTimeline('${r.id}')">${ic('spark')}Agent trace</button>
    <span class="grow"></span>
    ${cit && !r.mine && !r.flagged ? `<button class="ghost danger" onclick="flag('${r.id}')" title="Report as false">${ic('flag')}</button>` : ''}${r.flagged ? '<span class="meta">flagged by you</span>' : ''}
   </div>
   ${!cit && r.status !== 'resolved' ? `<div class="authbar">${authActions(r)}</div>` : ''}
  </div></article>`;
}
function authActions(r) {
  return `${r.status === 'open' || r.status === 'reopened' ? `<button class="btn" onclick="act('${r.id}','acknowledge')">Acknowledge</button>` : ''}
  ${r.status !== 'in_progress' ? `<button class="btn" onclick="act('${r.id}','start')">Start work</button>` : ''}
  <button class="btn pri" onclick="resolveDialog('${r.id}')">${ic('camera')} Resolve with after-photo</button>`;
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
  modal(`<h3>${esc(r.caption)}</h3><div class="chips" style="margin-bottom:8px"><span class="chip">${ICON[r.category]} ${esc(r.categoryLabel)}</span><span class="chip sev-${r.severity}">${r.severity}${r.sev ? ' · ' + r.sev + '/5' : ''}</span><span class="chip st-${r.status}">${STAT[r.status]}</span></div>${r.needsReview ? `<div class="warn">👀 Needs human review: ${esc(r.reviewWhy.join('; '))}</div>` : ''}
  ${r.ai && r.ai.evidence && r.ai.evidence.length ? `<div class="meta"><b>Visual evidence:</b> ${r.ai.evidence.map(esc).join(' · ')}</div>` : ''}
  ${traceHtml(r.trace)}
  ${r.verdict && r.verdict.evidence && r.verdict.evidence.length ? `<div class="meta"><b>Fix verification evidence${r.verdict.model ? ' (' + esc(r.verdict.model) + ')' : ''}:</b> ${r.verdict.evidence.map(esc).join(' · ')}</div>` : ''}
  ${r.geo ? `<div class="meta">Address source: ${esc(r.geo.source)}, fetched ${new Date(r.geo.t).toLocaleString()}</div>` : ''}
  <h3 style="margin-top:14px">Timeline</h3><div class="tl">${r.timeline.map(t => `<div><b>${new Date(t.t).toLocaleString()}</b> – ${esc(t.text)}</div>`).join('')}</div>
`);
}
async function openThread(id) {
  const r = await api('GET', `/api/reports/${id}?user=${ME.id}`);
  modal(`<h3>💬 Anonymous discussion</h3><div class="meta">Everyone appears under an auto-generated name. Authorities are marked 🏛.</div>
  <div id="msgs">${r.thread.length ? r.thread.map(m => `<div class="msg ${m.official ? 'off' : ''}"><b>${esc(m.name)}</b>${m.mine ? ' (you)' : ''} <span class="meta">${ago(m.t)}</span><br>${esc(m.text)}</div>`).join('') : '<div class="meta">No messages yet.</div>'}</div>
  <div class="row" style="margin-top:8px"><input id="mtext" class="grow" placeholder="Write a message…" maxlength="500"><button class="btn pri" onclick="sendMsg('${id}')">Send</button><button class="btn" onclick="closeModal();loadList()">Close</button></div>`);
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
  p.innerHTML = pending.map((m, i) => `<div style="position:relative;flex:none">${m.type === 'image' ? `<img src="${m.data}">` : m.type === 'video' ? `<video src="${m.data}" controls></video>` : `<audio src="${m.data}" controls></audio>`}<button class="btn" style="position:absolute;top:2px;right:2px;padding:0 6px" onclick="pending.splice(${i},1);renderPrev()">✕</button></div>`).join('');
  const h = $('#mhint'); if (h) h.textContent = `${pending.length}/8 files`;
}

// ---------- report ----------
// Location priority: photo GPS (EXIF) > device GPS > manual (map pin or address search). Never a default location.
let rpos = null;
const LOCSRC = { gps: '📍 device GPS', exif: '📷 photo GPS (EXIF)', manual: '✋ location set manually' };
function setRpos(p, source, label) {
  rpos = { lat: p.lat, lng: p.lng, source };
  const el = $('#r-loc'); if (el) el.innerHTML = `✓ ${LOCSRC[source]}: ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}${label ? ' · ' + esc(label) : ''}`;
  if (window.onRposChange) window.onRposChange(rpos);
}
function report() {
  if (ME.role !== 'citizen') return nav('feed');
  pending = []; rpos = null;
  $('#app').innerHTML = `<div class="narrow"><div class="pagehead"><div><h1>Report an issue</h1><p class="meta">An AI agent checks, classifies, scores and routes your report. You'll see every step it takes.</p></div></div>
  <div class="card form">
   <div class="fstep"><span class="num">1</span><div class="grow"><b>Add a photo</b><p class="meta">At least one photo. A photo with GPS sets the location automatically.</p>
    <label class="drop">${ic('camera')}<span>Take or choose photos</span><small>Up to 8 files · video and audio also accepted</small><input type="file" accept="image/*,video/*,audio/*" multiple onchange="addFiles(this)"></label>
    <div class="meta" id="mhint"></div><div class="media" id="prev"></div></div></div>
   <div class="fstep"><span class="num">2</span><div class="grow"><b>Describe it</b>
    <label>Caption *</label><input id="r-cap" maxlength="140" placeholder="One line: what's wrong?">
    <label>Details</label><textarea id="r-desc" rows="3" maxlength="1000" placeholder="How long has it been like this? Who is affected? Any danger?"></textarea>
    <label>Category</label><select id="r-cat"><option value="">✨ Let the AI decide</option>${Object.entries(H.cats).map(([k, c]) => `<option value="${k}">${ICON[k]} ${esc(c.label)}</option>`).join('')}</select></div></div>
   <div class="fstep"><span class="num">3</span><div class="grow"><b>Where is it?</b>
    <div class="locbox" id="r-loc">Not set yet. Allow location access, add a photo with GPS, drop a pin on the map, or search an address.</div>
    <div class="row locrow"><button class="btn" onclick="pinGps()">${ic('gps')} Use my location</button>
     <label class="search grow">${ic('search')}<input id="r-addr" maxlength="200" placeholder="Search address or landmark" onkeydown="if(event.key==='Enter')findAddr()"></label><button class="btn" onclick="findAddr()">Find</button></div>
    <div id="r-results"></div><div id="r-map" class="map small"></div></div></div>
   <div class="formfoot"><button class="btn" onclick="nav('feed')">Cancel</button><button class="btn pri lg" id="r-go" onclick="submitReport()">${ic('spark')} Submit to AI agent</button></div>
  </div></div>`;
  if (window.mountPinMap) mountPinMap();
  getGps().then(p => { if (p && !rpos && page === 'report') { GPS = p; setRpos(p, 'gps'); } });
}
async function pinGps() { const p = await getGps(); if (!p) return toast('Location permission denied or unavailable. Drop a pin or search an address.'); GPS = p; setRpos(p, 'gps'); }
async function findAddr() {
  const q = $('#r-addr').value.trim(); if (q.length < 3) return toast('Type an address or landmark first');
  $('#r-results').innerHTML = '<div class="meta">Searching OpenStreetMap…</div>';
  try {
    const r = await api('GET', '/api/geocode?q=' + encodeURIComponent(q));
    if (!r.results.length) { $('#r-results').innerHTML = '<div class="meta">No match. Try a nearby landmark, or drop a pin on the map.</div>'; return; }
    window._geo = r.results;
    $('#r-results').innerHTML = r.results.map((x, i) => `<div class="pick" onclick="pickAddr(${i})">${ic('pin')}<span>${esc(x.display)}</span></div>`).join('') + `<div class="meta">Source: ${esc(r.source)}</div>`;
  } catch (e) { $('#r-results').innerHTML = `<div class="warn">${esc(e.message)}</div>`; }
}
function pickAddr(i) { const x = window._geo[i]; setRpos(x, 'manual', x.display); $('#r-results').innerHTML = ''; }
function traceHtml(trace) {
  if (!trace || !trace.length) return '';
  const lab = { ok: 'done', warn: 'warning', fail: 'failed', rejected: 'rejected', skipped: 'skipped' };
  return `<div class="trace"><div class="trace-h">${ic('spark')}<b>Agent trace</b><span class="meta">${trace.length} steps</span></div><ol>${trace.map(t => `<li class="ts-${t.status}"><div class="th"><b>${esc(t.step)}</b><span class="tstat">${lab[t.status] || esc(t.status)}</span><span class="tsrc">${t.ms != null ? (t.ms / 1000).toFixed(1) + 's' : ''}${t.source ? ' · ' + esc(t.source) : ''}</span></div><p>${esc(t.output)}</p></li>`).join('')}</ol></div>`;
}
async function submitReport() {
  if (!pending.some(m => m.type === 'image')) return toast('Add at least one photo');
  if (!rpos) return toast('Set the location first (GPS, photo GPS, map pin or address search)');
  const b = { user: ME.id, category: $('#r-cat').value, caption: $('#r-cap').value, description: $('#r-desc').value, address: $('#r-addr').value, media: pending, lat: rpos.lat, lng: rpos.lng, locSource: rpos.source, gps: rpos.source === 'gps' };
  $('#r-go').disabled = true;
  modal(`<h3>AI agent is working…</h3><div class="spinner"></div><p class="meta" style="text-align:center">guardrail → perceive → critic → geolocate → dedupe → route → publish<br>This usually takes 5–20 seconds.</p>`);
  try {
    const r = await api('POST', '/api/reports', b);
    const rep = r.report;
    modal(`<h3>${r.merged ? 'Merged with an existing report' : 'Report published'}</h3>
    <p>${r.merged ? `Someone nearby already reported this. Your report and photos were <b>merged</b> into it (${rep.reporters} reports combined), raising its priority.` : rep.sev ? `AI triage: <b>${esc(rep.categoryLabel)}</b>, <span class="chip sev-${rep.severity}">${rep.severity} · ${rep.sev}/5</span>, SLA ${rep.slaDays} days, routed to the <b>${rep.assignedName}</b> authority (${esc(rep.deptLabel)}).` : `The AI could not triage this confidently, so it is queued for <b>human review</b>.`}</p>
    ${traceHtml(r.trace)}<button class="btn pri lg block" onclick="closeModal();nav('feed')">Go to feed</button>`);
  } catch (e) {
    modal(`<h3>Not published</h3><p>${esc(e.message)}</p>${traceHtml(e.data && e.data.trace)}<button class="btn" onclick="closeModal()">Back to the form</button>`);
    $('#r-go').disabled = false;
  }
}

// ---------- authority resolve ----------
function resolveDialog(id) {
  pending = [];
  modal(`<h3>Resolve with proof</h3><p class="meta">Upload clear "after" photo(s) taken at the spot. They are checked automatically (duplicate photo / distance${H.ai ? ' / AI visual comparison' : ''}) and then citizens confirm.</p>
  <input type="file" accept="image/*" multiple onchange="addFiles(this)"><div class="meta" id="mhint"></div><div class="media" id="prev"></div>
  <label>Note</label><input id="rnote" placeholder="What was done?">
  <div class="row" style="margin-top:10px"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" id="rgo" onclick="doResolve('${id}')">Submit for verification</button></div>`);
}
async function doResolve(id) {
  $('#rgo').disabled = true; $('#rgo').textContent = 'Verifying…';
  const p = await getGps();
  try {
    const r = await api('POST', `/api/reports/${id}/status`, { user: ME.id, action: 'resolve', note: $('#rnote').value, media: pending, lat: p && p.lat, lng: p && p.lng });
    closeModal(); const v = r.verdict || {}; toast(v.result === 'verified' ? '✅ AI-verified and closed' : v.result === 'not_fixed' ? '❌ Not fixed: ' + v.reason : '⚠️ Inconclusive: recorded as claimed, not verified'); loadList();
  } catch (e) { toast(e.message); $('#rgo').disabled = false; $('#rgo').textContent = 'Submit for verification'; }
}

// ---------- notices (authority) ----------
async function notices() {
  $('#app').innerHTML = '<div class="card"><h2>🔔 Notices</h2><div id="nl">Loading…</div></div>';
  const l = await api('GET', '/api/notices?user=' + ME.id);
  $('#nl').innerHTML = l.length ? l.map(n => `<div class="card"><div class="row"><span class="chip ${n.kind === 'suspension' || n.kind === 'abuse' ? 'st-open' : ''}">${n.kind}</span><span class="chip">${n.status}</span><span class="meta">${ago(n.t)} · ${esc(n.path.slice(2).join(' › '))}</span></div><p>${esc(n.text)}</p>
  ${n.status === 'new' && n.kind === 'abuse' ? `<button class="btn danger" onclick="nres('${n.id}','uphold')">Uphold removal</button> <button class="btn" onclick="nres('${n.id}','dismiss')">Dismiss & restore post</button>` : ''}</div>`).join('') : '<div class="meta">No notices. Abuse alerts, suspensions and community-disputed resolutions appear here.</div>';
}
async function nres(id, action) { try { await api('POST', `/api/notices/${id}/resolve`, { user: ME.id, action }); notices(); } catch (e) { toast(e.message); } }

// ---------- profile ----------
async function profile() {
  ME = await api('GET', '/api/users/' + ME.id);
  const cit = ME.role === 'citizen', loc = ME.path.slice(1);
  const rev = loc.slice().reverse().concat('India').join(', ').replace(/, India, India$/, ', India');
  const mine = cit ? (await api('GET', `/api/reports?user=${ME.id}&radius=100&status=&sort=new`)).filter(r => r.mine) : [];
  $('#app').innerHTML = `<div class="narrow"><div class="card profile"><div class="idcard"><div class="avatar">${ic(cit ? 'user' : 'landmark')}</div><div class="grow"><h2>${esc(ME.id)}</h2>
   <div class="meta">${cit ? 'Citizen' : esc(ME.office)} · ${esc(loc.join(' › '))}</div>${!cit ? `<div class="meta">${H.levelNames[ME.level]} level · ${esc(ME.dept === 'all' ? 'All departments' : H.depts[ME.dept])}</div>` : ''}</div>
   <button class="btn sm" onclick="signout()">${ic('logout')} Sign out</button></div>
  ${cit ? `<div class="tiles"><div class="tile"><b>${ME.stats.reports}</b><span>Reports</span></div><div class="tile"><b class="ok">${ME.stats.resolved}</b><span>AI-verified fixed</span></div><div class="tile"><b>${ME.stats.upvotes}</b><span>Upvotes received</span></div><div class="tile"><b>${ME.strikes}</b><span>Strikes</span></div></div>
  ${ME.suspendedUntil > Date.now() ? `<div class="warn">Suspended until ${new Date(ME.suspendedUntil).toLocaleString()}</div>` : ''}` : ''}
  <div class="pledge">${cit ? `I, <b>${esc(ME.id)}</b>, pledge to be a sincere and active citizen of ${esc(rev)}. I will report only what I have truly seen, help my neighbours confirm real problems, and never spread false information.`
      : `We, <b>${esc(ME.office)}</b>, pledge to serve the people of ${esc(rev)} with transparency: acknowledging every issue, fixing it on time and proving it with photographs.`}</div>
  <p class="meta">Contact (private): ${esc(ME.phone)} · ${esc(ME.email)}. Keep your ID <b>${esc(ME.id)}</b> to sign in on another device.</p></div>
  ${cit ? `<h2 class="sec">My reports</h2>${mine.map(card).join('') || `<div class="empty">${ic('inbox')}<b>No reports yet</b><span>Issues you report will appear here with their AI triage and fix status.</span></div>`}` : ''}</div>`;
}
function signout() { localStorage.removeItem('uid'); ME = null; nav('welcome'); }

// ---------- dashboard ----------
let dpath = null, ddepth = 0;
async function dashboardPage() {
  dashboardPage.init = false;
  if (!dpath) dpath = ME.role === 'authority' ? ME.path.slice() : ME.path.slice(0, 3);
  $('#app').innerHTML = `<div class="pagehead"><div><h1>${ME.role === 'authority' ? 'Performance' : 'Accountability dashboard'}</h1>
   <p class="meta"><b>Claimed</b> = the department says it is fixed. <b>AI-verified</b> = the AI compared before/after photos and confirmed the fix at the same spot. The gap between them is where fake closures hide.</p></div></div>
  <div class="card scope"><div id="dpick" class="pickrow"></div><div><label>Rank by</label><select id="ddepth"></select></div></div><div id="dbody"><div class="skel"></div></div>`;
  mountPicker($('#dpick'), { min: 1, max: 5, initial: dpath, onChange: (p) => { const changed = p.join() !== dpath.join(); dpath = p; if (changed || !dashboardPage.init) { dashboardPage.init = true; fillDepth(); loadDash(); } } });
  $('#ddepth').onchange = e => { ddepth = +e.target.value; loadDash(); };
}
function fillDepth() {
  const opts = []; for (let d = dpath.length + 1; d <= 5; d++) opts.push(`<option value="${d}" ${ddepth === d ? 'selected' : ''}>${['', 'States / UTs', 'Districts', 'Cities / Blocks', 'Localities'][d - 1]}</option>`);
  if (!opts.length) opts.push('<option value="5">—</option>');
  if (ddepth < dpath.length + 1 || ddepth > 5) ddepth = dpath.length + 1;
  $('#ddepth').innerHTML = opts.join('');
  $('#ddepth').value = Math.min(5, ddepth);
}
async function loadDash() {
  const d = await api('GET', `/api/dashboard?path=${encodeURIComponent(dpath.join('|'))}&depth=${ddepth || ''}`);
  const s = d.summary, mine = ME.path.join('>'), gap = Math.max(0, s.claimedRate - s.verifiedRate);
  const tw = html => `<div class="tablewrap"><table>${html}</table></div>`;
  $('#dbody').innerHTML = `<div class="dash-top"><div class="card truth">
    <h3>Claimed vs AI-verified closures</h3><p class="meta">${esc(d.path.join(' › '))} · ${s.total} issue${s.total === 1 ? '' : 's'}</p>
    <div class="cmp"><div class="cmprow"><span>Claimed fixed</span><div class="bar big"><i style="width:${s.claimedRate}%"></i></div><b>${s.claimedRate}%</b></div>
     <div class="cmprow"><span>AI-verified</span><div class="bar big ok"><i style="width:${s.verifiedRate}%"></i></div><b class="ok">${s.verifiedRate}%</b></div></div>
    <div class="gap"><div><b class="${gap ? 'bad' : ''}">${gap} pts</b><span>verification gap</span></div><div><b class="bad">${s.rejected}</b><span>closure claims rejected by AI</span></div><div><b>${s.needsReview || 0}</b><span>in human review</span></div></div></div>
   <div class="card mapcard"><div id="dmap" class="map"></div>${legendHtml()}</div></div>
  <div class="tiles">
   <div class="tile"><b>${s.total}</b><span>Total issues</span></div><div class="tile"><b>${s.pending}</b><span>Work left</span></div><div class="tile"><b>${s.inProgress}</b><span>In progress</span></div>
   <div class="tile"><b class="bad">${s.overdue}</b><span>Past SLA</span></div><div class="tile"><b class="bad">${s.critical}</b><span>Critical open</span></div><div class="tile"><b>${s.avgDays ?? '–'}</b><span>Avg days to verified fix</span></div><div class="tile"><b>${s.perf ?? '–'}</b><span>Performance /100</span></div></div>
  <div class="card"><h3>Departments: claimed vs AI-verified</h3>${d.depts.length ? tw(`<tr><th>Department</th><th>Claimed fixed</th><th>AI-verified</th><th>Gap</th><th>Rejected by AI</th><th>Left</th><th>Past SLA</th></tr>${d.depts.map(x => `<tr><td><b>${esc(x.label)}</b></td><td>${x.claimed}/${x.total} <span class="meta">${x.claimedRate}%</span></td><td><b class="ok">${x.verified}/${x.total}</b> <span class="meta">${x.verifiedRate}%</span><div class="bar ok"><i style="width:${x.verifiedRate}%"></i></div></td><td>${Math.max(0, x.claimedRate - x.verifiedRate)} pts</td><td>${x.rejected}</td><td>${x.pending}</td><td>${x.overdue}</td></tr>`).join('')}`) : '<div class="meta">No reports yet.</div>'}</div>
  <div class="card"><h3>Ranking · ${['', 'States / UTs', 'Districts', 'Cities / Blocks', 'Localities'][d.depth - 1]}</h3><p class="meta">Performance = 50% verified-fix rate + 30% share within SLA + 20% speed.</p>
  ${d.ranking.length ? tw(`<tr><th>#</th><th>Area</th><th>Performance</th><th>Verified</th><th>Left</th><th>Past SLA</th><th>Avg days</th></tr>${d.ranking.map(x => `<tr class="${mine.startsWith(x.path.join('>')) ? 'me' : ''}"><td>${x.rank}</td><td><b>${esc(x.name)}</b>${x.trail ? `<div class="meta">${esc(x.trail)}</div>` : ''}${mine.startsWith(x.path.join('>')) ? ' <span class="chip">your area</span>' : ''}</td>
  <td style="min-width:100px"><b>${x.perf ?? '–'}</b><div class="bar"><i style="width:${x.perf || 0}%"></i></div></td><td>${x.resolved}/${x.total}</td><td>${x.pending}</td><td>${x.overdue}</td><td>${x.avgDays ?? '–'}</td></tr>`).join('')}`) : '<div class="meta">No reports yet.</div>'}</div>
  <div class="card"><h3>By issue type</h3>${d.cats.length ? tw(`<tr><th>Type</th><th>Total</th><th>AI-verified</th><th>Rate</th></tr>${d.cats.map(x => `<tr><td>${ICON[x.cat]} ${esc(x.label)}</td><td>${x.total}</td><td>${x.resolved}</td><td>${x.rate}%</td></tr>`).join('')}`) : '<div class="meta">No reports yet.</div>'}</div>`;
  showPins('dmap', d.points || [], GPS);
}
window.nav = nav;
