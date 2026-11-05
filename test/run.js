// node test/run.js — 受け口（Code.gs）の動作確認
var assert = require('assert'), E = require('./env.js');
var n = 0, ng = 0;
function t(name, fn) { try { fn(); n++; console.log('  ok  ' + name); } catch (e) { ng++; console.log('  NG  ' + name + '\n      ' + (e.stack || e).toString().split('\n').slice(0, 3).join('\n      ')); } }

function good(over) {
  return Object.assign({ name: '山田 花子', kana: 'やまだ はなこ', gender: '女性', birth: '1990-04-05', tel: '090-1234-5678', email: 'hanako@example.jp', wishes: ['14:00〜15:00', '10:00〜11:00'] }, over || {});
}
function login(g, pw) { var r = g.call({ action: 'login', password: pw || 'first-pass-123' }); assert.ok(r.token, JSON.stringify(r)); return r.token; }
function setup(g, st) { var tk = login(g); var r = g.call({ action: 'saveSettings', token: tk, settings: Object.assign({ title: '尾州物流 お仕事説明会', date: '2026年11月20日（金）', place: '一宮市民会館', staff: 'a@k-create.co.jp\nb@client.jp' }, st || {}) }); assert.ok(r.ok, JSON.stringify(r)); return tk; }

t('公開の設定: 7枠（10〜17時・昼含む）・受付中', function () {
  var g = E.load(), c = g.call({ action: 'config' });
  assert.deepStrictEqual(c.slots, ['10:00〜11:00', '11:00〜12:00', '12:00〜13:00', '13:00〜14:00', '14:00〜15:00', '15:00〜16:00', '16:00〜17:00']);
  assert.strictEqual(c.open, true);
  assert.strictEqual(c.staff, undefined, '受付担当のアドレスは公開しない');
});

t('応募: シートに1行・希望は時間順・電話の0と生年月日は文字のまま', function () {
  var g = E.load(); setup(g);
  var r = g.call({ action: 'apply', data: good() });
  assert.ok(r.ok, JSON.stringify(r));
  var sh = g.book.getSheetByName('応募者'), row = sh.data[1];
  assert.strictEqual(row[2], '山田 花子'); assert.strictEqual(row[5], '1990-04-05'); assert.strictEqual(typeof row[5], 'string');
  assert.strictEqual(row[6], '090-1234-5678');
  assert.deepStrictEqual([row[8], row[9], row[10]], ['10:00〜11:00', '14:00〜15:00', '']);
  assert.strictEqual(row[12], '未連絡');
});

t('応募メール: 本人あて（内容・差出人名・返信先は受付担当）＋受付担当の複数アドレスへ1通', function () {
  var g = E.load(); setup(g);
  g.call({ action: 'apply', data: good() });
  var m = g.env.sent;
  assert.strictEqual(m.length, 2);
  assert.strictEqual(m[0].to, 'hanako@example.jp');
  assert.ok(/尾州物流 お仕事説明会/.test(m[0].subject), m[0].subject);
  assert.ok(m[0].body.indexOf('山田 花子 様') === 0, m[0].body);
  assert.ok(m[0].body.indexOf('希望の時間帯：10:00〜11:00、14:00〜15:00') > 0);
  assert.ok(m[0].body.indexOf('生年月日：1990年4月5日') > 0);
  assert.ok(m[0].body.indexOf('開催日：2026年11月20日（金）') > 0 && m[0].body.indexOf('会場：一宮市民会館') > 0);
  assert.ok(m[0].body.indexOf('{') < 0, '差し込みの残りがない');
  assert.strictEqual(m[0].replyTo, 'a@k-create.co.jp');
  assert.strictEqual(m[0].name, 'お仕事説明会 受付');
  assert.strictEqual(m[1].to, 'a@k-create.co.jp,b@client.jp');
  assert.strictEqual(m[1].replyTo, 'hanako@example.jp');
  assert.ok(/山田 花子/.test(m[1].subject));
});

t('返信先を設定したらそちら・受付担当が空なら本人あてだけ', function () {
  var g = E.load(); setup(g, { staff: '', reply_to: 'uketsuke@k-create.co.jp' });
  g.call({ action: 'apply', data: good() });
  assert.strictEqual(g.env.sent.length, 1); assert.strictEqual(g.env.sent[0].replyTo, 'uketsuke@k-create.co.jp');
});

t('メールが送れなくても応募は受け付け、失敗を記録', function () {
  var g = E.load(); setup(g);
  var r = g.call({ action: 'apply', data: good({ email: 'x@fail.jp' }) });
  assert.ok(r.ok);
  var tk = login(g), list = g.call({ action: 'list', token: tk }).applicants;
  assert.strictEqual(list.length, 1); assert.ok(/本人へのメール失敗/.test(list[0].mail), list[0].mail);
});

