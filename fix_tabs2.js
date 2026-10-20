#!/usr/bin/env node
// Robust orphan delete + restore 🔧作り方 tab
const { chromium } = require('/Users/kyazuya/goods-scout/node_modules/playwright');
const CDP = 'http://localhost:9226';
const SHEET_ID = '1wzEUr5IkjefUrJqRdrbm7i-odpfxbvVA0aQQTldKTK0';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const HOWTO = `ホビ垢PRリスト - 作り方・技術メモ
最終更新: 2026-10-20

■ 全体フロー
1. X・IGそれぞれ別軸でハッシュタグ検索によるハンドル収集
2. 各ハンドルのプロフィール詳細取得(フォロワー数・bio等)
3. ブランド・店舗・情報チャンネルの除外(classifier)
4. 大ジャンル推定(bio+タグキーワード)
5. CSVに統合→スプシに貼り付け

■ 使用技術
- Playwright + Chrome CDP(Chrome for Testing ワーカー 9224-9226)
- SQLite(better-sqlite3)でローカルDB(/Users/kyazuya/hobi-aka-list/hobi.db)
- Node.js スクリプト群
- Google Sheets API ではなくClipboard pasteで既存シートに書き込み

■ X側スクレイピング
対象タグ(有効なもの): #ホビ垢 系+#量産型+#韓国コーデ+#HONEYMEW+#dreamv+#地雷系+#めじるしアクセサリー+#ボンボンドロップ+#メロジョイ+#缶バッジ+#アクスタ+#痛バ+#ガチャ活+#一番くじ+#オリパ+#DOPA+#トレカ 等 計55タグ
ハブ展開: 10K+個人垢14名のフォロワー/フォローから芋づる収集

■ IG側スクレイピング
対象タグ: 計58タグ
IG専用の内部API /api/v1/tags/web_info/?tag_name=XXX を叩く(x-ig-app-id ヘッダー必須)
各タグから最大25人程度の投稿者が返る→合計1,368ユニーク取得

■ プロフィール取得
X: profile ページから [data-testid="UserDescription"] と follower link でパース
IG: profile ページの meta[name="description"] から follower/following/posts/bio をパース(API 429回避)

■ ブランド判定(classifier)
以下のパターンに該当する handle/display_name/bio をbrand判定:
- handle suffix: _official _jp _shop _store _japan _channel _global _asia 等
- 名前: 株式会社/有限会社/合同会社/通販/販売店/公式/オフィシャル
- チェーン店名: 古本市場/ふるいち/駿河屋/ブックオフ/TSUTAYA/ガチャ王国 等50種
- 大手ブランド: 無印/UNIQLO/GU/ZARA/サンリオ/ポケモン/バンダイ 等70種
- 情報チャンネル: 100均チャンネル/ダイソー/セリア/キャンドゥ/スリコ
- bio シグナル: 営業時間/定休日/買取価格/スタッフ募集/当店 等

■ 大ジャンル推定ロジック(優先度順)
1. オリパ・トレカ系: タグ #オリパ #DOPA #トレカ or bioに「オリパ/dopa/ポケカ/mtg」等
2. 推し活グッズ系: タグ #めじるし #缶バッジ #アクスタ #ガチャ活 or bioキーワード
3. 現場・推し沼系: タグ #SixTONES #SEVENTEEN 等 or bioに「推し/現場/担/ペン」
4. コーデ系: タグ #量産型 #地雷系 #韓国 or bioに「量産/地雷/韓国/白系」
5. その他: 上記いずれにも該当なし

■ 制約・限界
- X検索はログインChromeで深掘り可能だがレートリミットあり
- IG APIは429頻発(1件2秒間隔必須)、HTMLパース(1件3秒)が確実
- 両プラットフォーム共に数千件のスクレイピングで数時間かかる
- Chrome 155以降、Playwright attachが Browser.setDownloadBehavior エラーで切れることあり(browser.close()しない設計必須)

■ データファイル場所
~/hobi-aka-list/hobi.db … 全データSQLite
~/hobi-aka-list/hobi-aka-list_v12.csv … 最新統合CSV
~/hobi-aka-list/*.js … スクレイピング・貼り付け用スクリプト群

■ 更新手順
1. 新しいタグを追加したい → ig_tags2.js/batch2.js の TAGS 配列に追記
2. スクレイプ再実行 → nohup node XXX.js
3. CSV再生成 → generate_v12.js(インラインで実行)
4. スプシ更新 → nohup node repaste_v12.js (CDP=9226)

■ 既知の課題
- X bioの取得率が低い(selector発火前に次に進んでいた、現在は改善中)
- IGログインセッション期限切れすると再ログイン必要
- 時間経過でフォロワー数が変動するため、PR起用直前の再チェック推奨
`;

