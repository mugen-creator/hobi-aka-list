#!/usr/bin/env node
// Add 2 doc tabs: README and HOWTO
const { chromium } = require('/Users/kyazuya/goods-scout/node_modules/playwright');
const CDP = 'http://localhost:9226';
const SHEET_ID = '1wzEUr5IkjefUrJqRdrbm7i-odpfxbvVA0aQQTldKTK0';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const README = `ホビ垢PRリスト - 使い方ガイド
最終更新: 2026-10-20

■ このリストは何？
X(Twitter)とInstagramから、推し活・ガチャ・コーデ系の個人アカウント約1,500名を集めたPR施策候補リスト。
on-gacha(オンガチャ)のポイント付与型PR施策のインフルエンサー候補として使用。

■ 列の意味
媒体: X もしくは IG(Instagram)
大ジャンル: 投稿内容から推定したカテゴリ(オリパ・トレカ系/推し活グッズ系/コーデ系/現場・推し沼系/その他)
種別: person(個人)/brand(ブランド・店舗・情報チャンネル・公式)。brandはPR対象外
プロフURL: クリックで該当プロフィールを開ける
handle/username: Xのhandle もしくは IGのusername
表示名: アカウントの表示名
フォロワー: フォロワー数(収集時点)
bio: プロフィール本文(抜粋・最大150文字)
タグ: このアカウントが引っかかったハッシュタグ
認証: 公式認証バッジの有無

■ タブ構成
X系 (6タブ)
🎯オリパ・トレカ系 97名 … オリパ開封・トレカ系。PR最本線
💝推し活グッズ系 440名 … めじるし・缶バッジ・アクスタ系。ガチャ親和高
👗コーデ系 191名 … 白系/量産型/地雷/韓国コーデ系
🎧現場・推し沼系 38名 … ジャニ/K-POP現場系
その他 483名 … 分類不能・ハブ経由のみ
X_ブランド情報 303名 … 公式・店舗・情報チャンネル(除外対象)

IG系 (7タブ)
📸個人垢200+ 541名 … IG個人垢全部(フォロワー200以上)
IG_ブランド情報 251名 … IG公式/店舗(除外対象)
🎯オリパ・トレカ系 97名
💝推し活グッズ系 109名
👗コーデ系 160名
🎧現場・推し沼系 88名
その他 87名

■ 使い方
各タブの1行目は固定済み。各列の▼でフィルタ・ソート可能。
フォロワー列▼ → 大きい順に並び替え、インフルエンサー順に見れる。
大ジャンル列▼ → 複数ジャンル該当があるときに絞り込み可能。
タグ列▼ → 特定の#タグ経由で引っかかったアカウントだけ見れる。

■ PR運用の推奨順
1. X_🎯オリパ・トレカ系 (97名) 10K+層からDM
2. IG_🎯オリパ・トレカ系 (97名) 10K+層からDM
3. X_💝推し活グッズ系 (440名) フォロワー1,000以上に絞って声かけ
4. IG_💝推し活グッズ系 (109名) 同上
5. その他ジャンルは余力あればアプローチ

■ 注意事項
- bioが空のアカウントが多いのはスクレイピング時のDOM取得失敗(X側で頻発)
- 「種別=brand」のタブはPR起用対象外(店舗公式・情報チャンネル・ブランド)
- ハブ経由(hub:xxx)のみで引っかかったアカウントは精度低め
- フォロワー数は収集時点のスナップショット。実運用時は再確認推奨
- X/IGは別軸(同名検索ではなく独立に収集)。両プラットフォームの関連性なし

■ 問い合わせ
技術的な質問・リスト更新依頼は半田司哉(hanmow165@gmail.com)まで
`;

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
対象タグ(有効なもの): #ホビ垢 #ホビ垢さんと繋がりたい #量産型 #量産型コーデ #韓国コーデ #韓国ファッション #HONEYMEW #dreamv #地雷系 #地雷コーデ #地雷ちゃん #病み可愛い #メンヘラ #ゆめかわ #やみかわ #おしゃれさんと繋がりたい #コーデ記録 #めじるしアクセサリー #めじるし #ボンボンドロップ #メロジョイ #缶バッジ #缶バッジ交換 #アクスタ #アクリルスタンド #推しグッズ #痛バ #痛バッグ #ガチャ活 #ガチャガチャ #ガチャ報告 #一番くじ #オリパ #オリパ開封 #DOPA #DOPAオリパ #トレカ 等 計55タグ
ハブ展開: 10K+個人垢14名のフォロワー/フォローから芋づる収集
X検索は未ログインChromeでも可(但しレートリミット厳)

