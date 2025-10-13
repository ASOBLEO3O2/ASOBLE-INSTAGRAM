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

// accounts.json の1件を正規化（オブジェクト/配列どちらでもOKに）
function normalizeAccount(a){
  // 1) オブジェクト型：既存の受け口拡張（A適用相当）
  if (a && typeof a === 'object' && !Array.isArray(a)) {
    const handle = a.handle || a.account || a.username || a.name || a.store || a.page;
    const igId   = a.igId || a.igID || a.instagram_id || a.id || a['ig-id'];
    const token  = a.token || a.page_token || a.access_token;
    return { handle, igId, token, raw: a };
  }
  // 2) 配列型：位置・中身から推定（[handle, igId, token] などを想定）
  if (Array.isArray(a)) {
    let handle = null, igId = null, token = null;
    for (const v of a) {
      if (!handle && typeof v === 'string' && /[@A-Za-z_]/.test(v) && v.length <= 64) handle = v;
      if (!igId && (typeof v === 'number' || (typeof v === 'string' && /^\d{8,}$/.test(v)))) igId = String(v);
      if (!token && typeof v === 'string' && (v.includes('.') || v.length > 40)) token = v;
    }
    return { handle, igId, token, raw: a };
  }
  // 4) 文字列型: ハンドル名のみ（Secretsからトークンを取得）
  if (typeof a === 'string') {
    const handle = a;
    const envKey = `PAGE_TOKEN_${String(handle).toUpperCase().replace(/[^A-Z0-9]+/g,'_')}`;
    const token = process.env[envKey] || null;
    return { handle, igId: null, token, raw: a };
  }
  
  // 3) それ以外は未対応
  return { handle: null, igId: null, token: null, raw: a };
}

