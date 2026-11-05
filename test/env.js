// Code.gs を Node の中で動かすための入れ物（gas-mock.js は一斉DMのものを流用し、足りない所を足す）
var fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
var GasMock = require('./gas-mock.js');
// パスワードは gas/Secret.gs（GitHub に置かない）と同じ値。無いときはテスト用の仮の値
var SECRET = path.join(__dirname, '../gas/Secret.gs');
var PASSWORD = fs.existsSync(SECRET) ? (/INIT_PW = '([^']*)'/.exec(fs.readFileSync(SECRET, 'utf8')) || [])[1] : 'test-only-pass';

function load(opts) {
  opts = opts || {};
  var store = {}, env = GasMock.makeEnv(store, {});
  var book = env.SpreadsheetApp.create('説明会応募管理');
  env.SpreadsheetApp.getActive = function () { return book; };
  var sp = env.PropertiesService.getScriptProperties;
  env.PropertiesService.getScriptProperties = function () { var o = sp(); o.deleteProperty = function (k) { delete env.props[k]; }; return o; };
  env.Utilities.getUuid = function () { return crypto.randomUUID(); };
  env.Utilities.DigestAlgorithm = { SHA_256: 'sha256' };
  env.Utilities.Charset = { UTF_8: 'utf8' };
  env.Utilities.computeDigest = function (alg, s) { return Array.from(crypto.createHash('sha256').update(s, 'utf8').digest()).map(function (b) { return b > 127 ? b - 256 : b; }); };
  env.sent = [];
  env.MailApp = { sendEmail: function (o) {
    if (typeof o !== 'object') throw new Error('object form expected');
    if (/@fail\./.test(o.to)) throw new Error('Invalid email: ' + o.to);
    env.sent.push(o);
  } };
  env.console = { error: function () {}, log: function () {} };
  var ctx = vm.createContext(Object.assign({ JSON: JSON, Date: Date, Math: Math, String: String, Object: Object, Array: Array, parseInt: parseInt }, env));
  var code = fs.readFileSync(path.join(__dirname, '../gas/Code.gs'), 'utf8');
  if (opts.initPw !== null) code += "\nvar INIT_PW = '" + (opts.initPw || PASSWORD) + "';";
  vm.runInContext(code, ctx);
  ctx.env = env; ctx.book = book;
  // doPost を JSON で呼ぶ
  ctx.call = function (req) { return JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(req) } }).body); };
  return ctx;
}
module.exports = { load: load, PASSWORD: PASSWORD };
