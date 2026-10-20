#!/usr/bin/env node
// Delete orphan tabs (シート14, シート9) and re-paste any missing data
const { chromium } = require('/Users/kyazuya/goods-scout/node_modules/playwright');
const fs = require('fs');
const CDP = 'http://localhost:9226';
const SHEET_ID = '1wzEUr5IkjefUrJqRdrbm7i-odpfxbvVA0aQQTldKTK0';
const CSV_PATH = '/Users/kyazuya/hobi-aka-list/hobi-aka-list_v12.csv';
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

async function deleteTabByText(page, matchText) {
  // Find tab by text, right-click, click 削除
  const tabs = await page.$$('.docs-sheet-tab');
  for (const t of tabs) {
    const txt = (await t.textContent() || '').trim();
    if (txt.includes(matchText)) {
      console.log(`[delete] ${txt}`);
      await t.click({ button: 'right' });
      await sleep(1000);
      // Click 削除 menu item
      await page.getByText('シートを削除', { exact: false }).first().click({ timeout: 3000 }).catch(() => {});
      await sleep(1000);
      // Confirm dialog if any
      await page.getByText('OK', { exact: true }).first().click({ timeout: 2000 }).catch(() => {});
      await sleep(1500);
      return true;
    }
  }
  return false;
}

async function addTabAndPaste(page, name, tsv) {
  console.log(`[add] ${name}`);
  const addBtn = await page.$('#docs-sheets-add-container, [aria-label="シートを追加"], [aria-label="Add sheet"]');
  if (addBtn) {
    await addBtn.click();
    await sleep(2000);
  }
  const tabs = await page.$$('.docs-sheet-tab');
  if (tabs.length) {
    await tabs[tabs.length - 1].dblclick();
    await sleep(500);
    await page.keyboard.press('Meta+A');
    await page.keyboard.type(name);
    await page.keyboard.press('Enter');
    await sleep(1500);
  }
  await page.keyboard.press('Escape');
  await sleep(300);
  await page.keyboard.press('Meta+Home');
  await sleep(500);
  await page.evaluate(async (t) => { await navigator.clipboard.writeText(t); }, tsv);
  await sleep(500);
  await page.keyboard.press('Meta+V');
  await sleep(8000);
}

(async () => {
  const all = parseCSV(fs.readFileSync(CSV_PATH, 'utf8'));
  const header = all[0];
  const data = all.slice(1);
  const igBrand = data.filter(r => r[0]==='IG' && r[2]==='brand');
  const igOther = data.filter(r => r[0]==='IG' && r[2]==='person' && r[1]==='その他');
  console.log(`IG_brand=${igBrand.length} IG_其他=${igOther.length}`);

  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  await page.goto(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`, { timeout: 30000 });
  await sleep(8000);

  try {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Browser.grantPermissions', {
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
      origin: 'https://docs.google.com'
    });
  } catch(e) {}

  // Delete orphans
  for (const t of ['シート14', 'シート9']) {
    await deleteTabByText(page, t);
  }

  // Add missing tabs with data
  await addTabAndPaste(page, 'IG_ブランド情報', toTSV([header, ...igBrand]));
  await addTabAndPaste(page, 'IG_その他', toTSV([header, ...igOther]));

  console.log('\n[done]');
})().catch(e => { console.error('ERR:', e); process.exit(1); });