async function main(){
  const metricsConf = await readJson('config/insights.metrics.json'); // { period:"day", metrics:[...] }
  const period = metricsConf?.period || 'day';
  const metrics = Array.isArray(metricsConf?.metrics) ? metricsConf.metrics : [];
  if (!metrics.length) throw new Error('metrics empty in config/insights.metrics.json');

  const accounts = (await readJson('accounts.json'))?.accounts || [];
  if (!accounts.length) throw new Error('accounts.json: accounts empty');

   // --- UTC基準で前日範囲を計算 ---
  const generatedAt = nowIsoJst();
  const utcNow = new Date();
  utcNow.setUTCDate(utcNow.getUTCDate() - 1);
  const date = utcNow.toISOString().slice(0,10);
  const sinceSec = Math.floor(utcNow.setUTCHours(0,0,0,0) / 1000);
  const untilSec = sinceSec + 86400 - 1;

  // デバッグ時のみ出力（DEBUG_INSIGHTS=1）
  if (process.env.DEBUG_INSIGHTS === '1') {
    console.log('[debug] UTC range', { sinceSec, untilSec });
  }

  // 旧名 <-> API名 の互換マッピング（insights用）
  const ALIAS = {
    impressions: 'content_views',    // 旧: impressions
    accounts_reached: 'reach',       // 旧: accounts_reached
  };
  // Graph API v23 の insights が受け付けるメトリクス（主要どころ）
  const ALLOWED = new Set([
    'reach','follower_count','website_clicks','profile_views','online_followers',
    'accounts_engaged','total_interactions','likes','comments','shares','saves','replies',
    'engaged_audience_demographics','reached_audience_demographics','follower_demographics',
    'follows_and_unfollows','profile_links_taps','views',
    'threads_likes','threads_replies','reposts','quotes',
    'threads_followers','threads_follower_demographics',
    'content_views','threads_views','threads_clicks'
  ]);
  const toApi = (name) => ALIAS[name] ?? name;
  const fromApi = (name) => (name === 'content_views' ? 'impressions' : name);

  for (const a of accounts){
  
    const norm = normalizeAccount(a);
    const handle =
      a.handle || a.account || a.username || a.name || a.store || a.page || (typeof a === 'string' ? a : null);

    // IG ID / TOKEN は Secrets（環境変数）から取得
    const envKeyId = `IG_ID_${String(handle||'').toUpperCase().replace(/[^A-Z0-9]+/g,'_')}`;
    const envKeyTk = `PAGE_TOKEN_${String(handle||'').toUpperCase().replace(/[^A-Z0-9]+/g,'_')}`;
    const igId   = process.env[envKeyId]  || null;
    const token  = process.env[envKeyTk]  || null;

    if (!handle || !igId || !token){
      console.error(`[skip] missing field(s) :: handle=${handle} , igId=${igId?'SET':'MISSING'}(${envKeyId}) , token=${token?'SET':'MISSING'}(${envKeyTk})`);
      continue;
    }
    if (!handle || !igId || !token){
      let snippet;
      try { snippet = JSON.stringify(norm.raw).slice(0, 200); } catch { snippet = String(norm.raw); }
      console.error(`[skip] missing field(s) → handle=${handle}, igId=${igId}, token=${!!token} / raw=${snippet}`);
      continue;
    }

    // insights: Config値→API名へ変換し、ALLOWED外は除外（警告表示）。followers_count は送らない。
    const apiMetricsAll = metrics.map(toApi);
    const invalid = apiMetricsAll.filter(m => !ALLOWED.has(m));
    if (invalid.length) console.warn(`[warn] drop unsupported metrics: ${invalid.join(',')}`);
    const metricsForInsights = apiMetricsAll
      .filter(m => ALLOWED.has(m))
      .filter(m => m !== 'follower_count'); // followerは別エンドポイント
    let insightValues = {};
    if (metricsForInsights.length){
      const url = new URL(`https://graph.facebook.com/${API_VER}/${igId}/insights`);
      url.searchParams.set('metric', metricsForInsights.join(','));
      // 一部メトリクスは total_value 指定が必須（v23）
      const needsTotal = metricsForInsights.some(n => (
        n === 'content_views' || n === 'profile_views' || n === 'accounts_engaged'
      ));
      if (needsTotal) url.searchParams.set('metric_type', 'total_value');
      url.searchParams.set('period', period);
      url.searchParams.set('since', sinceSec);
      url.searchParams.set('until', untilSec);
      url.searchParams.set('access_token', token);
      const json = await fetchJson(url.toString());
      // --- debug (opt-in by DEBUG_INSIGHTS=1) ---
      if (process.env.DEBUG_INSIGHTS === '1') {
        const meta = `metrics=[${metricsForInsights.join(',')}] metric_type=${needsTotal?'total_value':'(none)'} handle=${handle}`;
        let snippet = '';
        try { snippet = JSON.stringify(json); } catch { snippet = String(json); }
        if (snippet.length > 800) snippet = snippet.slice(0, 800) + '…';
        console.log(`[debug] insights ${meta} raw=${snippet}`);
      }
      // data: [{name, period, values:[{value, end_time}], title, id}, ...]
      for (const item of (json?.data||[])){
        const name = fromApi(item?.name); // 旧名へ戻す（例：content_views→impressions）
        const arr = Array.isArray(item?.values) ? item.values : [];
        const val = arr[0];
        let n = 0;
        if (val) {
          if (typeof val.value === 'number') n = val.value;
          else if (val.total_value && typeof val.total_value.value === 'number') n = val.total_value.value;
        }
        insightValues[name] = Number.isFinite(n) ? n : 0;
      }
    }

    // followers_count は別エンドポイント（IGUser: field=followers_count）
    let followersCount = null;
    if (metrics.includes('followers_count')){
      const u2 = new URL(`https://graph.facebook.com/${API_VER}/${igId}`);
      // IGUser で有効なのは followers_count（複数形）
      u2.searchParams.set('fields', 'followers_count');
      u2.searchParams.set('access_token', token);
      const j2 = await fetchJson(u2.toString());
      // 安全に数値化（followers_count を優先、万一 follower_count が来ても拾う）
      let fcRaw = null;
      if (j2 && typeof j2 === 'object') {
        fcRaw = (j2.followers_count !== undefined) ? j2.followers_count
              : (j2.follower_count !== undefined)  ? j2.follower_count
              : null;
      }
      const fcNum = Number(fcRaw);
      followersCount = Number.isFinite(fcNum) ? fcNum : 0;
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
    // 既存成果物に合わせる場合はこちら（insights→account）
    const outPath = join('data','account',handle, `${y}-${m}-${d}.json`);
    await ensureDir(dirname(outPath));
    await writeFile(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
    console.log(`[ok] ${handle} -> ${outPath}`);
  }
}

main().catch(e => {
  console.error('[fatal]', e.message || e);
  process.exit(1);
});
