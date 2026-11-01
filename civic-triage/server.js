'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { tree, LEVELS, findNode, coordsFor } = require('./hierarchy');

const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, 'data');
const MEDIA = path.join(DATA, 'media');
fs.mkdirSync(MEDIA, { recursive: true });
const DBF = path.join(DATA, 'db.json');

// ---------- config ----------
const CIRCULATION_KM = 5;         // a report circulates only to people within this radius
const CONFIRM_M = 500;            // upvotes from live-GPS users within 500 m count as "on-site confirmations"
const FLAGS_TO_REMOVE = 3;        // distinct citizens flagging a post -> post removed + authority notified
const STRIKES_TO_SUSPEND = 2;     // removed posts -> account suspended (24h x strikes)
const LEVEL_NAMES = ['National', 'State', 'District', 'Local'];
const DEPTS = {
  roads: 'Roads & Bridges (PWD/NHAI)', water: 'Water Supply & Drainage', pollution: 'Pollution Control Board',
  sanitation: 'Sanitation & Waste', electricity: 'Electricity & Street Lighting', general: 'General Administration'
};
const CATS = {
  pothole: { label: 'Road damage / pothole', dept: 'roads', base: 5, sla: 5 },
  bridge: { label: 'Bridge / flyover damage', dept: 'roads', base: 9, sla: 3 },
  water_leak: { label: 'Water leakage / pipe burst', dept: 'water', base: 5, sla: 4 },
  sewage: { label: 'Sewage / drain overflow', dept: 'water', base: 6, sla: 3 },
  pollution: { label: 'Air / water / noise pollution', dept: 'pollution', base: 6, sla: 7 },
  garbage: { label: 'Garbage / illegal dumping', dept: 'sanitation', base: 4, sla: 3 },
  streetlight: { label: 'Street light not working', dept: 'electricity', base: 4, sla: 5 },
  electric_hazard: { label: 'Electric hazard (live wire/pole)', dept: 'electricity', base: 9, sla: 2 },
  other: { label: 'Other civic issue', dept: 'general', base: 3, sla: 7 }
};
const KEYWORDS = ['accident', 'danger', 'dangerous', 'injur', 'child', 'children', 'school', 'hospital', 'collapse', 'flood', 'urgent',
  'death', 'died', 'fire', 'spark', 'shock', 'live wire', 'toxic', 'smoke', 'sinking', 'crack', 'overflow', 'dengue', 'ambulance', 'elderly', 'night'];

// ---------- db ----------
let db = { users: {}, reports: {}, notices: [], seq: 1 };
try { db = JSON.parse(fs.readFileSync(DBF, 'utf8')); } catch (e) { /* fresh */ }
let saveT = null;
function save() { clearTimeout(saveT); saveT = setTimeout(() => fs.writeFile(DBF + '.tmp', JSON.stringify(db), () => fs.rename(DBF + '.tmp', DBF, () => { })), 200); }
const now = () => Date.now();
const DAY = 864e5;
const err = (code, msg) => Object.assign(new Error(msg), { code });
const rid = (p, n = 6) => p + '-' + crypto.randomBytes(n).toString('hex').slice(0, n).toUpperCase();

// ---------- helpers ----------
function km(a, b) {
  if (!a || !b || a[0] == null || b[0] == null) return null;
  const R = 6371, t = x => x * Math.PI / 180;
  const dl = t(b[0] - a[0]), dg = t(b[1] - a[1]);
  const h = Math.sin(dl / 2) ** 2 + Math.cos(t(a[0])) * Math.cos(t(b[0])) * Math.sin(dg / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const isPrefix = (pre, p) => pre.every((x, i) => p[i] === x);
const num = v => (v === null || v === undefined || v === '' || isNaN(+v)) ? null : +v;
const ADJ = ['Brave', 'Calm', 'Swift', 'Quiet', 'Bright', 'Gentle', 'Bold', 'Keen', 'Lucky', 'Noble', 'Witty', 'Sunny', 'Steady', 'Clever', 'Kind'];
const ANI = ['Heron', 'Tiger', 'Peacock', 'Otter', 'Falcon', 'Lotus', 'Mynah', 'Panda', 'Koel', 'Dolphin', 'Banyan', 'Cheetah', 'Sparrow', 'Elephant', 'Parrot'];
function anon(uid, rid_) {
  const h = crypto.createHash('sha1').update(uid + '|' + rid_).digest();
  return `${ADJ[h[0] % ADJ.length]} ${ANI[h[1] % ANI.length]} ${10 + h[2] % 90}`;
}
function saveMedia(list) {
  const out = [];
  for (const m of (list || []).slice(0, 8)) {
    const mt = /^data:((image|video|audio)\/[\w.+-]+);base64,(.+)$/s.exec(m && m.data || '');
    if (!mt) continue;
    const buf = Buffer.from(mt[3], 'base64');
    if (buf.length > 14e6) throw err(413, 'A media file is larger than 14 MB');
    const ext = (mt[1].split('/')[1] || 'bin').replace(/[^\w]/g, '').slice(0, 5);
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    const name = hash.slice(0, 16) + crypto.randomBytes(3).toString('hex') + '.' + ext;
    fs.writeFileSync(path.join(MEDIA, name), buf);
    out.push({ type: mt[2], mime: mt[1], url: '/media/' + name, hash });
  }
  return out;
}
function tokens(s) { return new Set(String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3)); }
function jac(a, b) { if (!a.size || !b.size) return 0; let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i); }

