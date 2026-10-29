/**
 * EcoOils Disciplinary Record - multi-user backend (v2.0)
 *
 * Setup (once):
 *  1. Paste this file in Extensions > Apps Script (replace the old code), Save.
 *  2. Run setup() once from the editor and accept the permissions (Sheets, Drive, Mail).
 *     It creates the sheets Records, Users, Audit and the Drive folder for badge photos,
 *     and registers YOUR Google account as the first admin.
 *  3. Deploy > Manage deployments > pencil > Version: New version > Deploy.
 *     (Execute as: Me | Who has access: Anyone). The /exec URL stays the same.
 *  4. Add the IC admins in the app: Settings > Users (email + company + role).
 *
 * v2.1: HSSE posts the badge photo (status Awaiting); the IC completes the details (Pending); HSSE verifies. Run setupReminder() once for the daily 08:00 IC reminder.
 * Rules enforced HERE (not in the browser):
 *  - login = one-time 6-digit code sent by email, session 6 h
 *  - IC sees and adds only its own company; cannot edit, delete or verify
 *  - a badge photo is mandatory for an IC warning
 *  - nothing is overwritten: edits, verifications and deletions are logged in Audit
 *  - a warning counts for the ladder only when an admin has verified it
 */
var REC_H = ['id','date','company','name','empId','position','level','violation','givenBy','ack',
  'status','flags','photoId','photoHash','addedBy','addedAt','verifiedBy','verifiedAt','note','source'];
var USER_H = ['email','name','company','role','active'];
var AUD_H = ['time','email','role','action','recId','detail'];
var TZ = 'Asia/Jakarta';
var MONTHS = 6;               // SP validity (PP 35/2021 Pasal 52)
var CODE_TTL = 600, SESS_TTL = 21600, MAX_TRIES = 5, SESS_DAYS = 30;

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function sh_(name, headers) {
  var s = ss_(), sh = s.getSheetByName(name);
  if (!sh) { sh = s.insertSheet(name); sh.appendRow(headers); sh.setFrozenRows(1); }
  return sh;
}
function recSh_() { return sh_('Records', REC_H); }
function userSh_() { return sh_('Users', USER_H); }
function audSh_() { return sh_('Audit', AUD_H); }
function sesSh_() { return sh_('Sessions', ['hash', 'email', 'expires', 'created']); }
function hash_(t) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(t))); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function now_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss"); }
function str_(x) { return x === null || x === undefined ? '' : String(x); }
function norm_(s) { return str_(s).toLowerCase().replace(/\s+/g, ' ').trim(); }
function badgeKey_(s) { return str_(s).toUpperCase().replace(/[\s.\-_\/]+/g, ''); }

function setup() {
  recSh_(); userSh_(); audSh_(); photoFolder_();
  var u = userSh_();
  if (u.getLastRow() < 2) {
    var me = Session.getEffectiveUser().getEmail();
    u.appendRow([me, 'Admin', 'EcoOils', 'admin', 'yes']);
    Logger.log('Admin registered: ' + me);
  }
  MailApp.getRemainingDailyQuota();
  Logger.log('Setup OK. Now deploy a New version.');
}

