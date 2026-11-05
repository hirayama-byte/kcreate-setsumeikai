// node docs/guide/demos.js — 使い方ガイドの「動きで見る」用: 写真（img/demo-*.png）を撮り、押す場所を実際の画面の部品から測って demos.json に書く
// 座標は手で打たない（画面を直したら、これを実行 → node docs/guide/build-demos.js で index.html に反映 → verify-demos.js で確認）
// PW=<npx の playwright の場所> node docs/guide/demos.js [demo-id ...]   … id を付けるとその分だけ撮り直す
// 写真はサンプル（架空のデータ）。test/serve.js（模擬環境）を別のポートで動かして撮る。パスワードは写さない（●で見せる）
var pw = require(process.env.PW || 'playwright'), path = require('path'), fs = require('fs'), cp = require('child_process');
var ROOT = path.join(__dirname, '../..'), OUT = path.join(__dirname, 'img'), JSON_OUT = path.join(__dirname, 'demos.json');
var PORT = 8796, BASE = 'http://localhost:' + PORT + '/';
var PASSWORD = require(path.join(ROOT, 'test/env.js')).PASSWORD;
var r1 = function (v) { return Math.round(v * 10) / 10; };
fs.mkdirSync(OUT, { recursive: true });

// ---------- サンプルのデータ ----------
var SAMPLE = [
  { name: '山田 花子', kana: 'やまだ はなこ', gender: '女性', birth: '1990-04-05', tel: '090-1234-5678', email: 'hanako@example.jp', wishes: ['10:00〜11:00', '14:00〜15:00'] },
  { name: '佐藤 健一', kana: 'さとう けんいち', gender: '男性', birth: '1985-07-01', tel: '080-2345-6789', email: 'kenichi@example.jp', wishes: ['10:00〜11:00'] },
  { name: '鈴木 美咲', kana: 'すずき みさき', gender: '女性', birth: '2001-12-24', tel: '070-3456-7890', email: 'misaki@example.jp', wishes: ['13:00〜14:00', '15:00〜16:00', '16:00〜17:00'] },
  { name: '高橋 大輔', kana: 'たかはし だいすけ', gender: '男性', birth: '1995-01-15', tel: '090-4567-8901', email: 'daisuke@example.jp', wishes: ['11:00〜12:00', '13:00〜14:00'] },
  { name: '伊藤 さくら', kana: 'いとう さくら', gender: '女性', birth: '1998-03-30', tel: '080-5678-9012', email: 'sakura@example.jp', wishes: ['10:00〜11:00', '11:00〜12:00'] },
  { name: '渡辺 翔太', kana: 'わたなべ しょうた', gender: '男性', birth: '1979-10-10', tel: '0586-12-3456', email: 'shota@example.jp', wishes: ['14:00〜15:00'] }
];
async function api(req) { var r = await fetch(BASE + 'api', { method: 'POST', body: JSON.stringify(req) }); return r.json(); }
async function seed() {
  await fetch(BASE + '__reset');
  var tk = (await api({ action: 'login', password: PASSWORD })).token;
  await api({ action: 'saveSettings', token: tk, settings: { title: '日建ホームズ お仕事説明会', date: '2026年1月16日（金）', place: '一宮市○○町1-2-3 2階 会議室', staff: 'uketsuke@k-create.co.jp\ntanto@example.co.jp', capacity: { '10:00〜11:00': 3, '11:00〜12:00': 3, '13:00〜14:00': 3, '14:00〜15:00': 3 } } });
  for (var d of SAMPLE) await api({ action: 'apply', data: d });
  await api({ action: 'add', token: tk, data: { name: '中村 誠', kana: 'なかむら まこと', tel: '0586-98-7654', gender: '男性', wishes: ['13:00〜14:00'], slot: '13:00〜14:00', status: '参加確定', memo: '電話で受付（11/5 平山）', source: '電話' } });
  var L = (await api({ action: 'list', token: tk })).applicants, by = {}; L.forEach(function (a) { by[a.name] = a.id; });
  await api({ action: 'update', token: tk, id: by['佐藤 健一'], fields: { slot: '10:00〜11:00', status: '参加確定', memo: '11/6 10時に電話。10時でOK' } });
  await api({ action: 'update', token: tk, id: by['高橋 大輔'], fields: { slot: '11:00〜12:00', status: '連絡済み', memo: '11時で調整中' } });
  await api({ action: 'update', token: tk, id: by['渡辺 翔太'], fields: { status: '不在・折り返し待ち', memo: '11/6 留守電に入れた' } });
}

