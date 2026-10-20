#!/usr/bin/env node
const { chromium } = require('/Users/kyazuya/goods-scout/node_modules/playwright');
const Database = require('/Users/kyazuya/goods-scout/node_modules/better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'hobi.db');
const CDP = 'http://localhost:9225';

// Additional tags (not in first batch of 29)
const TAGS = [
  // 推し活全般
  '推し活','推し活アカ','おしゃれさんと繋がりたい','購入品','ホビ垢初心者','ホビ垢と繋がりたい',
  // トレカ系
  'ポケカ女子','ポケモンカード','遊戯王','遊戯王開封','ワンピカード','ワンピカード開封','ユニオンアリーナ','ヴァイス','トレカ女子','ガチャ女子','トレカオリパ','ガチャ結果',
  // 韓国系
  '韓国ファッション','韓国系','韓国女子','韓国コスメ',
  // 白系・量産
  '白系コーデ','量産型コーデ','りぼんがとれない','りぼん','りぼんコーデ','ガーリーコーデ',
  // 地雷系
  '地雷コーデ','病み可愛い','ゆめかわ','やみかわ','ピンク病み',
  // 推し沼・現場
  'SixTONES','SnowMan','なにわ男子','SEVENTEEN','StrayKids','ENHYPEN','ジャニヲタ','現場コーデ','スタヲタ','推し活コーデ',
  // 開封・ガチャ補完
  '開封動画','ガチャガチャ女子','カプセルトイ女子',
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function initDb() {
  const db = new Database(DB_PATH);
  db.prepare(`CREATE TABLE IF NOT EXISTS instagram_tags (
    username TEXT NOT NULL,
    source_tag TEXT NOT NULL,
    pk TEXT,
    full_name TEXT,
    is_private INTEGER DEFAULT 0,
    is_verified INTEGER DEFAULT 0,
    first_seen TEXT,
    PRIMARY KEY (username, source_tag)
  )`).run();
  return db;
}

(async () => {
  const db = initDb();
  const insert = db.prepare(`INSERT OR IGNORE INTO instagram_tags
    (username, source_tag, pk, full_name, is_private, is_verified, first_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);

  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto('https://www.instagram.com/', { timeout: 30000 });
  await sleep(3000);

  const totals = {};
  for (const tag of TAGS) {
    try {
      const result = await page.evaluate(async (t) => {
        const r = await fetch('/api/v1/tags/web_info/?tag_name=' + encodeURIComponent(t), {
          headers: { 'x-ig-app-id': '936619743392459' }
        });
        if (r.status !== 200) return { err: 'status ' + r.status };
        const d = await r.json();
        const authors = [];
        const seen = new Set();
        const walk = (sections) => {
          for (const s of (sections||[])) {
            for (const m of (s.layout_content?.medias || [])) {
              const u = m.media?.user;
              if (u && u.username && !seen.has(u.username)) {
                seen.add(u.username);
                authors.push({
                  username: u.username,
                  pk: String(u.pk),
                  full_name: u.full_name || null,
                  is_private: u.is_private ? 1 : 0,
                  is_verified: u.is_verified ? 1 : 0,
                });
              }
            }
          }
        };
        walk(d.data?.top?.sections);
        walk(d.data?.recent?.sections);
        return { authors };
      }, tag);

      if (result.err) {
        console.log(`[tag #${tag}] ${result.err}`);
        totals[tag] = 0;
        continue;
      }
      const now = new Date().toISOString();
      for (const a of result.authors) {
        insert.run(a.username, '#' + tag, a.pk, a.full_name, a.is_private, a.is_verified, now);
      }
      totals[tag] = result.authors.length;
      console.log(`[tag #${tag}] ${result.authors.length}`);
    } catch (e) {
      console.log(`[tag #${tag}] err: ${e.message.slice(0,80)}`);
      totals[tag] = -1;
    }
    await sleep(3000 + Math.random() * 2000);
  }

  const grand = db.prepare('SELECT COUNT(DISTINCT username) c FROM instagram_tags').get();
  console.log(`\n[GRAND] unique IG users: ${grand.c}`);
  await page.close();
  await browser.close();
  db.close();
})().catch(e => { console.error(e); process.exit(1); });