/* ---------- storage ---------- */
function rows_(sh, headers) {
  var v = sh.getDataRange().getValues(), out = [];
  for (var i = 1; i < v.length; i++) {
    if (v[i][0] === '') continue;
    var o = {};
    for (var j = 0; j < headers.length; j++) {
      var x = v[i][j];
      if (x instanceof Date) x = Utilities.formatDate(x, TZ, headers[j] === 'date' ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm:ss");
      o[headers[j]] = str_(x);
    }
    o._row = i + 1;
    out.push(o);
  }
  return out;
}
function recs_() { return rows_(recSh_(), REC_H); }
function writeRec_(o, row) {
  var arr = REC_H.map(function (h) { return str_(o[h]); });
  var sh = recSh_();
  if (row) sh.getRange(row, 1, 1, REC_H.length).setNumberFormat('@').setValues([arr]);
  else { var r = sh.getLastRow() + 1; sh.getRange(r, 1, 1, REC_H.length).setNumberFormat('@').setValues([arr]); }
}
function audit_(u, action, recId, detail) {
  audSh_().appendRow([now_(), u ? u.email : '', u ? u.role : '', action, recId || '', detail || '']);
}
function photoFolder_() {
  var p = PropertiesService.getScriptProperties(), id = p.getProperty('PHOTO_FOLDER');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var f = DriveApp.createFolder('EcoOils Disciplinary Badge Photos (private)');
  p.setProperty('PHOTO_FOLDER', f.getId());
  return f;
}

/* ---------- ladder (verified records only) ---------- */
function addMonths_(s, m) {
  var p = s.split('-').map(Number), t = p[1] - 1 + m, y = p[0] + Math.floor(t / 12), mo = ((t % 12) + 12) % 12;
  var dim = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  return Utilities.formatString('%04d-%02d-%02d', y, mo + 1, Math.min(p[2], dim));
}
function addDays_(s, n) { var d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function lastValid_(s) { return addDays_(addMonths_(s, MONTHS), -1); }
/* Person identity. Legacy (imported Excel) records are linked BY NAME only (their IDs are not reliable: shared batch codes, typos).
   New records (source not legacy) are linked by badge ID, and join a legacy person when the name matches. */
function nameToks_(s) { return norm_(str_(s).replace(/\(.*?\)/g, ' ')).replace(/[^a-z ]/g, ' ').split(/\s+/).filter(function (w) { return w.length > 1; }); }
function nameCompat_(a, b) {
  var x = nameToks_(a), y = nameToks_(b);
  if (!x.length || !y.length) return false;
  if (x.join(' ') === y.join(' ')) return true;
  var sm = x.length <= y.length ? x : y, lg = sm === x ? y : x;
  return sm.length >= 2 && sm.every(function (w) { return lg.indexOf(w) >= 0; });
}
function isLegacy_(r) { return str_(r.source) === 'legacy'; }
function pkMap_(all) {
  var rs = all.filter(function (r) { return r.status !== 'Deleted'; }), par = {};
  rs.forEach(function (r) { par[r.id] = r.id; });
  function find(x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; }
  function uni(a, b) { var ra = find(a), rb = find(b); if (ra === rb) return; if (+ra < +rb) par[rb] = ra; else par[ra] = rb; }
  var byBadge = {}, leg = [], nw = [];
  rs.forEach(function (r) {
    if (isLegacy_(r)) { leg.push(r); return; }
    nw.push(r); var k = badgeKey_(r.empId);
    if (k.length >= 3) { if (byBadge[k]) uni(byBadge[k].id, r.id); else byBadge[k] = r; }
  });
  for (var i = 0; i < leg.length; i++) {
    for (var j = i + 1; j < leg.length; j++) if (nameCompat_(leg[i].name, leg[j].name)) uni(leg[i].id, leg[j].id);
    for (var m = 0; m < nw.length; m++) if (r_ok_(nw[m]) && (!leg[i].company || !nw[m].company || norm_(leg[i].company) === norm_(nw[m].company)) && nameCompat_(leg[i].name, nw[m].name)) uni(leg[i].id, nw[m].id);
  }
  var map = {};
  rs.forEach(function (r) { map[r.id] = 'P' + find(r.id); });
  return map;
}
function r_ok_(r) { return !!str_(r.name).trim() && r.status !== 'Awaiting'; }
/** Which person would a (badge, name) belong to? ID first (new records), then legacy name. Returns {pk, via}. */
function resolve_(all, map, empId, name, exceptId, company) {
  var k = badgeKey_(empId), rs = all.filter(function (r) { return r.status !== 'Deleted' && String(r.id) !== String(exceptId); }), i;
  if (k.length >= 3) for (i = 0; i < rs.length; i++) if (!isLegacy_(rs[i]) && rs[i].status !== 'Awaiting' && badgeKey_(rs[i].empId) === k && map[rs[i].id]) return { pk: map[rs[i].id], via: 'id' };
  if (str_(name).trim()) for (i = 0; i < rs.length; i++) if (isLegacy_(rs[i]) && (!company || !rs[i].company || norm_(company) === norm_(rs[i].company)) && nameCompat_(rs[i].name, name) && map[rs[i].id]) return { pk: map[rs[i].id], via: 'name' };
  return { pk: '', via: '' };
}
function ladder_(all, map, pk, date, exceptId) {
  var maxA = 0, best = null, name = '', company = '', any = false;
  all.forEach(function (r) {
    if (!pk || map[r.id] !== pk || r.status === 'Deleted' || r.status === 'Rejected') return;
    any = true;
    if (r.status === 'Verified') { if (!name) name = r.name; if (!company && r.company) company = r.company; }
    if (!name) name = r.name; if (!company && r.company) company = r.company;
    if (r.status !== 'Verified' || String(r.id) === String(exceptId) || r.level === 'ZT') return;
    if (r.date < date && date <= lastValid_(r.date) && +r.level > maxA) { maxA = +r.level; best = r; }
  });
  return { known: any, name: name, company: company, maxA: maxA, next: Math.min(3, maxA + 1), phk: maxA === 3, since: best ? best.date : '', until: best ? lastValid_(best.date) : '' };
}

/* ---------- auth ---------- */
function role_(x) { x = norm_(x); return x === 'admin' ? 'admin' : x === 'viewer' ? 'viewer' : 'ic'; }
function canRead_(u) { return u.role === 'admin' || u.role === 'viewer'; }
function users_() { return rows_(userSh_(), USER_H); }
function findUser_(email) {
  email = norm_(email);
  var l = users_();
  for (var i = 0; i < l.length; i++) if (norm_(l[i].email) === email && norm_(l[i].active) !== 'no') return l[i];
  return null;
}
function rnd_() { return String(Math.floor(100000 + Math.random() * 900000)); }
function reqCode_(b) {
  var email = norm_(b.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'bad_email' };
  var c = CacheService.getScriptCache();
  var u = findUser_(email);
  // the answer is the same whether or not the address is registered (no user probing)
  if (!u) return { ok: true };
  if (c.get('wait:' + email)) return { ok: false, error: 'wait' };
  var n = +(c.get('day:' + email) || 0);
  if (n >= 10) return { ok: false, error: 'limit' };
  var code = rnd_();
  c.put('code:' + email, JSON.stringify({ code: code, tries: 0 }), CODE_TTL);
  c.put('wait:' + email, '1', 45);
  c.put('day:' + email, String(n + 1), 21600);
  MailApp.sendEmail({
    to: email,
    subject: 'EcoOils Disciplinary Record - your code ' + code,
    body: 'Your one-time code: ' + code + '\n\nValid for 10 minutes. Do not share it.\nIf you did not ask for it, ignore this email.\n\nEcoOils Mentari Project - HSSE'
  });
  return { ok: true };
}
function verify_(b) {
  var email = norm_(b.email), c = CacheService.getScriptCache(), raw = c.get('code:' + email);
  var u = findUser_(email);
  if (!u || !raw) return { ok: false, error: 'code' };
  var st = JSON.parse(raw);
  if (st.tries >= MAX_TRIES) { c.remove('code:' + email); return { ok: false, error: 'code' }; }
  if (str_(b.code).trim() !== st.code) { st.tries++; c.put('code:' + email, JSON.stringify(st), CODE_TTL); return { ok: false, error: 'code' }; }
  c.remove('code:' + email);
  var token = Utilities.getUuid() + Utilities.getUuid();
  var sess = { email: u.email, name: u.name, company: u.company, role: role_(u.role) };
  c.put('sess:' + token, JSON.stringify(sess), SESS_TTL);
  // persistent session (30 days, sliding): survives cache eviction and the 6 h cache limit; only a hash of the token is stored
  var ss = sesSh_(), now = new Date().getTime(), v = ss.getDataRange().getValues();
  for (var i = v.length; i >= 2; i--) { if (+v[i - 1][2] < now) ss.deleteRow(i); }
  ss.appendRow([hash_(token), u.email, String(now + SESS_DAYS * 86400000), String(now)]);
  audit_(sess, 'LOGIN', '', '');
  return { ok: true, token: token, me: sess };
}
function sess_(token) {
  if (!token) return null;
  var c = CacheService.getScriptCache(), raw = c.get('sess:' + token), email = '';
  if (raw) email = JSON.parse(raw).email;
  else {
    var h = hash_(token), v = sesSh_().getDataRange().getValues(), now = new Date().getTime();
    for (var i = 1; i < v.length; i++) {
      if (v[i][0] === h) {
        if (+v[i][2] < now) return null;
        email = v[i][1];
        if (+v[i][2] - now < (SESS_DAYS - 1) * 86400000) sesSh_().getRange(i + 1, 3).setValue(String(now + SESS_DAYS * 86400000));   // slide
        break;
      }
    }
    if (!email) return null;
  }
  var u = findUser_(email);                       // deactivated users lose access at once
  if (!u) return null;
  var sess = { email: u.email, name: u.name, company: u.company, role: role_(u.role) };
  c.put('sess:' + token, JSON.stringify(sess), SESS_TTL);
  return sess;
}

/* ---------- views ---------- */
function pub_(r, u, map) {
  var o = {};
  REC_H.forEach(function (h) { o[h] = r[h]; });
  o.hasPhoto = r.photoId ? '1' : '';
  o.pk = map ? (map[r.id] || '') : ''; o.lg = isLegacy_(r) ? '1' : '';
  delete o.photoId; delete o.photoHash;
  if (!canRead_(u)) { delete o.flags; delete o.addedBy; delete o.verifiedBy; delete o.source; }
  return o;
}
function visible_(all, u) {
  return all.filter(function (r) {
    if (r.status === 'Deleted') return false;
    return canRead_(u) || norm_(r.company) === norm_(u.company);
  });
}

/* ---------- actions ---------- */
function list_(b, u) {
  var all = recs_(), map = pkMap_(all), l = visible_(all, u).map(function (r) { return pub_(r, u, map); });
  return { ok: true, records: l, me: u };
}
function lookup_(b, u) {
  // IC: only for badges of its own company. Another company's badge reveals nothing except 'other'.
  var key = badgeKey_(b.empId);
  if (key.length < 3 && !str_(b.name).trim()) return { ok: true };
  var all = recs_().filter(function (r) { return r.status !== 'Deleted'; }), map = pkMap_(all);
  var date = /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  var R = resolve_(all, map, key.length >= 3 ? b.empId : '', b.name, '', canRead_(u) ? '' : u.company), L = ladder_(all, map, R.pk, date, '');
  if (!canRead_(u) && L.known && L.company && norm_(L.company) !== norm_(u.company)) return { ok: true, known: true, other: true };
  return { ok: true, via: R.via, known: L.known, name: L.name, company: L.company, maxA: L.maxA, next: L.next, phk: L.phk, since: L.since, until: L.until };
}
function add_(b, u) {
  if (u.role === 'viewer') return { ok: false, error: 'forbidden' };
  var d = b.rec || {};
  var date = str_(d.date).slice(0, 10), level = str_(d.level);
  var name = str_(d.name).trim(), empId = str_(d.empId).trim().replace(/\s+/g, ' ');
  var pos = str_(d.position).trim(), viol = str_(d.violation).trim();
  var company = u.role === 'admin' ? str_(d.company).trim() : u.company;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || ['1', '2', '3', 'ZT'].indexOf(level) < 0) return { ok: false, error: 'bad_request' };
  if (!name || badgeKey_(empId).length < 3 || !pos || !viol || !company) return { ok: false, error: 'missing' };
  if (date > Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd')) return { ok: false, error: 'future' };
  var photo = str_(b.photo).replace(/^data:image\/\w+;base64,/, '');
  if (u.role !== 'admin' && !photo) return { ok: false, error: 'photo' };
  if (photo.length > 4000000) return { ok: false, error: 'photo_big' };

  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var all = recs_(), key = badgeKey_(empId), flags = [], map = pkMap_(all), R = resolve_(all, map, empId, name, '', company);
    var dup = all.some(function (r) { return r.status !== 'Deleted' && r.status !== 'Rejected' && (badgeKey_(r.empId) === key || (R.pk && map[r.id] === R.pk)) && r.date === date && norm_(r.violation) === norm_(viol); });
    if (dup) return { ok: false, error: 'duplicate' };

    var L = ladder_(all, map, R.pk, date, '');
    if (L.known) {
      if (u.role !== 'admin' && L.company && norm_(L.company) !== norm_(u.company)) return { ok: false, error: 'other_company' };
      if (R.via === 'id' && norm_(L.name) !== norm_(name)) {
        var a = norm_(L.name).split(' '), c = norm_(name).split(' ');
        var sub = a.every(function (w) { return c.indexOf(w) >= 0; }) || c.every(function (w) { return a.indexOf(w) >= 0; });
        if (!sub) flags.push('NAME_MISMATCH');
      }
    } else {
      var sameName = all.some(function (r) { return r.status !== 'Deleted' && !isLegacy_(r) && norm_(r.name) === norm_(name) && badgeKey_(r.empId) !== key; });
      if (sameName) flags.push('SAME_NAME_NEW_BADGE');
    }
    if (level !== 'ZT' && L.known && +level !== L.next && !(L.phk && level === '3')) flags.push('LEVEL_MISMATCH');
    if (level !== 'ZT' && L.phk) flags.push('SP3_ACTIVE');

    var photoId = '', hash = '';
    if (photo) {
      var bytes = Utilities.base64Decode(photo);
      hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)).slice(0, 24);
      var reused = all.some(function (r) { return r.photoHash && r.photoHash === hash && r.status !== 'Deleted'; });
      if (reused) flags.push('PHOTO_REUSED');
    }
    var id = 1; all.forEach(function (r) { if (+r.id >= id) id = +r.id + 1; });
    if (photo) {
      var blob = Utilities.newBlob(bytes, 'image/jpeg', 'DR' + id + '_' + key + '.jpg');
      photoId = photoFolder_().createFile(blob).getId();
    }
    var rec = {
      id: id, date: date, company: company, name: name, empId: empId, position: pos, level: level, violation: viol,
      givenBy: str_(d.givenBy).trim() || u.name, ack: str_(d.ack) || '0',
      status: u.role === 'admin' ? 'Verified' : 'Pending', flags: flags.join(','), photoId: photoId, photoHash: hash,
      addedBy: u.email, addedAt: now_(), verifiedBy: u.role === 'admin' ? u.email : '', verifiedAt: u.role === 'admin' ? now_() : '', note: '', source: u.role === 'admin' ? 'admin' : 'ic'
    };
    writeRec_(rec);
    audit_(u, 'ADD', id, key + ' ' + level + ' ' + flags.join(','));
    return { ok: true, id: id, status: rec.status };
  } finally { lock.releaseLock(); }
}
/** HSSE (admin) posts the punched-badge photo + violation. The IC then completes the details. */
function post_(b, u) {
  if (u.role !== 'admin') return { ok: false, error: 'forbidden' };
  var d = b.rec || {}, date = str_(d.date).slice(0, 10), company = str_(d.company).trim(), viol = str_(d.violation).trim();
  var photo = str_(b.photo).replace(/^data:image\/\w+;base64,/, '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !company || !viol) return { ok: false, error: 'missing' };
  if (!photo) return { ok: false, error: 'photo' };
  if (photo.length > 4000000) return { ok: false, error: 'photo_big' };
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var all = recs_(), id = 1; all.forEach(function (r) { if (+r.id >= id) id = +r.id + 1; });
    var bytes = Utilities.base64Decode(photo);
    var hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)).slice(0, 24);
    var photoId = photoFolder_().createFile(Utilities.newBlob(bytes, 'image/jpeg', 'DR' + id + '_posted.jpg')).getId();
    writeRec_({ id: id, date: date, company: company, name: '', empId: '', position: '', level: '', violation: viol, givenBy: str_(d.givenBy).trim() || u.name, ack: '0',
      status: 'Awaiting', flags: '', photoId: photoId, photoHash: hash, addedBy: u.email, addedAt: now_(), verifiedBy: '', verifiedAt: '', note: '', source: 'hsse' });
    audit_(u, 'POST', id, company + ' ' + date);
    return { ok: true, id: id };
  } finally { lock.releaseLock(); }
}
/** The IC completes a posted item: badge number, name, position, level. The photo stays the one HSSE posted. */
function fill_(b, u) {
  if (u.role !== 'ic') return { ok: false, error: 'forbidden' };
  var d = b.rec || {}, name = str_(d.name).trim(), empId = str_(d.empId).trim().replace(/\s+/g, ' '), pos = str_(d.position).trim(), level = str_(d.level);
  if (['1', '2', '3', 'ZT'].indexOf(level) < 0) return { ok: false, error: 'bad_request' };
  if (!name || badgeKey_(empId).length < 3 || !pos) return { ok: false, error: 'missing' };
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var all = recs_(), r = all.filter(function (x) { return String(x.id) === String(b.id); })[0];
    if (!r || r.status !== 'Awaiting') return { ok: false, error: 'not_found' };
    if (norm_(r.company) !== norm_(u.company)) return { ok: false, error: 'forbidden' };
    var key = badgeKey_(empId), flags = [], map = pkMap_(all), R = resolve_(all, map, empId, name, r.id, u.company);
    var dup = all.some(function (x) { return x.id !== r.id && x.status !== 'Deleted' && x.status !== 'Rejected' && x.status !== 'Awaiting' && (badgeKey_(x.empId) === key || (R.pk && map[x.id] === R.pk)) && x.date === r.date && norm_(x.violation) === norm_(r.violation); });
    if (dup) return { ok: false, error: 'duplicate' };
    var L = ladder_(all, map, R.pk, r.date, r.id);
    if (L.known) {
      if (L.company && norm_(L.company) !== norm_(u.company)) return { ok: false, error: 'other_company' };
      if (R.via === 'id' && norm_(L.name) !== norm_(name)) {
        var a = norm_(L.name).split(' '), c = norm_(name).split(' ');
        if (!(a.every(function (w) { return c.indexOf(w) >= 0; }) || c.every(function (w) { return a.indexOf(w) >= 0; }))) flags.push('NAME_MISMATCH');
      }
    } else if (all.some(function (x) { return x.status !== 'Deleted' && x.id !== r.id && norm_(x.name) === norm_(name) && !isLegacy_(x) && badgeKey_(x.empId) !== key; })) flags.push('SAME_NAME_NEW_BADGE');
    if (level !== 'ZT' && L.known && +level !== L.next && !(L.phk && level === '3')) flags.push('LEVEL_MISMATCH');
    if (level !== 'ZT' && L.phk) flags.push('SP3_ACTIVE');
    r.name = name; r.empId = empId; r.position = pos; r.level = level; r.flags = flags.join(',');
    r.status = 'Pending'; r.addedBy = u.email + (r.addedBy ? ' (posted by ' + r.addedBy + ')' : ''); r.addedAt = now_();
    writeRec_(r, r._row);
    audit_(u, 'FILL', r.id, key + ' ' + level + ' ' + flags.join(','));
    return { ok: true, id: r.id };
  } finally { lock.releaseLock(); }
}
/** Daily email to every active IC admin that has posted items waiting. Counts only, no names. Run setupReminder() once. */
function remindICs() {
  var aw = recs_().filter(function (r) { return r.status === 'Awaiting'; }), today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), sent = 0;
  users_().forEach(function (u) {
    if (norm_(u.role) !== 'ic' || norm_(u.active) === 'no') return;
    var mine = aw.filter(function (r) { return norm_(r.company) === norm_(u.company); });
    if (!mine.length) return;
    var oldest = mine.map(function (r) { return r.date; }).sort()[0];
    var days = Math.round((new Date(today) - new Date(oldest)) / 86400000);
    MailApp.sendEmail({ to: u.email, subject: 'EcoOils Disciplinary Record - ' + mine.length + ' warning(s) waiting for your details',
      body: mine.length + ' safety warning(s) for ' + u.company + ' are waiting for you to enter the badge number, name, position and level.\nOldest: ' + oldest + ' (' + days + ' days).\n\nOpen the app and sign in with your email code.\n\nEcoOils Mentari Project - HSSE' });
    sent++;
  });
  return sent;
}
function setupReminder() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'remindICs') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('remindICs').timeBased().everyDays(1).atHour(8).inTimezone(TZ).create();
  Logger.log('Daily reminder set for about 08:00 Jakarta.');
}
function review_(b, u) {
  if (u.role !== 'admin') return { ok: false, error: 'forbidden' };
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var r = recs_().filter(function (x) { return String(x.id) === String(b.id); })[0];
    if (!r || r.status === 'Deleted') return { ok: false, error: 'not_found' };
    if (r.status === 'Awaiting') return { ok: false, error: 'not_ready' };
    var dec = b.decision === 'reject' ? 'Rejected' : 'Verified';
    if (dec === 'Rejected' && !str_(b.note).trim()) return { ok: false, error: 'note' };
    r.status = dec; r.verifiedBy = u.email; r.verifiedAt = now_(); r.note = str_(b.note).trim();
    writeRec_(r, r._row);
    audit_(u, dec === 'Verified' ? 'VERIFY' : 'REJECT', r.id, r.note);
    return { ok: true };
  } finally { lock.releaseLock(); }
}
function update_(b, u) {
  if (u.role !== 'admin') return { ok: false, error: 'forbidden' };
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var r = recs_().filter(function (x) { return String(x.id) === String(b.id); })[0];
    if (!r || r.status === 'Deleted') return { ok: false, error: 'not_found' };
    var d = b.rec || {}, ch = [];
    ['date', 'company', 'name', 'empId', 'position', 'level', 'violation', 'givenBy', 'ack'].forEach(function (f) {
      if (d[f] !== undefined && str_(d[f]) !== r[f]) { ch.push(f + ': ' + r[f] + ' -> ' + str_(d[f])); r[f] = str_(d[f]).trim(); }
    });
    if (ch.length) { writeRec_(r, r._row); audit_(u, 'EDIT', r.id, ch.join(' | ')); }
    return { ok: true };
  } finally { lock.releaseLock(); }
}
function delete_(b, u) {
  if (u.role !== 'admin') return { ok: false, error: 'forbidden' };
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var r = recs_().filter(function (x) { return String(x.id) === String(b.id); })[0];
    if (!r) return { ok: false, error: 'not_found' };
    r.status = 'Deleted'; r.note = (r.note ? r.note + ' | ' : '') + 'deleted by ' + u.email;
    writeRec_(r, r._row);
    audit_(u, 'DELETE', r.id, r.name + ' ' + r.empId + ' ' + r.date);
    return { ok: true };
  } finally { lock.releaseLock(); }
}
function import_(b, u) {
  if (u.role !== 'admin') return { ok: false, error: 'forbidden' };
  var inc = b.records || [];
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var removed = 0;
    if (b.replace === true) {
      var shr = recSh_();
      recs_().filter(isLegacy_).sort(function (a, c) { return c._row - a._row; }).forEach(function (r) { shr.deleteRow(r._row); removed++; });
      audit_(u, 'PURGE_LEGACY', '', removed + ' legacy records removed before re-import');
    }
    var all = recs_(), have = {}, id = 1, n = 0, dup = 0;
    all.forEach(function (r) { if (+r.id >= id) id = +r.id + 1; if (r.status !== 'Deleted') have[[r.date, norm_(r.name), norm_(r.empId), norm_(r.violation)].join('|')] = 1; });
    var rows = [];
    inc.forEach(function (d) {
      var date = str_(d.date).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !str_(d.name).trim() || ['1', '2', '3', 'ZT'].indexOf(str_(d.level)) < 0) return;
      var k = [date, norm_(d.name), norm_(d.empId), norm_(d.violation)].join('|');
      if (have[k]) { dup++; return; } have[k] = 1;
      var rec = { id: id++, date: date, company: str_(d.company).trim(), name: str_(d.name).trim(), empId: str_(d.empId).trim(), position: str_(d.position).trim(), level: str_(d.level),
        violation: str_(d.violation).trim(), givenBy: str_(d.givenBy).trim(), ack: str_(d.ack) || '0', status: 'Verified', flags: '', photoId: '', photoHash: '',
        addedBy: u.email, addedAt: now_(), verifiedBy: u.email, verifiedAt: now_(), note: 'legacy import', source: 'legacy' };
      rows.push(REC_H.map(function (h) { return str_(rec[h]); })); n++;
    });
    if (rows.length) {
      var sh = recSh_(), r0 = sh.getLastRow() + 1;
      sh.getRange(r0, 1, rows.length, REC_H.length).setNumberFormat('@').setValues(rows);
    }
    audit_(u, 'IMPORT', '', n + ' added, ' + dup + ' duplicates');
    return { ok: true, added: n, duplicates: dup, removed: removed };
  } finally { lock.releaseLock(); }
}
function photo_(b, u) {
  var r = recs_().filter(function (x) { return String(x.id) === String(b.id); })[0];
  if (!r || r.status === 'Deleted' || !r.photoId) return { ok: false, error: 'not_found' };
  if (!canRead_(u) && norm_(r.company) !== norm_(u.company)) return { ok: false, error: 'forbidden' };
  var bytes = DriveApp.getFileById(r.photoId).getBlob().getBytes();
  return { ok: true, data: 'data:image/jpeg;base64,' + Utilities.base64Encode(bytes) };
}
function users_list_(b, u) {
  if (u.role !== 'admin') return { ok: false, error: 'forbidden' };
  return { ok: true, users: users_().map(function (x) { return { email: x.email, name: x.name, company: x.company, role: x.role, active: x.active }; }) };
}
function users_save_(b, u) {
  if (u.role !== 'admin') return { ok: false, error: 'forbidden' };
  var d = b.user || {}, email = norm_(d.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'bad_email' };
  var role = d.role === 'admin' ? 'admin' : d.role === 'viewer' ? 'viewer' : 'ic', company = str_(d.company).trim();
  if (role === 'ic' && !company) return { ok: false, error: 'missing' };
  var active = d.active === 'no' ? 'no' : 'yes';
  if (email === norm_(u.email) && (role !== 'admin' || active === 'no')) return { ok: false, error: 'self' };
  var sh = userSh_(), l = users_(), row = 0;
  l.forEach(function (x) { if (norm_(x.email) === email) row = x._row; });
  var arr = [email, str_(d.name).trim(), company, role, active];
  if (row) sh.getRange(row, 1, 1, 5).setValues([arr]); else sh.appendRow(arr);
  audit_(u, 'USER', '', email + ' ' + role + ' ' + company + ' ' + active);
  return { ok: true };
}
function audit_list_(b, u) {
  if (u.role !== 'admin') return { ok: false, error: 'forbidden' };
  var v = audSh_().getDataRange().getValues().slice(1).reverse().slice(0, 300);
  return { ok: true, rows: v.map(function (r) { return r.map(function (x) { return x instanceof Date ? Utilities.formatDate(x, TZ, "yyyy-MM-dd HH:mm") : str_(x); }); }) };
}