// ---------- AI (optional: set ANTHROPIC_API_KEY) ----------
async function claudeJSON(content) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5', max_tokens: 400, messages: [{ role: 'user', content }] }),
      signal: AbortSignal.timeout(30000)
    });
    const j = await res.json();
    return JSON.parse(j.content[0].text.match(/\{[\s\S]*\}/)[0]);
  } catch (e) { return null; }
}
function imgBlocks(media, max = 2) {
  return media.filter(m => m.type === 'image').slice(0, max).map(m => {
    try { return { type: 'image', source: { type: 'base64', media_type: m.mime, data: fs.readFileSync(path.join(DATA, m.url)).toString('base64') } }; } catch (e) { return null; }
  }).filter(Boolean);
}
async function aiSeverity(r) {
  const imgs = imgBlocks(r.media);
  if (!imgs.length) return;
  const j = await claudeJSON([...imgs, { type: 'text', text: `Civic issue report. Category: ${CATS[r.category].label}. Caption: ${r.caption}. Rate the visible severity 0-10 for public safety/inconvenience. Reply ONLY JSON: {"severity":0-10,"matches_category":true|false,"summary":"<=20 words"}` }]);
  if (j) { r.ai = { severity: Math.max(0, Math.min(10, +j.severity || 0)), matches: j.matches_category !== false, summary: String(j.summary || '').slice(0, 200) }; r.score = score(r); save(); }
}
async function verifyResolution(r, after, loc) {
  // 1) cheap integrity checks (always run)
  if (after.some(a => r.media.some(b => b.hash === a.hash))) return { resolved: false, by: 'integrity', reason: 'After-photo is identical to a "before" photo.' };
  const d = km([loc.lat, loc.lng], r.lat != null ? [r.lat, r.lng] : null);
  if (loc.lat != null && d != null && d * 1000 > CONFIRM_M * 2) return { resolved: false, by: 'integrity', reason: `After-photo was taken ${Math.round(d * 1000)} m from the reported spot.` };
  // 2) AI vision comparison when available
  const b = imgBlocks(r.media, 2), a = imgBlocks(after, 2);
  if (process.env.ANTHROPIC_API_KEY && b.length && a.length) {
    const j = await claudeJSON([{ type: 'text', text: 'BEFORE photos:' }, ...b, { type: 'text', text: 'AFTER photos (submitted by authority):' }, ...a,
      { type: 'text', text: `Issue: ${CATS[r.category].label} - ${r.caption}. Does the AFTER show the same place with the issue genuinely fixed? Be strict. Reply ONLY JSON: {"resolved":true|false,"confidence":0-1,"reason":"<=25 words"}` }]);
    if (j) return { resolved: !!j.resolved && (+j.confidence || 0) >= 0.5, by: 'ai', confidence: +j.confidence || 0, reason: String(j.reason || '') };
  }
  // 3) fallback: provisional acceptance, finalised by community confirmation
  return { resolved: true, by: 'heuristic', reason: 'Passed integrity checks (no AI key configured: provisional, community confirmation decides).' };
}

