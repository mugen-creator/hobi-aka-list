#!/usr/bin/env node
const { chromium } = require('/Users/kyazuya/goods-scout/node_modules/playwright');
const Database = require('/Users/kyazuya/goods-scout/node_modules/better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'hobi.db');
const CDP = 'http://localhost:9223';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const db = new Database(DB_PATH);
  const todo = db.prepare(`
    SELECT handle FROM profiles
    WHERE followers IS NOT NULL AND followers >= 200
      AND (bio IS NULL OR length(bio) = 0)
    ORDER BY followers DESC
  `).all();
  console.log(`[todo] ${todo.length}`);

  const upd = db.prepare(`UPDATE profiles SET bio = ?, checked_at = ? WHERE handle = ?`);
  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  let ok = 0, fail = 0;
  for (const { handle } of todo) {
    try {
      await page.goto(`https://x.com/${handle}`, { timeout: 20000 });
      await page.waitForSelector('[data-testid="UserDescription"]', { timeout: 8000 }).catch(() => null);
      await sleep(500);
      const bio = await page.locator('[data-testid="UserDescription"]').first().innerText().catch(() => null);
      if (bio && bio.length > 0) {
        upd.run(bio, new Date().toISOString(), handle);
        ok++;
      } else {
        fail++;
      }
      if ((ok + fail) % 25 === 0) console.log(`[progress] ok=${ok} fail=${fail} last=${handle}`);
    } catch (e) {
      fail++;
    }
    await sleep(1500 + Math.random() * 1000);
  }
  console.log(`[done] ok=${ok} fail=${fail}`);
  await page.close();
  await browser.close();
  db.close();
})().catch(e => { console.error(e); process.exit(1); });
