// お仕事説明会 応募フォーム＋管理（2026-11-05）
// 画面は GitHub Pages（docs/）。ここは受け口（API）だけ。平山さんの権限で動き、誰でも呼べる（executeAs=USER_DEPLOYING・access=ANYONE_ANONYMOUS）
// 応募（apply）と画面に出す設定（config）は誰でも。ほかはパスワードでログインしたトークンが必要
var VERSION = 'v2';
var HEAD = ['id', 'created', 'name', 'kana', 'gender', 'birth', 'tel', 'email', 'wish1', 'wish2', 'wish3', 'slot', 'status', 'memo', 'updated', 'mail', 'source'];
var SOURCES = ['フォーム', '電話']; // 受付の経路（source が空＝フォーム）
var STATUSES = ['未連絡', '連絡済み', '不在・折り返し待ち', '参加確定', '辞退', 'その他'];
var GENDERS = ['男性', '女性'];
var TOKEN_SEC = 6 * 3600; // ログインの有効時間（CacheService の上限）
var DEFAULTS = {
  title: 'お仕事説明会',
  date: '',
  place: '',
  intro: 'ご希望の時間帯を選んでお申し込みください。参加いただく時間は、担当者よりお電話でご連絡します。',
  open: '1',
  slots: '10:00〜11:00\n11:00〜12:00\n12:00〜13:00\n13:00〜14:00\n14:00〜15:00\n15:00〜16:00\n16:00〜17:00',
  capacity: '{}',
  staff: '',
  sender_name: 'お仕事説明会 受付',
  reply_to: '',
  mail_subject: '【応募受付】{説明会名}へのご応募ありがとうございます',
  mail_body: '{氏名} 様\n\nこのたびは「{説明会名}」にご応募いただき、ありがとうございます。\n以下の内容で受け付けました。\n\n{応募内容}\n\n参加いただく時間は、担当者よりお電話でご連絡いたします。\nしばらくお待ちください。\n\nご不明な点は、このメールにご返信ください。\n\n{署名}',
  signature: '',
  staff_subject: '【新しい応募】{氏名} 様（{説明会名}）'
};

// ---------- 入口 ----------
function doGet() { return json_({ ok: true, version: VERSION }); }
function doPost(e) {
  var req;
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) { return json_({ error: '送信の形が正しくありません' }); }
  try { return json_(route_(req)); }
  catch (x) { console.error(x); return json_({ error: String(x && x.message || x) }); }
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function route_(req) {
  var a = String(req.action || '');
  if (a === 'config') return publicConfig_();
  if (a === 'apply') return apply_(req.data || {});
  if (a === 'login') return login_(req.password);
  auth_(req.token);
  if (a === 'list') return adminData_();
  if (a === 'update') return update_(req.id, req.fields || {});
  if (a === 'remove') return remove_(req.id);
  if (a === 'add') return add_(req.data || {}, !!req.sendMail);
  if (a === 'edit') return edit_(req.id, req.data || {});
  if (a === 'saveSettings') return saveSettings_(req.settings || {});
  if (a === 'changePassword') return changePassword_(req.current, req.next);
  if (a === 'logout') { CacheService.getScriptCache().remove('tok_' + req.token); return { ok: true }; }
  throw new Error('不明な操作です');
}

