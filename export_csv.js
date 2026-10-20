#!/usr/bin/env node
// Export handle + profile data to CSV for review
const Database = require('/Users/kyazuya/goods-scout/node_modules/better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'hobi.db');
const OUT = path.join(__dirname, 'hobi-aka-list.csv');

function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

const db = new Database(DB_PATH);
const rows = db.prepare(`
  SELECT
    h.handle,
    COALESCE(p.display_name, h.display_name) AS display_name,
    p.followers,
    p.following,
    p.bio,
    p.external_url,
    p.joined,
    p.verified,
    p.genre_guess,
    GROUP_CONCAT(DISTINCT h.source_tag) AS tags,
    'https://x.com/' || h.handle AS profile_url
  FROM handles h
  LEFT JOIN profiles p ON p.handle = h.handle
  GROUP BY h.handle
  ORDER BY p.followers DESC NULLS LAST, h.handle
`).all();

function classifyAccountType(r) {
  const handle = (r.handle || '').toLowerCase();
  const name = (r.display_name || '').toLowerCase();
  const bio = (r.bio || '').toLowerCase();
  const url = (r.external_url || '').toLowerCase();
  const brandSignals = [
    /_official($|_)/, /official$/, /offic$/, /_jp$/, /jp_/, /_brand/, /brand_/, /_shop/, /shop_/, /_store/, /公式/,
  ];
  for (const re of brandSignals) if (re.test(handle)) return 'brand';
  if (/official|公式|brand|shop|store/.test(name)) return 'brand';
  if (/online shop|オンラインショップ|送料|入荷|販売|公式|rakuten|amazon|base|stores|shopify/.test(bio)) return 'brand';
  if (/rakuten|amazon|base\.ec|stores\.jp|shopify/.test(url)) return 'brand';
  if (r.verified && (r.followers || 0) > 30000 && /_jp|_official|jp$/i.test(r.handle)) return 'brand';
  return 'person';
}

function inferGenre(r) {
  const bio = (r.bio || '') + ' ' + (r.display_name || '') + ' ' + (r.tags || '');
  const low = bio.toLowerCase();
  const hits = [];
  const kw = {
    '白系/量産型': ['量産','量産型','ホビ垢','honeymew','dreamv','raspberry','maje','rienda','白系','おしゃれ','ガーリー','りぼん'],
    '地雷系/病み': ['地雷','病み','メンヘラ','めんへら','黒','ピンク病','めん','ゆめかわ','やみかわ'],
    '韓国系': ['韓国','韓服','カムバ','ペン','k-pop','kpop','seventeen','skz','stray','enhypen','txt','newjeans','ive','lesserafim','나나','네이버','チング'],
    'ジャニ現場': ['sixtones','snowman','なにわ','timelesz','travis','jr','ジュニア','ジャニ','ストーンズ','スノ','キンプリ','嵐','担','pit','trfzero'],
    '2.5次元/舞台': ['2.5','刀ステ','テニミュ','ハイステ','舞台','俳優'],
    'アイドル沼全般': ['推し','生誕','単推し','DD','現場','遠征','ペンラ'],
    'おしゃれ系': ['古着','vintage','ヴィンテージ','プチプラ','gu','ユニクロ','zara'],
  };
  for (const [g, words] of Object.entries(kw)) {
    if (words.some(w => low.includes(w.toLowerCase()))) hits.push(g);
  }
  return hits.length ? hits.join(',') : (r.genre_guess || null);
}

const header = ['account_type','handle','display_name','followers','following','genre_inferred','bio','external_url','joined','verified','tags','profile_url'];
const lines = [header.join(',')];
const stats = { person: 0, brand: 0, person_1k: 0, person_10k: 0 };
for (const r of rows) {
  const account_type = classifyAccountType(r);
  const genre_inferred = inferGenre(r);
  stats[account_type] = (stats[account_type] || 0) + 1;
  if (account_type === 'person') {
    const fw = r.followers || 0;
    if (fw >= 1000) stats.person_1k++;
    if (fw >= 10000) stats.person_10k++;
  }
  const row = { ...r, account_type, genre_inferred };
  lines.push(header.map(k => csvCell(row[k])).join(','));
}
fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
console.log(`[csv] ${OUT} rows=${rows.length}`);
console.log(`[classify] person=${stats.person} brand=${stats.brand} person_1k+=${stats.person_1k} person_10k+=${stats.person_10k}`);

// Also write persons-only CSV for PR targeting
const personRows = rows.filter(r => classifyAccountType(r) === 'person');
const personLines = [header.join(',')];
for (const r of personRows) {
  const row = { ...r, account_type: 'person', genre_inferred: inferGenre(r) };
  personLines.push(header.map(k => csvCell(row[k])).join(','));
}
const PERSON_OUT = path.join(__dirname, 'hobi-aka-list_persons.csv');
fs.writeFileSync(PERSON_OUT, personLines.join('\n'), 'utf8');
console.log(`[csv persons] ${PERSON_OUT} rows=${personRows.length}`);

const tagCounts = db.prepare('SELECT source_tag, COUNT(DISTINCT handle) c FROM handles GROUP BY source_tag ORDER BY c DESC').all();
console.log('\n[by tag]');
for (const t of tagCounts) console.log(`  ${t.source_tag}: ${t.c}`);

const grand = db.prepare('SELECT COUNT(DISTINCT handle) c FROM handles').get();
const profiled = db.prepare('SELECT COUNT(*) c FROM profiles WHERE followers IS NOT NULL').get();
console.log(`\n[summary] unique_handles=${grand.c} profiled=${profiled.c}`);
