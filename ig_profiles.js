#!/usr/bin/env node
// Fetch IG profile details via /api/v1/users/web_profile_info/
const { chromium } = require('/Users/kyazuya/goods-scout/node_modules/playwright');
const Database = require('/Users/kyazuya/goods-scout/node_modules/better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'hobi.db');
const CDP = 'http://localhost:9222';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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
  console.log(`[todo] ${todo.length} IG users`);

  const upsert = db.prepare(`INSERT OR REPLACE INTO ig_profiles
    (username, pk, full_name, bio, external_url, followers, following, posts_count,
     is_private, is_verified, is_business, category, checked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  await page.goto('https://www.instagram.com/', { timeout: 30000 });
  await sleep(3000);

  let ok = 0, fail = 0, rateLimited = 0;
  for (const { username } of todo) {
    try {
      const res = await page.evaluate(async (u) => {
        const r = await fetch('/api/v1/users/web_profile_info/?username=' + encodeURIComponent(u), {
          headers: { 'x-ig-app-id': '936619743392459' }
        });
        if (r.status !== 200) return { status: r.status };
        const d = await r.json();
        const u2 = d.data?.user;
        if (!u2) return { status: r.status, nodata: true };
        return {
          status: 200,
          pk: String(u2.id),
          full_name: u2.full_name || null,
          biography: u2.biography || null,
          external_url: u2.external_url || null,
          followers: u2.edge_followed_by?.count ?? null,
          following: u2.edge_follow?.count ?? null,
          posts: u2.edge_owner_to_timeline_media?.count ?? null,
          is_private: u2.is_private ? 1 : 0,
          is_verified: u2.is_verified ? 1 : 0,
          is_business: u2.is_business_account ? 1 : 0,
          category: u2.category_name || null,
        };
      }, username);

      const now = new Date().toISOString();
      if (res.status === 429) {
        rateLimited++;
        console.log(`[429] ${username} - sleep 180s`);
        await sleep(180000);
        continue;
      }
      if (res.status !== 200 || res.nodata) {
        upsert.run(username, null, null, null, null, null, null, null, null, null, null, null, now);
        fail++;
        continue;
      }
      upsert.run(username, res.pk, res.full_name, res.biography, res.external_url,
        res.followers, res.following, res.posts, res.is_private, res.is_verified,
        res.is_business, res.category, now);
      ok++;
      if (ok % 20 === 0) console.log(`[progress] ok=${ok} fail=${fail} 429=${rateLimited} last=${username} fw=${res.followers}`);
    } catch (e) {
      fail++;
    }
    await sleep(8000 + Math.random() * 4000);
  }
  console.log(`[done] ok=${ok} fail=${fail} 429=${rateLimited}`);
  await page.close();
  await browser.close();
  db.close();
})().catch(e => { console.error(e); process.exit(1); });