// ---------- domain logic ----------
function score(r) {
  const c = CATS[r.category];
  const ageD = (now() - r.createdAt) / DAY;
  const votes = Object.values(r.votes), conf = votes.filter(v => v.confirmed).length;
  const kw = Math.min(20, KEYWORDS.filter(k => (r.caption + ' ' + r.description).toLowerCase().includes(k)).length * 5);
  let s = c.base * 4 + kw + Math.min(15, r.media.length * 3) + Math.min(15, votes.length) + Math.min(20, conf * 4)
    + (r.ai ? r.ai.severity : 0) + (r.status === 'resolved' ? 0 : Math.min(10, ageD));
  return Math.max(0, Math.min(100, Math.round(s)));
}
const sevLabel = s => s >= 75 ? 'Critical' : s >= 55 ? 'High' : s >= 35 ? 'Medium' : 'Low';
function assigned(r) { // auto-routing + SLA escalation: local -> district -> state -> national
  let lvl = Math.min(3, r.path.length - 1);
  if (sevLabel(r.score) === 'Critical') lvl = Math.max(0, lvl - 1);
  if (r.status !== 'resolved') {
    const esc = Math.floor((now() - r.createdAt) / DAY / CATS[r.category].sla);
    lvl = Math.max(0, lvl - esc);
  }
  return lvl;
}
const isOpenStatus = s => s !== 'resolved';
function addTL(r, text) { r.timeline.push({ t: now(), text }); }

function view(r, uid) {
  const v = r.votes[uid];
  const ids = Object.values(r.votes);
  return {
    id: r.id, category: r.category, categoryLabel: CATS[r.category].label, dept: r.dept, deptLabel: DEPTS[r.dept],
    caption: r.caption, description: r.description, address: r.address, path: r.path, lat: r.lat, lng: r.lng,
    media: r.media.map(m => ({ type: m.type, url: m.url })), afterMedia: (r.afterMedia || []).map(m => ({ type: m.type, url: m.url })),
    votes: ids.length, confirmed: ids.filter(x => x.confirmed).length, voted: !!v,
    comments: r.comments.length, flags: Object.keys(r.flags).length, flagged: !!r.flags[uid],
    status: r.status, score: r.score, severity: sevLabel(r.score), assignedLevel: assigned(r), assignedName: LEVEL_NAMES[assigned(r)],
    slaDays: CATS[r.category].sla, createdAt: r.createdAt, resolvedAt: r.resolvedAt || null,
    author: anon(r.user, r.id), mine: r.user === uid, reporters: 1 + r.supporters.length, merged: r.supporters.length > 0,
    timeline: r.timeline, ai: r.ai || null, verdict: r.verdict || null, removed: !!r.removed, demo: !!r.demo,
    resolutionVotes: { ok: Object.values(r.resVotes || {}).filter(x => x).length, bad: Object.values(r.resVotes || {}).filter(x => !x).length },
    myResVote: r.resVotes && r.resVotes[uid] !== undefined ? r.resVotes[uid] : null
  };
}
function userView(u) { return u; }
function needUser(id, role) {
  const u = db.users[id];
  if (!u) throw err(401, 'Unknown profile. Please register again.');
  if (role && u.role !== role) throw err(403, `This action is for ${role}s only.`);
  return u;
}
function notSuspended(u) {
  if (u.suspendedUntil && u.suspendedUntil > now()) throw err(403, `Your account is suspended until ${new Date(u.suspendedUntil).toLocaleString()} due to repeated false reports.`);
}
function notify(path_, kind, text, extra) {
  db.notices.push({ id: rid('N', 5), t: now(), path: path_, kind, text, status: 'new', ...extra });
}
function recompute(r) { r.score = score(r); }

function findDuplicate(c) {
  const t = tokens(c.caption + ' ' + c.address);
  let best = null, bs = 0;
  for (const r of Object.values(db.reports)) {
    if (r.removed || r.category !== c.category || r.status === 'resolved') continue;
    const d = km(c.lat != null ? [c.lat, c.lng] : null, r.lat != null ? [r.lat, r.lng] : null);
    const sim = jac(t, tokens(r.caption + ' ' + r.address));
    let s = 0;
    if (d != null) { if (d <= 0.15) s = 1 + sim; else if (d <= 0.5 && sim >= 0.35) s = 0.6 + sim; }
    else if (isPrefix(r.path, c.path) && c.path.length === r.path.length && sim >= 0.5) s = 0.5 + sim;
    if (s > bs) { bs = s; best = r; }
  }
  return best;
}

