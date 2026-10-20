#!/usr/bin/env node
// Clear existing sheet then paste fresh data
const { chromium } = require('/Users/kyazuya/goods-scout/node_modules/playwright');
const fs = require('fs');
const CDP = 'http://localhost:9222';
const SHEET_ID = '1wzEUr5IkjefUrJqRdrbm7i-odpfxbvVA0aQQTldKTK0';
const CSV_PATH = '/Users/kyazuya/hobi-aka-list/hobi-aka-list_v10.csv';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const csvText = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = [];
  const lines = csvText.split('\n');
  for (const line of lines) {
    if (!line) continue;
    const cells = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i+1] === '"') { cur += '"'; i++; }
        else if (c === '"') { inQ = false; }
        else { cur += c; }
      } else {
        if (c === ',') { cells.push(cur); cur = ''; }
        else if (c === '"' && !cur) { inQ = true; }
        else { cur += c; }
      }
    }
    cells.push(cur);
    rows.push(cells);
  }
  const tsv = rows.map(r => r.map(c => (c||'').replace(/\t/g,' ').replace(/\n/g,' ')).join('\t')).join('\n');
  console.log(`[csv] ${rows.length} rows → tsv ${tsv.length} chars`);

  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  await page.goto(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`, { timeout: 30000 });
  await sleep(8000);
  console.log('[1] opened');

  // Clipboard permission
  try {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Browser.grantPermissions', {
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
      origin: 'https://docs.google.com'
    });
  } catch(e) {}

  // Clear existing content: Meta+A (select all) then Delete
  await page.keyboard.press('Escape');
  await sleep(300);
  await page.keyboard.press('Meta+Home');
  await sleep(500);
  await page.keyboard.press('Meta+A');
  await sleep(1000);
  await page.keyboard.press('Delete');
  await sleep(2000);
  console.log('[2] cleared');
  await page.keyboard.press('Meta+Home');
  await sleep(500);

  // Set clipboard
  await page.evaluate(async (text) => {
    await navigator.clipboard.writeText(text);
  }, tsv);
  console.log('[3] clipboard set');
  await sleep(1000);

  await page.keyboard.press('Meta+V');
  console.log('[4] paste, wait 15s');
  await sleep(15000);
  console.log('[5] done');
  await page.close();
  await browser.close();
})().catch(e => { console.error('ERR:', e); process.exit(1); });
