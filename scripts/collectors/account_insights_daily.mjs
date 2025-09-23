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

async function getUsername(igId, token) {
  if (process.env.IG_USERNAME) return process.env.IG_USERNAME;
  const data = await callGraph(`/${igId}`, { fields: 'username' }, { token });
  if (!data.username) throw new Error('username not found');
  return data.username;
}

async function getAccountInsights(){

 const metrics = ['reach','follower_count','profile_views','website_clicks'];
 const j = await callGraph(`/${IG_ID}/insights`, { metric: metrics.join(','), period:'day' }, { token:TOKEN });  return Array.isArray(j?.data) ? j.data : [];
  return Array.isArray(j?.data) ? j.data : [];
}

function normalizeDaily(data){
  // Graph APIの日次は配列（metricごとに values[{value, end_time}]）
  // 当日分の latest をまとめる（欠測は含めない）
  const out = {};
  for(const m of data){
    const name = m?.name;
    const vals = Array.isArray(m?.values) ? m.values : [];
    const last = vals[vals.length-1];
    const v = last?.value;    
    if (name && (v!==undefined)) out[name] = v;
  }
  return out;
}

async function main(){
  const username = await getUsername(IG_ID, TOKEN);
  const daily = normalizeDaily(await getAccountInsights());
  const date = ymdJST();
  const payload = { date, generated_at: isoJST(), account: username, source:'ig_graph_v23.0', metrics: daily };

  const outDir = path.join('data','account', username);
  await ensureDir(outDir);
  const outPath = path.join(outDir, `${date}.json`);
  const changed = await writeJsonPretty(outPath, payload);
  console.log(`account_insights_daily: ${changed?'updated':'nochange'} ${outPath}`);
}

main().catch(e=>{ console.error(e); process.exit(1); });
