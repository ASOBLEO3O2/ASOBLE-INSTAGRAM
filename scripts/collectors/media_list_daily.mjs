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

async function fetchAllMedia(limit=100){
  const fields = [
    'id','media_type','timestamp','permalink','caption',
    'like_count','comments_count','thumbnail_url','media_url'
  ].join(',');
  let url = `/${IG_ID}/media`;
  let params = { fields, limit: String(Math.min(100, limit)) };
  const out = [];
  while(true){
    const j = await callGraph(url, params, { token:TOKEN });
    const data = Array.isArray(j?.data) ? j.data : [];
    out.push(...data);
    const next = j?.paging?.next;
    const curs = j?.paging?.cursors?.after;
    if(next && curs && out.length < limit){
      url = `/${IG_ID}/media`;
      params = { fields, limit: String(Math.min(100, limit - out.length)), after: curs };
    }else break;
  }
  return out;
}

async function main(){
  const username = await getUsername();
  const list = await fetchAllMedia(100); // 直近最大100件
  const date = ymdJST();
  const payload = { date, generated_at: isoJST(), account: username, source:'ig_graph_v23.0', items: list };

  const outDir = path.join('data','media', username);
  await ensureDir(outDir);
  const outPath = path.join(outDir, `${date}.json`);
  const changed = await writeJsonPretty(outPath, payload);
  console.log(`media_list_daily: ${changed?'updated':'nochange'} ${outPath}`);
}

main().catch(e=>{ console.error(e); process.exit(1); });
