#!/usr/bin/env node
// Fetch IG profile details via HTML meta description (bypass 429 of /api/)
const { chromium } = require('/Users/kyazuya/goods-scout/node_modules/playwright');
const Database = require('/Users/kyazuya/goods-scout/node_modules/better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'hobi.db');
const CDP = 'http://localhost:9226';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function parseCount(s) {
  if (!s) return null;
  s = String(s).trim().replace(/,/g, '').replace(/人/g,'').replace(/件/g,'');
  const m = s.match(/^([\d.]+)([KMk万])?/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  const u = m[2];
  if (u === 'K' || u === 'k') n *= 1000;
  else if (u === 'M') n *= 1000000;
  else if (u === '万') n *= 10000;
  return Math.round(n);
}

function initDb() {
  const db = new Database(DB_PATH);
  db.prepare(`CREATE TABLE IF NOT EXISTS ig_profiles (
    username TEXT PRIMARY KEY,
    pk TEXT,
    full_name TEXT,
    bio TEXT,
    external_url TEXT,
    followers INTEGER,
    following INTEGER,
    posts_count INTEGER,
    is_private INTEGER,
    is_verified INTEGER,
    is_business INTEGER,
    category TEXT,
    checked_at TEXT
  )`).run();
  return db;
}

(async () => {
  const db = initDb();
  const todo = db.prepare(`
    SELECT DISTINCT it.username FROM instagram_tags it
    LEFT JOIN ig_profiles ip ON ip.username = it.username
    WHERE ip.username IS NULL
    ORDER BY it.username
  `).all();
  console.log(`[todo] ${todo.length}`);
  const upsert = db.prepare(`INSERT OR REPLACE INTO ig_profiles
    (username, pk, full_name, bio, external_url, followers, following, posts_count,
     is_private, is_verified, is_business, category, checked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] || await ctx.newPage();

  let ok = 0, fail = 0;
  for (const { username } of todo) {
    try {
      await page.goto(`https://www.instagram.com/${username}/`, { timeout: 20000 });
      await sleep(2500 + Math.random() * 1500);
      const data = await page.evaluate(() => ({
        descr: document.querySelector('meta[name="description"]')?.getAttribute('content') || null,
        ogUrl: document.querySelector('meta[property="og:url"]')?.getAttribute('content') || null,
      }));
      const now = new Date().toISOString();
      if (!data.descr) {
        upsert.run(username, null, null, null, null, null, null, null, null, null, null, null, now);
        fail++;
        continue;
      }
      const d = data.descr;
      const fwM = d.match(/フォロワー([\d.,]+[KM万]?)/);
      const flM = d.match(/フォロー中([\d.,]+[KM万]?)/);
      const posM = d.match(/投稿([\d.,]+[KM万]?)/);
      const bioM = d.match(/「([\s\S]*?)」\s*$/) || d.match(/「([^」]*)」/);
      const nameM = d.match(/-\s*(.+?)\s*\(@/);
      upsert.run(username, null,
        nameM ? nameM[1] : null,
        bioM ? bioM[1] : null,
        null,
        fwM ? parseCount(fwM[1]) : null,
        flM ? parseCount(flM[1]) : null,
        posM ? parseCount(posM[1]) : null,
        null, null, null, null,
        now
      );
      ok++;
      if (ok % 20 === 0) console.log(`[progress] ok=${ok} fail=${fail} last=${username} fw=${fwM?.[1] || '-'}`);
    } catch (e) {
      fail++;
      upsert.run(username, null, null, null, null, null, null, null, null, null, null, null, new Date().toISOString());
    }
  }
  console.log(`[done] ok=${ok} fail=${fail}`);
  db.close();
  // Intentionally NOT calling browser.close() to avoid Chrome 155 lock
  // Just let the process exit naturally
})().catch(e => { console.error(e); process.exit(1); });