// ---------- 共通 ----------
async function openAdmin(b, o) {
  o = o || {};
  var ctx = await b.newContext({ viewport: { width: o.w || 1280, height: o.h || 860 }, deviceScaleFactor: 1, acceptDownloads: true });
  var p = await ctx.newPage();
  p.on('pageerror', function (e) { console.error('pageerror', e); });
  p.on('dialog', function (d) { d.dismiss(); });
  await p.goto(BASE + 'admin/');
  if (o.login === false) { await p.waitForSelector('#loginForm'); await p.waitForTimeout(400); return p; }
  await p.fill('#pw', PASSWORD); await p.click('#loginBtn'); await p.waitForSelector('#rows tr'); await p.waitForTimeout(700);
  await p.evaluate(function () { return document.fonts && document.fonts.ready; });
  return p;
}
async function openForm(b) {
  var ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  var p = await ctx.newPage();
  p.on('pageerror', function (e) { console.error('pageerror', e); });
  await p.goto(BASE); await p.waitForSelector('#step-input:not(.hide)'); await p.waitForTimeout(500);
  return p;
}
async function hideToast(p) { await p.evaluate(function () { document.querySelectorAll('.toast').forEach(function (t) { t.remove(); }); }); }
async function box(p, sel) { var l = typeof sel === 'string' ? p.locator(sel).first() : sel; var bb = await l.boundingBox(); if (!bb) throw new Error('見つからない: ' + sel); var sy = await p.evaluate(function () { return scrollY; }); return { x: bb.x, y: bb.y + sy, width: bb.width, height: bb.height }; }
// 複数の部品を囲む切り抜き（ページ全体の座標）
async function clipOf(p, sels, pad) {
  pad = pad == null ? 12 : pad; var x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
  var W = await p.evaluate(function () { return document.documentElement.clientWidth; });
  for (var s of sels) { var bb = await box(p, s); x1 = Math.min(x1, bb.x); y1 = Math.min(y1, bb.y); x2 = Math.max(x2, bb.x + bb.width); y2 = Math.max(y2, bb.y + bb.height); }
  var c = { x: Math.max(0, Math.floor(x1 - pad)), y: Math.max(0, Math.floor(y1 - pad)) };
  c.width = Math.min(W, Math.ceil(x2 + pad)) - c.x; c.height = Math.ceil(y2 + pad) - c.y;
  return c;
}
async function snap(p, demo, name, clip, dw, alt) {
  var file = 'demo-' + name + '.png';
  await p.screenshot({ path: path.join(OUT, file), clip: clip, fullPage: true });
  var dsf = await p.evaluate(function () { return devicePixelRatio; });
  demo.images.push({ src: 'img/' + file, w: Math.round(clip.width * dsf), h: Math.round(clip.height * dsf), dw: dw || Math.round(clip.width), alt: alt || '' });
  return { k: demo.images.length - 1, clip: clip };
}
function pct(shot, bb, dx, dy) {
  var c = shot.clip;
  return {
    x: r1(((bb.x + (dx == null ? bb.width / 2 : dx)) - c.x) / c.width * 100), y: r1(((bb.y + (dy == null ? bb.height / 2 : dy)) - c.y) / c.height * 100),
    box: { x: r1((bb.x - c.x) / c.width * 100), y: r1((bb.y - c.y) / c.height * 100), w: r1(bb.width / c.width * 100), h: r1(bb.height / c.height * 100) }
  };
}
// opt: { dx, dy, look, lookPad, type, more:[sel..] }
async function step(p, shot, sel, t, opt) {
  opt = opt || {};
  var bb = await box(p, sel), q = pct(shot, bb, opt.dx, opt.dy);
  var s = { img: shot.k, x: q.x, y: q.y, t: t, box: q.box };
  if (opt.look) { var pad = opt.lookPad == null ? 4 : opt.lookPad, c = shot.clip; s.look = { x: r1((bb.x - pad - c.x) / c.width * 100), y: r1((bb.y - pad - c.y) / c.height * 100), w: r1((bb.width + pad * 2) / c.width * 100), h: r1((bb.height + pad * 2) / c.height * 100) }; }
  if (opt.type) s.type = opt.type;
  if (opt.more) { s.more = []; for (var m of opt.more) { var mb = await box(p, m); var mq = pct(shot, mb); s.more.push({ x: mq.x, y: mq.y }); } }
  return s;
}
var ROW = function (name) { return '#rows tr:has-text("' + name + '")'; };