t('入力チェック: 全部必須・ふりがなはひらがな・電話・メール・生年月日・希望1〜3', function () {
  var g = E.load(); setup(g);
  var r = g.call({ action: 'apply', data: {} });
  assert.deepStrictEqual(Object.keys(r.errors).sort(), ['birth', 'email', 'gender', 'kana', 'name', 'tel', 'wishes']);
  function err(over) { return (g.call({ action: 'apply', data: good(over) }).errors || {}); }
  assert.ok(err({ kana: 'Yamada' }).kana); assert.ok(!err({ kana: 'ヤマダ ハナコ' }).kana, 'カタカナもよい');
  assert.ok(err({ gender: 'その他' }).gender);
  assert.ok(err({ birth: '1990-02-30' }).birth); assert.ok(err({ birth: '2999-01-01' }).birth); assert.ok(err({ birth: '1990/4/5' }).birth);
  assert.ok(err({ tel: '1234' }).tel); assert.ok(err({ tel: 'abc' }).tel); assert.ok(!err({ tel: '０９０１２３４５６７８' }).tel, '全角数字もよい');
  assert.ok(err({ email: 'hanako@' }).email); assert.ok(err({ email: 'a b@x.jp' }).email);
  assert.ok(err({ wishes: [] }).wishes); assert.ok(err({ wishes: ['10:00〜11:00', '11:00〜12:00', '12:00〜13:00', '13:00〜14:00'] }).wishes);
  assert.ok(err({ wishes: ['9:00〜10:00'] }).wishes, '無い枠は不可');
  assert.ok(!err({ wishes: ['16:00〜17:00'] }).wishes, '1つでもよい');
  assert.strictEqual(g.book.getSheetByName('応募者').getLastRow(), 4, 'エラーなしの3件（カタカナ・全角電話・希望1つ）だけ入る');
});

t('全角の電話・メールは半角にそろえる・式に見える文字は無害化', function () {
  var g = E.load(); setup(g);
  g.call({ action: 'apply', data: good({ tel: '０９０−１２３４−５６７８', email: 'Hanako＠Example.jp', name: '=HYPERLINK("x")' }) });
  var row = g.book.getSheetByName('応募者').data[1];
  assert.strictEqual(row[6], '090-1234-5678'); assert.strictEqual(row[7], 'hanako@example.jp');
  assert.strictEqual(row[2].charAt(0), "'");
  var tk = login(g); assert.strictEqual(g.call({ action: 'list', token: tk }).applicants[0].name, '=HYPERLINK("x")', '画面には元の文字');
});

t('ロボット避けの欄が入っていたら保存しない（でも成功に見せる）', function () {
  var g = E.load(); setup(g);
  assert.ok(g.call({ action: 'apply', data: good({ website: 'http://spam' }) }).ok);
  var sh = g.book.getSheetByName('応募者'); assert.ok(!sh || sh.getLastRow() === 1); assert.strictEqual(g.env.sent.length, 0);
});

t('受付終了にすると応募できない', function () {
  var g = E.load(), tk = setup(g, { open: false });
  assert.strictEqual(g.call({ action: 'config' }).open, false);
  var r = g.call({ action: 'apply', data: good() }); assert.ok(r.closed); assert.strictEqual(g.env.sent.length, 0);
  g.call({ action: 'saveSettings', token: tk, settings: { open: true } });
  assert.ok(g.call({ action: 'apply', data: good() }).ok);
});

t('ログイン: パスワード違い・トークンなしは中身を見られない・10回間違えると一時停止', function () {
  var g = E.load(); g.call({ action: 'apply', data: good() });
  assert.ok(/違います/.test(g.call({ action: 'login', password: 'nope' }).error));
  assert.ok(/ログイン/.test(g.call({ action: 'list' }).error));
  assert.ok(/ログイン/.test(g.call({ action: 'list', token: 'a'.repeat(64) }).error));
  assert.ok(/ログイン/.test(g.call({ action: 'saveSettings', token: 'x', settings: { open: false } }).error));
  for (var i = 0; i < 9; i++) g.call({ action: 'login', password: 'nope' + i });
  assert.ok(/待って/.test(g.call({ action: 'login', password: 'first-pass-123' }).error), '10回目以降は正しくても止める');
  delete g.env.cache.fails;
  var tk = login(g); assert.strictEqual(g.call({ action: 'list', token: tk }).applicants.length, 1);
  g.call({ action: 'logout', token: tk }); assert.ok(g.call({ action: 'list', token: tk }).error, 'ログアウト後は使えない');
});

