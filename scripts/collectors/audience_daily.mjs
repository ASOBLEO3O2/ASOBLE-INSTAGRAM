import path from 'node:path';
import { callGraph } from '../core/graph.js';
import { ensureDir, writeJsonPretty } from '../core/save.js';
import { isoJST, ymdJST } from '../core/time.js';

const TOKEN = process.env.FB_PAGE_TOKEN;
const IG_ID = process.env.IG_ID;
if (!TOKEN || !IG_ID) { console.error('FB_PAGE_TOKEN or IG_ID is missing.'); process.exit(1); }

async function getUsername(){
  const j = await callGraph(`/${IG_ID}`, { fields:'username' }, { token:TOKEN });
  const u = String(j?.username||'').trim();
  if(!u) throw new Error('username not found');
  return u;
}

async function main(){
  const username = await getUsername();
  // audience_* は period=lifetime、online_followers は period=day
  const lifetimeMetrics = ['audience_city','audience_country','audience_gender','audience_age'];
  const lifetime = await callGraph(`/${IG_ID}/insights`, { metric:lifetimeMetrics.join(','), period:'lifetime' }, { token:TOKEN });
  const dailyOnline = await callGraph(`/${IG_ID}/insights`, { metric:'online_followers', period:'day' }, { token:TOKEN });

  const date = ymdJST();
  const metrics = {};
  if(Array.isArray(lifetime?.data)){
    for(const m of lifetime.data){
      const name = m?.name;
      const vals = Array.isArray(m?.values) ? m.values : [];
      const last = vals[vals.length-1];
      if(name && last && last.value) metrics[name] = last.value;
    }
  }
  if(Array.isArray(dailyOnline?.data)){
    const m = dailyOnline.data.find(x=>x?.name==='online_followers');
    const vals = Array.isArray(m?.values) ? m.values : [];
    const last = vals[vals.length-1];
    if(last && last.value) metrics['online_followers'] = last.value; // { "0":n, "1":n, ... "23":n }
  }

  const payload = { date, generated_at: isoJST(), account: username, source:'ig_graph_v23.0', metrics };
  const outDir = path.join('data','audience', username);
  await ensureDir(outDir);
  const outPath = path.join(outDir, `${date}.json`);
  const changed = await writeJsonPretty(outPath, payload);
  console.log(`audience_daily: ${changed?'updated':'nochange'} ${outPath}`);
}

main().catch(e=>{ console.error(e); process.exit(1); });
