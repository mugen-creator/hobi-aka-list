#!/usr/bin/env node
// Add IG genre tabs to existing sheet (keeping all current X tabs)
const { chromium } = require('/Users/kyazuya/goods-scout/node_modules/playwright');
const fs = require('fs');
const CDP = 'http://localhost:9224';
const SHEET_ID = '1wzEUr5IkjefUrJqRdrbm7i-odpfxbvVA0aQQTldKTK0';
const CSV_PATH = '/Users/kyazuya/hobi-aka-list/hobi-aka-list_v11.csv';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function parseCSV(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const cells = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i+1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else {
        if (c === ',') { cells.push(cur); cur = ''; }
        else if (c === '"' && !cur) inQ = true;
        else cur += c;
      }
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}
function toTSV(rows) {
  return rows.map(r => r.map(c => (c||'').replace(/\t/g,' ').replace(/\n/g,' ')).join('\t')).join('\n');
}

(async () => {
  const all = parseCSV(fs.readFileSync(CSV_PATH, 'utf8'));
  const header = all[0];
  const data = all.slice(1);
  // IG persons split by big genre
  const igTabs = {
    'IG_🎯オリパ・トレカ系': data.filter(r => r[0]==='IG' && r[2]==='person' && r[1]==='オリパ・トレカ系'),
    'IG_💝推し活グッズ系': data.filter(r => r[0]==='IG' && r[2]==='person' && r[1]==='推し活グッズ系'),
    'IG_👗コーデ系': data.filter(r => r[0]==='IG' && r[2]==='person' && r[1]==='コーデ系'),
    'IG_🎧現場・推し沼系': data.filter(r => r[0]==='IG' && r[2]==='person' && r[1]==='現場・推し沼系'),
    'IG_その他': data.filter(r => r[0]==='IG' && r[2]==='person' && r[1]==='その他'),
  };
  for (const [n, rs] of Object.entries(igTabs)) console.log(`  ${n}: ${rs.length}`);

  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  await page.goto(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`, { timeout: 30000 });
  await sleep(8000);
  console.log('[1] opened');

  try {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Browser.grantPermissions', {
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
      origin: 'https://docs.google.com'
    });
  } catch(e) {}

  const tabNames = Object.keys(igTabs);
  for (let i = 0; i < tabNames.length; i++) {
    const name = tabNames[i];
    const rows = igTabs[name];
    const sheetRows = [header, ...rows];
    const tsv = toTSV(sheetRows);
    console.log(`\n[${i+1}/${tabNames.length}] ${name} (${rows.length})`);

    // Add new sheet via "+" button
    const addBtn = await page.$('#docs-sheets-add-container, [aria-label="シートを追加"], [aria-label="Add sheet"]');
    if (addBtn) {
      await addBtn.click();
      await sleep(2000);
    }
    // Rename the newly created last tab
    const tabs2 = await page.$$('.docs-sheet-tab');
    if (tabs2.length) {
      await tabs2[tabs2.length - 1].dblclick();
      await sleep(500);
      await page.keyboard.press('Meta+A');
      await page.keyboard.type(name);
      await page.keyboard.press('Enter');
      await sleep(1200);
    }
    // Go to A1 and paste
    await page.keyboard.press('Escape');
    await sleep(300);
    await page.keyboard.press('Meta+Home');
    await sleep(500);
    await page.evaluate(async (t) => { await navigator.clipboard.writeText(t); }, tsv);
    await sleep(500);
    await page.keyboard.press('Meta+V');
    await sleep(6000);
    console.log(`[${i+1}] pasted`);
  }
  console.log('\n[done]');
  await page.close();
  await browser.close();
})().catch(e => { console.error('ERR:', e); process.exit(1); });
