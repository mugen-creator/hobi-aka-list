#!/usr/bin/env node
const { chromium } = require('/Users/kyazuya/goods-scout/node_modules/playwright');
const Database = require('/Users/kyazuya/goods-scout/node_modules/better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'hobi.db');
const CDP = process.env.CDP || 'http://localhost:9222';

const TAGS = [
  '#アクリルスタンド',
  '#推しグッズ',
  '#痛バ',
  '#痛バッグ',
  '#ガチャ活',
  '#ガチャガチャ',
  '#ガチャ報告',
  '#カプセルトイ',
  '#一番くじ',
  '#オリパ',
  '#オリパ開封',
  '#オリパ報告',
  '#オリパ結果',
  '#DOPA',
  '#DOPAオリパ',
  '#トレカ',
  '#トレカ開封',
  '#トレカガチャ',
  '#ポケカ開封',
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function initDb() {
  const db = new Database(DB_PATH);
  db.prepare('CREATE TABLE IF NOT EXISTS handles (handle TEXT NOT NULL, source_tag TEXT NOT NULL, display_name TEXT, first_seen TEXT NOT NULL, PRIMARY KEY (handle, source_tag))').run();
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
  await sleep(5000);
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
      if (noNewRounds >= 4) { console.log(`[tag ${tag}] stop (no new x4)`); break; }
    } else noNewRounds = 0;
    if (i % 5 === 0 || i === scrollCount - 1) console.log(`[tag ${tag}] scroll ${i+1}/${scrollCount} new=${newN} total=${seen.size}`);
    await page.evaluate(() => window.scrollBy(0, 3000));
    await sleep(2500 + Math.random() * 2500);
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

  const scrolls = parseInt(process.argv[2] || '30', 10);
  for (const tag of TAGS) {
    await scrapeTag(page, insert, tag, scrolls);
    const cool = 7000 + Math.random() * 5000;
    console.log(`[cool] sleep ${Math.round(cool)}ms`);
    await sleep(cool);
  }

  const grand = db.prepare('SELECT COUNT(DISTINCT handle) c FROM handles').get();
  console.log(`\n[GRAND TOTAL] ${grand.c}`);
  await page.close();
  await browser.close();
  db.close();
})().catch(e => { console.error(e); process.exit(1); });
