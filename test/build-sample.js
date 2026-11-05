// node test/build-sample.js — 公開サンプル（docs/sample/）を作り直す。本番の画面（docs/index.html・docs/admin/index.html）と受け口（gas/Code.gs）から作る
// 画面や Code.gs を直したら、これを実行してから公開する。Secret.gs（本番のパスワード）は使わない
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'docs/sample');
fs.mkdirSync(path.join(OUT, 'admin'), { recursive: true });
var BAR = '<div style="background:#fff4e0;color:#8a5300;border-bottom:1px solid #f3d29a;padding:8px 16px;font:600 13px/1.6 -apple-system,BlinkMacSystemFont,\'Hiragino Sans\',\'Yu Gothic UI\',Meiryo,sans-serif;display:flex;gap:10px;align-items:center;flex-wrap:wrap" id="sampleBar">' +
  '<span>サンプル画面です（架空のデータ）。本番とはつながっていないので自由に試せます。送信してもメールは届きません。変えた内容はこのブラウザの中だけに残ります。</span>' +
  '<button type="button" onclick="if(confirm(\'サンプルを最初の状態に戻しますか？\'))sampleReset()" style="font:inherit;border:1px solid #e0b060;background:#fff;color:#8a5300;border-radius:8px;padding:2px 10px;cursor:pointer">最初の状態に戻す</button>%LINK%</div>';
function bar(link) { return BAR.replace('%LINK%', link); }
function put(rel, s) { fs.writeFileSync(path.join(OUT, rel), s); }

var form = fs.readFileSync(path.join(ROOT, 'docs/index.html'), 'utf8');
form = form.replace('<title>', '<title>【サンプル】').replace('<body>\n', '<body>\n' + bar('<a href="admin/" style="color:#8a5300">管理画面のサンプルへ →</a>') + '\n');
put('index.html', form);

var admin = fs.readFileSync(path.join(ROOT, 'docs/admin/index.html'), 'utf8');
if (admin.indexOf('href="../guide/"') < 0) throw new Error('ガイドへのリンクが見つからない');
admin = admin.replace('href="../guide/"', 'href="../../guide/"').replace('<title>', '<title>【サンプル】').replace('<body>\n', '<body>\n' + bar('<a href="../" target="_blank" rel="noopener" style="color:#8a5300">応募フォームのサンプルを開く →</a>') + '\n');
put('admin/index.html', admin);

fs.copyFileSync(path.join(ROOT, 'gas/Code.gs'), path.join(OUT, 'code.js'));
fs.copyFileSync(path.join(__dirname, 'gas-mock.js'), path.join(OUT, 'gas-mock.js'));
fs.copyFileSync(path.join(__dirname, 'sample-data.js'), path.join(OUT, 'sample-data.js'));
fs.copyFileSync(path.join(__dirname, 'sample-config.js'), path.join(OUT, 'config.js'));
var all = fs.readdirSync(OUT).concat(fs.readdirSync(path.join(OUT, 'admin')).map(function (f) { return 'admin/' + f; }));
var REAL = require('./env.js').PASSWORD; // 本番のパスワード（Secret.gs から読む。この値はファイルに書かない）
all.forEach(function (f) { var p = path.join(OUT, f); if (fs.statSync(p).isFile() && REAL && fs.readFileSync(p, 'utf8').indexOf(REAL) >= 0) throw new Error('本番のパスワードが入っている: ' + f); });
console.log('docs/sample:', all.join(' '));
