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

async function getFollowers(igId, token) {
  const data = await callGraph(`/${igId}`, { fields: 'followers_count' }, { token });
  const n = Number(data?.followers_count);
  return Number.isFinite(n) ? n : null;
}

async function getUsername(igId, token) {
  if (process.env.IG_USERNAME) return process.env.IG_USERNAME;
  const data = await callGraph(`/${igId}`, { fields: 'username' }, { token });
  if (!data.username) throw new Error('username not found');
  return data.username;
}

async function getAccountInsights(){
  // Graph #100 回避：total_value 必須メトリクスを分割して取得
  const normalMetrics = ['reach'];
  const totalMetrics  = ['profile_views','accounts_engaged'];
  // 許可メトリクス（想定外の混入を事前に遮断）
  const ALLOW = new Set(['reach','profile_views','accounts_engaged']);
  const out = [];

  // 通常系（period=day のみ）
    if (normalMetrics.length){
    const metrics1 = normalMetrics.filter(m => ALLOW.has(m));
    if (metrics1.length) {
      console.log('IG insights(normal):', metrics1.join(','));
      const j1 = await callGraph(`/${IG_ID}/insights`,
        { metric: metrics1.join(','), period:'day' },
        { token: TOKEN }
      );
      if (Array.isArray(j1?.data)) out.push(...j1.data);
    }
  }

  // total_value 系（metric_type=total_value を付与）
  if (totalMetrics.length){
    const metrics2 = totalMetrics.filter(m => ALLOW.has(m));
    if (metrics2.length) {
      console.log('IG insights(total_value):', metrics2.join(','));
      const j2 = await callGraph(`/${IG_ID}/insights`,
        { metric: metrics2.join(','), period:'day', metric_type:'total_value' },
        { token: TOKEN }
      );
      if (Array.isArray(j2?.data)) out.push(...j2.data);
    }
  }
  return out;
}

function normalizeDaily(data){
  // Graph API の日次は 2 形態:
  //  - values[{ value, end_time }]（例: reach）
  //  - total_value.{ value }       （例: profile_views, accounts_engaged）
  // どちらかに値があれば採用（欠測は含めない）
  const out = {};
  for(const m of data){
    const name = m?.name;
    const vals = Array.isArray(m?.values) ? m.values : [];
    const last = vals[vals.length-1];
    const v = (last?.value !== undefined)
      ? last.value
      : (m?.total_value?.value !== undefined ? m.total_value.value : undefined);
    if (name && (v!==undefined)) out[name] = v;
  }
  return out;
}

async function main(){
  const username = await getUsername(IG_ID, TOKEN);
  const daily = normalizeDaily(await getAccountInsights());
  const followers = await getFollowers(IG_ID, TOKEN);
  if (Number.isFinite(followers)) daily.followers_count = followers;
  const date = ymdJST();
  const payload = { date, generated_at: isoJST(), account: username, source:'ig_graph_v23.0', metrics: daily };

  const outDir = path.join('data','account', username);
  await ensureDir(outDir);
  const outPath = path.join(outDir, `${date}.json`);
  const changed = await writeJsonPretty(outPath, payload);
  console.log(`account_insights_daily: ${changed?'updated':'nochange'} ${outPath}`);
}

main().catch(e=>{ console.error(e); process.exit(1); });
