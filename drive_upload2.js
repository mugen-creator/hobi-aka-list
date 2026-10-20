#!/usr/bin/env node
const { chromium } = require('/Users/kyazuya/goods-scout/node_modules/playwright');
const CDP = 'http://localhost:9222';
const XLSX_PATH = '/Users/kyazuya/hobi-aka-list/hobi-aka-list_v9.xlsx';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  await page.goto('https://drive.google.com/drive/my-drive', { timeout: 30000 });
  await sleep(6000);
  console.log('[1] loaded:', page.url());

  const [filechooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 20000 }).catch(() => null),
    (async () => {
      await page.getByRole('button', { name: '新規' }).first().click();
      await sleep(1500);
      console.log('[2] clicked 新規');
      // JS-level click to bypass overlay interception
      await page.evaluate(() => {
        const items = document.querySelectorAll('[role="menuitem"]');
        for (const i of items) {
          if ((i.textContent || '').includes('ファイルのアップロード')) {
            i.click();
            return true;
          }
        }
        return false;
      });
      console.log('[3] JS-clicked upload item');
    })(),
  ]);

  if (!filechooser) {
    console.log('[err] no file chooser');
    const bodyText = (await page.$eval('body', b => b.innerText).catch(() => '')).slice(0, 300);
    console.log('[body]', bodyText);
    await page.close(); await browser.close(); process.exit(1);
  }

  console.log('[4] filechooser opened');
  await filechooser.setFiles(XLSX_PATH);
  console.log('[4] file set, wait 25s');
  await sleep(25000);

  // After upload shows in Drive, we need to open with Google Sheets to convert
  const uploaded = await page.$$eval('a, [role="link"]', (els) => {
    return els.map(e => ({
      text: (e.textContent || '').slice(0,50),
      href: e.getAttribute('href') || e.getAttribute('data-href') || ''
    })).filter(x => x.href && (x.href.includes('spreadsheets') || x.href.includes('/file/d/'))).slice(0, 5);
  }).catch(() => []);
  console.log('[5] links:', uploaded);
  console.log('[final]', page.url());
  await page.close();
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
