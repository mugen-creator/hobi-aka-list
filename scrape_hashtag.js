#!/usr/bin/env node
// X hashtag search -> extract user handles
// usage: node scrape_hashtag.js "#hobi" 30
const { chromium } = require('/Users/kyazuya/goods-scout/node_modules/playwright');
const Database = require('/Users/kyazuya/goods-scout/node_modules/better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'hobi.db');
const CDP = 'http://localhost:9222';

function initDb() {
  const db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS handles (
      handle TEXT NOT NULL,
      source_tag TEXT NOT NULL,
      display_name TEXT,
      first_seen TEXT NOT NULL,
      PRIMARY KEY (handle, source_tag)
    );
    CREATE TABLE IF NOT EXISTS profiles (
      handle TEXT PRIMARY KEY,
      display_name TEXT,
      bio TEXT,
      followers INTEGER,
      following INTEGER,
      posts_count INTEGER,
      joined TEXT,
      external_url TEXT,
      profile_image TEXT,
      verified INTEGER DEFAULT 0,
      checked_at TEXT,
      genre_guess TEXT
    );
  `);
  return db;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function run(tag, scrollCount) {
  const db = initDb();
  const insert = db.prepare('INSERT OR IGNORE INTO handles (handle, source_tag, display_name, first_seen) VALUES (?, ?, ?, ?)');
  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  const url = `https://x.com/search?q=${encodeURIComponent(tag)}&src=typed_query&f=live`;
  console.log(`[open] ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  const seen = new Set();
  let noNewRounds = 0;

  for (let i = 0; i < scrollCount; i++) {
    const found = await page.$$eval('article[role="article"]', (articles) => {
      const result = [];
      for (const art of articles) {
        const nameBlock = art.querySelector('[data-testid="User-Name"]');
        if (!nameBlock) continue;
        const anchors = nameBlock.querySelectorAll('a[href^="/"]');
        let handle = null;
        let displayName = null;
        for (const a of anchors) {
          const href = a.getAttribute('href') || '';
          if (/^\/[A-Za-z0-9_]{1,15}$/.test(href)) {
            handle = href.slice(1);
            const span = a.querySelector('span');
            if (span) displayName = span.innerText.trim();
            break;
          }
        }
        if (handle) result.push({ handle, displayName });
      }
      return result;
    });

    const nowIso = new Date().toISOString();
    let newThisRound = 0;
    for (const { handle, displayName } of found) {
      if (seen.has(handle)) continue;
      seen.add(handle);
      insert.run(handle, tag, displayName || null, nowIso);
      newThisRound++;
    }
    console.log(`[scroll ${i+1}/${scrollCount}] new=${newThisRound} total=${seen.size}`);

    if (newThisRound === 0) {
      noNewRounds++;
      if (noNewRounds >= 3) {
        console.log('[stop] 3 rounds no new handles');
        break;
      }
    } else {
      noNewRounds = 0;
    }
    await page.evaluate(() => window.scrollBy(0, 2500));
    await sleep(1500 + Math.random() * 1500);
  }

  await page.close();
  await browser.close();
  db.close();
  console.log(`[done] tag=${tag} unique=${seen.size}`);
}

const tag = process.argv[2] || '#ホビ垢';
const scrolls = parseInt(process.argv[3] || '30', 10);
run(tag, scrolls).catch(e => { console.error(e); process.exit(1); });