// ---------- 各章 ----------
var DEMOS = {};

DEMOS.login = { section: 'start', title: '管理画面にログインする', run: async function (b, d) {
  var p = await openAdmin(b, { login: false });
  var shot = await snap(p, d, 'login', await clipOf(p, ['#loginForm'], 16), 0, 'ログイン画面');
  d.steps.push(await step(p, shot, '#pw', 'パスワードを入れます（担当者から聞いてください）', { dx: 60, type: '●●●●●●●●' }));
  d.steps.push(await step(p, shot, '#loginBtn', '「ログイン」を押します'));
} };

DEMOS.settings = { section: 'setup', title: '説明会の情報と受付担当を入れる', run: async function (b, d) {
  var p = await openAdmin(b);
  var head = await snap(p, d, 'set-head', await clipOf(p, ['header.top'], 0), 760, '上のバー');
  d.steps.push(await step(p, head, 'nav.tabs button[data-tab=set]', '上のバーの「設定」を押します'));
  await p.click('nav.tabs button[data-tab=set]'); await p.waitForTimeout(500);
  var left = await snap(p, d, 'set-event', await clipOf(p, ['#tab-set .grid2 > .card'], 10), 520, '説明会の設定');
  d.steps.push(await step(p, left, '#sTitle', '説明会の名前を入れます（フォームのいちばん上に出ます）', { dx: 80, type: '日建ホームズ お仕事説明会' }));
  d.steps.push(await step(p, left, '#sDate', '開催日を入れます', { dx: 80, type: '2026年1月16日（金）' }));
  d.steps.push(await step(p, left, '#sPlace', '会場を入れます', { dx: 80, type: '一宮市○○町1-2-3 2階 会議室' }));
  d.steps.push(await step(p, left, '#sOpen', 'チェックが入っている間だけ、応募を受け付けます', { look: true, lookPad: 6 }));
  d.steps.push(await step(p, left, '#sCaps', '時間帯ごとの定員（空欄なら決めない）', { look: true }));
  var mail = await snap(p, d, 'set-mail', await clipOf(p, ['#tab-set .grid2 > div > .card:nth-child(1)'], 10), 520, 'メールの設定');
  d.steps.push(await step(p, mail, '#sStaff', '受付担当のアドレスを1行に1つ入れます（応募があると届きます）', { dx: 90, dy: 20, type: 'uketsuke@k-create.co.jp' }));
  d.steps.push(await step(p, mail, '#sBody', '本人に届くメールの文面です。そのままでも使えます', { look: true }));
  d.steps.push(await step(p, mail, '#saveSet', '最後に「設定を保存」を押します'));
} };

DEMOS.qr = { section: 'qr', title: 'QRコードを保存する', run: async function (b, d) {
  var p = await openAdmin(b);
  await p.click('nav.tabs button[data-tab=set]'); await p.waitForTimeout(800);
  var shot = await snap(p, d, 'qr', await clipOf(p, ['#tab-set .grid2 > div > .card:nth-child(2)'], 10), 520, 'URLとQRコード');
  d.steps.push(await step(p, shot, '#qr', 'これが応募フォームのQRコードです', { look: true }));
  d.steps.push(await step(p, shot, '#dlQr', '「QRを画像で保存」で、印刷用の大きな画像を保存します'));
  d.steps.push(await step(p, shot, '#copyUrl', 'URLをコピーして、ホームページやメールにも貼れます'));
  d.steps.push(await step(p, shot, '#openForm', '「フォームを開く」で、応募者が見る画面を確かめられます'));
} };