async function deleteTabByText(page, matchText) {
  const tabs = await page.$$('.docs-sheet-tab');
  for (const t of tabs) {
    const txt = (await t.textContent() || '').trim();
    if (txt.includes(matchText)) {
      console.log(`[rightclick] ${txt}`);
      await t.click({ button: 'right' });
      await sleep(1500);
      // Try multiple delete menu text variations
      let clicked = false;
      for (const needle of ['シートを削除', 'シートの削除', '削除']) {
        try {
          const el = await page.getByText(needle, { exact: false }).first();
          if (await el.isVisible({ timeout: 1500 })) {
            await el.click({ timeout: 2000 });
            clicked = true;
            console.log(`[menu] clicked "${needle}"`);
            break;
          }
        } catch(e) {}
      }
      if (!clicked) {
        await page.keyboard.press('Escape');
        console.log(`[fail] no delete menu for ${txt}`);
        continue;
      }
      await sleep(1500);
      // Confirm: 削除 button or OK or Enter
      let confirmed = false;
      for (const needle of ['削除', 'OK', 'Delete']) {
        try {
          const btn = await page.getByRole('button', { name: needle }).first();
          if (await btn.isVisible({ timeout: 1500 })) {
            await btn.click({ timeout: 2000 });
            confirmed = true;
            console.log(`[confirm] clicked "${needle}"`);
            break;
          }
        } catch(e) {}
      }
      if (!confirmed) {
        await page.keyboard.press('Enter');
      }
      await sleep(2000);
      return true;
    }
  }
  return false;
}

(async () => {
  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  await page.goto(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`, { timeout: 30000 });
  await sleep(8000);

  try {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Browser.grantPermissions', {
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
      origin: 'https://docs.google.com'
    });
  } catch(e) {}

  // Delete orphan tabs
  for (const t of ['シート14', 'シート9', 'シート16', 'シート17', 'シート18']) {
    await deleteTabByText(page, t);
  }

  // Add 🔧作り方 tab
  console.log('[add] 🔧作り方・技術メモ');
  const addBtn = await page.$('#docs-sheets-add-container, [aria-label="シートを追加"], [aria-label="Add sheet"]');
  if (addBtn) {
    await addBtn.click();
    await sleep(2000);
  }
  const tabs = await page.$$('.docs-sheet-tab');
  if (tabs.length) {
    await tabs[tabs.length - 1].dblclick();
    await sleep(500);
    await page.keyboard.press('Meta+A');
    await page.keyboard.type('🔧作り方・技術メモ');
    await page.keyboard.press('Enter');
    await sleep(1500);
  }
  await page.keyboard.press('Escape');
  await sleep(300);
  await page.keyboard.press('Meta+Home');
  await sleep(500);
  await page.evaluate(async (t) => { await navigator.clipboard.writeText(t); }, HOWTO);
  await sleep(500);
  await page.keyboard.press('Meta+V');
  await sleep(4000);

  console.log('[done]');
})().catch(e => { console.error('ERR:', e); process.exit(1); });