// ---------- stats ----------
function stats(list) {
  const total = list.length, resolved = list.filter(r => r.status === 'resolved');
  const open = list.filter(r => isOpenStatus(r.status));
  const overdue = open.filter(r => (now() - r.createdAt) / DAY > CATS[r.category].sla).length;
  const avgDays = resolved.length ? resolved.reduce((a, r) => a + ((r.resolvedAt || now()) - r.createdAt) / DAY, 0) / resolved.length : null;
  const rate = total ? resolved.length / total : 0;
  const overdueRatio = open.length ? overdue / open.length : 0;
  const speed = avgDays == null ? 0 : Math.max(0, 1 - avgDays / 14);
  return {
    total, resolved: resolved.length, pending: open.length, inProgress: list.filter(r => r.status === 'in_progress').length, overdue,
    critical: open.filter(r => sevLabel(r.score) === 'Critical').length, avgDays: avgDays == null ? null : +avgDays.toFixed(1),
    rate: Math.round(rate * 100), perf: Math.round(100 * (0.5 * rate + 0.3 * (1 - overdueRatio) + 0.2 * speed))
  };
}
function dashboard(pre, depth) {
  const list = Object.values(db.reports).filter(r => !r.removed && isPrefix(pre, r.path));
  const d = Math.max(pre.length + 1, Math.min(5, depth || pre.length + 1));
  const groups = {};
  for (const r of list) if (r.path.length >= d) (groups[r.path.slice(0, d).join('>')] ||= []).push(r);
  const ranking = Object.entries(groups).map(([k, l]) => {
    const p = k.split('>');
    return { name: p[d - 1], path: p, trail: p.slice(pre.length, d - 1).join(' › '), ...stats(l) };
  }).sort((a, b) => b.perf - a.perf || b.total - a.total).map((x, i) => ({ ...x, rank: i + 1 }));
  const depts = Object.keys(DEPTS).map(k => ({ dept: k, label: DEPTS[k], ...stats(list.filter(r => r.dept === k)) })).filter(x => x.total);
  const cats = Object.keys(CATS).map(k => ({ cat: k, label: CATS[k].label, ...stats(list.filter(r => r.category === k)) })).filter(x => x.total);
  return { path: pre, depth: d, summary: stats(list), ranking, depts, cats };
}

// ---------- API handlers ----------
const routes = [];
const R = (m, re, fn) => routes.push([m, re, fn]);

R('GET', /^\/api\/hierarchy$/, () => ({ tree, levels: LEVELS, cats: CATS, depts: DEPTS, levelNames: LEVEL_NAMES, config: { circulationKm: CIRCULATION_KM, confirmM: CONFIRM_M, flagsToRemove: FLAGS_TO_REMOVE }, ai: !!process.env.ANTHROPIC_API_KEY }));

R('POST', /^\/api\/users$/, ({ body: b }) => {
  const role = b.role;
  if (!['citizen', 'authority'].includes(role)) throw err(400, 'Choose a role');
  const p = (Array.isArray(b.path) ? b.path : []).map(x => String(x).trim().slice(0, 60)).filter(Boolean);
  if (p[0] !== 'India') throw err(400, 'Invalid location');
  const phone = String(b.phone || '').replace(/\D/g, '').slice(-10), email = String(b.email || '').trim().slice(0, 80);
  if (phone.length !== 10) throw err(400, 'Enter a valid 10-digit phone number');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw err(400, 'Enter a valid email');
  const u = { role, path: p, phone, email, createdAt: now(), strikes: 0, suspendedUntil: 0 };
  if (role === 'citizen') {
    if (p.length < 4) throw err(400, 'Choose your location down to at least city / block level');
    u.id = rid('CZ');
  } else {
    const lvl = +b.level;
    if (![0, 1, 2, 3].includes(lvl) || p.length !== lvl + 1) throw err(400, 'Pick your jurisdiction fully for the chosen level');
    if (b.dept !== 'all' && !DEPTS[b.dept]) throw err(400, 'Choose a department');
    u.id = rid('AU'); u.level = lvl; u.dept = b.dept; u.office = String(b.office || '').trim().slice(0, 80) || `${LEVEL_NAMES[lvl]} ${b.dept === 'all' ? 'Administration' : DEPTS[b.dept]}`;
  }
  const g = coordsFor(p);
  u.lat = g[0]; u.lng = g[1];
  db.users[u.id] = u; save();
  return u;
});
R('GET', /^\/api\/users\/([\w-]+)$/, ({ m }) => {
  const u = db.users[m[1]]; if (!u) throw err(404, 'No such profile');
  const mine = Object.values(db.reports).filter(r => r.user === u.id);
  return { ...u, stats: { reports: mine.length, resolved: mine.filter(r => r.status === 'resolved').length, upvotes: mine.reduce((a, r) => a + Object.keys(r.votes).length, 0) }, suspended: u.suspendedUntil > now() };
});

