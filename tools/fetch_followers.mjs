import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
// 収集から除外するユーザー名（カンマ区切り）
const DENY = new Set((process.env.DENY_USERNAMES || "asobleasoble6")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean));

async function fetchFollowersFromProfile(handle) {
  // 公開プロフィールHTMLを取得して <meta property="og:description"> を解析
  const url = `https://www.instagram.com/${handle}/`;
  const res = await fetch(url, {
    headers: {
   "Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
      "Referer": "https://www.instagram.com/",
      "User-Agent": uaFor(handle)
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${handle}`);
  const html = await res.text();
  // 例: content="1,234 Followers, 56 Following, 78 Posts - See Instagram photos and videos from foo (@foo)"
  // 属性順・クォート差の双方を許容（どちらかにマッチすればOK）
  let m = html.match(/property=['"]og:description['"][^>]*content=['"]([^'"]+)['"]/i);
  if (!m) m = html.match(/content=['"]([^'"]+)['"][^>]*property=['"]og:description['"]/i);
  if (!m) throw new Error(`og:description not found for ${handle}`);
  const s = m[1];
  const m2 = s.match(/([\d.,]+)\s*(Followers|フォロワー)/i);
  if (!m2) throw new Error(`followers not found for ${handle}`);
  const norm = v=>{
    const t = String(v).trim().toLowerCase();
    if (t.endsWith('m')) return Math.round(parseFloat(t)*1_000_000);
    if (t.endsWith('k')) return Math.round(parseFloat(t)*1_000);
    return Number(t.replace(/[.,]/g,'')); // 1,234 → 1234
  };
  return norm(m2[1]);
}

// 429/一時エラー対策：指数バックオフ付きの再試行
async function fetchFollowersWithRetry(handle, tries = 5) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fetchFollowersFromProfile(handle);
    } catch (e) {
      lastErr = e;
      // 429 や一時的な失敗は少し待って再試行
      const msg = String(e?.message || '');
      const is429 = /HTTP\s*429/i.test(msg);
      const isTemp = /timeout|fetch failed|og:description not found/i.test(msg);
      if (!(is429 || isTemp)) break; // 恒久的っぽいエラーは即中断
      // 強化: 30s, 60s, 120s, 240s, 480s (+ジッター)
      const backoff = 30000 * Math.pow(2, i) + Math.floor(Math.random() * 5000);
      console.warn(`[retry ${i+1}/${tries}] @${handle} after ${backoff}ms due to: ${msg}`);
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

function today() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function ensureDirs() {
  for (const p of ["data/history", "data/summary"]) {
    if (!existsSync(p)) await mkdir(p, { recursive: true });
  }
}

async function main() {
  await ensureDirs();
  // accounts.json をソースオブトゥルースにする
  const cfg = JSON.parse(await readFile("accounts.json", "utf8"));
  const handles = (Array.isArray(cfg?.accounts) ? cfg.accounts : [])
    .map(h=>String(h||'').trim()).filter(Boolean)
    .filter(h=>!DENY.has(h.toLowerCase()));
  if (handles.length === 0) {
    console.error("No handles in accounts.json");
    process.exit(1);
  }
  const accounts = [];

  const sleep = (ms)=> new Promise(r=>setTimeout(r, ms));
  // 決定的UAプール：ハンドルごとに分散（同一ハンドルは常に同じUA）
  function uaFor(h){
    const UAS = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0"
    ];
    let hash = 2166136261>>>0; // FNV-1a
    for (let i=0;i<h.length;i++){ hash ^= h.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return UAS[Math.abs(hash)%UAS.length];
  }

  for (const h of handles) {
    try {
       const f = await fetchFollowersFromProfile(h);
      accounts.push({ username: h, followers_count: f, media_count: null });
    } catch(e) {
      console.error(`fetch failed for @${h}:`, e.message);
      accounts.push({ username: h, followers_count: null, media_count: null });
    }
     // レート制限回避のため待機を大幅延長（15〜20秒ジッター）
    await sleep(15000 + Math.floor(Math.random()*5000));
  }
  const snapshot = {
    fetched_at_utc: new Date().toISOString(),
    accounts,
  };
  const latestPath = path.join("data", "summary", "latest.json");
  const historyPath = path.join("data", "history", `${today()}.json`);
  await writeFile(latestPath, JSON.stringify(snapshot, null, 2));
  await writeFile(historyPath, JSON.stringify(snapshot, null, 2));
  console.log(`Wrote ${latestPath} and ${historyPath}`);

  // === timeseries append ===
  const tsDir = path.join("data", "timeseries");
  if (!existsSync(tsDir)) await mkdir(tsDir, { recursive: true });
  const now = new Date();
  const isoJST = new Date(now.getTime() - now.getTimezoneOffset()*60000)
                   .toISOString().replace("Z", "+09:00");
console.log("accounts fetched (scrape):", accounts.map(a => ({ u:a.username, f:a.followers_count })));
  for (const acc of accounts) {
    if (!acc.username) continue;
    const tsPath = path.join(tsDir, `${acc.username}.json`);
    console.log("append target:", tsPath, "followers:", acc.followers_count);
    let arr = [];
    try {
      if (existsSync(tsPath)) {
        const raw = await readFile(tsPath, "utf8");
        arr = JSON.parse(raw||"[]");
      }
    } catch {}
    if (Number.isFinite(acc.followers_count)) {
      arr.push({ t: isoJST, followers: acc.followers_count });
    } else {
      console.warn(`skip append for @${acc.username} (no followers_count)`);
    }    
    // 重複除去（tキーで後勝ち）
    const seen = new Map();
    arr.forEach(x => { if(x?.t) seen.set(x.t, x.followers); });
    arr = [...seen.entries()].map(([t,v])=>({t, followers:v}))
             .sort((a,b)=> new Date(a.t)-new Date(b.t));
    // 上限 4000 件
    if (arr.length > 4000) arr.splice(0, arr.length-4000);
    await writeFile(tsPath, JSON.stringify(arr, null, 2));
    console.log(`Updated timeseries ${acc.username} (${arr.length} pts)`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
