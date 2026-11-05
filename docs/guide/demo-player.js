// 動きで見る（ポインターのアニメーション）: guide/build-demos.js が index.html に入れる。ここを直したら build-demos.js を実行
// データ（各 .demo の中の <script type="application/json">）:
//   images: [{ src, w, h, dw }]  … 写真（w,h は画面上の大きさ・dw は表示する幅 px）
//   steps:  [{ img, x, y, t, look:{x,y,w,h}, type:'文字', drag:{x,y}, more:[{x,y}] }]  … x,y,w,h は写真の左上=0%・右下=100%
//   look = 押さずに「ここを見る」（枠で囲む）／ type = 入力する文字を見せる／ drag = つまんで引く／ more = 続けて押す場所
// テスト用: window.__demoGo('id', n) でアニメーションなしに n 番目（0 から）を表示して止める
(function () {
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ARROW = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M4 2l15 11.2-6.6.9 3.9 7.6-2.9 1.4-3.8-7.6L4 20z" fill="#fff" stroke="#0f172a" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  var demos = {};
  document.querySelectorAll('.demo[data-demo]').forEach(function (box) {
    var data = JSON.parse(box.querySelector('script[type="application/json"]').textContent);
    var steps = data.steps, images = data.images, stage = box.querySelector('.stage'), img = stage.querySelector('img'), list = box.querySelector('ol.steps');
    var maxDw = Math.max.apply(null, images.map(function (m) { return m.dw; }));
    if (maxDw > 520) box.classList.add('wide');
    var preloaded = false;
    function preload() { if (preloaded) return; preloaded = true; images.forEach(function (m) { var pre = new Image(); pre.src = m.src; }); } // 見えたときに、このデモの写真を先に読み込む（切り替えで待たない・ページを開いた時は読まない）
    list.innerHTML = steps.map(function (s) { return '<li>' + s.t + '</li>'; }).join('');
    var lis = list.querySelectorAll('li');
    var now = document.createElement('div'); now.className = 'now'; now.textContent = '▶ ' + steps[0].t; stage.insertAdjacentElement('afterend', now);
    var ptr = document.createElement('div'); ptr.className = 'ptr'; ptr.innerHTML = ARROW; stage.appendChild(ptr);
    var ring = document.createElement('div'); ring.className = 'ring'; stage.appendChild(ring);
    var hl = document.createElement('div'); hl.className = 'hl'; stage.appendChild(hl);
    var typing = document.createElement('div'); typing.className = 'typing'; stage.appendChild(typing);
    var badge = document.createElement('div'); badge.className = 'badge'; stage.appendChild(badge);
    var i = -1, cur = -1, timer = null, visible = false, paused = false, pauseBtn = box.querySelector('[data-act=pause]');
    var HOME = { x: 70, y: 4 };
    function place(el, p) { el.style.left = p.x + '%'; el.style.top = p.y + '%'; }
    function wait(ms, fn) { clearTimeout(timer); timer = setTimeout(fn, reduce ? Math.min(ms, 300) : ms); }
    function setImg(k, instant, done) {
      if (k === cur) return done && done();
      var m = images[k]; cur = k;
      function swap() { img.src = m.src; img.width = m.w; img.height = m.h; img.alt = m.alt || img.alt; stage.style.width = m.dw + 'px'; }
      if (instant || img.getAttribute('src') === m.src) { swap(); return done && done(); }
      img.classList.add('fade'); hl.classList.remove('on'); typing.classList.remove('on');
      setTimeout(function () { swap(); img.classList.remove('fade'); done && setTimeout(done, 200); }, 180);
    }
    function mark(n) {
      if (n >= 0) now.textContent = (n + 1) + '. ' + steps[n].t;
      lis.forEach(function (li, k) { li.classList.toggle('on', k === n); li.classList.toggle('done', n >= 0 && k < n); });
    }
    function showHl(s) { if (s.look) { hl.style.left = s.look.x + '%'; hl.style.top = s.look.y + '%'; hl.style.width = s.look.w + '%'; hl.style.height = s.look.h + '%'; hl.classList.add('on'); } else hl.classList.remove('on'); }
    function placeTyping(s) { // 入力欄のすぐ下（下の端に近いときは上）
      var b = s.box || { x: s.x - 10, y: s.y - 2, w: 20, h: 4 };
      typing.style.left = Math.max(0, Math.min(b.x, 60)) + '%';
      if (b.y + b.h > 82) { typing.style.top = 'auto'; typing.style.bottom = (100 - b.y + 1) + '%'; }
      else { typing.style.bottom = 'auto'; typing.style.top = (b.y + b.h + 1) + '%'; }
    }
    function click(p, done) { place(ring, p); ring.classList.remove('go'); void ring.offsetWidth; ring.classList.add('go'); ptr.classList.add('press'); setTimeout(function () { ptr.classList.remove('press'); }, 160); wait(500, done); }
    function typeText(s, done) {
      placeTyping(s); typing.textContent = ''; typing.classList.add('on');
      var txt = s.type, k = 0;
      (function one() { k++; typing.textContent = txt.slice(0, k); if (k < txt.length) wait(reduce ? 0 : 70, one); else wait(1300, function () { typing.classList.remove('on'); done(); }); })();
    }
    function show(n) {
      mark(n);
      var s = steps[n];
      typing.classList.remove('on');
      setImg(s.img || 0, false, function () {
        var p = { x: s.x, y: s.y }; place(ptr, p); place(badge, p); badge.textContent = n + 1; badge.style.opacity = 1; ptr.style.opacity = 1;
        showHl(s);
        wait(1000, function () {
          if (s.look) return next(1900);
          if (s.drag) { ptr.classList.add('press', 'drag'); wait(250, function () { place(ptr, s.drag); place(badge, s.drag); wait(1300, function () { ptr.classList.remove('press', 'drag'); next(1300); }); }); return; }
          var more = (s.more || []).slice();
          (function chain() {
            click(p, function () {
              if (s.type && !more.length) return typeText(s, function () { next(500); });
              if (!more.length) return next(1500);
              p = more.shift(); place(ptr, p); place(badge, p); wait(650, chain);
            });
          })();
        });
      });
    }
    function reset() { i = -1; mark(-1); badge.style.opacity = 0; hl.classList.remove('on'); typing.classList.remove('on'); place(ptr, HOME); }
    function next(ms) {
      wait(ms, function () {
        if (!visible || paused) { timer = null; return; }
        i++;
        if (i >= steps.length) { reset(); return wait(1800, function () { setImg(steps[0].img || 0, false, function () { next(0); }); }); }
        show(i);
      });
    }
    function start() { if (timer || paused) return; next(400); }
    function stop() { clearTimeout(timer); timer = null; }
    setImg(steps[0].img || 0, true); place(ptr, HOME); place(badge, HOME); badge.style.opacity = 0;
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) { preload(); start(); } else stop(); }, { threshold: .3 }).observe(stage);
    else { visible = true; preload(); start(); }
    function setPaused(v) { paused = v; pauseBtn.textContent = paused ? '再生' : '一時停止'; }
    pauseBtn.onclick = function () { setPaused(!paused); stop(); if (!paused) next(200); };
    box.querySelector('[data-act=again]').onclick = function () { stop(); setPaused(false); reset(); setImg(steps[0].img || 0, false, function () { next(100); }); };
    // 手順の一覧を押すと、その手順から
    lis.forEach(function (li, k) { li.onclick = function () { stop(); setPaused(false); i = k - 1; next(0); }; });
    // テスト用: n 番目をアニメーションなしで表示して止める
    demos[box.dataset.demo] = function (n) {
      stop(); setPaused(true); preload(); box.classList.add('instant');
      var s = steps[n]; i = n; mark(n); setImg(s.img || 0, true);
      var p = { x: s.x, y: s.y }; place(ptr, p); place(badge, p); badge.textContent = n + 1; badge.style.opacity = 1; ptr.style.opacity = 1;
      showHl(s);
      if (s.type) { placeTyping(s); typing.textContent = s.type; typing.classList.add('on'); } else typing.classList.remove('on');
      void box.offsetWidth; box.classList.remove('instant');
      return { img: images[s.img || 0].src, x: s.x, y: s.y };
    };
  });
  window.__demoGo = function (id, n) { return demos[id] ? demos[id](n) : null; };
  window.__demoIds = Object.keys(demos);
})();
