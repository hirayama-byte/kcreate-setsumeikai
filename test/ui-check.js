// node test/ui-check.js — 画面の動作確認（先に node test/serve.js 8790 を起動）。スクリーンショットは test/shots/
var pw = require(process.env.PW || 'playwright'), fs = require('fs'), path = require('path');
var BASE = process.env.BASE || 'http://localhost:8790/';
var SHOTS = path.join(__dirname, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
var n = 0, ng = 0, jsErrors = [];
async function t(name, fn) { try { await fn(); n++; console.log('  ok  ' + name); } catch (e) { ng++; console.log('  NG  ' + name + '\n      ' + String(e && e.message || e).split('\n')[0]); } }
function ok(c, m) { if (!c) throw new Error(m || 'NG'); }

(async function () {
  var b = await pw.chromium.launch({ channel: 'chrome' });
  await (await fetch(BASE + '__reset')).text();
  var phone = await b.newContext({ viewport: { width: 375, height: 760 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  var p = await phone.newPage();
  p.on('pageerror', function (e) { jsErrors.push('form: ' + e.message); });

  await t('フォーム: 説明会名・7枠が出る（スマホ幅で横にはみ出さない）', async function () {
    await p.goto(BASE); await p.waitForSelector('#step-input:not(.hide)');
    ok((await p.locator('input[name=wish]').count()) === 7, '枠の数');
    ok(await p.evaluate(function () { return document.documentElement.scrollWidth <= window.innerWidth; }), '横はみ出し');
    await p.screenshot({ path: path.join(SHOTS, 'form-input.png'), fullPage: true });
  });
  await t('フォーム: 何も入れずに確認 → 7項目すべて必須のエラー', async function () {
    await p.click('button[type=submit]'); await p.waitForTimeout(300);
    ok((await p.locator('.field.bad').count()) === 7, 'エラー数 ' + await p.locator('.field.bad').count());
    await p.screenshot({ path: path.join(SHOTS, 'form-errors.png'), fullPage: true });
  });
  await t('フォーム: 希望は3つまで（4つ目は押せない）・1つでもよい', async function () {
    var w = p.locator('input[name=wish]');
    for (var i = 0; i < 3; i++) await w.nth(i * 2).check({ force: true });
    ok(await w.nth(1).isDisabled(), '4つ目が押せてしまう'); ok((await p.textContent('#wCount')).trim() === '3 / 3');
    await w.nth(0).uncheck({ force: true }); ok(!(await w.nth(1).isDisabled()), '外したら押せる');
    await w.nth(2).uncheck({ force: true }); // 残り1つ（14:00〜15:00）
  });
  await t('フォーム: ふりがな・電話・メールの形をチェック', async function () {
    await p.fill('#name', '山田 花子'); await p.fill('#kana', 'Yamada'); await p.fill('#tel', '12345'); await p.fill('#email', 'hanako@');
    await p.click('button[type=submit]'); await p.waitForTimeout(200);
    ok(/ひらがな/.test(await p.textContent('[data-f=kana] .err'))); ok(/正しくありません/.test(await p.textContent('[data-f=tel] .err'))); ok(/正しくありません/.test(await p.textContent('[data-f=email] .err')));
  });
  await t('フォーム: 正しく入れて確認画面 → 修正するで戻ると入力が残る', async function () {
    await p.fill('#kana', 'やまだ はなこ'); await p.fill('#tel', '０９０−１２３４−５６７８'); await p.fill('#email', 'hanako@example.jp');
    await p.check('input[name=gender][value=女性]', { force: true });
    await p.selectOption('#by', '1990'); await p.selectOption('#bm', '2'); await p.selectOption('#bd', '28');
    ok((await p.locator('#bd option').count()) === 29, '1990年2月は28日まで（＋「日」）');
    await p.locator('input[name=wish]').nth(0).check({ force: true });
    await p.click('button[type=submit]'); await p.waitForSelector('#step-confirm:not(.hide)');
    var txt = await p.textContent('#confirmList');
    ok(txt.indexOf('1990年2月28日') >= 0 && txt.indexOf('090-1234-5678') >= 0 && txt.indexOf('10:00〜11:00') >= 0 && txt.indexOf('14:00〜15:00') >= 0, txt);
    await p.screenshot({ path: path.join(SHOTS, 'form-confirm.png'), fullPage: true });
    await p.click('#backBtn'); await p.waitForSelector('#step-input:not(.hide)');
    ok(await p.inputValue('#name') === '山田 花子', '名前が消えた');
    await p.click('button[type=submit]'); await p.waitForSelector('#step-confirm:not(.hide)');
  });
  await t('フォーム: 送信 → 完了画面・本人と受付担当にメール', async function () {
    await p.click('#sendBtn'); await p.waitForSelector('#step-done:not(.hide)');
    await p.screenshot({ path: path.join(SHOTS, 'form-done.png'), fullPage: true });
    var mails = await (await fetch(BASE + '__mails')).json();
    ok(mails.length === 1 && mails[0].to === 'hanako@example.jp', '受付担当が未設定なので本人あて1通: ' + mails.length);
  });

  // 2人目・3人目（管理画面の確認用）
  async function apply(d) { await fetch(BASE + 'api', { method: 'POST', body: JSON.stringify({ action: 'apply', data: d }) }); }
  await apply({ name: '佐藤 次郎', kana: 'さとう じろう', gender: '男性', birth: '1985-07-01', tel: '0586-12-3456', email: 'jiro@example.jp', wishes: ['10:00〜11:00'] });
  await apply({ name: '鈴木 三郎', kana: 'すずき さぶろう', gender: '男性', birth: '2001-12-24', tel: '080-0000-1111', email: 'saburo@example.jp', wishes: ['13:00〜14:00', '16:00〜17:00'] });

  var pc = await b.newContext({ viewport: { width: 1366, height: 820 }, acceptDownloads: true });
  var a = await pc.newPage();
  a.on('pageerror', function (e) { jsErrors.push('admin: ' + e.message); });
  await t('管理: パスワード違いは入れない → 正しいと一覧（3人・未連絡）', async function () {
    await a.goto(BASE + 'admin/'); await a.fill('#pw', 'wrong'); await a.click('#loginBtn'); await a.waitForSelector('#loginErr:has-text("違います")');
    await a.fill('#pw', 'first-pass-123'); await a.click('#loginBtn'); await a.waitForSelector('#rows tr');
    ok((await a.locator('#rows tr').count()) === 3); ok((await a.textContent('#kpis')).indexOf('3応募') >= 0, await a.textContent('#kpis'));
    ok(/受付担当のアドレスが未設定/.test(await a.textContent('#warnBox')), '未設定の注意');
    await a.screenshot({ path: path.join(SHOTS, 'admin-list.png') });
  });
  await t('管理: 割当・状況・メモを変えて、読み込み直しても残る', async function () {
    var tr = a.locator('#rows tr').nth(1);
    await tr.locator('.eSlot').selectOption('10:00〜11:00'); await a.waitForTimeout(400);
    tr = a.locator('#rows tr').nth(1);
    await tr.locator('.eSt').selectOption('連絡済み'); await a.waitForTimeout(400);
    tr = a.locator('#rows tr').nth(1);
    await tr.locator('.eMemo').fill('11/6 14時 電話OK'); await a.click('#q'); await a.waitForTimeout(400);
    await a.reload(); await a.waitForSelector('#rows tr');
    tr = a.locator('#rows tr').nth(1);
    ok(await tr.locator('.eSlot').inputValue() === '10:00〜11:00'); ok(await tr.locator('.eSt').inputValue() === '連絡済み'); ok(await tr.locator('.eMemo').inputValue() === '11/6 14時 電話OK');
  });
  await t('管理: 絞り込み（未割当・検索）', async function () {
    await a.selectOption('#fSlot', '-'); ok((await a.locator('#rows tr').count()) === 2);
    await a.selectOption('#fSlot', ''); await a.fill('#q', 'すずき'); ok((await a.locator('#rows tr').count()) === 1);
    await a.fill('#q', '05861234'); ok((await a.locator('#rows tr').count()) === 1, 'ハイフンなしの電話でも'); await a.fill('#q', '');
  });
  await t('時間割: 7枠・割り当て済みと候補（第◯）・＋で割り当て・×で外す', async function () {
    await a.click('nav.tabs button[data-tab=tt]'); await a.waitForSelector('#tt .slot');
    ok((await a.locator('#tt .slot').count()) === 7);
    var s10 = a.locator('#tt .slot').nth(0);
    ok((await s10.locator('.chip.as').count()) === 1 && /佐藤/.test(await s10.locator('.chip.as').textContent()), '10時に佐藤さん');
    ok(/山田 花子/.test(await s10.textContent()) && /第1/.test(await s10.textContent()), '10時の候補に山田さん（第1）');
    await a.screenshot({ path: path.join(SHOTS, 'admin-timetable.png'), fullPage: true });
    var s13 = a.locator('#tt .slot').nth(3);
    await s13.locator('button.add').first().click(); await a.waitForTimeout(500);
    s13 = a.locator('#tt .slot').nth(3); ok((await s13.locator('.chip.as').count()) === 1, '13時に割り当て');
    ok(/鈴木/.test(await s13.locator('.chip.as').textContent()), '13時に鈴木さん'); ok(!/鈴木/.test(await a.locator('#tt .slot').nth(6).locator('.col').nth(1).textContent()), '割り当てたら他の枠（16時）の候補から消える');
    await s13.locator('button.x').click(); await a.waitForTimeout(500);
    ok((await a.locator('#tt .slot').nth(3).locator('.chip.as').count()) === 0, '外せる');
  });
  await t('設定: 受付担当2人・定員・開催日を保存 → 注意が消え、時間割に定員', async function () {
    await a.click('nav.tabs button[data-tab=set]'); await a.waitForSelector('#sTitle');
    await a.fill('#sTitle', '尾州物流 お仕事説明会'); await a.fill('#sDate', '2026年11月20日（金）'); await a.fill('#sPlace', '一宮市民会館 3階');
    await a.fill('#sStaff', 'uketsuke@k-create.co.jp\ntanto@client.co.jp');
    await a.fill('[data-cap="10:00〜11:00"]', '1');
    ok((await a.locator('#qr canvas, #qr img').count()) >= 1, 'QR が出ない');
    await a.screenshot({ path: path.join(SHOTS, 'admin-settings.png'), fullPage: true });
    await a.click('#saveSet'); await a.waitForSelector('.toast:has-text("保存")');
    ok(!/受付担当のアドレスが未設定/.test(await a.textContent('#warnBox')));
    ok(/尾州物流/.test(await a.textContent('#hTitle')));
    await a.click('nav.tabs button[data-tab=tt]'); ok(/定員 1/.test(await a.locator('#tt .slot').nth(0).textContent()));
    await fetch(BASE + 'api', { method: 'POST', body: JSON.stringify({ action: 'apply', data: { name: '高橋 四郎', kana: 'たかはし しろう', gender: '男性', birth: '1995-01-01', tel: '090-2222-3333', email: 'shiro@example.jp', wishes: ['11:00〜12:00'] } }) });
    var mails = await (await fetch(BASE + '__mails')).json(), last = mails[mails.length - 1];
    ok(last.to === 'uketsuke@k-create.co.jp,tanto@client.co.jp' && /高橋 四郎/.test(last.subject) && /尾州物流/.test(last.subject), JSON.stringify(last).slice(0, 200));
  });
  await t('Excel（A4）: 一覧と時間割の2枚・A4横・1ページ幅に収める・見出し行を毎ページ', async function () {
    await a.click('nav.tabs button[data-tab=list]'); await a.click('#reloadBtn'); await a.waitForTimeout(500);
    var dl = a.waitForEvent('download'); await a.click('#xlsxBtn'); var d = await dl;
    var f = path.join(__dirname, 'out.xlsx'); await d.saveAs(f);
    ok(/尾州物流 お仕事説明会_応募者一覧_\d{8}\.xlsx/.test(d.suggestedFilename()), d.suggestedFilename());
    var info = await a.evaluate(async function (b64) {
      var wb = new ExcelJS.Workbook(); await wb.xlsx.load(Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); }).buffer);
      return wb.worksheets.map(function (ws) { return { name: ws.name, ps: ws.pageSetup, rows: ws.rowCount, a1: ws.getCell('A1').value, c4: ws.getCell('C4').value, k5: ws.getCell('K5').value }; });
    }, fs.readFileSync(f).toString('base64'));
    ok(info.length === 2 && info[0].name === '応募者一覧' && info[1].name === '時間割', JSON.stringify(info.map(function (x) { return x.name; })));
    ok(info[0].ps.paperSize === 9 && info[0].ps.orientation === 'landscape' && info[0].ps.fitToWidth === 1 && info[0].ps.printTitlesRow === '3:3', JSON.stringify(info[0].ps));
    ok(info[0].rows === 3 + 4, '見出し3行＋4人: ' + info[0].rows);
    ok(/応募者一覧（4名）/.test(info[0].a1) && /山田 花子/.test(info[0].c4) && info[0].k5 === '11/6 14時 電話OK', JSON.stringify(info[0]));
    ok(info[1].rows === 3 + 7, '時間割は7枠');
  });
  await t('電話受付: 追加（必須3つ・割当と状況も）→ 一覧に「電話」・時間割に入る・メールは送らない', async function () {
    var before = (await (await fetch(BASE + '__mails')).json()).length;
    await a.click('nav.tabs button[data-tab=list]'); await a.click('#addBtn'); await a.waitForSelector('#modal:not(.hide)');
    await a.click('#mSave'); await a.waitForTimeout(400);
    ok(/入力/.test(await a.textContent('[data-e=name]')) && /入力/.test(await a.textContent('[data-e=tel]')), '必須エラー');
    await a.fill('#mName', '電話 太郎'); await a.fill('#mKana', 'でんわ たろう'); await a.fill('#mTel', '0586-11-2222');
    await a.locator('#mWishes input').nth(5).check(); await a.selectOption('#mSlot', '15:00〜16:00'); await a.fill('#mMemo', '11/5 電話で受付（平山）');
    ok(await a.inputValue('#mStatus') === '連絡済み', '状況の既定');
    await a.screenshot({ path: path.join(SHOTS, 'admin-add-phone.png') });
    await a.click('#mSave'); await a.waitForSelector('.toast:has-text("追加しました")'); await a.waitForTimeout(300);
    ok(await a.locator('#modal.hide').count() === 1, '閉じる');
    var tr = a.locator('#rows tr').last(); ok(/電話 太郎/.test(await tr.textContent()) && /電話/.test(await tr.locator('.src').textContent()), '一覧に電話');
    ok(await tr.locator('.eSlot').inputValue() === '15:00〜16:00');
    ok(/うち電話 1/.test(await a.textContent('#kpis')));
    await a.selectOption('#fSrc', '電話'); ok((await a.locator('#rows tr').count()) === 1, '受付で絞り込み'); await a.selectOption('#fSrc', '');
    await a.click('nav.tabs button[data-tab=tt]'); ok(/電話 太郎/.test(await a.locator('#tt .slot').nth(5).locator('.chip.as').textContent()), '時間割に入る');
    ok((await (await fetch(BASE + '__mails')).json()).length === before, 'メールは送らない');
    await a.click('nav.tabs button[data-tab=list]');
  });
  await t('編集: 名前と電話を直せる（割当・状況・メモはそのまま）', async function () {
    var tr = a.locator('#rows tr').last(); await tr.locator('.eEdit').click(); await a.waitForSelector('#modal:not(.hide)');
    ok(await a.inputValue('#mName') === '電話 太郎' && await a.locator('#mSlot').isHidden(), '編集では割当欄は出ない');
    await a.fill('#mName', '電話 太朗'); await a.fill('#mTel', '0586-11-3333'); await a.click('#mSave'); await a.waitForSelector('.toast:has-text("保存しました")'); await a.waitForTimeout(300);
    tr = a.locator('#rows tr').last(); ok(/電話 太朗/.test(await tr.textContent()) && /0586-11-3333/.test(await tr.textContent()));
    ok(await tr.locator('.eSlot').inputValue() === '15:00〜16:00' && await tr.locator('.eMemo').inputValue() === '11/5 電話で受付（平山）');
  });
  await t('受付終了にするとフォームは「受付は終了しました」', async function () {
    await a.click('nav.tabs button[data-tab=set]'); await a.uncheck('#sOpen'); await a.click('#saveSet'); await a.waitForSelector('.toast:has-text("保存")');
    await p.goto(BASE); await p.waitForSelector('#closed:not(.hide)');
    await a.check('#sOpen'); await a.click('#saveSet'); await a.waitForTimeout(600);
  });
  await t('管理: 削除は確認つき', async function () {
    await a.click('nav.tabs button[data-tab=list]');
    var before = await a.locator('#rows tr').count();
    a.once('dialog', function (dg) { dg.dismiss(); }); await a.locator('#rows tr').last().locator('.eDel').click(); await a.waitForTimeout(300);
    ok((await a.locator('#rows tr').count()) === before, 'キャンセルで消えない');
    a.once('dialog', function (dg) { dg.accept(); }); await a.locator('#rows tr').last().locator('.eDel').click(); await a.waitForSelector('.toast:has-text("削除")');
    ok((await a.locator('#rows tr').count()) === before - 1);
  });
  await t('管理: スマホ幅でもページが横にはみ出さない（表は枠の中で横に動く）', async function () {
    var m = await phone.newPage(); await m.goto(BASE + 'admin/');
    await m.fill('#pw', 'first-pass-123'); await m.click('#loginBtn'); await m.waitForSelector('#rows tr');
    ok(await m.evaluate(function () { return document.documentElement.scrollWidth <= window.innerWidth; }), '横はみ出し ' + await m.evaluate(function () { return document.documentElement.scrollWidth; }));
    await m.screenshot({ path: path.join(SHOTS, 'admin-phone.png'), fullPage: true });
    await m.click('nav.tabs button[data-tab=tt]'); await m.screenshot({ path: path.join(SHOTS, 'admin-phone-tt.png'), fullPage: true });
    ok(await m.evaluate(function () { return document.documentElement.scrollWidth <= window.innerWidth; }), '時間割 横はみ出し');
  });
  await t('JSエラーなし', async function () { ok(!jsErrors.length, jsErrors.join(' / ')); });
  await b.close();
  console.log((ng ? n + ' 件 OK・' + ng + ' 件 NG' : n + ' 件 OK'));
  process.exit(ng ? 1 : 0);
})();
