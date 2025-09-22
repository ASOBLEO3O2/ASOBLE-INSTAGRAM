import path from 'node:path';
import { callGraph } from '../core/graph.js';
import { ensureDir, writeJsonPretty } from '../core/save.js';
import { isoJST, ymdJST } from '../core/time.js';

const TOKEN = process.env.FB_PAGE_TOKEN;
const IG_ID = process.env.IG_ID;
if (!TOKEN || !IG_ID) {
  console.error('FB_PAGE_TOKEN or IG_ID is missing.');
  process.exit(1);
}

async function main(){
  // アカウント全体インサイト（日次）
  const metrics = ['impressions','reach','profile_views','website_clicks'];
  const data = await callGraph(`/${IG_ID}/insights`, { metric: metrics.join(','), period:'day' }, { token:TOKEN });

  const date = ymdJST();
  const outDir = path.join('data','account','__STORE__'); // 後で username で置換
  await ensureDir(outDir);
  const outPath = path.join(outDir, `${date}.json`);
  const payload = { date, generated_at: isoJST(), data };

  const changed = await writeJsonPretty(outPath, payload);
  console.log(`account_insights_daily: ${changed?'updated':'nochange'} ${outPath}`);
}

main().catch(e=>{ console.error(e); process.exit(1); });
