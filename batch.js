#!/usr/bin/env node
const { chromium } = require('/Users/kyazuya/goods-scout/node_modules/playwright');
const Database = require('/Users/kyazuya/goods-scout/node_modules/better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'hobi.db');
const CDP = 'http://localhost:9222';

const TAGS = [
  '#ホビ垢',
  '#量産型',
  '#量産型コーデ',
  '#韓国ファッション',
  '#HONEYMEW',
  '#dreamv',
  '#地雷系',
  '#地雷コーデ',
  '#病み可愛い',
  '#メンヘラ',
  '#SixTONESと繋がりたい',
  '#SnowManと繋がりたい',
  '#なにわ男子',
  '#timelesz',
  '#Travis_Japan',
  '#ジャニヲタさんと繋がりたい',
  '#SEVENTEEN',
  '#StrayKids',
  '#ENHYPEN',
  '#TXT',
  '#NewJeans',
  '#LESSERAFIM',
  '#IVE',
  '#SKZと繋がりたい',
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function initDb() {
  const db = new Database(DB_PATH);
  const ddl1 = `CREATE TABLE IF NOT EXISTS handles (handle TEXT NOT NULL, source_tag TEXT NOT NULL, display_name TEXT, first_seen TEXT NOT NULL, PRIMARY KEY (handle, source_tag))`;
  const ddl2 = `CREATE TABLE IF NOT EXISTS profiles (handle TEXT PRIMARY KEY, display_name TEXT, bio TEXT, followers INTEGER, following INTEGER, posts_count INTEGER, joined TEXT, external_url TEXT, profile_image TEXT, verified INTEGER DEFAULT 0, checked_at TEXT, genre_guess TEXT)`;
  db.prepare(ddl1).run();
  db.prepare(ddl2).run();
  return db;
}

const EXTRACT_FN = (arts) => {
  const result = [];
  for (const art of arts) {
    const nameBlock = art.querySelector('[data-testid="User-Name"]');
    if (!nameBlock) continue;
    const anchors = nameBlock.querySelectorAll('a[href^="/"]');
    let handle = null, displayName = null;
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
};

async function scrapeTag(page, insert, tag, scrollCount) {
  const url = `https://x.com/search?q=${encodeURIComponent(tag)}&src=typed_query&f=live`;
  console.log(`\n[tag ${tag}] open`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    console.log(`[tag ${tag}] goto failed: ${e.message.slice(0,80)}`);
    return 0;
  }
  await sleep(3000);
  const seen = new Set();
  let noNewRounds = 0;
  for (let i = 0; i < scrollCount; i++) {
    const found = await page.$$eval('article[role="article"]', EXTRACT_FN).catch(() => []);
    const now = new Date().toISOString();
    let newN = 0;
    for (const { handle, displayName } of found) {
      if (seen.has(handle)) continue;
      seen.add(handle);
      insert.run(handle, tag, displayName || null, now);
      newN++;
    }
    if (newN === 0) {
      noNewRounds++;
      if (noNewRounds >= 3) { console.log(`[tag ${tag}] stop (no new x3)`); break; }
    } else noNewRounds = 0;
    if (i % 5 === 0 || i === scrollCount - 1) console.log(`[tag ${tag}] scroll ${i+1}/${scrollCount} new=${newN} total=${seen.size}`);
    await page.evaluate(() => window.scrollBy(0, 2500));
    await sleep(1500 + Math.random() * 1500);
  }
  console.log(`[tag ${tag}] done unique=${seen.size}`);
  return seen.size;
}

(async () => {
  const db = initDb();
  const insert = db.prepare('INSERT OR IGNORE INTO handles (handle, source_tag, display_name, first_seen) VALUES (?, ?, ?, ?)');
  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  const scrolls = parseInt(process.argv[2] || '20', 10);
  const totals = {};
  for (const tag of TAGS) {
    totals[tag] = await scrapeTag(page, insert, tag, scrolls);
    await sleep(2000 + Math.random() * 2000);
  }

  const grand = db.prepare('SELECT COUNT(DISTINCT handle) c FROM handles').get();
  console.log(`\n[GRAND TOTAL] unique handles across all tags: ${grand.c}`);
  console.log(`[by tag]`, totals);
  await page.close();
  await browser.close();
  db.close();
})().catch(e => { console.error(e); process.exit(1); });
