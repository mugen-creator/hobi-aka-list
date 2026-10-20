#!/usr/bin/env node
const { chromium } = require('/Users/kyazuya/goods-scout/node_modules/playwright');
const Database = require('/Users/kyazuya/goods-scout/node_modules/better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'hobi.db');
const CDP = process.env.CDP || 'http://localhost:9222';
const PER_HUB_CAP = parseInt(process.env.HUB_CAP || '500', 10);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function initDb() {
  const db = new Database(DB_PATH);
  db.prepare('CREATE TABLE IF NOT EXISTS handles (handle TEXT NOT NULL, source_tag TEXT NOT NULL, display_name TEXT, first_seen TEXT NOT NULL, PRIMARY KEY (handle, source_tag))').run();
  return db;
}

const EXTRACT_FN = (cells) => {
  const result = [];
  for (const cell of cells) {
    const link = cell.querySelector('a[href^="/"][role="link"]');
    if (!link) continue;
    const href = link.getAttribute('href') || '';
    if (!/^\/[A-Za-z0-9_]{1,15}$/.test(href)) continue;
    const handle = href.slice(1);
    const nameEl = cell.querySelector('div[dir="ltr"] span, div[dir="auto"] span');
    const displayName = nameEl ? nameEl.innerText.trim() : null;
    result.push({ handle, displayName });
  }
  return result;
};

async function scrapeFollowList(page, insert, hub, listType, cap) {
  const url = `https://x.com/${hub}/${listType}`;
  console.log(`\n[hub ${hub}/${listType}] open ${url}`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    console.log(`[${hub}/${listType}] goto failed: ${e.message.slice(0,80)}`);
    return 0;
  }
  await sleep(4000);
  const tag = `hub:${hub}:${listType}`;
  const seen = new Set();
  let noNew = 0;
  let scrolls = 0;
  const maxScrolls = 80;
  while (seen.size < cap && scrolls < maxScrolls) {
    const found = await page.$$eval('[data-testid="UserCell"]', EXTRACT_FN).catch(() => []);
    const now = new Date().toISOString();
    let newN = 0;
    for (const { handle, displayName } of found) {
      if (seen.has(handle)) continue;
      seen.add(handle);
      insert.run(handle, tag, displayName || null, now);
      newN++;
    }
    if (newN === 0) {
      noNew++;
      if (noNew >= 5) { console.log(`[${hub}/${listType}] stop no-new x5`); break; }
    } else noNew = 0;
    if (scrolls % 10 === 0) console.log(`[${hub}/${listType}] scroll ${scrolls+1} new=${newN} total=${seen.size}`);
    await page.evaluate(() => window.scrollBy(0, 3000));
    await sleep(1500 + Math.random() * 1500);
    scrolls++;
  }
  console.log(`[${hub}/${listType}] done unique=${seen.size}`);
  return seen.size;
}

(async () => {
  const db = initDb();
  const hubRows = db.prepare(`
    SELECT handle, display_name, followers FROM profiles
    WHERE followers IS NOT NULL AND followers >= 10000
    ORDER BY followers DESC
  `).all();
  function isBrand(r) {
    const h = (r.handle||'').toLowerCase();
    const n = (r.display_name||'').toLowerCase();
    return /_official|_jp|_shop|_store|japan$|official$|offic$|qvc/.test(h) || /official|公式|japan$/i.test(n);
  }
  const hubs = hubRows.filter(r => !isBrand(r)).slice(0, 14);
  console.log('[hubs]');
  for (const h of hubs) console.log(`  ${h.handle} (${h.display_name}) fw=${h.followers}`);

  const insert = db.prepare('INSERT OR IGNORE INTO handles (handle, source_tag, display_name, first_seen) VALUES (?, ?, ?, ?)');
  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  for (const h of hubs) {
    for (const listType of ['followers', 'following']) {
      await scrapeFollowList(page, insert, h.handle, listType, PER_HUB_CAP);
      await sleep(4000 + Math.random() * 4000);
    }
  }

  const grand = db.prepare('SELECT COUNT(DISTINCT handle) c FROM handles').get();
  console.log(`\n[GRAND TOTAL] ${grand.c}`);
  await page.close();
  await browser.close();
  db.close();
})().catch(e => { console.error(e); process.exit(1); });
