#!/usr/bin/env node
// Paste data directly into existing Google Sheet via Chrome CDP
const { chromium } = require('/Users/kyazuya/goods-scout/node_modules/playwright');
const fs = require('fs');
const CDP = 'http://localhost:9222';
const SHEET_ID = '1wzEUr5IkjefUrJqRdrbm7i-odpfxbvVA0aQQTldKTK0';
const CSV_PATH = '/Users/kyazuya/hobi-aka-list/hobi-aka-list_v9.csv';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const csvText = fs.readFileSync(CSV_PATH, 'utf8');
  // Parse CSV properly (handle quoted fields)
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
  console.log(`[csv] ${rows.length} rows parsed`);

  // Convert to TSV (tab-separated, newline-row-separated)
  // Replace any existing tabs/newlines in cells with spaces to be safe
  const tsv = rows.map(r => r.map(c => (c||'').replace(/\t/g,' ').replace(/\n/g,' ')).join('\t')).join('\n');
  console.log(`[tsv] ${tsv.length} chars`);

  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  await page.goto(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`, { timeout: 30000 });
  await sleep(8000);
  console.log('[1] sheet opened');

  // Focus the sheet area then jump to A1
  // Click on the sheet content area to focus
  await page.keyboard.press('Escape');
  await sleep(500);
  // Ctrl+Home to go to A1
  await page.keyboard.press('Meta+Home');
  await sleep(1000);
  console.log('[2] cursor at A1');

  // Set clipboard content via browser clipboard API
  // Grant clipboard permissions
  try {
    const cdpSession = await ctx.newCDPSession(page);
    await cdpSession.send('Browser.grantPermissions', {
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
      origin: 'https://docs.google.com'
    });
  } catch (e) { console.log('[cdp perms] err:', e.message); }

  // Write TSV to clipboard
  await page.evaluate(async (text) => {
    await navigator.clipboard.writeText(text);
    return text.length;
  }, tsv).catch(e => console.log('[clipboard] err:', e.message));
  console.log('[3] clipboard set');
  await sleep(1000);

  // Paste
  await page.keyboard.press('Meta+V');
  console.log('[4] paste triggered, wait 15s');
  await sleep(15000);

  // Save (Google Sheets auto-saves, but Meta+S triggers save explicitly)
  console.log('[5] done');
  await page.close();
  await browser.close();
})().catch(e => { console.error('ERR:', e); process.exit(1); });
