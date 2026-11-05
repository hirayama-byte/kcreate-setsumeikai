// node test/serve.js [port] [--sample] — docs/ を配り、/api を Code.gs（模擬環境）につなぐ。config.js は /api を指す
// --sample … サンプル画面（ガイドと同じ架空のデータ入り・管理画面はパスワードなしで開く）。テスト（ui-check.js）は --sample なしの方を使う
var http = require('http'), fs = require('fs'), path = require('path'), E = require('./env.js');
var port = +process.argv[2] || 8790, root = path.join(__dirname, '../docs'), g = E.load();
var SAMPLE_MODE = process.argv.indexOf('--sample') >= 0, sampleToken = '';
function makeSample() { g = E.load(); return require('./sample-data.js').seed(function (req) { return g.call(req); }, E.PASSWORD).then(function (tk) { sampleToken = tk; }); }
if (SAMPLE_MODE) makeSample();
var types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.css': 'text/css' };
http.createServer(function (req, res) {
  var u = new URL(req.url, 'http://x');
  if (u.pathname === '/__reset') { if (SAMPLE_MODE) { makeSample().then(function () { res.end('ok'); }); return; } g = E.load(); res.end('ok'); return; }
  if (u.pathname === '/__mails') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(g.env.sent)); return; }
  if (u.pathname === '/api' && req.method === 'POST') {
    var body = ''; req.on('data', function (c) { body += c; });
    req.on('end', function () { var out = g.doPost({ postData: { contents: body } }).body; setTimeout(function () { res.setHeader('content-type', 'application/json'); res.end(out); }, 80); });
    return;
  }
  if (u.pathname === '/config.js') { res.setHeader('content-type', types['.js']); res.end("window.API_URL = '/api';" + (SAMPLE_MODE ? "\nwindow.SAMPLE_TOKEN = '" + sampleToken + "';" : '')); return; }
  var p = path.join(root, decodeURIComponent(u.pathname)); if (p.endsWith(path.sep) || p.endsWith('/')) p = path.join(p, 'index.html');
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.statusCode = 404; res.end('not found'); return; }
  res.setHeader('content-type', types[path.extname(p)] || 'application/octet-stream'); fs.createReadStream(p).pipe(res);
}).listen(port, '127.0.0.1', function () { console.log('http://localhost:' + port + '/'); }); // このパソコンの中からだけ（社内のほかのPCからは開けない）