DEMOS.form = { section: 'form', title: '応募者がスマホで入力する流れ', run: async function (b, d) {
  var p = await openForm(b);
  var top = await snap(p, d, 'form-top', await clipOf(p, ['header.hero', '[data-f=email]'], 10), 300, '応募フォーム（入力）');
  d.steps.push(await step(p, top, '#name', 'QRコードを読み込むと、このフォームが開きます。お名前を入れます', { dx: 70, type: '山田 花子' }));
  d.steps.push(await step(p, top, '#kana', 'ふりがな', { dx: 70, type: 'やまだ はなこ' }));
  d.steps.push(await step(p, top, '[data-f=gender] .opt:nth-child(2) span', '性別を選びます'));
  d.steps.push(await step(p, top, '#by', '生年月日を 年・月・日 で選びます', { more: ['#bm', '#bd'] }));
  d.steps.push(await step(p, top, '#tel', '電話番号', { dx: 70, type: '090-1234-5678' }));
  d.steps.push(await step(p, top, '#email', 'メールアドレス（受付のメールが届きます）', { dx: 70, type: 'hanako@example.jp' }));
  var w = await snap(p, d, 'form-wish', await clipOf(p, ['[data-f=wishes]', '.actions'], 10), 300, '希望の時間帯');
  d.steps.push(await step(p, w, '#slots .opt:nth-child(1) span', '希望の時間帯を1〜3つ選びます', { more: ['#slots .opt:nth-child(5) span'] }));
  d.steps.push(await step(p, w, '#wCount', '選んだ数が出ます（3つまで。4つ目は選べません）', { look: true }));
  d.steps.push(await step(p, w, 'button[type=submit]', '「入力内容を確認する」を押します'));
  // 確認画面
  await p.fill('#name', '山田 花子'); await p.fill('#kana', 'やまだ はなこ'); await p.check('input[name=gender][value=女性]', { force: true });
  await p.selectOption('#by', '1990'); await p.selectOption('#bm', '4'); await p.selectOption('#bd', '5');
  await p.fill('#tel', '090-1234-5678'); await p.fill('#email', 'hanako@example.jp');
  await p.locator('input[name=wish]').nth(0).check({ force: true }); await p.locator('input[name=wish]').nth(4).check({ force: true });
  await p.click('button[type=submit]'); await p.waitForSelector('#step-confirm:not(.hide)'); await p.waitForTimeout(400);
  var cf = await snap(p, d, 'form-confirm', await clipOf(p, ['#step-confirm .card'], 10), 300, '確認画面');
  d.steps.push(await step(p, cf, '#confirmList', '入力した内容を確かめます', { look: true }));
  d.steps.push(await step(p, cf, '#backBtn', '直したいときは「修正する」'));
  d.steps.push(await step(p, cf, '#sendBtn', 'よければ「この内容で送信する」'));
  await p.click('#sendBtn'); await p.waitForSelector('#step-done:not(.hide)'); await p.waitForTimeout(300);
  var dn = await snap(p, d, 'form-done', await clipOf(p, ['#step-done .card'], 10), 300, '完了画面');
  d.steps.push(await step(p, dn, '#step-done h2', '完了です。本人と受付担当にメールが届きます', { look: true, lookPad: 10 }));
} };