R('GET', /^\/api\/reports$/, ({ q }) => {
  const u = needUser(q.user);
  const st = q.status, cat = q.cat, sort = q.sort || 'priority', text = (q.q || '').toLowerCase();
  const here = (q.lat && q.lng) ? [+q.lat, +q.lng] : [u.lat, u.lng];
  const radius = Math.min(100, Math.max(0.5, +q.radius || CIRCULATION_KM));
  let list = Object.values(db.reports);
  if (u.role === 'citizen') {
    list = list.filter(r => !r.removed || r.user === u.id);
    list = list.filter(r => { const d = km(here, r.lat != null ? [r.lat, r.lng] : coordsFor(r.path)); return d != null ? d <= radius : isPrefix(u.path.slice(0, 4), r.path); });
  } else {
    list = list.filter(r => isPrefix(u.path, r.path) && (u.dept === 'all' || r.dept === u.dept));
    if (q.removed === '1') list = list.filter(r => r.removed); else list = list.filter(r => !r.removed);
    if (q.scope === 'mine') list = list.filter(r => assigned(r) === u.level && r.status !== 'resolved');
  }
  if (st === 'open') list = list.filter(r => r.status !== 'resolved'); else if (st) list = list.filter(r => r.status === st);
  if (cat) list = list.filter(r => r.category === cat);
  if (text) list = list.filter(r => (r.caption + r.address + r.description).toLowerCase().includes(text));
  const cmp = { priority: (a, b) => b.score - a.score, votes: (a, b) => Object.keys(b.votes).length - Object.keys(a.votes).length, new: (a, b) => b.createdAt - a.createdAt, old: (a, b) => a.createdAt - b.createdAt }[sort] || ((a, b) => b.score - a.score);
  list.sort(cmp);
  return list.slice(0, 80).map(r => { const v = view(r, u.id); const d = km(here, r.lat != null ? [r.lat, r.lng] : coordsFor(r.path)); v.distanceKm = d == null ? null : +d.toFixed(2); return v; });
});
R('GET', /^\/api\/reports\/([\w-]+)$/, ({ m, q }) => {
  const r = db.reports[m[1]]; if (!r) throw err(404, 'Not found');
  return { ...view(r, q.user), thread: r.comments.map(c => ({ name: c.official ? '🏛 ' + c.name : c.name, text: c.text, t: c.t, official: !!c.official, mine: c.user === q.user })) };
});

R('POST', /^\/api\/reports$/, async ({ body: b }) => {
  const u = needUser(b.user, 'citizen'); notSuspended(u);
  const cat = CATS[b.category]; if (!cat) throw err(400, 'Choose a category');
  const caption = String(b.caption || '').trim().slice(0, 140);
  if (caption.length < 5) throw err(400, 'Add a short caption (at least 5 characters)');
  const address = String(b.address || '').trim().slice(0, 200);
  if (!address) throw err(400, 'Address / landmark is required');
  const p = u.path;
  const g = coordsFor(p);
  const lat = num(b.lat) ?? g[0], lng = num(b.lng) ?? g[1];
  const gps = !!b.gps;
  const media = saveMedia(b.media);
  const c = { caption, address, category: b.category, lat, lng, path: p };
  const dup = findDuplicate(c);
  if (dup) {
    if (dup.user !== u.id && !dup.supporters.some(s => s.user === u.id)) {
      dup.supporters.push({ user: u.id, t: now() });
      dup.media.push(...media.filter(m => !dup.media.some(x => x.hash === m.hash)));
      dup.media = dup.media.slice(0, 16);
      if (b.description && String(b.description).trim()) dup.description += (dup.description ? '\n' : '') + '+ ' + String(b.description).trim().slice(0, 300);
      const d = km(gps ? [lat, lng] : null, dup.lat != null ? [dup.lat, dup.lng] : null);
      dup.votes[u.id] = { t: now(), confirmed: d != null && d * 1000 <= CONFIRM_M };
      addTL(dup, `Merged: another citizen reported the same issue (${dup.supporters.length + 1} reports combined).`);
      recompute(dup); save();
    }
    return { merged: true, report: view(dup, u.id) };
  }
  const r = {
    id: rid('R', 5), user: u.id, category: b.category, dept: cat.dept, caption, description: String(b.description || '').trim().slice(0, 1000), address,
    path: p, lat, lng, media, afterMedia: [], votes: {}, comments: [], flags: {}, supporters: [], status: 'open', createdAt: now(), timeline: [], resVotes: {}
  };
  r.votes[u.id] = { t: now(), confirmed: gps };
  addTL(r, 'Report submitted by citizen.');
  r.score = score(r);
  addTL(r, `Auto-evaluated: ${sevLabel(r.score)} severity (score ${r.score}/100).`);
  addTL(r, `Auto-routed to ${LEVEL_NAMES[assigned(r)]} authority · ${DEPTS[r.dept]}.`);
  db.reports[r.id] = r; save();
  aiSeverity(r).catch(() => { });
  return { merged: false, report: view(r, u.id) };
});

