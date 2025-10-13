import path from 'node:path';
import { callGraph } from '../core/graph.js';
import { ensureDir, writeJsonPretty } from '../core/save.js';
import { isoJST, ymdJST } from '../core/time.js';

const TOKEN = process.env.FB_PAGE_TOKEN;
const IG_ID = process.env.IG_ID;
const STORE = process.env.STORE || '';

// 相模原は一時的にスキップ許可
if ((!TOKEN || !IG_ID) && STORE.toUpperCase().includes('SAGAMIHARA')) {
  console.warn(`[stories_insights_periodic] skip ${STORE} (missing token or id)`);
  process.exit(0); // 成功扱いで終了
}

// 他の店舗は従来通り厳格チェック
if (!TOKEN || !IG_ID) {
  console.error(`FB_PAGE_TOKEN or IG_ID is missing for ${STORE || 'unknown store'}`);
  process.exit(1);
}

async function getUsername(){
  const j = await callGraph(`/${IG_ID}`, { fields:'username' }, { token:TOKEN });
  const u = String(j?.username||'').trim();
  if(!u) throw new Error('username not found');
  return u;
}

async function fetchActiveStories(limit=50){
  const j = await callGraph(`/${IG_ID}/stories`, { fields:'id,permalink,timestamp', limit:String(limit) }, { token:TOKEN });
  return Array.isArray(j?.data) ? j.data : [];
}

async function fetchStoryInsights(id){
  const metrics = ['impressions','reach','exits','replies','taps_forward','taps_back'];
  try{
    const j = await callGraph(`/${id}/insights`, { metric: metrics.join(',') }, { token:TOKEN });
    const arr = Array.isArray(j?.data) ? j.data : [];
    const obj = {};
    for(const m of arr){
      const name = m?.name;
      const vals = Array.isArray(m?.values) ? m.values : [];
      const last = vals[vals.length-1];
      if(name && last && last.value !== undefined) obj[name] = last.value;
    }
    return obj;
  }catch{ return {}; }
}

async function main(){
  const STORE = process.env.STORE || await getUsername();
  const username = await getUsername();
  const stories = await fetchActiveStories(50);
  const items = [];
  for(const s of stories){
    const metrics = await fetchStoryInsights(s.id);
    items.push({ id:s.id, permalink:s.permalink, timestamp:s.timestamp, metrics });
  }
  // UTC日時をファイル名化（例: 2025-10-13T06.json）
  const now = new Date();
  const isoUTC = now.toISOString().slice(0,13); // YYYY-MM-DDTHH
  const fileName = `${isoUTC}.json`;

  const payload = {
    store: STORE,
    fetched_at_utc: new Date().toISOString(),
    fetched_at_jst: new Date(Date.now() + 9*3600*1000).toISOString().replace('Z','+09:00'),
    source: 'ig_graph_v23.0',
    granularity: 'hourly',
    version: 'v1',
    items
  };

  const outDir = path.join('data','account', STORE, 'stories');
  await ensureDir(outDir);
  const outPath = path.join(outDir, fileName);
  const changed = await writeJsonPretty(outPath, payload);
  console.log(`[stories] ${STORE}: ${changed ? 'updated' : 'nochange'} -> ${outPath}`);
}

main().catch(e=>{ console.error(e); process.exit(1); });