■ IG側スクレイピング
対象タグ: 計58タグ(X側のタグに加えて韓国系・推し沼系・DIY系追加)
IG専用の内部API /api/v1/tags/web_info/?tag_name=XXX を叩く(x-ig-app-id ヘッダー必須)
各タグから最大25人程度の投稿者が返る→合計1,368ユニーク取得
IGログイン必須(未ログインだとAPI認証エラー)

■ プロフィール取得
X: profile ページから [data-testid="UserDescription"] と follower link でパース
IG: profile ページの meta[name="description"] から follower/following/posts/bio をパース(API 429回避)

■ ブランド判定(classifier)
以下のパターンに該当する handle/display_name/bio をbrand判定:
- handle suffix: _official _jp _shop _store _japan _channel 等
- 名前: 株式会社/有限会社/合同会社/通販/販売店/公式/オフィシャル
- チェーン店名: 古本市場/ふるいち/駿河屋/ブックオフ/TSUTAYA/ガチャ王国 等50種
- 情報チャンネル: 100均チャンネル/ダイソー/セリア/キャンドゥ/スリコ
- bio シグナル: 営業時間/定休日/買取価格/スタッフ募集/当店 等

■ 大ジャンル推定ロジック(優先度順)
1. オリパ・トレカ系: タグ #オリパ #DOPA #トレカ or bioに「オリパ/dopa/ポケカ/mtg」等
2. 推し活グッズ系: タグ #めじるし #缶バッジ #アクスタ #ガチャ活 or bioキーワード
3. 現場・推し沼系: タグ #SixTONES #SEVENTEEN 等 or bioに「推し/現場/担/ペン」
4. コーデ系: タグ #量産型 #地雷系 #韓国 or bioに「量産/地雷/韓国/白系」
5. その他: 上記いずれにも該当なし

■ 制約・限界
- X検索はログインChromeで深掘り可能だがレートリミットあり(数分で止まる)
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
- IGログインセッション期限切れすると再ログイン必要(司哉手動)
- 時間経過でフォロワー数が変動するため、PR起用直前の再チェック推奨
`;

(async () => {
  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  await page.goto(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`, { timeout: 30000 });
  await sleep(8000);
  console.log('[1] opened');

  try {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Browser.grantPermissions', {
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
      origin: 'https://docs.google.com'
    });
  } catch(e) {}

  const docs = [
    { name: '📘リスト解説', text: README },
    { name: '🔧作り方・技術メモ', text: HOWTO },
  ];

  for (const d of docs) {
    console.log(`\n[new tab] ${d.name}`);
    // Click + button to add new sheet
    const addBtn = await page.$('#docs-sheets-add-container, [aria-label="シートを追加"], [aria-label="Add sheet"]');
    if (addBtn) {
      await addBtn.click();
      await sleep(2000);
    }
    // Rename newly created last tab
    const tabs = await page.$$('.docs-sheet-tab');
    if (tabs.length) {
      await tabs[tabs.length - 1].dblclick();
      await sleep(500);
      await page.keyboard.press('Meta+A');
      await page.keyboard.type(d.name);
      await page.keyboard.press('Enter');
      await sleep(1500);
    }
    // Go to A1 and paste as single-column text (lines → rows)
    await page.keyboard.press('Escape');
    await sleep(300);
    await page.keyboard.press('Meta+Home');
    await sleep(500);
    // Paste as single column: use text with newlines
    await page.evaluate(async (t) => { await navigator.clipboard.writeText(t); }, d.text);
    await sleep(500);
    await page.keyboard.press('Meta+V');
    await sleep(4000);
    console.log(`[${d.name}] pasted`);
  }

  console.log('\n[done]');
  // No close() to avoid Chrome 155 lock
})().catch(e => { console.error('ERR:', e); process.exit(1); });