t('パスワード変更: 今のパスワードが必要・8文字以上・変えたら新しい方でだけ入れる', function () {
  var g = E.load(), tk = login(g);
  assert.ok(g.call({ action: 'changePassword', token: tk, current: 'x', next: 'newpassword1' }).error);
  assert.ok(g.call({ action: 'changePassword', token: tk, current: 'first-pass-123', next: 'short' }).error);
  assert.ok(g.call({ action: 'changePassword', token: tk, current: 'first-pass-123', next: 'newpassword1' }).ok);
  assert.ok(g.call({ action: 'login', password: 'first-pass-123' }).error);
  assert.ok(g.call({ action: 'login', password: 'newpassword1' }).token);
  assert.ok(!/newpassword1/.test(JSON.stringify(g.env.props)), 'パスワードそのものは保存しない');
});

t('最初のパスワードが無いとログインできない', function () {
  var g = E.load({ initPw: null }); assert.ok(g.call({ action: 'login', password: '' }).error); assert.ok(g.call({ action: 'login', password: 'undefined' }).error);
});

t('管理: 割り当て・状況・メモを保存（無い枠・無い状況は不可）', function () {
  var g = E.load(), tk = setup(g);
  g.call({ action: 'apply', data: good() }); g.call({ action: 'apply', data: good({ name: '佐藤 次郎', gender: '男性' }) });
  var list = g.call({ action: 'list', token: tk }).applicants, id = list[1].id;
  var r = g.call({ action: 'update', token: tk, id: id, fields: { slot: '14:00〜15:00', status: '連絡済み', memo: '11/6 午後に電話。14時でOK' } });
  assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(r.applicant.slot, '14:00〜15:00');
  var after = g.call({ action: 'list', token: tk }).applicants[1];
  assert.strictEqual(after.status, '連絡済み'); assert.strictEqual(after.memo, '11/6 午後に電話。14時でOK'); assert.strictEqual(after.name, '佐藤 次郎');
  assert.strictEqual(g.call({ action: 'list', token: tk }).applicants[0].slot, '', '他の人は変わらない');
  assert.ok(g.call({ action: 'update', token: tk, id: id, fields: { slot: '9:00〜10:00' } }).error);
  assert.ok(g.call({ action: 'update', token: tk, id: id, fields: { status: '???' } }).error);
  assert.ok(g.call({ action: 'update', token: tk, id: id, fields: { slot: '' } }).ok, '割り当てを外せる');
  assert.ok(g.call({ action: 'update', token: tk, id: 'nope', fields: { memo: 'x' } }).error);
});

t('管理: 削除（テストの応募を消す）', function () {
  var g = E.load(), tk = setup(g);
  g.call({ action: 'apply', data: good() }); g.call({ action: 'apply', data: good({ name: '残る 人' }) });
  var id = g.call({ action: 'list', token: tk }).applicants[0].id;
  assert.ok(g.call({ action: 'remove', token: tk, id: id }).ok);
  var l = g.call({ action: 'list', token: tk }).applicants; assert.strictEqual(l.length, 1); assert.strictEqual(l[0].name, '残る 人');
});

t('設定: 受付担当のアドレス（改行・カンマ区切り）・まちがったアドレスは保存しない・定員・時間帯を変えられる', function () {
  var g = E.load(), tk = login(g);
  assert.ok(/正しくありません/.test(g.call({ action: 'saveSettings', token: tk, settings: { staff: 'a@x.jp\nbad-address' } }).error));
  var r = g.call({ action: 'saveSettings', token: tk, settings: { staff: 'a@x.jp, b@y.jp\nc@z.jp', capacity: { '10:00〜11:00': '5', '11:00〜12:00': '' } } });
  assert.ok(r.ok); assert.strictEqual(r.settings.staff, 'a@x.jp\nb@y.jp\nc@z.jp');
  var d = g.call({ action: 'list', token: tk });
  assert.deepStrictEqual(d.capacity, { '10:00〜11:00': 5 }); assert.deepStrictEqual(d.staffValid, ['a@x.jp', 'b@y.jp', 'c@z.jp']);
  g.call({ action: 'saveSettings', token: tk, settings: { slots: '10:00〜11:00\n11:00〜12:00\n13:00〜14:00' } });
  assert.strictEqual(g.call({ action: 'config' }).slots.length, 3);
  assert.ok(g.call({ action: 'saveSettings', token: tk, settings: { slots: '' } }).error);
  assert.ok(g.call({ action: 'saveSettings', token: tk, settings: { mail_body: ' ' } }).error);
});

t('壊れた送信でも落ちない', function () {
  var g = E.load();
  assert.ok(JSON.parse(g.doPost({ postData: { contents: '{bad' } }).body).error);
  assert.ok(g.call({ action: 'unknown' }).error);
  assert.ok(g.call({ action: 'apply', data: { wishes: 'x' } }).errors.wishes);
});

console.log((ng ? n + ' 件 OK・' + ng + ' 件 NG' : n + ' 件 OK'));
process.exit(ng ? 1 : 0);
