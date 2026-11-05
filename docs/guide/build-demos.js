// node guide/build-demos.js — guide/demos.json（demos.js が書き出す）から、index.html の「動きで見る」を入れる／入れ直す（何度実行しても同じ結果）
// 入れる場所:
//   CSS … <style> の中の /* demo-css:start */ 〜 /* demo-css:end */（中身は guide/demo-player.css）
//   JS  … </body> の前の <!-- demo-js:start --> 〜 <!-- demo-js:end -->（中身は guide/demo-player.js）
//   各デモ … <!-- demo:ID --> 〜 <!-- /demo:ID -->（章の見出し h2 のすぐ後。after があるときはそのデモの後）
var fs = require('fs'), path = require('path');
var F = path.join(__dirname, 'index.html');
var s = fs.readFileSync(F, 'utf8');
var data = JSON.parse(fs.readFileSync(path.join(__dirname, 'demos.json'), 'utf8'));
var css = fs.readFileSync(path.join(__dirname, 'demo-player.css'), 'utf8').replace(/\s+$/, '');
var js = fs.readFileSync(path.join(__dirname, 'demo-player.js'), 'utf8').replace(/\s+$/, '');


function between(start, end, body, insertBefore) {
  var a = s.indexOf(start);
  if (a >= 0) { var b = s.indexOf(end, a); if (b < 0) throw new Error('終わりの印が無い: ' + end); s = s.slice(0, a) + start + '\n' + body + '\n' + s.slice(b); return; }
  var at = s.indexOf(insertBefore); if (at < 0) throw new Error('入れる場所が無い: ' + insertBefore);
  s = s.slice(0, at) + start + '\n' + body + '\n' + end + '\n' + s.slice(at);
}
between('  /* demo-css:start */', '  /* demo-css:end */', css, '  @media (max-width: 860px) {');
between('<!-- demo-js:start -->', '<!-- demo-js:end -->', '<script>\n' + js + '\n</script>', '</body>');

function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function block(d) {
  var json = JSON.stringify({ images: d.images, steps: d.steps }).replace(/</g, '\\u003c');
  var m = d.images[(d.steps[0] && d.steps[0].img) || 0];
  return '<!-- demo:' + d.id + ' -->\n' +
    '  <h3>動きで見る：' + esc(d.title) + '</h3>\n' +
    '  <div class="demo" data-demo="' + d.id + '">\n' +
    '    <div class="stage" style="width:' + m.dw + 'px"><img src="' + m.src + '" alt="' + esc(m.alt) + '" width="' + m.w + '" height="' + m.h + '" loading="lazy"></div>\n' +
    '    <div class="side"><h4>' + esc(d.head || 'この順に押します') + '</h4><ol class="steps"></ol><div class="ctl"><button type="button" data-act="pause">一時停止</button><button type="button" data-act="again">最初から</button></div></div>\n' +
    '    <script type="application/json">' + json + '</script>\n' +
    '  </div>\n' +
    '<!-- /demo:' + d.id + ' -->\n';
}
var ids = {};
data.demos.forEach(function (d) {
  ids[d.id] = 1;
  var start = '<!-- demo:' + d.id + ' -->\n', end = '<!-- /demo:' + d.id + ' -->\n', html = block(d);
  var a = s.indexOf(start);
  if (a >= 0) { var b = s.indexOf(end, a); s = s.slice(0, a) + html + s.slice(b + end.length); return; }
  var at;
  if (d.after) { var pe = s.indexOf('<!-- /demo:' + d.after + ' -->\n'); if (pe < 0) throw new Error('after のデモが無い: ' + d.after); at = pe + ('<!-- /demo:' + d.after + ' -->\n').length; }
  else {
    var sec = s.indexOf('<section id="' + d.section + '">'); if (sec < 0) throw new Error('章が無い: ' + d.section);
    var h2 = s.indexOf('</h2>\n', sec); at = h2 + '</h2>\n'.length;
  }
  s = s.slice(0, at) + html + s.slice(at);
});
// demos.json から消えたデモは外す
s = s.replace(/<!-- demo:([\w-]+) -->\n[\s\S]*?<!-- \/demo:\1 -->\n/g, function (all, id) { return ids[id] ? all : ''; });
fs.writeFileSync(F, s);
console.log('demos:', data.demos.length, '／', Math.round(s.length / 1024) + 'KB');
