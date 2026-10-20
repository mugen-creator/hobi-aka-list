#!/usr/bin/env node
const { chromium } = require('/Users/kyazuya/goods-scout/node_modules/playwright');
const CDP = 'http://localhost:9222';
const XLSX_PATH = '/Users/kyazuya/hobi-aka-list/hobi-aka-list_v8.xlsx';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  console.log('[1] goto drive');
  await page.goto('https://drive.google.com/drive/my-drive', { timeout: 30000 });
  await sleep(5000);
  const url = page.url();
  console.log('[1] at:', url);
  if (!url.includes('drive.google.com')) { console.log('[err] not logged in'); await browser.close(); process.exit(1); }

  console.log('[2] find file input');
  const inputs = await page.$$('input[type="file"]');
  console.log('[2] file inputs:', inputs.length);
  if (inputs.length === 0) { console.log('[err] no file input'); await browser.close(); process.exit(1); }
  await inputs[0].setInputFiles(XLSX_PATH);
  console.log('[2] file set, waiting 20s...');
  await sleep(20000);

  const linkEl = await page.$('a[href*="/spreadsheets/d/"], a[href*="/file/d/"]');
  if (linkEl) {
    console.log('[3] doc link:', await linkEl.getAttribute('href'));
  }
  const bodyText = (await page.$eval('body', b => b.innerText).catch(() => '')).slice(0, 300);
  console.log('[body]', bodyText);
  console.log('[url]', page.url());
  await page.close();
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