DEMOS.list = { section: 'list', title: '応募者一覧で、電話の結果を残す', run: async function (b, d) {
  var p = await openAdmin(b);
  var shot = await snap(p, d, 'list', await clipOf(p, ['#kpis', '#tab-list .tbl'], 8), 0, '応募者一覧');
  d.steps.push(await step(p, shot, '#kpis', '応募の数・未連絡・割当済み などが一目で分かります', { look: true }));
  d.steps.push(await step(p, shot, ROW('山田 花子') + ' td:nth-child(8)', '希望の時間帯（第1〜第3）', { look: true }));
  d.steps.push(await step(p, shot, ROW('山田 花子') + ' td:nth-child(6) a', '電話番号を押すと、スマホならそのまま電話できます'));
  d.steps.push(await step(p, shot, ROW('山田 花子') + ' .eSlot', '電話で決まった時間を「割当」で選びます'));
  d.steps.push(await step(p, shot, ROW('山田 花子') + ' .eSt', '「状況」を選びます（連絡済み・参加確定 など）'));
  d.steps.push(await step(p, shot, ROW('山田 花子') + ' .eMemo', 'メモに電話の内容を書きます。欄の外を押すと保存されます', { dx: 30, type: '11/6 14時に電話。10時でOK' }));
  d.steps.push(await step(p, shot, ROW('中村 誠') + ' .src', '「電話」の印は電話で受けた人、「フォーム」はスマホから応募した人です', { look: true, lookPad: 3 }));
} };

DEMOS.find = { section: 'list', after: 'list', title: '探す・絞り込む', run: async function (b, d) {
  var p = await openAdmin(b);
  var shot = await snap(p, d, 'find', await clipOf(p, ['#tab-list .bar'], 8), 0, '探す・絞り込む');
  d.steps.push(await step(p, shot, '#q', '名前・ふりがな・電話・メールで探せます', { dx: 60, type: 'やまだ' }));
  d.steps.push(await step(p, shot, '#fStatus', '状況で絞り込み（例：未連絡の人だけ）'));
  d.steps.push(await step(p, shot, '#fSlot', '時間帯で絞り込み（「未割当」も選べます）'));
  d.steps.push(await step(p, shot, '#fSrc', '受付（フォーム／電話）で絞り込み'));
} };

DEMOS.phone = { section: 'phone', title: '電話で受けた応募を入れる', run: async function (b, d) {
  var p = await openAdmin(b);
  var bar = await snap(p, d, 'phone-bar', await clipOf(p, ['#tab-list .bar'], 8), 0, '一覧の上のボタン');
  d.steps.push(await step(p, bar, '#addBtn', '一覧の上の「＋ 電話受付を追加」を押します'));
  await p.click('#addBtn'); await p.waitForSelector('#modal:not(.hide)'); await p.waitForTimeout(300);
  var m = await snap(p, d, 'phone-modal', await clipOf(p, ['#mForm'], 0), 560, '電話受付の入力');
  d.steps.push(await step(p, m, '#mName', 'お名前', { dx: 60, type: '小林 優子' }));
  d.steps.push(await step(p, m, '#mKana', 'ふりがな', { dx: 60, type: 'こばやし ゆうこ' }));
  d.steps.push(await step(p, m, '#mTel', '電話番号（ここまでの3つが必須です）', { dx: 60, type: '090-8765-4321' }));
  d.steps.push(await step(p, m, '#mWishes label:nth-child(3)', '聞けたら、性別・生年月日・希望の時間帯も入れます', { more: ['#mWishes label:nth-child(4)'] }));
  d.steps.push(await step(p, m, '#mSlot', 'その場で時間が決まったら「割当」も選べます'));
  d.steps.push(await step(p, m, '#mMemo', 'メモ（受けた日時・担当など）', { dx: 60, dy: 16, type: '11/7 電話で受付（平山）' }));
  d.steps.push(await step(p, m, '#mMail', 'メールアドレスを入れたときだけ、受付メールを送ることもできます（送らなくてもOK）', { look: true, lookPad: 4 }));
  d.steps.push(await step(p, m, '#mSave', '「追加する」を押すと、一覧と時間割に入ります'));
} };

