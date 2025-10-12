#!/usr/bin/env node
// scripts/place-insights.mjs
// 収集済みの日次JSON（単発 or 複数）を、data/insights/{handle}/daily/YYYY/MM/DD.json に配置。
// 既存ファイルと内容が同一なら上書きしない（差分コミット抑制）。

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

function sha1(s){ return createHash('sha1').update(s).digest('hex'); }
async function ensureDir(p){ if (!existsSync(p)) await mkdir(p, { recursive: true }); }

async function placeOne(inputPath){
  const raw = await readFile(inputPath, 'utf8');
  const json = JSON.parse(raw);

  const date = json?.date;              // "YYYY-MM-DD"（JST）
  const handle = json?.account;         // "asoble_***"
  if (!date || !handle) throw new Error(`Invalid input: ${inputPath}`);

  const [y,m,d] = date.split('-');
  const outPath = join('data','insights',handle,'daily',y,m,`${d}.json`);

  // 既存同値チェック（差分最小化）
  const next = JSON.stringify(json, null, 2) + '\n';
  const nextHash = sha1(next);
  let same = false;
  try{
    const cur = await readFile(outPath, 'utf8');
    same = (sha1(cur) === nextHash);
  }catch{/* no current */}

  if (same) {
    console.log(`[skip] identical: ${outPath}`);
    return { outPath, skipped: true };
  }
  await ensureDir(dirname(outPath));
  await writeFile(outPath, next, 'utf8');
  console.log(`[write] ${outPath}`);
  return { outPath, skipped: false };
}

// 使い方： node scripts/place-insights.mjs <json1> [json2 ...]
// 例： node scripts/place-insights.mjs dist/2025-10-12.json
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('usage: node scripts/place-insights.mjs <json ...>');
  process.exit(2);
}
const results = [];
for (const p of args) {
  try { results.push(await placeOne(p)); }
  catch (e) { console.error(`[error] ${p}: ${e.message}`); process.exitCode = 1; }
}
console.log(JSON.stringify({ results }, null, 2));
