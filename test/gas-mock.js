// Apps Script の最小限のモック（テスト用）。Node でもブラウザでも動く
(function (root) {
  function colNum(s) { var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + s.charCodeAt(i) - 64; return n; }

  function Sheet(name) { this.name = name; this.data = []; this.textCols = {}; }
  Sheet.prototype.getName = function () { return this.name; };
  Sheet.prototype.getSheetId = function () { return this.gid || (this.gid = 1000 + Math.floor(Math.random() * 1e6)); };
  Sheet.prototype.clear = function () { this.data = []; this.textCols = {}; this.fmt = {}; return this; };
  Sheet.prototype.setColumnWidths = function () { return this; };
  Sheet.prototype.setName = function (n) { this.name = n; return this; };
  Sheet.prototype.getMaxRows = function () { return Math.max(this.data.length, 1000); };
  // 本物と同じく、最後の空の行は数えない（中身を消した行の下には書かない）
  Sheet.prototype.getLastRow = function () { for (var i = this.data.length - 1; i >= 0; i--) { var r = this.data[i] || []; for (var j = 0; j < r.length; j++) if (r[j] !== '' && r[j] !== undefined && r[j] !== null) return i + 1; } return 0; };
  Sheet.prototype.getLastColumn = function () { return this.data.reduce(function (m, r) { return Math.max(m, r.length); }, 0); };
  Sheet.prototype.appendRow = function (r) { this.data[this.getLastRow()] = this._conv(r.slice(), 1); return this; }; // 本物と同じく最後の中身のある行の次に
  // 書式が文字列でない列に yyyy-MM-dd を入れると Date になる（実物と同じ落とし穴を再現）
  Sheet.prototype._conv = function (row, c0) {
    var self = this;
    return row.map(function (v, i) {
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !self.textCols[c0 + i]) return new Date(v + 'T00:00:00+09:00');
      return v;
    });
  };
  Sheet.prototype.getRange = function (a, c, nr, nc) {
    if (typeof a === 'string') {
      var m = /^([A-Z]+):([A-Z]+)$/.exec(a);
      if (m) { var c1 = colNum(m[1]), c2 = colNum(m[2]); return new Range(this, 1, c1, Math.max(this.data.length, 1), c2 - c1 + 1, true); }
      var m2 = /^([A-Z]+)(\d+)$/.exec(a);
      return new Range(this, +m2[2], colNum(m2[1]), 1, 1);
    }
    return new Range(this, a, c, nr || 1, nc || 1);
  };

  function Range(sh, r, c, nr, nc, whole) { this.sh = sh; this.r = r; this.c = c; this.nr = nr; this.nc = nc; this.whole = whole; }
  Range.prototype.getRow = function () { return this.r; };
  Range.prototype.getValues = function () {
    var out = [];
    for (var i = 0; i < this.nr; i++) {
      var row = this.sh.data[this.r - 1 + i] || [];
      var o = [];
      for (var j = 0; j < this.nc; j++) { var v = row[this.c - 1 + j]; o.push(v === undefined ? '' : v); }
      out.push(o);
    }
    return out;
  };
  Range.prototype.setValues = function (vals) {
    for (var i = 0; i < vals.length; i++) {
      var row = this.sh.data[this.r - 1 + i] || (this.sh.data[this.r - 1 + i] = []);
      var cv = this.sh._conv(vals[i], this.c);
      for (var j = 0; j < cv.length; j++) row[this.c - 1 + j] = cv[j];
    }
    return this;
  };
  Range.prototype.setValue = function (v) { return this.setValues([[v]]); };
  Range.prototype.setFontWeight = function (w) { var f = this.sh.fmt || (this.sh.fmt = {}); f[this.r] = Object.assign({}, f[this.r], { bold: w === 'bold' }); return this; };
  Range.prototype.setBackground = function (c) { var f = this.sh.fmt || (this.sh.fmt = {}); f[this.r] = Object.assign({}, f[this.r], { bg: c }); return this; };
  Range.prototype.setFormulas = function (vals) { return this.setValues(vals); };
  Range.prototype.setDataValidation = function (rule) { this.sh.validation = this.sh.validation || {}; this.sh.validation[this.c] = rule; return this; };
  Range.prototype.clearContent = function () { var e = []; for (var i = 0; i < this.nr; i++) { var row = []; for (var j = 0; j < this.nc; j++) row.push(''); e.push(row); } return this.setValues(e); };
  Range.prototype.getValue = function () { return this.getValues()[0][0]; };
  Range.prototype.setNumberFormat = function (f) { if (f === '@') for (var j = 0; j < this.nc; j++) this.sh.textCols[this.c + j] = true; return this; };
  Range.prototype.createTextFinder = function (text) {
    var self = this, entire = false;
    var tf = {
      matchEntireCell: function (b) { entire = b; return tf; },
      findNext: function () {
        for (var i = 0; i < self.sh.data.length; i++) for (var j = 0; j < self.nc; j++) {
          var v = String((self.sh.data[i] || [])[self.c - 1 + j]);
          if (entire ? v === text : v.indexOf(text) >= 0) return new Range(self.sh, i + 1, self.c + j, 1, 1);
        }
        return null;
      }
    };
    return tf;
  };

  function Spreadsheet(id, name) { this.id = id; this.name = name; this.sheets = [new Sheet('シート1')]; }
  Spreadsheet.prototype.getId = function () { return this.id; };
  Spreadsheet.prototype.getUrl = function () { return 'https://docs.google.com/spreadsheets/d/' + this.id; };
  Spreadsheet.prototype.getSpreadsheetTimeZone = function () { return this.tz || 'GMT'; };
  Spreadsheet.prototype.setSpreadsheetTimeZone = function (tz) { this.tz = tz; };
  Spreadsheet.prototype.getSheetByName = function (n) { return this.sheets.filter(function (s) { return s.name === n; })[0] || null; };
  Spreadsheet.prototype.insertSheet = function (n) { var s = new Sheet(n); this.sheets.push(s); return s; };
  Spreadsheet.prototype.deleteSheet = function (s) { this.sheets.splice(this.sheets.indexOf(s), 1); };
  Spreadsheet.prototype.getSheets = function () { return this.sheets.slice(); };
  Sheet.prototype.deleteRow = function (r) { this.data.splice(r - 1, 1); return this; };

  function pad(n) { return ('0' + n).slice(-2); }
  function lock_() { return { waitLock: function () {}, tryLock: function () { return true; }, releaseLock: function () {} }; }

  // store: 複数プロジェクトで共有するスプレッドシート置き場
  function makeEnv(store, opts) {
    opts = opts || {};
    var props = {};
    var env = {
      user: opts.user || 'owner@k-create.co.jp',
      now: null, // テストで日時を固定するとき Date を入れる
      SpreadsheetApp: {
        create: function (n) { var id = 'sheet' + (Object.keys(store).length + 1); store[id] = new Spreadsheet(id, n); return store[id]; },
        flush: function () {},
        openById: function (id) { if (!store[id]) throw new Error('no sheet ' + id); return store[id]; },
        newDataValidation: function () { var b = { list: null, requireValueInList: function (l) { b.list = l; return b; }, setAllowInvalid: function () { return b; }, setHelpText: function () { return b; }, build: function () { return { list: b.list }; } }; return b; }
      },
      PropertiesService: {
        getScriptProperties: function () { return {
          getProperty: function (k) { return props.hasOwnProperty(k) ? props[k] : null; },
          setProperty: function (k, v) { props[k] = String(v); }
        }; },
        // ユーザーごとの入れ物（本物も人ごとに別）
        getUserProperties: function () { var u = env.user; env.userProps[u] = env.userProps[u] || {}; var o = env.userProps[u]; return {
          getProperty: function (k) { return o.hasOwnProperty(k) ? o[k] : null; },
          setProperty: function (k, v) { o[k] = String(v); }
        }; }
      },
      userProps: {},
      // 時限トリガー（持ち主ごと）。env.triggers = [{owner, fn}]
      triggers: [],
      ScriptApp: {
        getService: function () { return { getUrl: function () { return opts.scriptUrl || ''; } }; },
        getProjectTriggers: function () { return env.triggers.filter(function (t) { return t.owner === env.user; }).map(function (t) { return { getHandlerFunction: function () { return t.fn; }, _t: t }; }); },
        deleteTrigger: function (tr) { var i = env.triggers.indexOf(tr._t); if (i >= 0) env.triggers.splice(i, 1); },
        newTrigger: function (fn) { var b = { timeBased: function () { return b; }, atHour: function () { return b; }, everyDays: function () { return b; }, everyHours: function () { return b; }, create: function () { env.triggers.push({ owner: env.user, fn: fn }); } }; return b; }
      },
      Session: {
        getActiveUser: function () { return { getEmail: function () { return env.user; } }; },
        getEffectiveUser: function () { return { getEmail: function () { return opts.owner || 'owner@k-create.co.jp'; } }; }
      },
      Utilities: { formatDate: function (d, tz, f) {
        var off = /^(GMT|UTC|Etc\/)/i.test(String(tz || '')) ? 0 : 9; // 日本時間（+9）か GMT（0）だけ区別する簡易版
        var t = new Date(d.getTime() + off * 3600000);
        return f.replace('yyyy', t.getUTCFullYear()).replace('MM', pad(t.getUTCMonth() + 1)).replace('dd', pad(t.getUTCDate()))
          .replace('HH', pad(t.getUTCHours())).replace('mm', pad(t.getUTCMinutes()));
      } },
      LockService: { getScriptLock: lock_, getUserLock: lock_ },
      // 全員共通のキャッシュ（本物は最長6時間・1件100KB）。env.cache で中身を見られる
      cache: {},
      CacheService: { getScriptCache: function () { return {
        get: function (k) { return env.cache.hasOwnProperty(k) ? env.cache[k] : null; },
        put: function (k, v) { if (String(v).length > 100000) throw new Error('too big'); env.cache[k] = String(v); },
        remove: function (k) { delete env.cache[k]; }
      }; } },
      // 送ったメールは env.mails に溜まる。MailApp の残り通数は 1500 − 今日送った数（送信者ごと）
      mails: [],
      GmailApp: { sendEmail: function (to, subject, body, opt) {
        if (/@fail\./.test(to)) throw new Error('Invalid email: ' + to);
        env.mails.push({ from: env.user, to: to, subject: subject, body: body, htmlBody: (opt || {}).htmlBody || '', name: (opt || {}).name || '', at: Date.now() });
      } },
      MailApp: { sendEmail: function (to, subject, body) { env.notices = env.notices || []; env.notices.push({ from: env.user, to: to, subject: subject, body: body }); }, getRemainingDailyQuota: function () { return 1500 - env.mails.filter(function (m) { return m.from === env.user; }).length; } },
      ContentService: {
        MimeType: { JSON: 'json', JAVASCRIPT: 'js' },
        createTextOutput: function (s) { return { body: s, setMimeType: function (m) { this.mime = m; return this; } }; }
      },
      Logger: { log: function () {} },
      props: props
    };
    env.worker = fakeWorker();
    env.UrlFetchApp = {
      fetch: function (url, opt) { return env.worker.fetch(url, opt || {}); },
      fetchAll: function (reqs) { return reqs.map(function (r) { return env.worker.fetch(r.url, r); }); }
    };
    return env;
  }

  // Cloudflare Worker（worker/src/index.js）と同じ受け答えをするメモリ上の偽物（開封・クリック・配信停止）
  function fakeWorker() {
    var w = { campaigns: {}, sends: {}, recipient: {}, opens: {}, clicks: {}, unsub: {}, unsubLog: [], token: 'test-token', down: false, calls: [] };
    function res(code, body) { return { getResponseCode: function () { return code; }, getContentText: function () { return JSON.stringify(body); } }; }
    function stamp(t) { var d = new Date((t || Date.now()) + 9 * 3600000); return d.toISOString().slice(0, 16).replace('T', ' '); }
    w.open = function (token, t) { var o = w.opens[token] || (w.opens[token] = { first: stamp(t), count: 0 }); o.count++; };
    w.click = function (token, n, t) { var c = w.clicks[token] || (w.clicks[token] = {}); c[n] = (c[n] || 0) + 1; if (!w.opens[token]) w.open(token, t); };
    w.unsubscribe = function (token, t) { if (w.unsub[token]) return; w.unsub[token] = stamp(t); w.unsubLog.push({ id: w.unsubLog.length + 1, token: token }); }; // 本物は unsub テーブルの rowid（増えるだけ）
    w.fetch = function (url, opt) {
      if (w.down) return res(503, { error: 'down' });
      if ((opt.headers || {}).Authorization !== 'Bearer ' + w.token) return res(401, { error: 'unauthorized' });
      var u = new URL(url), p = u.pathname, q = u.searchParams, m = (opt.method || 'get').toLowerCase();
      w.calls.push(m + ' ' + p);
      if (p === '/api/dm/campaigns' && m === 'post') { var b = JSON.parse(opt.payload); w.campaigns[b.id] = { links: b.links || [] }; return res(200, { ok: true }); }
      if (p === '/api/dm/sends' && m === 'post') { var l = JSON.parse(opt.payload); if (l.length > 5000) return res(400, { error: 'array required' }); l.forEach(function (x) { w.sends[x.token] = x.campaign; if (x.recipient) w.recipient[x.token] = x.recipient; }); return res(200, { ok: true }); }
      // 前回以降に増えた配信停止（2026-11-03〜）。id = 取り込みの続きの番号
      if (p === '/api/dm/unsubs' && m === 'get') {
        if (w.noUnsubsApi) return res(404, { error: 'not found' });
        var after = Number(q.get('after') || 0), lim = Math.min(Number(q.get('limit') || 1000), 1000);
        var list = w.unsubLog.filter(function (x) { return x.id > after; }).slice(0, lim).map(function (x) { return { id: x.id, token: x.token, campaign: w.sends[x.token] || null, recipient: w.recipient[x.token] || null, at: w.unsub[x.token] }; });
        return res(200, { list: list, last: list.length ? list[list.length - 1].id : after });
      }
      if (p === '/api/dm/stats' && m === 'get') {
        var id = q.get('campaign'), out = { opens: {}, clicks: {}, unsub: {} };
        Object.keys(w.sends).forEach(function (t) { if (w.sends[t] !== id) return; if (w.opens[t]) out.opens[t] = w.opens[t]; if (w.clicks[t]) out.clicks[t] = w.clicks[t]; if (w.unsub[t]) out.unsub[t] = w.unsub[t]; });
        return res(200, out);
      }
      if (p === '/api/dm/summary' && m === 'post') {
        var out2 = {}, ids2 = JSON.parse(opt.payload);
        if (!Array.isArray(ids2) || ids2.length > 5000) return res(400, { error: 'array required' });
        ids2.forEach(function (id) {
          var s = { opened: 0, clicked: 0, unsub: 0 };
          Object.keys(w.sends).forEach(function (t) { if (w.sends[t] !== id) return; if (w.opens[t]) s.opened++; if (w.clicks[t]) s.clicked++; if (w.unsub[t]) s.unsub++; });
          out2[id] = s;
        });
        return res(200, out2);
      }
      return res(404, { error: 'not found' });
    };
    return w;
  }

  root.GasMock = { makeEnv: makeEnv, Spreadsheet: Spreadsheet };
  if (typeof module !== 'undefined') module.exports = root.GasMock;
})(typeof window !== 'undefined' ? window : globalThis);
