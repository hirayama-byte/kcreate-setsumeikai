// node guide/verify-demos.js <出力フォルダ> [幅=1280] [demo-id ...] — 「動きで見る」を全手順止めて撮り、デモごとに1枚の一覧（contact sheet）にする
// ポインターの先が押す場所に乗っているかを目で確かめる用。あわせてエラー・横はみ出し・画像の読み込みを確かめる
var pw = require(process.env.PW || 'playwright'), path = require('path'), url = require('url'), fs = require('fs');
(async function () {
  var outDir = process.argv[2], w = Number(process.argv[3] || 1280), only = process.argv.slice(4);
  fs.mkdirSync(outDir, { recursive: true });
  var b = await pw.chromium.launch({ channel: 'chrome' });
  var p = await b.newPage({ viewport: { width: w, height: 900 } });
  var errs = []; p.on('pageerror', function (e) { errs.push(String(e)); }); p.on('console', function (m) { if (m.type() === 'error') errs.push(m.text()); });
  p.on('requestfailed', function (r) { errs.push('failed ' + r.url()); });
  await p.goto(url.pathToFileURL(path.join(__dirname, 'index.html')).href);
  await p.waitForTimeout(500);
  // 画像を全部読み込ませる（lazy を外す）
  await p.evaluate(function () { document.querySelectorAll('img[loading=lazy]').forEach(function (i) { i.loading = 'eager'; }); });
  await p.waitForTimeout(1500);
  var bad = await p.evaluate(function () { return [].filter.call(document.images, function (i) { return !i.complete || !i.naturalWidth; }).map(function (i) { return i.src; }); });
  var ids = await p.evaluate(function () { return window.__demoIds; });
  var report = { width: w, demos: ids.length, badImages: bad, overflow: await p.evaluate(function () { return document.documentElement.scrollWidth - innerWidth; }) };
  for (var id of ids) {
    if (only.length && only.indexOf(id) < 0) continue;
    var n = await p.evaluate(function (id) { return JSON.parse(document.querySelector('.demo[data-demo="' + id + '"] script[type="application/json"]').textContent).steps.length; }, id);
    var shots = [];
    await p.locator('.demo[data-demo="' + id + '"]').scrollIntoViewIfNeeded();
    for (var k = 0; k < n; k++) {
      var info = await p.evaluate(function (a) { return window.__demoGo(a[0], a[1]); }, [id, k]);
      await p.waitForTimeout(120);
      var buf = await p.locator('.demo[data-demo="' + id + '"] .stage').screenshot();
      var t = await p.evaluate(function (a) { return document.querySelectorAll('.demo[data-demo="' + a[0] + '"] ol.steps li')[a[1]].textContent; }, [id, k]);
      shots.push({ k: k + 1, t: t, b64: buf.toString('base64') });
    }
    if (k === 0) continue;
    // 1枚にまとめる
    var sheet = await b.newPage({ viewport: { width: 1600, height: 900 } });
    await sheet.setContent('<body style="margin:0;font:13px sans-serif;background:#fff"><div style="display:flex;flex-wrap:wrap;gap:10px;padding:10px">' + shots.map(function (s) { return '<div style="max-width:' + (w < 600 ? 360 : 780) + 'px"><div style="font-weight:700;margin-bottom:4px">' + s.k + '. ' + s.t + '</div><img style="max-width:100%;border:1px solid #ccc" src="data:image/png;base64,' + s.b64 + '"></div>'; }).join('') + '</div></body>');
    await sheet.waitForTimeout(200);
    await sheet.screenshot({ path: path.join(outDir, 'sheet-' + w + '-' + id + '.png'), fullPage: true });
    await sheet.close();
  }
  report.errors = errs;
  console.log(JSON.stringify(report));
  await b.close();
})().catch(function (e) { console.error(e); process.exit(1); });