// ---------- シート ----------
function book_() { return SpreadsheetApp.getActive(); } // このスクリプトがついているスプレッドシート（権限は currentonly だけ）
function sheet_(name) {
  var ss = book_(), sh = ss.getSheetByName(name);
  if (sh) { if (name === '応募者') headFix_(sh); return sh; }
  sh = ss.insertSheet(name);
  if (name === '応募者') {
    sh.getRange(1, 1, 1000, HEAD.length).setNumberFormat('@'); // 電話の先頭0・日付の文字をそのまま残す
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold');
  } else if (name === '設定') {
    sh.getRange(1, 1, 1000, 2).setNumberFormat('@');
    sh.getRange(1, 1, 1, 2).setValues([['key', 'value']]).setFontWeight('bold');
  }
  return sh;
}
// 後から足した列（source）の見出しを、前からあるシートにも入れる（1回の呼び出しで1度だけ見る）
var HEAD_OK = false;
function headFix_(sh) {
  if (HEAD_OK) return; HEAD_OK = true;
  var h = sh.getRange(1, 1, 1, HEAD.length).getValues()[0];
  HEAD.forEach(function (k, j) { if (!h[j]) { sh.getRange(1, j + 1, 1000, 1).setNumberFormat('@'); sh.getRange(1, j + 1).setValue(k).setFontWeight('bold'); } });
}
function settings_() {
  var cache = CacheService.getScriptCache(), c = cache.get('settings');
  if (c) return JSON.parse(c);
  var s = {}, k;
  for (k in DEFAULTS) s[k] = DEFAULTS[k];
  var sh = sheet_('設定'), n = sh.getLastRow();
  if (n > 1) sh.getRange(2, 1, n - 1, 2).getValues().forEach(function (r) { if (r[0] && DEFAULTS.hasOwnProperty(r[0])) s[r[0]] = String(r[1]); });
  cache.put('settings', JSON.stringify(s), 600);
  return s;
}
function slots_(s) { return String(s.slots).split('\n').map(function (x) { return x.trim(); }).filter(String); }
function capacity_(s) { try { var o = JSON.parse(s.capacity || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
function staffList_(s) { return String(s.staff || '').split(/[\s,、;]+/).map(function (x) { return x.trim(); }).filter(function (x) { return EMAIL_RE.test(x); }); }
function now_() { return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'); }
// 先頭が = + - @ の文字は式として動かないように（シートを開いたときの事故防止）
function safe_(v) { v = String(v == null ? '' : v); return /^[=+\-@]/.test(v) ? "'" + v : v; }
function unsafe_(v) { v = String(v == null ? '' : v); return v.charAt(0) === "'" ? v.slice(1) : v; }

function rows_() {
  var sh = sheet_('応募者'), n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, HEAD.length).getValues().map(function (r, i) {
    var o = { row: i + 2 };
    HEAD.forEach(function (h, j) { o[h] = unsafe_(r[j]); });
    return o;
  }).filter(function (o) { return o.id; });
}

// ---------- 公開 ----------
function publicConfig_() {
  var s = settings_();
  return { title: s.title, date: s.date, place: s.place, intro: s.intro, open: s.open === '1', slots: slots_(s) };
}

var EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;
var KANA_RE = /^[ぁ-ゖァ-ヺー・\s　]+$/;
function clean_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 100); }
function toHalf_(v) { return String(v).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/[－ー−‐―]/g, '-'); }

// 入力の確認（画面と同じルール）。正しければ整えた値、だめならエラー
// staff=true は管理画面からの入力（電話受付など）: 必須はお名前・ふりがな・電話番号だけ
function validate_(d, s, staff) {
  var errs = {}, out = {};
  out.name = clean_(d.name, 50); if (!out.name) errs.name = 'お名前を入力してください';
  out.kana = clean_(d.kana, 50); if (!out.kana) errs.kana = 'ふりがなを入力してください'; else if (!KANA_RE.test(out.kana)) errs.kana = 'ふりがなは ひらがな で入力してください';
  out.gender = clean_(d.gender, 5); if (GENDERS.indexOf(out.gender) < 0 && !(staff && !out.gender)) errs.gender = '性別を選んでください';
  out.birth = clean_(d.birth, 10);
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(out.birth), today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  if (!m) { if (!(staff && !out.birth)) errs.birth = out.birth ? '生年月日が正しくありません' : '生年月日を選んでください'; }
  else {
    var dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (dt.getUTCMonth() !== +m[2] - 1 || dt.getUTCDate() !== +m[3] || +m[1] < 1900 || out.birth > today) errs.birth = '生年月日が正しくありません';
  }
  out.tel = toHalf_(clean_(d.tel, 20)).replace(/[()（）\s]/g, '');
  var digits = out.tel.replace(/-/g, '');
  if (!out.tel) errs.tel = '電話番号を入力してください'; else if (!/^[0-9-]+$/.test(out.tel) || !/^0\d{9,10}$/.test(digits)) errs.tel = '電話番号が正しくありません（例: 090-1234-5678）';
  out.email = toHalf_(clean_(d.email, 100)).replace(/＠/g, '@').toLowerCase();
  if (!out.email) { if (!staff) errs.email = 'メールアドレスを入力してください'; } else if (!EMAIL_RE.test(out.email)) errs.email = 'メールアドレスが正しくありません';
  var slots = slots_(s), w = Array.isArray(d.wishes) ? d.wishes.map(String) : [], seen = {};
  w = w.filter(function (x) { if (seen[x]) return false; seen[x] = true; return true; });
  if (!w.length) { if (!staff) errs.wishes = '希望の時間帯を1つ以上選んでください'; }
  else if (w.length > 3) errs.wishes = '希望の時間帯は3つまでです';
  else if (w.some(function (x) { return slots.indexOf(x) < 0; })) errs.wishes = '時間帯の選び方が正しくありません。ページを読み込み直してください';
  out.wishes = w.sort(function (a, b) { return slots.indexOf(a) - slots.indexOf(b); });
  return { ok: !Object.keys(errs).length, errors: errs, value: out };
}

