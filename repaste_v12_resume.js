#!/usr/bin/env node
// Resume from tab index via env START=
const { chromium } = require('/Users/kyazuya/goods-scout/node_modules/playwright');
const fs = require('fs');
const CDP = process.env.CDP || 'http://localhost:9226';
const SHEET_ID = '1wzEUr5IkjefUrJqRdrbm7i-odpfxbvVA0aQQTldKTK0';
const CSV_PATH = '/Users/kyazuya/hobi-aka-list/hobi-aka-list_v12.csv';
const START = parseInt(process.env.START || '0', 10);
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
  const tabs = {
    '0X_🎯オリパ・トレカ系': data.filter(r => r[0]==='X' && r[2]==='person' && r[1]==='オリパ・トレカ系'),
    '0X_💝推し活グッズ系': data.filter(r => r[0]==='X' && r[2]==='person' && r[1]==='推し活グッズ系'),
    '0X_👗コーデ系': data.filter(r => r[0]==='X' && r[2]==='person' && r[1]==='コーデ系'),
    '0X_🎧現場・推し沼系': data.filter(r => r[0]==='X' && r[2]==='person' && r[1]==='現場・推し沼系'),
    '0X_その他': data.filter(r => r[0]==='X' && r[2]==='person' && r[1]==='その他'),
    '0X_ブランド情報': data.filter(r => r[0]==='X' && r[2]==='brand'),
    '0IG_📸個人垢200+': data.filter(r => r[0]==='IG' && r[2]==='person'),
    '0IG_ブランド情報': data.filter(r => r[0]==='IG' && r[2]==='brand'),
    'IG_🎯オリパ・トレカ系': data.filter(r => r[0]==='IG' && r[2]==='person' && r[1]==='オリパ・トレカ系'),
    'IG_💝推し活グッズ系': data.filter(r => r[0]==='IG' && r[2]==='person' && r[1]==='推し活グッズ系'),
    'IG_👗コーデ系': data.filter(r => r[0]==='IG' && r[2]==='person' && r[1]==='コーデ系'),
    'IG_🎧現場・推し沼系': data.filter(r => r[0]==='IG' && r[2]==='person' && r[1]==='現場・推し沼系'),
    'IG_その他': data.filter(r => r[0]==='IG' && r[2]==='person' && r[1]==='その他'),
  };
  const tabOrder = Object.keys(tabs);

  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`, { timeout: 30000 });
  await sleep(8000);
  console.log(`[1] opened, starting from tab ${START+1}`);

  try {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Browser.grantPermissions', {
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
      origin: 'https://docs.google.com'
    });
  } catch(e) {}

  for (let i = START; i < tabOrder.length; i++) {
    const name = tabOrder[i];
    const rows = tabs[name];
    const sheetRows = [header, ...rows];
    const tsv = toTSV(sheetRows);
    console.log(`\n[tab ${i+1}/${tabOrder.length}] ${name} rows=${rows.length}`);

    const sheetTabs = await page.$$('.docs-sheet-tab');
    if (i >= sheetTabs.length) continue;
    await sheetTabs[i].click();
    await sleep(1500);

    const dataBtn = page.locator('[id="docs-data-menu"]').first();
    await dataBtn.click().catch(() => {});
    await sleep(600);
    await page.getByText('フィルタを削除', { exact: false }).first().click({ timeout: 2000 }).catch(() => {});
    await sleep(600);
    await page.keyboard.press('Escape');
    await sleep(400);

    await page.keyboard.press('Meta+Home');
    await sleep(300);
    await page.keyboard.press('Meta+A');
    await sleep(500);
    await page.keyboard.press('Delete');
    await sleep(1500);
    await page.keyboard.press('Meta+Home');
    await sleep(400);

    await page.evaluate(async (t) => { await navigator.clipboard.writeText(t); }, tsv);
    await sleep(500);
    await page.keyboard.press('Meta+V');
    await sleep(8000);
    console.log(`[tab ${i+1}] pasted`);
  }
  console.log('\n[done]');
})().catch(e => { console.error('ERR:', e); process.exit(1); });
