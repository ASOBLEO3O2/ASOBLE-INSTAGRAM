import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const TOKEN = process.env.FB_USER_TOKEN_LONG;
const PAGE_IDS = (process.env.PAGE_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
const IG_IDS_EXTRA = (process.env.INSTAGRAM_USER_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
const API = "https://graph.facebook.com/v23.0";

if (!TOKEN) {
  console.error("FB_USER_TOKEN_LONG is missing");
  process.exit(1);
}

async function g(url, params = {}) {
  const u = new URL(url);
  u.searchParams.set("access_token", TOKEN);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u, { headers: { "Accept": "application/json" }});
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Graph error ${res.status}: ${t}`);
  }
  return res.json();
}

async function resolveIgIdsFromPages(pageIds) {
  const ig = [];
  for (const pid of pageIds) {
    try {
      const j = await g(`${API}/${pid}`, { fields: "instagram_business_account" });
      if (j.instagram_business_account?.id) ig.push(j.instagram_business_account.id);
    } catch (e) {
      console.error(`resolveIgIdsFromPages failed for ${pid}:`, e.message);
    }
  }
  return ig;
}

async function fetchAccounts(igIds) {
  const out = [];
  for (const id of igIds) {
    try {
      const j = await g(`${API}/${id}`, { fields: "username,followers_count,media_count" });
      out.push({
        ig_id: id,
        username: j.username ?? null,
        followers_count: j.followers_count ?? null,
        media_count: j.media_count ?? null,
      });
    } catch (e) {
      console.error(`fetch account failed for ${id}:`, e.message);
    }
  }
  return out;
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
  const igFromPages = await resolveIgIdsFromPages(PAGE_IDS);
  const igIds = Array.from(new Set([...igFromPages, ...IG_IDS_EXTRA])).filter(Boolean);
  if (igIds.length === 0) {
    console.error("No Instagram user IDs resolved. Check PAGE_IDS or INSTAGRAM_USER_IDS.");
    process.exit(1);
  }
  const accounts = await fetchAccounts(igIds);
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
  console.log("accounts fetched for timeseries:",
  accounts.map(a => ({ u: a.username, f: a.followers_count })));
  console.log("accounts fetched for timeseries:", accounts.map(a => ({
  　u: a.username, f: a.followers_count
  })));
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
    arr.push({ t: isoJST, followers: acc.followers_count ?? 0 });
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