var ACTIONS_ = { post: post_, fill: fill_, list: list_, lookup: lookup_, add: add_, review: review_, update: update_, 'delete': delete_, import: import_, photo: photo_, users: users_list_, usersave: users_save_, audit: audit_list_ };

function doGet() { return out_({ ok: true, app: 'EcoOils Disciplinary Record', version: '2.0' }); }
function doPost(e) {
  try {
    if (!e || !e.postData) return out_({ ok: false, error: 'no_body' });
    var b = JSON.parse(e.postData.contents);
    if (b.action === 'reqcode') return out_(reqCode_(b));
    if (b.action === 'verify') return out_(verify_(b));
    var u = sess_(b.token);
    if (!u) return out_({ ok: false, error: 'auth' });
    if (b.action === 'logout') {
      CacheService.getScriptCache().remove('sess:' + b.token);
      var sh = sesSh_(), h = hash_(b.token), v = sh.getDataRange().getValues();
      for (var i = v.length; i >= 2; i--) { if (v[i - 1][0] === h) sh.deleteRow(i); }
      return out_({ ok: true });
    }
    var f = ACTIONS_[b.action];
    if (!f) return out_({ ok: false, error: 'bad_action' });
    return out_(f(b, u));
  } catch (err) {
    return out_({ ok: false, error: 'server', detail: String(err && err.message || err) });
  }
}

/** Optional: copy rows of the old 'Warnings' sheet (v1) into Records as verified legacy. Safe to run twice. */
function migrateLegacy() {
  var old = ss_().getSheetByName('Warnings');
  if (!old) { Logger.log('No Warnings sheet.'); return; }
  var v = old.getDataRange().getValues(), H = v[0], recs = [];
  for (var i = 1; i < v.length; i++) {
    var o = {}; H.forEach(function (h, j) { var x = v[i][j]; o[h] = x instanceof Date ? Utilities.formatDate(x, TZ, 'yyyy-MM-dd') : str_(x); });
    recs.push(o);
  }
  var res = import_({ records: recs }, { email: Session.getEffectiveUser().getEmail(), role: 'admin' });
  Logger.log(JSON.stringify(res));
}