R('POST', /^\/api\/reports\/([\w-]+)\/upvote$/, ({ m, body: b }) => {
  const u = needUser(b.user, 'citizen'); notSuspended(u);
  const r = db.reports[m[1]]; if (!r) throw err(404, 'Not found');
  if (r.votes[u.id]) delete r.votes[u.id];
  else {
    const d = km(b.gps ? [num(b.lat), num(b.lng)] : null, r.lat != null ? [r.lat, r.lng] : null);
    r.votes[u.id] = { t: now(), confirmed: d != null && d * 1000 <= CONFIRM_M };
  }
  recompute(r); save();
  return view(r, u.id);
});
R('POST', /^\/api\/reports\/([\w-]+)\/comments$/, ({ m, body: b }) => {
  const u = needUser(b.user); notSuspended(u);
  const r = db.reports[m[1]]; if (!r) throw err(404, 'Not found');
  const text = String(b.text || '').trim().slice(0, 500); if (!text) throw err(400, 'Empty message');
  r.comments.push({ user: u.id, name: u.role === 'authority' ? u.office : anon(u.id, r.id), official: u.role === 'authority', text, t: now() });
  save(); return { ok: true };
});
R('POST', /^\/api\/reports\/([\w-]+)\/flag$/, ({ m, body: b }) => {
  const u = needUser(b.user, 'citizen'); notSuspended(u);
  const r = db.reports[m[1]]; if (!r) throw err(404, 'Not found');
  if (r.user === u.id) throw err(400, 'You cannot flag your own report');
  r.flags[u.id] = { reason: String(b.reason || 'false information').slice(0, 100), t: now() };
  if (!r.removed && Object.keys(r.flags).length >= FLAGS_TO_REMOVE) {
    r.removed = true; addTL(r, 'Removed from public feed after multiple citizen flags.');
    const author = db.users[r.user];
    if (author && !r.demo) {
      author.strikes = (author.strikes || 0) + 1;
      notify(r.path, 'abuse', `Report ${r.id} ("${r.caption}") was flagged as false information by ${Object.keys(r.flags).length} citizens and removed. Author ${author.id} now has ${author.strikes} strike(s).`, { reportId: r.id, citizen: author.id });
      if (author.strikes >= STRIKES_TO_SUSPEND) {
        author.suspendedUntil = now() + author.strikes * DAY;
        notify(r.path, 'suspension', `Citizen ${author.id} suspended for ${author.strikes * 24}h for spreading false information (${author.strikes} removed reports).`, { citizen: author.id });
      }
    }
  }
  save(); return { ok: true, removed: !!r.removed };
});
R('POST', /^\/api\/reports\/([\w-]+)\/community-verify$/, ({ m, body: b }) => {
  const u = needUser(b.user, 'citizen'); notSuspended(u);
  const r = db.reports[m[1]]; if (!r || r.status !== 'resolved') throw err(400, 'Not in resolved state');
  r.resVotes[u.id] = !!b.ok;
  const vs = Object.values(r.resVotes), bad = vs.filter(x => !x).length, ok = vs.length - bad;
  if (bad >= 3 && bad > ok) { r.status = 'reopened'; r.resolvedAt = null; addTL(r, `Reopened: ${bad} citizens say the issue is NOT fixed.`); notify(r.path, 'reopened', `Report ${r.id} reopened by community: resolution disputed by ${bad} citizens.`, { reportId: r.id }); }
  recompute(r); save(); return view(r, u.id);
});
R('POST', /^\/api\/reports\/([\w-]+)\/status$/, async ({ m, body: b }) => {
  const u = needUser(b.user, 'authority');
  const r = db.reports[m[1]]; if (!r) throw err(404, 'Not found');
  if (!isPrefix(u.path, r.path)) throw err(403, 'This report is outside your jurisdiction');
  if (u.dept !== 'all' && u.dept !== r.dept) throw err(403, 'This report belongs to another department');
  const who = u.office, note = String(b.note || '').trim().slice(0, 300);
  if (b.action === 'acknowledge') { r.status = 'acknowledged'; addTL(r, `${who} acknowledged the issue.${note ? ' ' + note : ''}`); }
  else if (b.action === 'start') { r.status = 'in_progress'; addTL(r, `${who}: work in progress.${note ? ' ' + note : ''}`); }
  else if (b.action === 'resolve') {
    const after = saveMedia(b.media).filter(x => x.type === 'image');
    if (!after.length) throw err(400, 'Upload at least one "after" photo to close this issue');
    const verdict = await verifyResolution(r, after, { lat: num(b.lat), lng: num(b.lng) });
    r.verdict = { ...verdict, t: now(), by_office: who };
    r.afterMedia = after; r.resVotes = {};
    if (verdict.resolved) { r.status = 'resolved'; r.resolvedAt = now(); addTL(r, `${who} uploaded after-photo. ${verdict.by === 'ai' ? 'AI verified' : 'Auto-check passed'}: ${verdict.reason} Citizens can now confirm.`); }
    else { if (r.status === 'open') r.status = 'in_progress'; addTL(r, `After-photo REJECTED (${verdict.by}): ${verdict.reason}`); }
  } else throw err(400, 'Unknown action');
  recompute(r); save(); return view(r, u.id);
});

