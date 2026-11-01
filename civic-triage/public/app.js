'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const api = async (m, u, b) => {
  const r = await fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
};
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('show'), 3500); }
const ago = t => { const m = Math.floor((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + 'm ago' : m < 1440 ? Math.floor(m / 60) + 'h ago' : Math.floor(m / 1440) + 'd ago'; };
const ICON = { pothole: '🕳️', bridge: '🌉', water_leak: '💧', sewage: '🚰', pollution: '🏭', garbage: '🗑️', streetlight: '💡', electric_hazard: '⚡', other: '📍' };
const STAT = { open: 'Open', acknowledged: 'Acknowledged', in_progress: 'In progress', resolved: 'Resolved', reopened: 'Reopened' };

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

// ---------- feed ----------
async function feed() {
  const cit = ME.role === 'citizen';
  if (ME.suspended || (ME.suspendedUntil > Date.now())) { /* shown on profile and as banner */ }
  $('#app').innerHTML = `<div class="card">
  ${cit && ME.suspendedUntil > Date.now() ? `<div class="warn">⛔ Your account is suspended until ${new Date(ME.suspendedUntil).toLocaleString()} for repeated false reports. You can read but not post, vote or comment.</div>` : ''}
  <div class="row"><h2 class="grow" style="margin:0">${cit ? '📰 Community feed' : '📥 Issue queue – ' + esc(ME.office)}</h2>
  ${cit ? `<button class="btn pri" onclick="nav('report')">➕ Report issue</button>` : ''}</div>
  <p class="meta">${cit ? `Showing issues within <b>${filters.radius} km</b> of ${useGps ? 'your live GPS location' : esc(ME.path.slice(-1)[0])}. Reports circulate only around their location. ✓ "On-site" = upvoted by someone within ${H.config.confirmM} m (live GPS).` : `Jurisdiction: ${esc(ME.path.join(' › '))} · Dept: ${esc(ME.dept === 'all' ? 'All' : H.depts[ME.dept])}. Issues auto-escalate upward if the SLA lapses.`}</p>
  <div class="row">
   ${cit ? `<select id="f-rad">${[1, 2, 5, 10, 25].map(r => `<option value="${r}" ${filters.radius == r ? 'selected' : ''}>${r} km</option>`).join('')}</select>
   <button class="btn ${useGps ? 'on' : ''}" onclick="toggleGps()">📍 ${useGps ? 'Using live GPS' : 'Use live GPS'}</button>` : `<select id="f-scope"><option value="mine">Assigned to my level</option><option value="all">Everything in jurisdiction</option><option value="removed">Removed (flagged) posts</option></select>`}
   <select id="f-sort">${[['priority', 'Top priority'], ['votes', 'Most upvoted'], ['new', 'Newest'], ['old', 'Oldest']].map(([v, l]) => `<option value="${v}" ${filters.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
   <select id="f-st">${[['open', 'Unresolved'], ['', 'All'], ['resolved', 'Resolved'], ['in_progress', 'In progress']].map(([v, l]) => `<option value="${v}" ${filters.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
   <select id="f-cat"><option value="">All categories</option>${Object.entries(H.cats).map(([k, c]) => `<option value="${k}" ${filters.cat === k ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select>
   <input id="f-q" placeholder="Search…" value="${esc(filters.q)}" style="max-width:160px"></div></div><div id="list"><div class="meta">Loading…</div></div>`;
  ['f-rad', 'f-sort', 'f-st', 'f-cat', 'f-scope'].forEach(id => { const e = $('#' + id); if (e) e.onchange = () => { filters.radius = +($('#f-rad') || {}).value || 5; filters.sort = $('#f-sort').value; filters.status = $('#f-st').value; filters.cat = $('#f-cat').value; loadList(); }; });
  $('#f-q').oninput = e => { filters.q = e.target.value; clearTimeout(feed.t); feed.t = setTimeout(loadList, 300); };
  loadList();
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
    $('#list').innerHTML = l.length ? l.map(card).join('') : `<div class="card meta">No issues match. ${cit ? 'Try a bigger radius, or be the first to report one.' : ''}</div>`;
  } catch (e) { $('#list').innerHTML = `<div class="card warn">${esc(e.message)}</div>`; if (/Unknown profile/.test(e.message)) signout(); }
}
function mediaHtml(l) {
  if (!l.length) return '';
  return `<div class="media">${l.map(m => m.type === 'image' ? `<img loading="lazy" src="${m.url}" onclick="window.open('${m.url}')">` : m.type === 'video' ? `<video src="${m.url}" controls preload="metadata"></video>` : `<audio src="${m.url}" controls></audio>`).join('')}</div>`;
}
function card(r) {
  const cit = ME.role === 'citizen';
  return `<div class="card" id="c-${r.id}">
  <div class="row"><span class="chip">${ICON[r.category]} ${esc(r.categoryLabel)}</span><span class="chip sev-${r.severity}">${r.severity} · ${r.score}</span><span class="chip st-${r.status}">${STAT[r.status]}</span>
  ${r.confirmed ? `<span class="chip st-resolved">✓ ${r.confirmed} on-site</span>` : ''}${r.merged ? `<span class="chip">🔗 ${r.reporters} reports merged</span>` : ''}${r.removed ? '<span class="chip st-open">Removed</span>' : ''}${r.demo ? '<span class="chip">demo data</span>' : ''}
  <span class="meta grow" style="text-align:right">${ago(r.createdAt)}</span></div>
  <h3 style="margin-top:8px">${esc(r.caption)}</h3>
  ${r.description ? `<div style="white-space:pre-wrap">${esc(r.description)}</div>` : ''}
  ${r.media.length ? mediaHtml(r.media) : `<div class="ph">${ICON[r.category]}</div>`}
  <div class="meta">📍 ${esc(r.address)} · ${esc(r.path.slice(2).join(' › '))}${r.distanceKm != null ? ` · ${r.distanceKm} km away` : ''}<br>
  by <b>${esc(r.author)}</b>${r.mine ? ' (you)' : ''} · Routed to <b>${r.assignedName}</b> · ${esc(r.deptLabel)} · SLA ${r.slaDays}d</div>
  ${r.afterMedia.length ? `<div class="sep"></div><b>Before → After</b><div class="ba"><div>${mediaHtml(r.media.filter(m => m.type === 'image').slice(0, 1))}</div><div>${mediaHtml(r.afterMedia.slice(0, 1))}</div></div>` : ''}
  ${r.verdict ? `<div class="meta">🤖 Verification (${esc(r.verdict.by)}): ${esc(r.verdict.reason)}</div>` : ''}
  ${r.status === 'resolved' && cit ? `<div class="row" style="margin-top:6px"><span class="meta">Is it really fixed? 👍 ${r.resolutionVotes.ok} · 👎 ${r.resolutionVotes.bad}</span>
    <button class="btn ${r.myResVote === true ? 'on' : ''}" onclick="resVote('${r.id}',true)">✔ Yes fixed</button><button class="btn ${r.myResVote === false ? 'on' : ''}" onclick="resVote('${r.id}',false)">✖ Not fixed</button></div>` : ''}
  <div class="sep"></div>
  <div class="row">
   ${cit ? `<button class="btn ${r.voted ? 'on' : ''}" onclick="upvote('${r.id}')">▲ Upvote · ${r.votes}</button>` : `<span class="chip">▲ ${r.votes} upvotes</span>`}
   <button class="btn" onclick="openThread('${r.id}')">💬 Messages · ${r.comments}</button>
   <button class="btn" onclick="openTimeline('${r.id}')">🕒 Timeline</button>
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
  modal(`<h3>🕒 ${esc(r.caption)}</h3><div class="tl">${r.timeline.map(t => `<div><b>${new Date(t.t).toLocaleString()}</b> – ${esc(t.text)}</div>`).join('')}</div>
  ${r.ai ? `<p class="meta">🤖 AI image check: severity ${r.ai.severity}/10 – ${esc(r.ai.summary)}</p>` : ''}<button class="btn" onclick="closeModal()">Close</button>`);
}
async function openThread(id) {
  const r = await api('GET', `/api/reports/${id}?user=${ME.id}`);
  modal(`<h3>💬 Anonymous discussion</h3><div class="meta">Everyone appears under an auto-generated name. Authorities are marked 🏛.</div>
  <div id="msgs">${r.thread.length ? r.thread.map(m => `<div class="msg ${m.official ? 'off' : ''}"><b>${esc(m.name)}</b>${m.mine ? ' (you)' : ''} <span class="meta">${ago(m.t)}</span><br>${esc(m.text)}</div>`).join('') : '<div class="meta">No messages yet.</div>'}</div>
  <div class="row" style="margin-top:8px"><input id="mtext" class="grow" placeholder="Write a message…" maxlength="500"><button class="btn pri" onclick="sendMsg('${id}')">Send</button><button class="btn" onclick="closeModal();loadList()">Close</button></div>`);
}
async function sendMsg(id) { const t = $('#mtext').value; if (!t.trim()) return; try { await api('POST', `/api/reports/${id}/comments`, { user: ME.id, text: t }); openThread(id); } catch (e) { toast(e.message); } }

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
  for (const f of inp.files) { if (pending.length >= 8) break; try { pending.push(await readFile(f)); } catch (e) { toast(e.message); } }
  inp.value = ''; renderPrev();
}
function renderPrev() {
  const p = $('#prev'); if (!p) return;
  p.innerHTML = pending.map((m, i) => `<div style="position:relative;flex:none">${m.type === 'image' ? `<img src="${m.data}">` : m.type === 'video' ? `<video src="${m.data}" controls></video>` : `<audio src="${m.data}" controls></audio>`}<button class="btn" style="position:absolute;top:2px;right:2px;padding:0 6px" onclick="pending.splice(${i},1);renderPrev()">✕</button></div>`).join('');
  const h = $('#mhint'); if (h) h.textContent = `${pending.length}/8 files · more photos raise the priority score`;
}

// ---------- report ----------
let rpos = null;
function report() {
  if (ME.role !== 'citizen') return nav('feed');
  pending = []; rpos = null;
  $('#app').innerHTML = `<div class="card"><h2>➕ Report a civic issue</h2>
  <p class="meta">Posted anonymously in <b>${esc(ME.path.slice(2).join(' › '))}</b>. It circulates within ${H.config.circulationKm} km so neighbours can upvote and confirm it. Duplicate reports of the same problem nearby are merged automatically.</p>
  <label>Category *</label><select id="r-cat">${Object.entries(H.cats).map(([k, c]) => `<option value="${k}">${ICON[k]} ${esc(c.label)}</option>`).join('')}</select>
  <label>Caption *</label><input id="r-cap" maxlength="140" placeholder="One line: what's wrong?">
  <label>Description</label><textarea id="r-desc" rows="3" maxlength="1000" placeholder="Details: how long, who is affected, any danger…"></textarea>
  <label>Address / landmark *</label><input id="r-addr" maxlength="200" placeholder="e.g. Opposite Gate 2, Malancha Road">
  <label>Exact location</label><div class="row"><button class="btn" onclick="pinGps()">📍 Use my live GPS</button><span class="meta" id="r-loc">Using centre of ${esc(ME.path.slice(-1)[0])} (less accurate – GPS recommended)</span></div>
  <label>Photos / video / audio (up to 8)</label><input type="file" accept="image/*,video/*,audio/*" multiple onchange="addFiles(this)">
  <div class="meta" id="mhint">0/8 files · more photos raise the priority score</div><div class="media" id="prev"></div>
  <div class="row" style="margin-top:12px"><button class="btn" onclick="nav('feed')">Cancel</button><button class="btn pri" id="r-go" onclick="submitReport()">Submit report</button></div></div>`;
}
async function pinGps() { const p = await getGps(); if (!p) return toast('Could not get location'); rpos = p; GPS = p; $('#r-loc').textContent = `✓ Live location locked (${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})`; }
async function submitReport() {
  const b = { user: ME.id, category: $('#r-cat').value, caption: $('#r-cap').value, description: $('#r-desc').value, address: $('#r-addr').value, media: pending };
  if (rpos) Object.assign(b, { lat: rpos.lat, lng: rpos.lng, gps: true });
  $('#r-go').disabled = true;
  try {
    const r = await api('POST', '/api/reports', b);
    modal(`<h3>${r.merged ? '🔗 Merged with an existing report' : '✅ Report submitted'}</h3>
    <p>${r.merged ? `Someone nearby already reported this issue. Your report and photos were <b>merged</b> into it, so it now carries ${r.report.reporters} reports and a higher priority.` : `Auto-evaluated as <span class="chip sev-${r.report.severity}">${r.report.severity} (${r.report.score}/100)</span> and routed to the <b>${r.report.assignedName}</b> authority – ${esc(r.report.deptLabel)}.`}</p>
    <button class="btn pri" onclick="closeModal();nav('feed')">Go to feed</button>`);
  } catch (e) { toast(e.message); $('#r-go').disabled = false; }
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
    closeModal(); toast(r.status === 'resolved' ? '✅ Verified and closed' : '❌ ' + (r.verdict ? r.verdict.reason : 'Rejected')); loadList();
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
  <p class="meta">Choose any level to see how authorities are performing there. Performance = 50% resolution rate + 30% share of issues within SLA + 20% speed. (Demo seed data is included so dashboards are not empty.)</p>
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
  $('#dbody').innerHTML = `<div class="tiles">
  <div class="tile"><b>${s.total}</b><span>Total issues</span></div><div class="tile"><b style="color:var(--ok)">${s.resolved}</b><span>Resolved</span></div><div class="tile"><b>${s.pending}</b><span>Work left</span></div>
  <div class="tile"><b>${s.inProgress}</b><span>In progress</span></div><div class="tile"><b style="color:var(--bad)">${s.overdue}</b><span>Past SLA</span></div><div class="tile"><b>${s.critical}</b><span>Critical open</span></div>
  <div class="tile"><b>${s.rate}%</b><span>Resolution rate</span></div><div class="tile"><b>${s.avgDays ?? '–'}</b><span>Avg days to fix</span></div><div class="tile"><b>${s.perf}</b><span>Performance /100</span></div></div>
  <div class="card"><h3>🏆 Ranking – ${['', 'States / UTs', 'Districts', 'Cities / Blocks', 'Localities'][d.depth - 1]} under ${esc(d.path.join(' › '))}</h3>
  ${d.ranking.length ? `<table><tr><th>#</th><th>Area</th><th>Perf</th><th>Done</th><th>Left</th><th>Past SLA</th><th>Avg days</th></tr>${d.ranking.map(x => `<tr class="${mine.startsWith(x.path.join('>')) ? 'me' : ''}"><td>${x.rank}</td><td><b>${esc(x.name)}</b>${x.trail ? `<div class="meta">${esc(x.trail)}</div>` : ''}${mine.startsWith(x.path.join('>')) ? ' <span class="chip">your area</span>' : ''}</td>
  <td style="min-width:90px"><b>${x.perf}</b><div class="bar"><i style="width:${x.perf}%"></i></div></td><td>${x.resolved}/${x.total}</td><td>${x.pending}</td><td>${x.overdue}</td><td>${x.avgDays ?? '–'}</td></tr>`).join('')}</table>` : '<div class="meta">No data at this level yet.</div>'}</div>
  <div class="card"><h3>🏢 Department-wise</h3>${d.depts.length ? `<table><tr><th>Department</th><th>Perf</th><th>Done</th><th>Left</th><th>Past SLA</th></tr>${d.depts.map(x => `<tr><td>${esc(x.label)}</td><td><b>${x.perf}</b><div class="bar"><i style="width:${x.perf}%"></i></div></td><td>${x.resolved}/${x.total}</td><td>${x.pending}</td><td>${x.overdue}</td></tr>`).join('')}</table>` : '<div class="meta">No data</div>'}</div>
  <div class="card"><h3>🧩 By issue type</h3><table><tr><th>Type</th><th>Total</th><th>Resolved</th><th>Rate</th></tr>${d.cats.map(x => `<tr><td>${ICON[x.cat]} ${esc(x.label)}</td><td>${x.total}</td><td>${x.resolved}</td><td>${x.rate}%</td></tr>`).join('')}</table></div>`;
}
window.nav = nav;