DEMOS.edit = { section: 'phone', after: 'phone', title: '名前や電話番号を直す・削除する', run: async function (b, d) {
  var p = await openAdmin(b);
  var row = await snap(p, d, 'edit-row', await clipOf(p, [ROW('鈴木 美咲')], 4), 0, '一覧の行');
  d.steps.push(await step(p, row, ROW('鈴木 美咲') + ' .eEdit', '直したい人の「編集」を押します'));
  await p.click(ROW('鈴木 美咲') + ' .eEdit'); await p.waitForSelector('#modal:not(.hide)'); await p.waitForTimeout(300);
  var m = await snap(p, d, 'edit-modal', await clipOf(p, ['#mForm'], 0), 560, '情報を直す');
  d.steps.push(await step(p, m, '#mTel', '直して…', { dx: 60, type: '070-3456-0000' }));
  d.steps.push(await step(p, m, '#mSave', '「保存する」。割当・状況・メモはそのまま残ります'));
  d.steps.push(await step(p, row, ROW('鈴木 美咲') + ' .eDel', 'まちがい・テストの応募は「削除」（確認が出ます。元に戻せません）'));
} };

DEMOS.timetable = { section: 'timetable', title: '時間割で振り分ける', run: async function (b, d) {
  var p = await openAdmin(b);
  var head = await snap(p, d, 'tt-head', await clipOf(p, ['header.top'], 0), 760, '上のバー');
  d.steps.push(await step(p, head, 'nav.tabs button[data-tab=tt]', '上のバーの「時間割」を押します'));
  await p.click('nav.tabs button[data-tab=tt]'); await p.waitForTimeout(500);
  var tt = await snap(p, d, 'tt', await clipOf(p, ['#tt .slot:nth-child(1)', '#tt .slot:nth-child(4)'], 6), 0, '時間割');
  d.steps.push(await step(p, tt, '#tt .slot:nth-child(1) .time', '時間帯ごとに、割り当てた人数と定員', { look: true }));
  d.steps.push(await step(p, tt, '#tt .slot:nth-child(1) .chip.as', '割り当て済みの人と、その状況', { look: true }));
  d.steps.push(await step(p, tt, '#tt .slot:nth-child(1) .col:nth-child(3)', '候補 = まだ割り当てていない人のうち、この時間を希望している人（第何希望か）', { look: true }));
  d.steps.push(await step(p, tt, '#tt .slot:nth-child(1) .chip:not(.as) .add', '電話で決まったら「＋」で、この時間に割り当てます'));
  d.steps.push(await step(p, tt, '#tt .slot:nth-child(1) .chip.as .x', '「×」で割り当てを外せます'));
} };

DEMOS.excel = { section: 'excel', title: 'Excel（A4）で出力して印刷する', run: async function (b, d) {
  var p = await openAdmin(b);
  var shot = await snap(p, d, 'excel', await clipOf(p, ['#tab-list .bar'], 8), 0, '一覧の上のボタン');
  d.steps.push(await step(p, shot, '#fSlot', '必要なら先に絞り込みます（例：参加確定の人だけ）。何もしなければ全員'));
  d.steps.push(await step(p, shot, '#xlsxBtn', '「Excel（A4）で出力」を押すと、ファイルが保存されます'));
} };

// ---------- 実行 ----------
(async function () {
  var only = process.argv.slice(2);
  var srv = cp.spawn(process.execPath, [path.join(ROOT, 'test/serve.js'), String(PORT)], { stdio: 'ignore' });
  try {
    for (var i = 0; i < 40; i++) { try { await fetch(BASE + '__mails'); break; } catch (e) { await new Promise(function (r) { setTimeout(r, 150); }); } }
    var old = fs.existsSync(JSON_OUT) ? JSON.parse(fs.readFileSync(JSON_OUT, 'utf8')).demos : [];
    var b = await pw.chromium.launch({ channel: 'chrome' });
    var out = [];
    for (var id of Object.keys(DEMOS)) {
      if (only.length && only.indexOf(id) < 0) { var keep = old.filter(function (x) { return x.id === id; })[0]; if (keep) out.push(keep); continue; }
      await seed();
      var D = DEMOS[id], demo = { id: id, section: D.section, after: D.after, title: D.title, head: D.head, images: [], steps: [] };
      await D.run(b, demo);
      out.push(demo); console.log(id, demo.images.length + '枚', demo.steps.length + '手順');
    }
    await b.close();
    fs.writeFileSync(JSON_OUT, JSON.stringify({ demos: out }, null, 1));
  } finally { srv.kill(); }
})().catch(function (e) { console.error(e); process.exit(1); });