function apply_(d) {
  if (d.website) return { ok: true }; // ロボット避け（人には見えない欄）
  var s = settings_();
  if (s.open !== '1') return { error: '受付は終了しました', closed: true };
  var v = validate_(d, s);
  if (!v.ok) return { error: '入力内容を確認してください', errors: v.errors };
  var x = v.value, lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var id, created;
  try {
    var sh = sheet_('応募者');
    id = Utilities.getUuid().slice(0, 8); created = now_();
    sh.appendRow([id, created, x.name, x.kana, x.gender, x.birth, x.tel, x.email, x.wishes[0] || '', x.wishes[1] || '', x.wishes[2] || '', '', STATUSES[0], '', created, ''].map(safe_));
  } finally { lock.releaseLock(); }
  var mail = sendMails_(s, x, created, true);
  if (mail) setCell_(id, 'mail', mail);
  return { ok: true };
}

// 本人と受付担当にメール。送れなかったときは記録して、応募自体は受け付ける
function sendMails_(s, x, created, toStaff) {
  var vars = {
    '氏名': x.name, 'ふりがな': x.kana, '説明会名': s.title, '開催日': s.date, '会場': s.place, '署名': s.signature,
    '希望時間帯': x.wishes.join('、'),
    '応募内容': ['お名前：' + x.name + '（' + x.kana + '）', x.gender ? '性別：' + x.gender : '', x.birth ? '生年月日：' + birthText_(x.birth) : '', '電話番号：' + x.tel, x.email ? 'メールアドレス：' + x.email : '',
      x.wishes.length ? '希望の時間帯：' + x.wishes.join('、') : ''].filter(String).concat(s.date ? ['開催日：' + s.date] : []).concat(s.place ? ['会場：' + s.place] : []).join('\n')
  };
  var problems = [], staff = staffList_(s), opt = { name: s.sender_name || DEFAULTS.sender_name };
  var reply = EMAIL_RE.test(s.reply_to) ? s.reply_to : staff[0];
  try {
    MailApp.sendEmail({ to: x.email, subject: fill_(s.mail_subject, vars), body: fill_(s.mail_body, vars).replace(/\n{3,}/g, '\n\n').trim() + '\n', name: opt.name, replyTo: reply || undefined });
  } catch (e) { console.error(e); problems.push('本人へのメール失敗: ' + String(e.message || e)); }
  if (toStaff && staff.length) {
    try {
      MailApp.sendEmail({ to: staff.join(','), subject: fill_(s.staff_subject, vars), name: opt.name, replyTo: x.email,
        body: '新しい応募がありました（' + created + '）。\n\n' + vars['応募内容'] + '\n\n管理画面で一覧・時間割を確認できます。\n' });
    } catch (e2) { console.error(e2); problems.push('受付担当へのメール失敗: ' + String(e2.message || e2)); }
  }
  return problems.join(' / ');
}
function fill_(t, vars) { return String(t || '').replace(/\{([^{}]+)\}/g, function (m, k) { return vars.hasOwnProperty(k) ? (vars[k] || '') : m; }); }
function birthText_(b) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b); return m ? m[1] + '年' + (+m[2]) + '月' + (+m[3]) + '日' : b; }

