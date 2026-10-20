#!/usr/bin/env node
// Fetch profile details for handles not yet in profiles table
// usage: node scrape_profiles.js [limit]
const { chromium } = require('/Users/kyazuya/goods-scout/node_modules/playwright');
const Database = require('/Users/kyazuya/goods-scout/node_modules/better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'hobi.db');
const CDP = 'http://localhost:9223';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function parseCount(s) {
  if (!s) return null;
  s = s.trim().replace(/,/g, '').replace(/\s/g, '');
  const m = s.match(/^([\d.]+)([KMk万])?/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  const unit = m[2];
  if (unit === 'K' || unit === 'k') n *= 1000;
  else if (unit === 'M') n *= 1000000;
  else if (unit === '万') n *= 10000;
  return Math.round(n);
}

async function run(limit) {
  const db = new Database(DB_PATH);
  const todo = db.prepare(`
    SELECT DISTINCT h.handle FROM handles h
    LEFT JOIN profiles p ON p.handle = h.handle
    WHERE p.handle IS NULL
    LIMIT ?
  `).all(limit);
  console.log(`[todo] ${todo.length} handles`);

  const upsert = db.prepare(`
    INSERT OR REPLACE INTO profiles
    (handle, display_name, bio, followers, following, posts_count, joined, external_url, profile_image, verified, checked_at, genre_guess)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  let ok = 0, fail = 0;
  for (const { handle } of todo) {
    try {
      await page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(1800 + Math.random() * 1200);

      // Wait for a key signal that the profile loaded (any follower link)
      await page.waitForSelector('a[href*="/followers"], a[href*="/following"]', { timeout: 15000 }).catch(() => null);

      const data = await page.evaluate(() => {
        const q = (sel) => document.querySelector(sel);
        const text = (el) => el ? el.innerText.trim() : null;

        // Display name: try title or h2 strongest tactic
        let displayName = null;
        const title = document.title || '';
        const titleMatch = title.match(/^(.+?)\s*\(@/);
        if (titleMatch) displayName = titleMatch[1].trim();
        if (!displayName) {
          const h2 = document.querySelector('h2[role="heading"], h1');
          if (h2) displayName = h2.innerText.trim().split('\n')[0];
        }

        const bio = text(q('[data-testid="UserDescription"]'));
        const joined = text(q('[data-testid="UserJoinDate"]'));

        let externalUrl = null;
        const urlEl = q('[data-testid="UserUrl"]');
        if (urlEl) externalUrl = urlEl.getAttribute('href') || urlEl.innerText.trim();

        // followers/following via contains selector (more tolerant)
        let followers = null, following = null;
        const anchors = document.querySelectorAll('a[href*="/followers"], a[href*="/verified_followers"], a[href*="/following"]');
        for (const a of anchors) {
          const href = a.getAttribute('href') || '';
          const combined = a.innerText || '';
          const numMatch = combined.match(/[\d.,]+[KMk万]?/);
          if (!numMatch) continue;
          const isFollowing = /\/following(\?|$)/.test(href);
          const isFollowers = /\/(verified_followers|followers)(\?|$)/.test(href);
          if (isFollowing && !following) following = numMatch[0];
          else if (isFollowers && !followers) followers = numMatch[0];
        }

        const postsCount = null;

        const imgEl = q('img[src*="profile_images"]');
        const profileImage = imgEl ? imgEl.getAttribute('src') : null;

        const verified = !!q('[data-testid="icon-verified"]');

        return { displayName, bio, followers, following, postsCount, joined, externalUrl, profileImage, verified };
      });

      // simple genre guess from bio keywords
      const bio = (data.bio || '').toLowerCase();
      const bioOrig = data.bio || '';
      let genre = [];
      const kw = {
        'ジャニ': ['sixtones','snowman','snow man','なにわ','travis','timelesz','jr','ストーンズ','スノ','なにわ男子','ジャニ','嵐','キンプリ'],
        'K-POP': ['seventeen','stray','straykids','txt','enhypen','ive','newjeans','le sserafim','nct','svt','bts','skz','ateez','treasure','riize','zb1','韓国','カムバ','ペン'],
        '量産型': ['量産','量産型','りぼん','りぼんがとれない'],
        '地雷系': ['地雷','病み','メンヘラ','めんへら'],
        '白系/韓国系': ['honeymew','dreamv','raspberry','acme','acmedelavie','maje','rienda','ハニミュ','白系','韓国系','量産型'],
        '2.5次元/舞台': ['2.5','刀ステ','テニミュ','ハイステ','舞台','俳優'],
        '古着/ストリート': ['古着','ストリート','vintage','ヴィンテージ'],
        'アニメ/アイドル': ['推し','生誕','おまいり','単推し','DD'],
      };
      for (const [g, words] of Object.entries(kw)) {
        if (words.some(w => bio.includes(w.toLowerCase()))) genre.push(g);
      }
      const genreGuess = genre.length ? genre.join(',') : null;

      upsert.run(
        handle,
        data.displayName,
        data.bio,
        parseCount(data.followers),
        parseCount(data.following),
        data.postsCount,
        data.joined,
        data.externalUrl,
        data.profileImage,
        data.verified ? 1 : 0,
        new Date().toISOString(),
        genreGuess
      );
      ok++;
      if (ok % 5 === 0) console.log(`[progress] ok=${ok} fail=${fail} last=${handle} fw=${data.followers} genre=${genreGuess||'-'}`);
    } catch (e) {
      fail++;
      console.log(`[fail] ${handle}: ${e.message.slice(0,80)}`);
      upsert.run(handle, null, null, null, null, null, null, null, null, 0, new Date().toISOString(), 'ERROR');
    }
  }

  await page.close();
  await browser.close();
  db.close();
  console.log(`[done] ok=${ok} fail=${fail}`);
}

const limit = parseInt(process.argv[2] || '500', 10);
run(limit).catch(e => { console.error(e); process.exit(1); });
