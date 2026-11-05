// サンプル（架空）のデータ。使い方ガイドの写真（docs/guide/demos.js）と、パスワードなしのサンプル画面（node test/serve.js 8791 --sample）で共通
// seed(call, password) … call(req) は受け口を呼んで結果を返す関数（そのまま値でも Promise でもよい）。ログインのトークンを返す
var SAMPLE = [
  { name: '山田 花子', kana: 'やまだ はなこ', gender: '女性', birth: '1990-04-05', tel: '090-1234-5678', email: 'hanako@example.jp', wishes: ['10:00〜11:00', '14:00〜15:00'] },
  { name: '佐藤 健一', kana: 'さとう けんいち', gender: '男性', birth: '1985-07-01', tel: '080-2345-6789', email: 'kenichi@example.jp', wishes: ['10:00〜11:00'] },
  { name: '鈴木 美咲', kana: 'すずき みさき', gender: '女性', birth: '2001-12-24', tel: '070-3456-7890', email: 'misaki@example.jp', wishes: ['13:00〜14:00', '15:00〜16:00', '16:00〜17:00'] },
  { name: '高橋 大輔', kana: 'たかはし だいすけ', gender: '男性', birth: '1995-01-15', tel: '090-4567-8901', email: 'daisuke@example.jp', wishes: ['11:00〜12:00', '13:00〜14:00'] },
  { name: '伊藤 さくら', kana: 'いとう さくら', gender: '女性', birth: '1998-03-30', tel: '080-5678-9012', email: 'sakura@example.jp', wishes: ['10:00〜11:00', '11:00〜12:00'] },
  { name: '渡辺 翔太', kana: 'わたなべ しょうた', gender: '男性', birth: '1979-10-10', tel: '0586-12-3456', email: 'shota@example.jp', wishes: ['14:00〜15:00'] }
];
async function seed(call, password) {
  var tk = (await call({ action: 'login', password: password })).token;
  await call({ action: 'saveSettings', token: tk, settings: { title: '日建ホームズ お仕事説明会', date: '2026年1月16日（金）', place: '一宮市○○町1-2-3 2階 会議室', staff: 'uketsuke@k-create.co.jp\ntanto@example.co.jp', capacity: { '10:00〜11:00': 3, '11:00〜12:00': 3, '13:00〜14:00': 3, '14:00〜15:00': 3 } } });
  for (var d of SAMPLE) await call({ action: 'apply', data: d });
  await call({ action: 'add', token: tk, data: { name: '中村 誠', kana: 'なかむら まこと', tel: '0586-98-7654', gender: '男性', wishes: ['13:00〜14:00'], slot: '13:00〜14:00', status: '参加確定', memo: '電話で受付（11/5 平山）', source: '電話' } });
  var L = (await call({ action: 'list', token: tk })).applicants, by = {}; L.forEach(function (a) { by[a.name] = a.id; });
  await call({ action: 'update', token: tk, id: by['佐藤 健一'], fields: { slot: '10:00〜11:00', status: '参加確定', memo: '11/6 10時に電話。10時でOK' } });
  await call({ action: 'update', token: tk, id: by['高橋 大輔'], fields: { slot: '11:00〜12:00', status: '連絡済み', memo: '11時で調整中' } });
  await call({ action: 'update', token: tk, id: by['渡辺 翔太'], fields: { status: '不在・折り返し待ち', memo: '11/6 留守電に入れた' } });
  return tk;
}
module.exports = { SAMPLE: SAMPLE, seed: seed };
