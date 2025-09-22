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

async function fetchRecentMediaIds(limit=50){
  const j = await callGraph(`/${IG_ID}/media`, { fields:'id,media_type,timestamp', limit:String(limit) }, { token:TOKEN });
  return (Array.isArray(j?.data) ? j.data : []).map(x=>x.id).filter(Boolean);
}

async function fetchInsightsForMedia(id){
  // media_type により有効な metric は異なるが、存在しないものは無視
  const metrics = ['impressions','reach','engagement','saved','video_views'];
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
  }catch(e){
    // 権限やタイプ不一致で失敗する場合があるので空で返す
    return {};
  }
}

async function main(){
  const username = await getUsername();
  const ids = await fetchRecentMediaIds(50);
  const out = [];
  for(const id of ids){
    const ins = await fetchInsightsForMedia(id);
    out.push({ id, metrics: ins });
  }
  const date = ymdJST();
  const payload = { date, generated_at: isoJST(), account: username, source:'ig_graph_v23.0', items: out };

  const outDir = path.join('data','media_insights', username);
  await ensureDir(outDir);
  const outPath = path.join(outDir, `${date}.json`);
  const changed = await writeJsonPretty(outPath, payload);
  console.log(`media_insights_daily: ${changed?'updated':'nochange'} ${outPath}`);
}

main().catch(e=>{ console.error(e); process.exit(1); });
