--- /dev/null
+++ b/scripts/build_timeseries.mjs
@@
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { jstYmd } from "./lib/time.js";

// --------------- helpers ---------------
function readJsonSafe(p){
  try{ return JSON.parse(fs.readFileSync(p, "utf8")); }catch{ return null; }
}
function walk(dir, exts=[".json"]){
  const out = [];
  if(!fs.existsSync(dir)) return out;
  const st = fs.statSync(dir);
  if(st.isFile()){
    if(exts.includes(path.extname(dir))) out.push(dir);
    return out;
  }
  for(const name of fs.readdirSync(dir)){
    const p = path.join(dir, name);
    const s = fs.statSync(p);
    if(s.isDirectory()) out.push(...walk(p, exts));
    else if(exts.includes(path.extname(p))) out.push(p);
  }
  return out;
}
function parseArgs(argv=process.argv.slice(2)){
  const out={};
  for(let i=0;i<argv.length;i++){
    const a=argv[i];
    if(a==="--store") out.store = argv[++i];
  }
  return out;
}
function ensureDir(d){ fs.mkdirSync(d, { recursive:true }); }

// 日付キー抽出: posts/reels は YYYY/MM/DD.json、stories は YYYY-MM-DDThh.json
function keyFromPath(p){
  const base = path.basename(p);
  if(base.includes("T")) return base.split("T")[0]; // stories -> YYYY-MM-DD
  const m = p.match(/(\d{4})[\\/](\d{2})[\\/](\d{2})\.json$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// --------------- main ---------------
async function main(){
  const args = parseArgs();
  if(!args.store){ console.error("usage: node build_timeseries.mjs --store <STORE|ALL>"); process.exit(2); }

  // per-store aggregation
  if(args.store !== "ALL"){
    const store = args.store;

    const postsDir  = path.join("data", "posts",  store);
    const reelsDir  = path.join("data", "reels",  store);
    const storiesDir= path.join("data", "account", store, "stories");

    const map = new Map(); // date(YYYY-MM-DD) -> {posts_count, reels_count, stories_count}

    // posts（日次）
    for(const f of walk(postsDir)){
      const k = keyFromPath(f); if(!k) continue;
      const j = readJsonSafe(f); if(!j) continue;
      const n = Array.isArray(j.items) ? j.items.length : 0;
      const o = map.get(k) || {posts_count:0, reels_count:0, stories_count:0};
      o.posts_count += n; map.set(k, o);
    }

    // reels（日次）
    for(const f of walk(reelsDir)){
      const k = keyFromPath(f); if(!k) continue;
      const j = readJsonSafe(f); if(!j) continue;
      const n = Array.isArray(j.items) ? j.items.length : 0;
      const o = map.get(k) || {posts_count:0, reels_count:0, stories_count:0};
      o.reels_count += n; map.set(k, o);
    }

    // stories（時間次→日次合算）
    for(const f of walk(storiesDir)){
      const k = keyFromPath(f); if(!k) continue;
      const j = readJsonSafe(f); if(!j) continue;
      const n = Array.isArray(j.items) ? j.items.length : 0;
      const o = map.get(k) || {posts_count:0, reels_count:0, stories_count:0};
      o.stories_count += n; map.set(k, o);
    }

    const rows = [...map.keys()].sort().map(d => ({ date:d, ...map.get(d) }));
    const payload = {
      store,
      version: "v1",
      updated_at_jst: jstYmd(new Date()),
      granularity: "daily",
      items: rows
    };

    ensureDir(path.join("data","timeseries"));
    fs.writeFileSync(path.join("data","timeseries", `${store}.json`), JSON.stringify(payload, null, 2));
    console.log(`timeseries saved: data/timeseries/${store}.json (days=${rows.length})`);
    return;
  }

  // ALL aggregation: 全 store の timeseries を合算
  const base = path.join("data","timeseries");
  ensureDir(base);
  const files = walk(base).filter(p => /[\\/](KITAKYUSHU|HONAMI|YUMEGAOKA|IRISO|OHTU)\.json$/.test(p));
  const map = new Map(); // date -> sums
  for(const p of files){
    const j = readJsonSafe(p); if(!j) continue;
    for(const r of (j.items||[])){
      const o = map.get(r.date) || {posts_count:0, reels_count:0, stories_count:0};
      o.posts_count   += Number(r.posts_count||0);
      o.reels_count   += Number(r.reels_count||0);
      o.stories_count += Number(r.stories_count||0);
      map.set(r.date, o);
    }
  }
  const rows = [...map.keys()].sort().map(d => ({ date:d, ...map.get(d) }));
  const payload = {
    store: "ALL",
    version: "v1",
    updated_at_jst: jstYmd(new Date()),
    granularity: "daily",
    items: rows
  };
  fs.writeFileSync(path.join(base, "ALL.json"), JSON.stringify(payload, null, 2));
  console.log(`timeseries saved: data/timeseries/ALL.json (days=${rows.length})`);
}

main().catch(e => { console.error(e); process.exit(1); });
