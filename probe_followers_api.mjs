// Probe script: verify Graph API can fetch followers_count and append to timeseries
// Usage:
//   node probe_followers_api.mjs --token "EAAG..." --ig-id "1784..."
//   (環境変数 FB_PAGE_TOKEN / IG_ID でも可。引数優先)

import { existsSync, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { callGraph } from './graph.js';
import { isoJST } from './time.js';
import { writeJsonPretty } from './save.js';

function parseArgs(argv = process.argv.slice(2)){
  const out = {};
  for (let i=0; i<argv.length; i++){
    const a = argv[i];
    if (a === '--token') out.token = argv[++i];
    else if (a === '--ig-id') out.igId = argv[++i];
  }
  return out;
}

async function main(){
  const args = parseArgs();
  const TOKEN = args.token || process.env.FB_PAGE_TOKEN;
  const IG_ID  = args.igId  || process.env.IG_ID;
  if(!TOKEN || !IG_ID){
    console.error('FB_PAGE_TOKEN or IG_ID is missing (use --token / --ig-id).');
    process.exit(1);
  }

  // ① Graph API 呼び出し（軽リトライは callGraph 内）
  const j = await callGraph(`/${IG_ID}`, { fields: 'followers_count,username' }, { token: TOKEN });
  const followers = Number(j?.followers_count);
  const username  = String(j?.username || '');
  if (!username || Number.isNaN(followers)) {
    throw new Error(`schema mismatch: ${JSON.stringify(j)}`);
  }
  console.log(`[OK] @${username} followers=${followers.toLocaleString()}`);

  // ② timeseries 追記（重複時刻は後勝ち・最大4000点）
  const p = path.join('data','timeseries', `${username}.json`);
  let arr = [];
  try{
    if (existsSync(p)) arr = JSON.parse(await readFile(p,'utf8')||'[]');
  }catch{}
  const now = isoJST();
  // dedupe by timestamp
  const map = new Map(arr.filter(x=>x?.t).map(x=>[x.t, Number(x.followers)]));
  map.set(now, followers);
  arr = [...map.entries()].map(([t,v])=>({ t, followers:v }))
        .sort((a,b)=> new Date(a.t) - new Date(b.t));
  if (arr.length > 4000) arr.splice(0, arr.length-4000);
  await writeJsonPretty(p, arr);
  console.log(`[WROTE] ${p} (${arr.length} pts)`);
}

main().catch(e=>{ console.error('[ERROR]', e?.message || e); process.exit(1); });
