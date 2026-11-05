// 公開サンプル（docs/sample/）の config.js の元。test/build-sample.js が docs/sample/config.js にコピーする
// 受け口（Code.gs）をブラウザの中の模擬環境で動かす。本番・Google とはつながらない。メールは送らない
// データはこのブラウザの中（localStorage）だけに残る。window.sampleReset() で最初の状態に戻す
(function () {
  var BASE = document.currentScript.src.replace(/[^/]*$/, ''); // docs/sample/
  var KEY = 'setsumeikai-sample-v1', TOKEN = 'a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5';
  window.API_URL = 'sample-api';
  window.SAMPLE_TOKEN = TOKEN;
  window.SAMPLE_MODE = true;
  var realFetch = window.fetch.bind(window), ready = null, env = null, book = null, doPost = null;
  function text(f) { return realFetch(BASE + f).then(function (r) { if (!r.ok) throw new Error(f + ' を読み込めませんでした'); return r.text(); }); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(book.sheets.map(function (s) { return { name: s.name, data: s.data, textCols: s.textCols }; }))); } catch (e) {} }
  function boot(fresh) {
    return Promise.all([text('gas-mock.js'), text('sample-data.js'), text('code.js')]).then(function (t) {
      new Function(t[0])();
      var mod = { exports: {} }; new Function('module', t[1])(mod); var SD = mod.exports;
      env = GasMock.makeEnv({}, {});
      book = env.SpreadsheetApp.create('サンプル');
      env.SpreadsheetApp.getActive = function () { return book; };
      env.Utilities.getUuid = function () { return (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(16) + Math.random().toString(16).slice(2) + '00000000')).toLowerCase(); };
      env.MailApp = { sendEmail: function () {} }; // サンプルはメールを送らない
      var names = ['SpreadsheetApp', 'PropertiesService', 'CacheService', 'LockService', 'Utilities', 'MailApp', 'ContentService', 'Session'];
      var fn = Function.apply(null, names.concat(['console', t[2] + "\nvar INIT_PW = 'sample-only';\nreturn { doPost: doPost };"]));
      doPost = fn.apply(null, names.map(function (k) { return env[k]; }).concat([{ error: function () {}, log: function () {} }])).doPost;
      var call = function (req) { return JSON.parse(doPost({ postData: { contents: JSON.stringify(req) } }).body); };
      var saved = null; try { saved = !fresh && JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
      var p = Promise.resolve();
      if (saved && saved.length) {
        book.sheets = [];
        saved.forEach(function (o) { var sh = book.insertSheet(o.name); sh.data = o.data; sh.textCols = o.textCols || {}; });
      } else {
        p = SD.seed(call, 'sample-only').then(save);
      }
      return p.then(function () { env.cache['tok_' + TOKEN] = '1'; });
    });
  }
  window.fetch = function (url, opt) {
    if (url !== 'sample-api') return realFetch(url, opt);
    ready = ready || boot(false);
    return ready.then(function () {
      var out = doPost({ postData: { contents: (opt && opt.body) || '{}' } }).body;
      env.cache['tok_' + TOKEN] = '1';
      save();
      return new Promise(function (r) { setTimeout(function () { r({ ok: true, json: function () { return Promise.resolve(JSON.parse(out)); } }); }, 120); });
    });
  };
  window.sampleReset = function () {
    try { localStorage.removeItem(KEY); } catch (e) {}
    ready = boot(true);
    return ready.then(function () { location.reload(); });
  };
})();