R('GET', /^\/api\/notices$/, ({ q }) => {
  const u = needUser(q.user, 'authority');
  return db.notices.filter(n => isPrefix(u.path, n.path)).sort((a, b) => b.t - a.t).slice(0, 100);
});
R('POST', /^\/api\/notices\/([\w-]+)\/resolve$/, ({ m, body: b }) => {
  const u = needUser(b.user, 'authority');
  const n = db.notices.find(x => x.id === m[1]); if (!n || !isPrefix(u.path, n.path)) throw err(404, 'Not found');
  n.status = b.action === 'dismiss' ? 'dismissed' : 'upheld';
  if (b.action === 'dismiss' && n.kind === 'abuse' && n.reportId) {
    const r = db.reports[n.reportId], c = db.users[n.citizen];
    if (r) { r.removed = false; r.flags = {}; addTL(r, 'Restored by authority review.'); }
    if (c) { c.strikes = Math.max(0, c.strikes - 1); if (c.strikes < STRIKES_TO_SUSPEND) c.suspendedUntil = 0; }
  }
  save(); return n;
});
R('GET', /^\/api\/dashboard$/, ({ q }) => dashboard(q.path ? q.path.split('|').filter(Boolean) : ['India'], +q.depth || 0));

// ---------- seed demo data ----------
function seed() {
  if (Object.keys(db.reports).length) return;
  let s = 42; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const places = [
    [['India', 'West Bengal', 'Paschim Medinipur', 'Kharagpur', 'IIT Kharagpur'], .85], [['India', 'West Bengal', 'Paschim Medinipur', 'Kharagpur', 'Inda'], .45],
    [['India', 'West Bengal', 'Paschim Medinipur', 'Kharagpur', 'Hijli'], .6], [['India', 'West Bengal', 'Paschim Medinipur', 'Kharagpur', 'Malancha'], .55],
    [['India', 'West Bengal', 'Paschim Medinipur', 'Midnapore', 'Midnapore Town Centre'], .5],
    [['India', 'West Bengal', 'Kolkata', 'Kolkata', 'Salt Lake (Bidhannagar)'], .75], [['India', 'West Bengal', 'Kolkata', 'Kolkata', 'Park Street'], .85],
    [['India', 'West Bengal', 'Kolkata', 'Kolkata', 'Jadavpur'], .6], [['India', 'West Bengal', 'Kolkata', 'Kolkata', 'Behala'], .35],
    [['India', 'West Bengal', 'Howrah', 'Howrah', 'Howrah Station Area'], .4],
    [['India', 'Delhi', 'New Delhi', 'New Delhi'], .7], [['India', 'Delhi', 'South Delhi', 'South Delhi'], .6],
    [['India', 'Maharashtra', 'Mumbai City', 'Mumbai'], .65], [['India', 'Maharashtra', 'Pune', 'Pune'], .8],
    [['India', 'Karnataka', 'Bengaluru Urban', 'Bengaluru'], .55], [['India', 'Tamil Nadu', 'Chennai', 'Chennai'], .75],
    [['India', 'Uttar Pradesh', 'Lucknow', 'Lucknow'], .5], [['India', 'Odisha', 'Khordha', 'Bhubaneswar'], .7]
  ];
  const caps = {
    pothole: ['Deep pothole near the main crossing', 'Road cave-in after rain, two-wheelers skidding', 'Broken tarmac along market road'],
    bridge: ['Cracks on bridge railing and deck', 'Foot-overbridge steps broken'],
    water_leak: ['Main pipe leaking for days', 'Water gushing from burst pipeline'],
    sewage: ['Drain overflowing onto the road', 'Sewage smell and stagnant water near school'],
    pollution: ['Black smoke from burning waste', 'Factory effluent in the canal'],
    garbage: ['Garbage piling up uncollected', 'Illegal dumping on the roadside'],
    streetlight: ['Street light out for a week', 'Whole lane dark at night'],
    electric_hazard: ['Live wire hanging low near footpath', 'Transformer sparking'],
    other: ['Stray animal menace', 'Broken footpath tiles']
  };
  const keys = Object.keys(CATS);
  for (const [p, q] of places) {
    const g = coordsFor(p), n = 9 + Math.floor(rnd() * 6);
    for (let i = 0; i < n; i++) {
      const cat = keys[Math.floor(rnd() * keys.length)], age = rnd() * 40, id = rid('R', 5), created = now() - age * DAY;
      const r = {
        id, user: 'CZ-DEMO' + Math.floor(rnd() * 90 + 10), category: cat, dept: CATS[cat].dept, demo: true,
        caption: caps[cat][Math.floor(rnd() * caps[cat].length)], description: '', address: `Near ${p[p.length - 1]}, sample landmark ${i + 1}`,
        path: p, lat: g[0] + (rnd() - .5) * .012, lng: g[1] + (rnd() - .5) * .012, media: [], afterMedia: [], votes: {}, comments: [], flags: {}, supporters: [],
        status: 'open', createdAt: created, timeline: [{ t: created, text: 'Report submitted by citizen.' }], resVotes: {}
      };
      const nv = Math.floor(rnd() * 25); for (let k = 0; k < nv; k++) r.votes['CZ-V' + k + id] = { t: created, confirmed: rnd() < .35 };
      const sla = CATS[cat].sla;
      if (rnd() < q * Math.min(1, age / (sla * 1.2))) { r.status = 'resolved'; r.resolvedAt = created + sla * DAY * (.4 + rnd() * 2.2 / (q + .3)); if (r.resolvedAt > now()) r.resolvedAt = now() - 3600e3; r.timeline.push({ t: r.resolvedAt, text: 'Resolved with after-photo verification.' }); }
      else if (rnd() < .4) r.status = 'in_progress'; else if (rnd() < .5) r.status = 'acknowledged';
      r.score = score(r); db.reports[id] = r;
    }
  }
  save();
}
seed();

