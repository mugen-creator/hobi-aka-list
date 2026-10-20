# ホビ垢PRリスト

X(旧Twitter)とInstagramから、ホビー・推し活・ガチャ・コーデ系の個人アカウントを約1,500名分 自動収集してGoogleスプレッドシートに貼り付けるツール群。

on-gacha(オンラインガチャ)のポイント付与型PR施策のインフルエンサー候補リストとして使用。

## 使い方

スプレッドシートの「🔧作り方・技術メモ」タブに詳細手順あり。要点のみ以下。

### セットアップ(1回だけ)

```bash
git clone https://github.com/mugen-creator/hobi-aka-list.git
cd hobi-aka-list
npm install
npx playwright install chromium
```

Chrome 3つを別プロフィールで起動 → それぞれX / IG / Googleスプシにログイン

### 更新手順(毎回)

```bash
git pull
nohup node batch.js 20 > batch.log 2>&1 &       # Xハンドル収集
nohup node ig_tags.js > ig_tags.log 2>&1 &      # IGハンドル収集
nohup node scrape_profiles.js 2000 > profiles.log 2>&1 &   # Xプロフィール
nohup node ig_profiles_html.js > ig_html.log 2>&1 &        # IGプロフィール
nohup node repaste_v12.js > repaste.log 2>&1 &  # スプシ貼り付け
nohup node format_sheets.js > format.log 2>&1 & # 体裁整形
```

## 構成

| ファイル | 役割 |
|---|---|
| `batch.js`, `batch2.js`, `batch3.js`, `batch4.js` | Xハッシュタグ検索でハンドル収集 |
| `hub_expand.js` | X個人垢のフォロワー/フォローから芋づる展開 |
| `scrape_profiles.js` | Xプロフィール詳細(フォロワー数・bio)取得 |
| `ig_tags.js`, `ig_tags2.js` | IGハッシュタグ検索でユーザー収集 |
| `ig_profiles_html.js` | IGプロフィール詳細取得 |
| `repaste_v12.js` | SQLite→CSV→Google Sheets貼り付け |
| `format_sheets.js` | 1行目固定・フィルタ有効化 |

## 技術スタック

- Node.js + Playwright + Chrome CDP(Chrome for Testing)
- SQLite (better-sqlite3)
- Google Sheets Clipboard paste経由(API不使用)

## 設定

`repaste_v12.js` の冒頭 `SHEET_ID` を自分のGoogleスプシIDに書き換えて使う。

## オーナー

半田司哉 (hanmow165@gmail.com)
