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
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.8",
      "User-Agent": "Mozilla/5.0"
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
  
  for (const h of handles) {
    try {
      const f = await fetchFollowersFromProfile(h);
      accounts.push({ username: h, followers_count: f, media_count: null });
    } catch(e) {
      console.error(`fetch failed for @${h}:`, e.message);
      accounts.push({ username: h, followers_count: null, media_count: null });
    }
    await sleep(1200); // 軽い待機で負荷・ブロック回避
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
