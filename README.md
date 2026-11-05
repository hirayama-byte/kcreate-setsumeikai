# お仕事説明会 応募フォーム＋管理（ケイクリエイト）

- `docs/` … GitHub Pages で公開（応募フォーム `/`・管理画面 `/admin/`）。`docs/config.js` に GAS の URL
- `gas/` … 受け口（Google Apps Script・スプレッドシート「お仕事説明会 応募管理」に付属）。`Secret.gs`（最初のパスワード）は GitHub に置かない
- テスト: `node test/run.js`（受け口）／ `node test/serve.js 8790` → `PW=<playwright> node test/ui-check.js`（画面）
