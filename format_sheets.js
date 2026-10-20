#!/usr/bin/env node
const { chromium } = require('/Users/kyazuya/goods-scout/node_modules/playwright');
const CDP = 'http://localhost:9226';
const SHEET_ID = '1wzEUr5IkjefUrJqRdrbm7i-odpfxbvVA0aQQTldKTK0';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  await page.bringToFront().catch(() => {});
  await page.goto(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`, { timeout: 30000 });
  await sleep(8000);
  console.log('[1] opened');

  const tabCount = await page.$$('.docs-sheet-tab').then(a => a.length);
  console.log(`[2] ${tabCount} tabs`);

  for (let i = 0; i < tabCount; i++) {
    const tabs = await page.$$('.docs-sheet-tab');
    if (i >= tabs.length) break;
    await tabs[i].click();
    await sleep(1500);
    const tabName = await tabs[i].textContent().catch(() => '');
    console.log(`\n[tab ${i+1}/${tabCount}] ${(tabName||'').trim().slice(0, 30)}`);

    await page.keyboard.press('Escape');
    await sleep(300);
    await page.keyboard.press('Meta+Home');
    await sleep(500);

    // FREEZE 1 ROW
    const viewBtn = page.locator('[id="docs-view-menu"]').first();
    await viewBtn.click().catch(async () => {
      await page.getByText('表示', { exact: true }).first().click();
    });
    await sleep(800);
    await page.getByText('固定', { exact: false }).first().hover({ timeout: 3000 }).catch(() => {});
    await sleep(600);
    await page.getByText('1 行', { exact: false }).first().click({ timeout: 3000 }).catch(async () => {
      await page.getByText('1行', { exact: false }).first().click({ timeout: 3000 }).catch(() => {});
    });
    await sleep(1200);
    console.log(`[tab ${i+1}] freeze done`);
    await page.keyboard.press('Escape');
    await sleep(400);

    // ENABLE FILTER
    const dataBtn = page.locator('[id="docs-data-menu"]').first();
    await dataBtn.click().catch(async () => {
      await page.getByText('データ', { exact: true }).first().click();
    });
    await sleep(800);
    await page.getByText('フィルタを作成', { exact: false }).first().click({ timeout: 3000 }).catch(() => {
      console.log(`[tab ${i+1}] filter skipped`);
    });
    await sleep(1200);
    await page.keyboard.press('Escape');
    await sleep(400);
    console.log(`[tab ${i+1}] filter done`);
  }

  console.log('\n[done]');
  // No close() to avoid Chrome 155 lock
})().catch(e => { console.error('ERR:', e); process.exit(1); });