// ---------- ログイン ----------
function hash_(pw, salt) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pw, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
function setPassword_(pw) {
  var salt = Utilities.getUuid(), p = PropertiesService.getScriptProperties();
  p.setProperty('PW_SALT', salt); p.setProperty('PW_HASH', hash_(pw, salt));
}
function login_(pw) {
  var cache = CacheService.getScriptCache(), fails = +(cache.get('fails') || 0);
  if (fails >= 10) return { error: 'パスワードの間違いが続いたため、10分ほど待ってからお試しください' };
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('PW_HASH') && typeof INIT_PW !== 'undefined' && INIT_PW) setPassword_(INIT_PW); // 最初のパスワード（Secret.gs・GitHub には置かない）
  var salt = p.getProperty('PW_SALT'), h = p.getProperty('PW_HASH');
  if (!h || !pw || hash_(String(pw), salt) !== h) { cache.put('fails', String(fails + 1), 600); return { error: 'パスワードが違います' }; }
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  cache.put('tok_' + token, '1', TOKEN_SEC);
  return { ok: true, token: token };
}
function auth_(token) {
  if (!token || !/^[0-9a-f]{64}$/.test(String(token)) || !CacheService.getScriptCache().get('tok_' + token)) { var e = new Error('ログインの期限が切れました。もう一度ログインしてください'); throw e; }
}
function changePassword_(cur, next) {
  var p = PropertiesService.getScriptProperties();
  if (hash_(String(cur || ''), p.getProperty('PW_SALT')) !== p.getProperty('PW_HASH')) return { error: '今のパスワードが違います' };
  next = String(next || '');
  if (next.length < 8) return { error: '新しいパスワードは8文字以上にしてください' };
  setPassword_(next);
  return { ok: true };
}

