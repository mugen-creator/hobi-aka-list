#!/usr/bin/env node
// Split v10 data into tabs in the existing Google Sheet
const { chromium } = require('/Users/kyazuya/goods-scout/node_modules/playwright');
const fs = require('fs');
const CDP = 'http://localhost:9222';
const SHEET_ID = '1wzEUr5IkjefUrJqRdrbm7i-odpfxbvVA0aQQTldKTK0';
const CSV_PATH = '/Users/kyazuya/hobi-aka-list/hobi-aka-list_v10.csv';
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
  // columns: [媒体, 大ジャンル, 種別, プロフURL, handle, 表示名, フォロワー, bio, タグ, 認証]
  const tabs = {
    'X_🎯オリパ・トレカ系': data.filter(r => r[0]==='X' && r[2]==='person' && r[1]==='オリパ・トレカ系'),
    'X_💝推し活グッズ系': data.filter(r => r[0]==='X' && r[2]==='person' && r[1]==='推し活グッズ系'),
    'X_👗コーデ系': data.filter(r => r[0]==='X' && r[2]==='person' && r[1]==='コーデ系'),
    'X_🎧現場・推し沼系': data.filter(r => r[0]==='X' && r[2]==='person' && r[1]==='現場・推し沼系'),
    'X_その他': data.filter(r => r[0]==='X' && r[2]==='person' && r[1]==='その他'),
    'X_ブランド情報': data.filter(r => r[0]==='X' && r[2]==='brand'),
    'IG_📸個人垢200+': data.filter(r => r[0]==='IG' && r[2]==='person'),
    'IG_ブランド情報': data.filter(r => r[0]==='IG' && r[2]==='brand'),
  };
  for (const [n, rs] of Object.entries(tabs)) console.log(`  ${n}: ${rs.length}`);

  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  await page.goto(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`, { timeout: 30000 });
  await sleep(8000);
  console.log('[1] sheet opened');

  // Grant clipboard
  try {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Browser.grantPermissions', {
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
      origin: 'https://docs.google.com'
    });
  } catch(e) {}

  const tabNames = Object.keys(tabs);
  for (let i = 0; i < tabNames.length; i++) {
    const name = tabNames[i];
    const rows = tabs[name];
    const sheetRows = [header, ...rows];
    const tsv = toTSV(sheetRows);
    console.log(`\n[tab ${i+1}/${tabNames.length}] ${name} (${rows.length} rows)`);

    if (i === 0) {
      // Rename the default sheet "シート1" to this tab name
      // Right-click on tab or double-click
      // Easiest: use the "シート" menu via keyboard: Alt+Shift+S then rename
      // Try double-click on sheet tab
      const sheetTab = await page.$('.docs-sheet-tab[data-id], .docs-sheet-tab');
      if (sheetTab) {
        await sheetTab.dblclick();
        await sleep(500);
        await page.keyboard.press('Meta+A');
        await page.keyboard.type(name);
        await page.keyboard.press('Enter');
        await sleep(1000);
      }
    } else {
      // Add new sheet via "+" button at bottom-left
      const addBtn = await page.$('#docs-sheets-add-container, [aria-label="シートを追加"], [aria-label="Add sheet"]');
      if (addBtn) {
        await addBtn.click();
        await sleep(1500);
      } else {
        console.log('[warn] + button not found, trying alternative');
      }
      // Now rename the newly created sheet - double-click the active tab
      await sleep(1000);
      const tabs2 = await page.$$('.docs-sheet-tab');
      if (tabs2.length > i) {
        // Last tab = newly created
        await tabs2[tabs2.length - 1].dblclick();
        await sleep(500);
        await page.keyboard.press('Meta+A');
        await page.keyboard.type(name);
        await page.keyboard.press('Enter');
        await sleep(1000);
      }
    }

    // Go to A1 and paste
    await page.keyboard.press('Escape');
    await sleep(300);
    await page.keyboard.press('Meta+Home');
    await sleep(500);
    await page.evaluate(async (t) => { await navigator.clipboard.writeText(t); }, tsv);
    await sleep(500);
    await page.keyboard.press('Meta+V');
    await sleep(8000);
    console.log(`[tab ${i+1}] pasted`);
  }

  console.log('\n[done]');
  await page.close();
  await browser.close();
})().catch(e => { console.error('ERR:', e); process.exit(1); });
