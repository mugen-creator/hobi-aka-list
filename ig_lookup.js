#!/usr/bin/env node
// Look up IG profiles with same handle as X. Save to `instagram` table.
const { chromium } = require('/Users/kyazuya/goods-scout/node_modules/playwright');
const Database = require('/Users/kyazuya/goods-scout/node_modules/better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'hobi.db');
const CDP = process.env.CDP || 'http://localhost:9222';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function parseCount(s) {
  if (!s) return null;
  s = s.trim().replace(/,/g, '').replace(/\s/g, '');
  const m = s.match(/^([\d.]+)([KMk万])?/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  const unit = m[2];
  if (unit === 'K' || unit === 'k') n *= 1000;
  else if (unit === 'M') n *= 1000000;
  else if (unit === '万') n *= 10000;
  return Math.round(n);
}

function initDb() {
  const db = new Database(DB_PATH);
  db.prepare(`CREATE TABLE IF NOT EXISTS instagram (
    x_handle TEXT PRIMARY KEY,
    exists_flag INTEGER NOT NULL,
    ig_followers INTEGER,
    ig_following INTEGER,
    ig_posts INTEGER,
    ig_full_name TEXT,
    ig_bio TEXT,
    ig_url TEXT,
    checked_at TEXT
  )`).run();
  return db;
}

async function run(limit) {
  const db = initDb();
  // person-ish candidates (followers>=200, not obvious brand pattern)
  const todo = db.prepare(`
    SELECT p.handle, p.followers FROM profiles p
    LEFT JOIN instagram i ON i.x_handle = p.handle
    WHERE p.followers IS NOT NULL AND p.followers >= 200
      AND i.x_handle IS NULL
    ORDER BY p.followers DESC
    LIMIT ?
  `).all(limit);
  console.log(`[todo] ${todo.length} handles to lookup on IG`);

  const upsert = db.prepare(`INSERT OR REPLACE INTO instagram
    (x_handle, exists_flag, ig_followers, ig_following, ig_posts, ig_full_name, ig_bio, ig_url, checked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  let hit = 0, miss = 0;
  for (const { handle, followers } of todo) {
    try {
      await page.goto(`https://www.instagram.com/${handle}/`, { timeout: 20000 });
      await sleep(2500 + Math.random() * 1500);
      const data = await page.evaluate(() => {
        const descr = document.querySelector('meta[name="description"]')?.getAttribute('content') || null;
        const ogUrl = document.querySelector('meta[property="og:url"]')?.getAttribute('content') || null;
        const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || null;
        return { descr, ogUrl, ogTitle };
      });

      // Parse description like: フォロワー12K人、フォロー中500人、投稿120件 - Full Name (@handle)のInstagramプロフィール: 「bio...」
      if (data.descr) {
        const fwMatch = data.descr.match(/フォロワー([\d.,]+[KM万]?)人?/) || data.descr.match(/([\d.,]+[KM万]?)\s*Followers/i);
        const flMatch = data.descr.match(/フォロー中([\d.,]+[KM万]?)人?/) || data.descr.match(/([\d.,]+[KM万]?)\s*Following/i);
        const posMatch = data.descr.match(/投稿([\d.,]+[KM万]?)件?/) || data.descr.match(/([\d.,]+[KM万]?)\s*Posts/i);
        const bioMatch = data.descr.match(/「([^」]*)」/) || data.descr.match(/:\s*"([^"]*)"/);
        const nameMatch = data.descr.match(/-\s*(.+?)\s*\(@/);
        upsert.run(handle, 1,
          fwMatch ? parseCount(fwMatch[1]) : null,
          flMatch ? parseCount(flMatch[1]) : null,
          posMatch ? parseCount(posMatch[1]) : null,
          nameMatch ? nameMatch[1] : null,
          bioMatch ? bioMatch[1] : null,
          data.ogUrl || `https://www.instagram.com/${handle}/`,
          new Date().toISOString()
        );
        hit++;
        if (hit % 25 === 0) console.log(`[hit=${hit} miss=${miss}] @${handle} fw=${fwMatch?.[1] || '-'}`);
      } else {
        // profile does not exist or private wall
        upsert.run(handle, 0, null, null, null, null, null, null, new Date().toISOString());
        miss++;
      }
    } catch (e) {
      miss++;
      upsert.run(handle, 0, null, null, null, null, null, null, new Date().toISOString());
    }
  }

  await page.close();
  await browser.close();
  console.log(`[done] hit=${hit} miss=${miss} rate=${((hit/(hit+miss))*100).toFixed(1)}%`);
  db.close();
}

const limit = parseInt(process.argv[2] || '1500', 10);
run(limit).catch(e => { console.error(e); process.exit(1); });