// ---------- 管理 ----------
function adminData_() {
  var s = settings_();
  var list = rows_().map(function (o) { delete o.row; return o; });
  list.forEach(function (o) { if (!o.source) o.source = 'フォーム'; });
  return { sources: SOURCES, applicants: list, settings: s, slots: slots_(s), capacity: capacity_(s), statuses: STATUSES, staffValid: staffList_(s), version: VERSION };
}
function findRow_(id) {
  var sh = sheet_('応募者'), n = sh.getLastRow();
  if (!id || n < 2) return 0;
  var ids = sh.getRange(2, 1, n - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return 0;
}
function setCell_(id, key, val) {
  var r = findRow_(id); if (!r) return;
  sheet_('応募者').getRange(r, HEAD.indexOf(key) + 1).setValue(safe_(val));
}
function update_(id, f) {
  var s = settings_(), lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var r = findRow_(id);
    if (!r) return { error: 'この応募は見つかりません（削除された可能性があります）' };
    var sh = sheet_('応募者'), cur = sh.getRange(r, 1, 1, HEAD.length).getValues()[0];
    if (f.hasOwnProperty('slot')) { var sl = String(f.slot || ''); if (sl && slots_(s).indexOf(sl) < 0) return { error: '時間帯が正しくありません' }; cur[HEAD.indexOf('slot')] = sl; }
    if (f.hasOwnProperty('status')) { if (STATUSES.indexOf(String(f.status)) < 0) return { error: '状況が正しくありません' }; cur[HEAD.indexOf('status')] = String(f.status); }
    if (f.hasOwnProperty('memo')) cur[HEAD.indexOf('memo')] = safe_(String(f.memo || '').slice(0, 2000));
    cur[HEAD.indexOf('updated')] = now_();
    sh.getRange(r, 1, 1, HEAD.length).setValues([cur]);
    var o = {}; HEAD.forEach(function (h, j) { o[h] = unsafe_(cur[j]); });
    return { ok: true, applicant: o };
  } finally { lock.releaseLock(); }
}
// 管理画面から追加（電話受付など）。メールは「受付メールを送る」にしたときだけ本人へ（受付担当へは送らない）
function add_(d, sendMail) {
  var s = settings_(), v = validate_(d, s, true);
  if (!v.ok) return { error: '入力内容を確認してください', errors: v.errors };
  var x = v.value, src = SOURCES.indexOf(String(d.source)) >= 0 ? String(d.source) : '電話';
  var slot = String(d.slot || ''), st = STATUSES.indexOf(String(d.status)) >= 0 ? String(d.status) : '連絡済み';
  if (slot && slots_(s).indexOf(slot) < 0) return { error: '時間帯が正しくありません' };
  if (sendMail && !x.email) return { error: '受付メールを送るには、メールアドレスを入れてください' };
  var lock = LockService.getScriptLock(), id, created;
  lock.waitLock(20000);
  try {
    id = Utilities.getUuid().slice(0, 8); created = now_();
    sheet_('応募者').appendRow([id, created, x.name, x.kana, x.gender, x.birth, x.tel, x.email, x.wishes[0] || '', x.wishes[1] || '', x.wishes[2] || '', slot, st, String(d.memo || '').slice(0, 2000), created, '', src].map(safe_));
  } finally { lock.releaseLock(); }
  if (sendMail) { var mail = sendMails_(s, x, created, false); if (mail) setCell_(id, 'mail', mail); }
  return { ok: true, id: id };
}
// 基本の項目（名前・ふりがな・性別・生年月日・電話・メール・希望）を直す。割当・状況・メモは update_
function edit_(id, d) {
  var s = settings_(), v = validate_(d, s, true);
  if (!v.ok) return { error: '入力内容を確認してください', errors: v.errors };
  var x = v.value, lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var r = findRow_(id);
    if (!r) return { error: 'この応募は見つかりません（削除された可能性があります）' };
    var sh = sheet_('応募者'), cur = sh.getRange(r, 1, 1, HEAD.length).getValues()[0];
    ['name', 'kana', 'gender', 'birth', 'tel', 'email'].forEach(function (k) { cur[HEAD.indexOf(k)] = safe_(x[k]); });
    [0, 1, 2].forEach(function (i) { cur[HEAD.indexOf('wish' + (i + 1))] = x.wishes[i] || ''; });
    cur[HEAD.indexOf('updated')] = now_();
    sh.getRange(r, 1, 1, HEAD.length).setValues([cur]);
    var o = {}; HEAD.forEach(function (h, j) { o[h] = unsafe_(cur[j]); });
    return { ok: true, applicant: o };
  } finally { lock.releaseLock(); }
}
function remove_(id) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var r = findRow_(id);
    if (!r) return { error: 'この応募は見つかりません' };
    sheet_('応募者').deleteRow(r);
    return { ok: true };
  } finally { lock.releaseLock(); }
}
function saveSettings_(inp) {
  var cur = settings_(), next = {}, k;
  for (k in DEFAULTS) next[k] = cur[k];
  ['title', 'date', 'place', 'sender_name', 'mail_subject', 'staff_subject'].forEach(function (k) { if (inp.hasOwnProperty(k)) next[k] = clean_(inp[k], 200); });
  ['intro', 'mail_body', 'signature'].forEach(function (k) { if (inp.hasOwnProperty(k)) next[k] = String(inp[k] || '').slice(0, 5000); });
  if (inp.hasOwnProperty('open')) next.open = inp.open ? '1' : '0';
  if (inp.hasOwnProperty('reply_to')) { var rt = clean_(inp.reply_to, 100); if (rt && !EMAIL_RE.test(rt)) return { error: '返信先のアドレスが正しくありません' }; next.reply_to = rt; }
  if (inp.hasOwnProperty('staff')) {
    var bad = String(inp.staff || '').split(/[\s,、;]+/).filter(function (x) { return x && !EMAIL_RE.test(x); });
    if (bad.length) return { error: '受付担当のアドレスが正しくありません: ' + bad.join(' ') };
    next.staff = String(inp.staff || '').split(/[\s,、;]+/).filter(String).join('\n');
  }
  if (inp.hasOwnProperty('slots')) {
    var sl = String(inp.slots || '').split('\n').map(function (x) { return clean_(x, 30); }).filter(String);
    if (!sl.length) return { error: '時間帯を1つ以上入れてください' };
    next.slots = sl.join('\n');
  }
  if (inp.hasOwnProperty('capacity')) {
    var c = {}, src = inp.capacity || {};
    Object.keys(src).forEach(function (k) { var n = parseInt(src[k], 10); if (n > 0 && n < 10000) c[k] = n; });
    next.capacity = JSON.stringify(c);
  }
  if (!next.mail_body.trim() || !next.mail_subject.trim()) return { error: '本人へのメールの件名と本文は空にできません' };
  var rows = Object.keys(DEFAULTS).map(function (k) { return [k, safe_(next[k])]; });
  var sh = sheet_('設定');
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).clearContent();
  sh.getRange(2, 1, rows.length, 2).setValues(rows);
  CacheService.getScriptCache().remove('settings');
  return { ok: true, settings: settings_() };
}

// ---------- 初期設定（エディタから1回だけ実行してもよい。実行しなくても最初の応募・ログインで作られる） ----------
function setup() { sheet_('応募者'); sheet_('設定'); return 'ok'; }
