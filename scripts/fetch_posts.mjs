import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { nowUtcISO, nowJstISO, jstYmd, ensureOutDir } from "./lib/time.js";

function parseArgs(argv=process.argv.slice(2)){
  const out={};
  for(let i=0;i<argv.length;i++){
    const a=argv[i];
    if(a==="--ig-id") out.igId = argv[++i];
    else if(a==="--token") out.token = argv[++i];
    else if(a==="--store") out.store = argv[++i];
    else if(a==="--out") out.out = argv[++i];
  }
  return out;
}

const args = parseArgs();
if(!args.igId || !args.token || !args.store || !args.out){
  console.error("usage: node fetch_posts.mjs --ig-id <ID> --token <TOKEN> --store <STORE> --out <DIR>");
  process.exit(2);
}

const API = (path, qs) => `https://graph.facebook.com/v23.0${path}?access_token=${encodeURIComponent(args.token)}${qs?`&${qs}`:""}`;

const MEDIA_FIELDS = [
  "id","media_type","permalink","timestamp","caption"
].join(",");

// posts = IMAGE / CAROUSEL_ALBUM / VIDEO (REELは除外)
const IS_POST = (t)=> t && !/REEL/i.test(t);

async function fetchJson(url){
  const r = await fetch(url, { headers: { "Accept":"application/json" } });
  if(!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return await r.json();
}

async function main(){
  const list = [];
  let url = API(`/${args.igId}/media`, `fields=${encodeURIComponent(MEDIA_FIELDS)}&limit=50`);
  for(let page=0; page<5 && url; page++){
    const j = await fetchJson(url);
    for(const it of (j.data||[])){
      if(IS_POST(it.media_type)) list.push(it);
    }
    url = j.paging?.next || null;
  }

  // metrics呼び出しは型依存で差があるため、まずは枠だけ確保（v1）
  const items = list.map(x => ({
    id: x.id,
    permalink: x.permalink,
    timestamp: x.timestamp,
    media_type: x.media_type,
    caption: x.caption ?? null,
    metrics: {}  // v1では空。後段で拡張
  }));

  const ymd = jstYmd();
  const outFile = ensureOutDir(fs, path, args.out, ymd);
  const payload = {
    store: args.store,
    fetched_at_utc: nowUtcISO(),
    fetched_at_jst: nowJstISO(),
    source: "ig_graph_v23.0",
    granularity: "daily",
    version: "v1",
    items
  };

  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));
  console.log("saved:", outFile, `(items=${items.length})`);
}

main().catch(e => { console.error(e); process.exit(1); });
