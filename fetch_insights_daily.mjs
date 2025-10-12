#!/usr/bin/env node
// fetch_insights_daily.mjs
// Instagram Graph API から日次インサイトを取得し、
// data/insights/{handle}/daily/YYYY/MM/DD.json に保存します。
// 仕様: metrics は config/insights.metrics.json に定義（period=day）。
// 日付: JSTの「前日」固定。Node.js v18+（fetch 利用）。

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const API_VER = 'v23.0';

function pad(n){ return String(n).padStart(2,'0'); }
function toJstDate(d=new Date()){
  // 入力Date(UTC内部)をJSTオフセットで見做して「前日」を返す
  const utc = d.getTime();
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const jstNow = new Date(utc + JST_OFFSET_MS);
  jstNow.setDate(jstNow.getDate() - 1); // 前日固定
  const y = jstNow.getUTCFullYear();
  const m = jstNow.getUTCMonth()+1;
  const day = jstNow.getUTCDate();
  return `${y}-${pad(m)}-${pad(day)}`;
}
function nowIsoJst(){
  const d = new Date();
  const tz = '+09:00';
  const iso = new Date(d.getTime() + 9*60*60*1000).toISOString().replace('Z','');
  return `${iso}${tz}`;
}

async function readJson(path){
  const txt = await readFile(path, 'utf8');
  return JSON.parse(txt);
}

async function ensureDir(p){
  if (!existsSync(p)) await mkdir(p, { recursive: true });
}

async function fetchJson(url, opts={}, retries=2){
  for (let i=0; i<=retries; i++){
    const res = await fetch(url, { ...opts });
    const text = await res.text();
    let json;
    try{ json = JSON.parse(text); }catch(e){
      if (i===retries) throw new Error(`Non-JSON response (${res.status}): ${text.slice(0,200)}`);
      await new Promise(r=>setTimeout(r, 1000*(i+1)));
      continue;
    }
    if (res.ok) return json;
    // レート/サーバ系はリトライ
    if ([429,500,502,503,504].includes(res.status) && i<retries){
      await new Promise(r=>setTimeout(r, 1000*(i+1)));
      continue;
    }
    const msg = json?.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  throw new Error('unreachable');
}

function envOr(obj, key, fallbackEnv){
  if (obj && obj[key]) return obj[key];
  if (fallbackEnv && process.env[fallbackEnv]) return process.env[fallbackEnv];
  return null;
}

async function main(){
  const metricsConf = await readJson('config/insights.metrics.json'); // { period:"day", metrics:[...] }
  const period = metricsConf?.period || 'day';
  const metrics = Array.isArray(metricsConf?.metrics) ? metricsConf.metrics : [];
  if (!metrics.length) throw new Error('metrics empty in config/insights.metrics.json');

  const accounts = (await readJson('accounts.json'))?.accounts || [];
  if (!accounts.length) throw new Error('accounts.json: accounts empty');

  const date = toJstDate();
  const since = date, until = date;
  const generatedAt = nowIsoJst();

  for (const a of accounts){
    const handle = a.handle || a.account || a.username;
    const igId   = a.igId || a.igID || a.instagram_id;
    // 優先順位: a.token → 環境変数 PAGE_TOKEN_{HANDLE_UPPER}
    const envKey = `PAGE_TOKEN_${String(handle||'').toUpperCase().replace(/[^A-Z0-9]+/g,'_')}`;
    const token  = envOr(a, 'token', envKey);
    if (!handle || !igId || !token){
      console.error(`[skip] missing field(s): handle=${handle}, igId=${igId}, token=${!!token}`);
      continue;
    }

    // insights（followers_count 以外）
    const metricsForInsights = metrics.filter(k => k !== 'followers_count');
    let insightValues = {};
    if (metricsForInsights.length){
      const url = new URL(`https://graph.facebook.com/${API_VER}/${igId}/insights`);
      url.searchParams.set('metric', metricsForInsights.join(','));
      url.searchParams.set('period', period);
      url.searchParams.set('since', since);
      url.searchParams.set('until', until);
      url.searchParams.set('access_token', token);
      const json = await fetchJson(url.toString());
      // data: [{name, period, values:[{value, end_time}], title, id}, ...]
      for (const item of (json?.data||[])){
        const name = item?.name;
        const arr = Array.isArray(item?.values) ? item.values : [];
        const v = arr[0]?.value;
        if (typeof v === 'number') insightValues[name] = v;
        else if (v && typeof v === 'object' && typeof v.value === 'number') insightValues[name] = v.value; // 念のため
        else insightValues[name] = 0;
      }
    }

    // followers_count は別エンドポイント
    let followersCount = null;
    if (metrics.includes('followers_count')){
      const u2 = new URL(`https://graph.facebook.com/${API_VER}/${igId}`);
      u2.searchParams.set('fields', 'followers_count');
      u2.searchParams.set('access_token', token);
      const j2 = await fetchJson(u2.toString());
      followersCount = Number(j2?.followers_count) || 0;
    }

    const outMetrics = { ...insightValues };
    if (metrics.includes('followers_count')) outMetrics['followers_count'] = followersCount;

    const out = {
      date,
      generated_at: generatedAt,
      account: handle,
      source: `ig_graph_${API_VER}`,
      metrics: outMetrics
    };

    const [y, m, d] = date.split('-');
    const outPath = join('data','insights',handle,'daily', y, m, `${d}.json`);
    await ensureDir(dirname(outPath));
    await writeFile(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
    console.log(`[ok] ${handle} -> ${outPath}`);
  }
}

main().catch(e => {
  console.error('[fatal]', e.message || e);
  process.exit(1);
});