// ---------- http ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mpeg': 'audio/mpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.svg': 'image/svg+xml' };
function serveFile(res, file, req) {
  fs.stat(file, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range) {
      const a = +range[1] || 0, b = range[2] ? +range[2] : st.size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${a}-${b}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': b - a + 1 });
      return fs.createReadStream(file, { start: a, end: b }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': file.includes('media') ? 'public,max-age=86400' : 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x'), pn = decodeURIComponent(url.pathname);
  if (pn.startsWith('/api/')) {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > 60e6) req.destroy(); else chunks.push(c); });
    req.on('end', async () => {
      const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      try {
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
        const q = Object.fromEntries(url.searchParams);
        for (const [m, re, fn] of routes) {
          const mm = re.exec(pn);
          if (m === req.method && mm) return send(200, await fn({ m: mm, q, body }));
        }
        send(404, { error: 'No such endpoint' });
      } catch (e) { send(e.code || 500, { error: e.message }); if (!e.code) console.error(e); }
    });
    return;
  }
  if (pn.startsWith('/media/')) return serveFile(res, path.join(MEDIA, path.basename(pn)), req);
  const f = path.normalize(path.join(__dirname, 'public', pn === '/' ? 'index.html' : pn));
  if (!f.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); return res.end(); }
  serveFile(res, f, req);
}).listen(PORT, () => console.log(`Civic triage running on http://localhost:${PORT}`));
