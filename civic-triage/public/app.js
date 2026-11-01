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
function renderTop() {
  const cit = ME && ME.role === 'citizen';
  const tabs = !ME ? [] : cit ? [['feed', '📰 Feed'], ['report', '➕ Report issue'], ['dashboardPage', '📊 Dashboard'], ['profile', '👤 Profile']]
    : [['feed', '📥 Issues'], ['notices', '🔔 Notices'], ['dashboardPage', '📊 Performance'], ['profile', '🏛 Profile']];
  $('#top').innerHTML = `<div class="brand">🇮🇳 Nagrik Sahayak<small>Transparent civic grievance & infrastructure triage</small></div>
  <nav>${tabs.map(([k, l]) => `<button class="${page === k ? 'on' : ''}" onclick="nav('${k}')">${l}</button>`).join('')}</nav>`;
}
function modal(html) { const m = $('#modal'); m.hidden = false; m.innerHTML = `<div class="modal">${html}</div>`; m.onclick = e => { if (e.target === m) closeModal(); }; }
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
function welcome() {
  $('#app').innerHTML = `<div class="card"><h2>Welcome 👋 Who are you?</h2>
  <p class="meta">No passwords. Pick a role, choose your place in India's hierarchy, and start. Citizens are always anonymous to other citizens.</p>
  <div class="roles"><div class="card role" onclick="register('citizen')"><div class="ic">🧑‍🤝‍🧑</div><h3>Citizen</h3><div class="meta">Report issues, upvote, discuss anonymously, track fixes.</div></div>
  <div class="card role" onclick="register('authority')"><div class="ic">🏛️</div><h3>Authority</h3><div class="meta">Receive auto-routed issues for your jurisdiction and department, resolve with proof.</div></div></div>
  <div class="sep"></div><div class="row"><span class="meta">Already have an ID?</span><input id="oldid" placeholder="e.g. CZ-1A2B3C" style="max-width:200px"><button class="btn" onclick="signin()">Continue</button></div></div>`;
}
async function signin() {
  try { ME = await api('GET', '/api/users/' + $('#oldid').value.trim()); localStorage.setItem('uid', ME.id); nav('feed'); } catch (e) { toast(e.message); }
}
let regState;
function register(role) {
  if (typeof role !== 'string') role = 'citizen';
  regState = { role, path: ['India'], ok: false, level: 3 };
  const au = role === 'authority';
  $('#app').innerHTML = `<div class="card"><h2>${au ? '🏛 Register as Authority' : '🧑 Register as Citizen'}</h2>
  ${au ? `<label>Level of authority</label><select id="lvl">${H.levelNames.map((n, i) => `<option value="${i}" ${i === 3 ? 'selected' : ''}>${n} (${['India', 'State / UT', 'District', 'City / Block / ULB'][i]})</option>`).join('')}</select>
  <label>Department</label><select id="dept"><option value="all">All departments</option>${Object.entries(H.depts).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
  <label>Office name (optional)</label><input id="office" placeholder="e.g. Kharagpur Municipality – Roads Wing">` : ''}
  <div id="pick"></div>
  <label>Phone (10 digits)</label><input id="phone" inputmode="numeric" maxlength="14" placeholder="9876543210">
  <label>Email</label><input id="email" type="email" placeholder="you@example.com">
  <div class="row" style="margin-top:14px"><button class="btn" onclick="nav('welcome')">← Back</button><button class="btn pri" id="go" onclick="doRegister()">Create profile</button></div></div>`;
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
  if (ME.suspended || (ME.suspendedUntil > Date.now())) { /* shown on profile and as banner */ }
  $('#app').innerHTML = `<div class="card">
  ${cit && ME.suspendedUntil > Date.now() ? `<div class="warn">⛔ Your account is suspended until ${new Date(ME.suspendedUntil).toLocaleString()} for repeated false reports. You can read but not post, vote or comment.</div>` : ''}
  <div class="row"><h2 class="grow" style="margin:0">${cit ? '📰 Community feed' : '📥 Issue queue – ' + esc(ME.office)}</h2>
  ${cit ? `<button class="btn pri" onclick="nav('report')">➕ Report issue</button>` : ''}</div>
  <p class="meta">${cit ? `Showing issues ${useGps ? `within <b>${filters.radius} km</b> of your live location` : `in <b>${esc(ME.path.slice(-1)[0])}</b> (allow location access to see issues near you)`}. Reports circulate only around their location. ✓ "On-site" = upvoted by someone within ${H.config.confirmM} m (live GPS).` : `Jurisdiction: ${esc(ME.path.join(' › '))} · Dept: ${esc(ME.dept === 'all' ? 'All' : H.depts[ME.dept])}. Issues auto-escalate upward if the SLA lapses.`}</p>
  <div class="row">
   ${cit ? `<select id="f-rad">${[1, 2, 5, 10, 25].map(r => `<option value="${r}" ${filters.radius == r ? 'selected' : ''}>${r} km</option>`).join('')}</select>
   <button class="btn ${useGps ? 'on' : ''}" onclick="toggleGps()">📍 ${useGps ? 'Using live GPS' : 'Use live GPS'}</button>` : `<select id="f-scope"><option value="mine">Assigned to my level</option><option value="all">Everything in jurisdiction</option><option value="removed">Removed (flagged) posts</option></select>`}
   <select id="f-sort">${[['priority', 'Top priority'], ['votes', 'Most upvoted'], ['new', 'Newest'], ['old', 'Oldest']].map(([v, l]) => `<option value="${v}" ${filters.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
   <select id="f-st">${[['open', 'Unresolved'], ['', 'All'], ['resolved', 'Resolved'], ['in_progress', 'In progress']].map(([v, l]) => `<option value="${v}" ${filters.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
   <select id="f-cat"><option value="">All categories</option>${Object.entries(H.cats).map(([k, c]) => `<option value="${k}" ${filters.cat === k ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select>
   <input id="f-q" placeholder="Search…" value="${esc(filters.q)}" style="max-width:160px"></div><div id="fmap" class="map"></div>${legendHtml()}</div><div id="list"><div class="meta">Loading…</div></div>`;
  ['f-rad', 'f-sort', 'f-st', 'f-cat', 'f-scope'].forEach(id => { const e = $('#' + id); if (e) e.onchange = () => { filters.radius = +($('#f-rad') || {}).value || 5; filters.sort = $('#f-sort').value; filters.status = $('#f-st').value; filters.cat = $('#f-cat').value; loadList(); }; });
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
    $('#list').innerHTML = l.length ? l.map(card).join('') : `<div class="card meta">No reports yet. ${cit ? 'Try a bigger radius, or be the first to report one.' : ''}</div>`;
  } catch (e) { $('#list').innerHTML = `<div class="card warn">${esc(e.message)}</div>`; if (/Unknown profile/.test(e.message)) signout(); }
}
function mediaHtml(l) {
  if (!l.length) return '';
  return `<div class="media">${l.map(m => m.type === 'image' ? `<img loading="lazy" src="${m.url}" onclick="window.open('${m.url}')">` : m.type === 'video' ? `<video src="${m.url}" controls preload="metadata"></video>` : `<audio src="${m.url}" controls></audio>`).join('')}</div>`;
}
function card(r) {
  const cit = ME.role === 'citizen';
  return `<div class="card" id="c-${r.id}">
  <div class="row"><span class="chip">${ICON[r.category]} ${esc(r.categoryLabel)}</span><span class="chip sev-${r.severity}">${r.severity}${r.sev ? ' · ' + r.sev + '/5' : ''}</span>${r.needsReview ? '<span class="chip st-claimed">👀 Needs human review</span>' : ''}<span class="chip st-${r.status}">${STAT[r.status]}</span>
  ${r.confirmed ? `<span class="chip st-resolved">✓ ${r.confirmed} on-site</span>` : ''}${r.merged ? `<span class="chip">🔗 ${r.reporters} reports merged</span>` : ''}${r.removed ? '<span class="chip st-open">Removed</span>' : ''}
  <span class="meta grow" style="text-align:right">${ago(r.createdAt)}</span></div>
  <h3 style="margin-top:8px">${esc(r.caption)}</h3>
  ${r.description ? `<div style="white-space:pre-wrap">${esc(r.description)}</div>` : ''}
  ${r.media.length ? mediaHtml(r.media) : `<div class="ph">${ICON[r.category]}</div>`}
  ${r.ai ? `<div class="meta">🤖 AI (${Math.round(r.ai.confidence * 100)}% confident): ${esc(r.ai.reasoning)}</div>` : ''}
  <div class="meta">📍 ${esc(r.address || 'Pinned location')}${r.locSource ? ` · ${LOCSRC[r.locSource] || ''}` : ''}${r.distanceKm != null ? ` · ${r.distanceKm} km away` : ''}<br>
  by <b>${esc(r.author)}</b>${r.mine ? ' (you)' : ''} · Routed to <b>${r.assignedName}</b> · ${esc(r.deptLabel)} · SLA ${r.slaDays}d</div>
  ${r.afterMedia.length ? `<div class="sep"></div><b>Before → After</b><div class="ba"><div>${mediaHtml(r.media.filter(m => m.type === 'image').slice(0, 1))}</div><div>${mediaHtml(r.afterMedia.slice(0, 1))}</div></div>` : ''}
  ${r.verdict ? `<div class="verdict v-${esc(r.verdict.result)}">🤖 <b>${{ verified: 'VERIFIED FIXED', not_fixed: 'NOT FIXED', inconclusive: 'INCONCLUSIVE' }[r.verdict.result] || esc(r.verdict.result)}</b>${r.verdict.by === 'ai' ? ` · AI confidence ${Math.round(r.verdict.confidence * 100)}%` : ` · ${esc(r.verdict.by)}`}${r.verdict.distanceM != null ? ` · ${r.verdict.distanceM} m from spot` : ''}<br>${esc(r.verdict.reason)}</div>` : ''}
  ${(r.status === 'resolved' || r.status === 'claimed') && cit ? `<div class="row" style="margin-top:6px"><span class="meta">Is it really fixed? 👍 ${r.resolutionVotes.ok} · 👎 ${r.resolutionVotes.bad}</span>
    <button class="btn ${r.myResVote === true ? 'on' : ''}" onclick="resVote('${r.id}',true)">✔ Yes fixed</button><button class="btn ${r.myResVote === false ? 'on' : ''}" onclick="resVote('${r.id}',false)">✖ Not fixed</button></div>` : ''}
  <div class="sep"></div>
  <div class="row">
   ${cit ? `<button class="btn ${r.voted ? 'on' : ''}" onclick="upvote('${r.id}')">▲ Upvote · ${r.votes}</button>` : `<span class="chip">▲ ${r.votes} upvotes</span>`}
   <button class="btn" onclick="openThread('${r.id}')">💬 Messages · ${r.comments}</button>
   <button class="btn" onclick="openTimeline('${r.id}')">🧠 Agent trace & timeline</button>
   <span class="grow"></span>
   ${cit && !r.mine && !r.flagged ? `<button class="btn danger" onclick="flag('${r.id}')">🚩 Report false</button>` : ''}${r.flagged ? '<span class="meta">flagged by you</span>' : ''}
   ${!cit && r.status !== 'resolved' ? authActions(r) : ''}</div></div>`;
}
function authActions(r) {
  return `${r.status === 'open' || r.status === 'reopened' ? `<button class="btn" onclick="act('${r.id}','acknowledge')">Acknowledge</button>` : ''}
  ${r.status !== 'in_progress' ? `<button class="btn" onclick="act('${r.id}','start')">Start work</button>` : ''}
  <button class="btn pri" onclick="resolveDialog('${r.id}')">Resolve + after-photo</button>`;
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
  modal(`<h3>🧠 ${esc(r.caption)}</h3>${r.needsReview ? `<div class="warn">👀 Needs human review: ${esc(r.reviewWhy.join('; '))}</div>` : ''}
  ${r.ai && r.ai.evidence && r.ai.evidence.length ? `<div class="meta"><b>Visual evidence:</b> ${r.ai.evidence.map(esc).join(' · ')}</div>` : ''}
  ${traceHtml(r.trace)}
  ${r.verdict && r.verdict.evidence && r.verdict.evidence.length ? `<div class="meta"><b>Fix verification evidence${r.verdict.model ? ' (' + esc(r.verdict.model) + ')' : ''}:</b> ${r.verdict.evidence.map(esc).join(' · ')}</div>` : ''}
  ${r.geo ? `<div class="meta">Address source: ${esc(r.geo.source)}, fetched ${new Date(r.geo.t).toLocaleString()}</div>` : ''}
  <h3 style="margin-top:12px">🕒 Timeline</h3><div class="tl">${r.timeline.map(t => `<div><b>${new Date(t.t).toLocaleString()}</b> – ${esc(t.text)}</div>`).join('')}</div>
  <button class="btn" style="margin-top:10px" onclick="closeModal()">Close</button>`);
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
  $('#app').innerHTML = `<div class="card"><h2>➕ Report a civic issue</h2>
  <p class="meta">Posted anonymously. An AI agent checks the photo, classifies the issue, scores severity, finds duplicates within 150 m and routes it. You will see every step.</p>
  <label>Photos (at least 1) / video / audio, up to 8 *</label><input type="file" accept="image/*,video/*,audio/*" multiple onchange="addFiles(this)">
  <div class="meta" id="mhint">0/8 files · a photo with GPS sets the location automatically</div><div class="media" id="prev"></div>
  <label>Caption *</label><input id="r-cap" maxlength="140" placeholder="One line: what's wrong?">
  <label>Description</label><textarea id="r-desc" rows="3" maxlength="1000" placeholder="Details: how long, who is affected, any danger…"></textarea>
  <label>Category</label><select id="r-cat"><option value="">🤖 Let the AI decide</option>${Object.entries(H.cats).map(([k, c]) => `<option value="${k}">${ICON[k]} ${esc(c.label)}</option>`).join('')}</select>
  <label>Location *</label>
  <div class="meta" id="r-loc">Not set yet. Allow location access, add a photo with GPS, drop a pin on the map, or search an address.</div>
  <div class="row" style="margin-top:6px"><button class="btn" onclick="pinGps()">📍 Use my location</button>
   <input id="r-addr" class="grow" maxlength="200" placeholder="Address / landmark (optional, or search it)"><button class="btn" onclick="findAddr()">🔎 Find</button></div>
  <div id="r-results"></div><div id="r-map" class="map small"></div>
  <div class="row" style="margin-top:12px"><button class="btn" onclick="nav('feed')">Cancel</button><button class="btn pri" id="r-go" onclick="submitReport()">Submit to AI agent</button></div></div>`;
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
    $('#r-results').innerHTML = r.results.map((x, i) => `<div class="pick" onclick="pickAddr(${i})">📍 ${esc(x.display)}</div>`).join('') + `<div class="meta">Source: ${esc(r.source)}</div>`;
  } catch (e) { $('#r-results').innerHTML = `<div class="warn">${esc(e.message)}</div>`; }
}
function pickAddr(i) { const x = window._geo[i]; setRpos(x, 'manual', x.display); $('#r-results').innerHTML = ''; }
function traceHtml(trace) {
  if (!trace || !trace.length) return '';
  const ic = { ok: '✅', warn: '⚠️', fail: '❌', rejected: '⛔', skipped: '⏭️' };
  return `<div class="trace"><b>🧠 Agent trace</b>${trace.map((t, i) => `<div class="tstep ts-${t.status}"><div class="row"><b>${i + 1}. ${esc(t.step)}</b><span>${ic[t.status] || ''} ${esc(t.status)}</span><span class="meta grow" style="text-align:right">${t.ms != null ? (t.ms / 1000).toFixed(1) + 's' : ''}${t.source ? ' · ' + esc(t.source) : ''}</span></div><div>${esc(t.output)}</div></div>`).join('')}</div>`;
}
async function submitReport() {
  if (!pending.some(m => m.type === 'image')) return toast('Add at least one photo');
  if (!rpos) return toast('Set the location first (GPS, photo GPS, map pin or address search)');
  const b = { user: ME.id, category: $('#r-cat').value, caption: $('#r-cap').value, description: $('#r-desc').value, address: $('#r-addr').value, media: pending, lat: rpos.lat, lng: rpos.lng, locSource: rpos.source, gps: rpos.source === 'gps' };
  $('#r-go').disabled = true;
  modal(`<h3>🤖 AI agent is working…</h3><div class="meta">guardrail → perceive → critic → geolocate → dedupe → route → publish</div><div class="spinner"></div>`);
  try {
    const r = await api('POST', '/api/reports', b);
    const rep = r.report;
    modal(`<h3>${r.merged ? '🔗 Merged with an existing report' : '✅ Report published'}</h3>
    <p>${r.merged ? `Someone nearby already reported this. Your report and photos were <b>merged</b> into it (${rep.reporters} reports combined), raising its priority.` : rep.sev ? `AI triage: <b>${esc(rep.categoryLabel)}</b>, <span class="chip sev-${rep.severity}">${rep.severity} · ${rep.sev}/5</span>, SLA ${rep.slaDays} days, routed to the <b>${rep.assignedName}</b> authority (${esc(rep.deptLabel)}).` : `The AI could not triage this confidently, so it is queued for <b>human review</b>.`}</p>
    ${traceHtml(r.trace)}<button class="btn pri" onclick="closeModal();nav('feed')">Go to feed</button>`);
  } catch (e) {
    modal(`<h3>⛔ Not published</h3><p>${esc(e.message)}</p>${traceHtml(e.data && e.data.trace)}<button class="btn" onclick="closeModal()">Back to the form</button>`);
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
  $('#app').innerHTML = `<div class="card"><div class="idcard"><div class="avatar">${cit ? '🧑' : '🏛'}</div><div><h2 style="margin:0">${esc(ME.id)}</h2>
  <div class="meta">${cit ? 'Citizen' : esc(ME.office)} · 📞 ${esc(ME.phone)} · ✉️ ${esc(ME.email)}</div>${!cit ? `<div class="meta">${H.levelNames[ME.level]} level · ${esc(ME.dept === 'all' ? 'All departments' : H.depts[ME.dept])}</div>` : ''}</div></div>
  <div class="sep"></div>
  ${cit ? `<div class="pledge">I, <b>${esc(ME.id)}</b>, pledge to be a sincere and active citizen of ${esc(rev)}. I will report only what I have truly seen, help my neighbours confirm real problems, and never spread false information.</div>`
      : `<div class="pledge">We, <b>${esc(ME.office)}</b>, pledge to serve the people of ${esc(rev)} with transparency – acknowledging every issue, fixing it on time and proving it with photographs.</div>`}
  ${cit ? `<div class="tiles" style="margin-top:12px"><div class="tile"><b>${ME.stats.reports}</b><span>Reports</span></div><div class="tile"><b>${ME.stats.resolved}</b><span>Resolved</span></div><div class="tile"><b>${ME.stats.upvotes}</b><span>Upvotes received</span></div><div class="tile"><b>${ME.strikes}</b><span>Strikes</span></div></div>
  ${ME.suspendedUntil > Date.now() ? `<div class="warn">⛔ Suspended until ${new Date(ME.suspendedUntil).toLocaleString()}</div>` : ''}` : ''}
  <div class="sep"></div><button class="btn danger" onclick="signout()">Sign out (forget this device)</button> <span class="meta">Keep your ID to come back: <b>${esc(ME.id)}</b></span></div>
  ${cit ? `<h3>My reports</h3>${mine.map(card).join('') || '<div class="card meta">You have not reported anything yet.</div>'}` : ''}`;
}
function signout() { localStorage.removeItem('uid'); ME = null; nav('welcome'); }

// ---------- dashboard ----------
let dpath = null, ddepth = 0;
async function dashboardPage() {
  dashboardPage.init = false;
  if (!dpath) dpath = ME.role === 'authority' ? ME.path.slice() : ME.path.slice(0, 3);
  $('#app').innerHTML = `<div class="card"><h2>📊 ${ME.role === 'authority' ? 'Performance dashboard' : 'Public accountability dashboard'}</h2>
  <p class="meta">Choose any level to see how authorities are performing there. <b>Claimed</b> = the department said it is fixed. <b>AI-verified</b> = the AI compared before/after photos and confirmed the fix at the same spot. Performance = 50% verified-fix rate + 30% share of issues within SLA + 20% speed.</p>
  <div id="dpick"></div><label>Rank by level</label><select id="ddepth" style="max-width:260px"></select></div><div id="dbody">Loading…</div>`;
  mountPicker($('#dpick'), { min: 1, max: 5, initial: dpath, onChange: (p) => { const changed = p.join() !== dpath.join(); dpath = p; if (changed || !dashboardPage.init) { dashboardPage.init = true; fillDepth(); loadDash(); } } });
  $('#ddepth').onchange = e => { ddepth = +e.target.value; loadDash(); };
}
function fillDepth() {
  const opts = []; for (let d = dpath.length + 1; d <= 5; d++) opts.push(`<option value="${d}" ${ddepth === d ? 'selected' : ''}>${H.levels[d - 1 + 0] ? ['', 'States / UTs', 'Districts', 'Cities / Blocks', 'Localities'][d - 1] : ''}</option>`);
  if (!opts.length) opts.push('<option value="5">—</option>');
  if (ddepth < dpath.length + 1 || ddepth > 5) ddepth = dpath.length + 1;
  $('#ddepth').innerHTML = opts.join('');
  $('#ddepth').value = Math.min(5, ddepth);
}
async function loadDash() {
  const d = await api('GET', `/api/dashboard?path=${encodeURIComponent(dpath.join('|'))}&depth=${ddepth || ''}`);
  const s = d.summary, mine = ME.path.join('>');
  $('#dbody').innerHTML = `<div class="card"><h3>🗺️ Issues map</h3><div id="dmap" class="map"></div>${legendHtml()}</div><div class="tiles">
  <div class="tile"><b>${s.total}</b><span>Total issues</span></div><div class="tile"><b style="color:var(--ok)">${s.resolved}</b><span>AI-verified fixed</span></div><div class="tile"><b>${s.pending}</b><span>Work left</span></div>
  <div class="tile"><b>${s.inProgress}</b><span>In progress</span></div><div class="tile"><b style="color:var(--bad)">${s.overdue}</b><span>Past SLA</span></div><div class="tile"><b>${s.critical}</b><span>Critical open</span></div>
  <div class="tile"><b>${s.claimedRate}%</b><span>Claimed closure rate</span></div><div class="tile"><b style="color:var(--ok)">${s.verifiedRate}%</b><span>AI-verified closure rate</span></div><div class="tile"><b style="color:var(--bad)">${s.rejected}</b><span>Closure claims rejected by AI</span></div><div class="tile"><b>${s.avgDays ?? '–'}</b><span>Avg days to fix</span></div><div class="tile"><b>${s.perf ?? '–'}</b><span>Performance /100</span></div></div>
  <div class="card"><h3>🏆 Ranking – ${['', 'States / UTs', 'Districts', 'Cities / Blocks', 'Localities'][d.depth - 1]} under ${esc(d.path.join(' › '))}</h3>
  ${d.ranking.length ? `<table><tr><th>#</th><th>Area</th><th>Perf</th><th>Done</th><th>Left</th><th>Past SLA</th><th>Avg days</th></tr>${d.ranking.map(x => `<tr class="${mine.startsWith(x.path.join('>')) ? 'me' : ''}"><td>${x.rank}</td><td><b>${esc(x.name)}</b>${x.trail ? `<div class="meta">${esc(x.trail)}</div>` : ''}${mine.startsWith(x.path.join('>')) ? ' <span class="chip">your area</span>' : ''}</td>
  <td style="min-width:90px"><b>${x.perf}</b><div class="bar"><i style="width:${x.perf}%"></i></div></td><td>${x.resolved}/${x.total}</td><td>${x.pending}</td><td>${x.overdue}</td><td>${x.avgDays ?? '–'}</td></tr>`).join('')}</table>` : '<div class="meta">No reports yet.</div>'}</div>
  <div class="card"><h3>🏢 Department-wise: claimed vs AI-verified closures</h3>${d.depts.length ? `<table><tr><th>Department</th><th>Claimed fixed</th><th>AI-verified</th><th>Gap</th><th>Rejected by AI</th><th>Left</th><th>Past SLA</th></tr>${d.depts.map(x => `<tr><td>${esc(x.label)}</td><td>${x.claimed}/${x.total} <span class="meta">(${x.claimedRate}%)</span></td><td><b style="color:var(--ok)">${x.verified}/${x.total}</b> <span class="meta">(${x.verifiedRate}%)</span><div class="bar"><i style="width:${x.verifiedRate}%"></i></div></td><td>${Math.max(0, x.claimedRate - x.verifiedRate)} pts</td><td>${x.rejected}</td><td>${x.pending}</td><td>${x.overdue}</td></tr>`).join('')}</table>` : '<div class="meta">No reports yet.</div>'}</div>
  <div class="card"><h3>🧩 By issue type</h3>${d.cats.length ? `<table><tr><th>Type</th><th>Total</th><th>Resolved</th><th>Rate</th></tr>${d.cats.map(x => `<tr><td>${ICON[x.cat]} ${esc(x.label)}</td><td>${x.total}</td><td>${x.resolved}</td><td>${x.rate}%</td></tr>`).join('')}</table>` : '<div class="meta">No reports yet.</div>'}</div>`;
  showPins('dmap', d.points || [], GPS);
}
window.nav = nav;
