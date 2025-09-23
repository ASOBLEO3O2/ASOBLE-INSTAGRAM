import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

// --- CLI引数サポート（未指定なら従来どおり環境変数を使用） ---
function parseArgs(argv = process.argv.slice(2)){
  const out = {};
  for (let i=0; i<argv.length; i++){
    const a = argv[i];
    if (a === '--token') out.token = argv[++i];
    else if (a === '--ig-id') out.igId = argv[++i];
  }
  return out;
}
const __args = parseArgs();
const TOKEN = __args.token || process.env.FB_PAGE_TOKEN;
const IG_ID  = __args.igId  || process.env.IG_ID;
if (!TOKEN || !IG_ID) {
  console.error("FB_PAGE_TOKEN or IG_ID is missing (you can also pass --token and --ig-id).");
  process.exit(1);
}

async function jstNowISO(){
  // Actions(UTC)でも常にJST(+09:00)を記録
  const jst = new Date(Date.now() + 9*60*60*1000);
  return jst.toISOString().replace("Z", "+09:00");
}
async function ensure(dir){ if(!existsSync(dir)) await mkdir(dir,{recursive:true}); }

async function main(){
  const url = `https://graph.facebook.com/v23.0/${IG_ID}?fields=followers_count,username&access_token=${encodeURIComponent(TOKEN)}`;
  const res = await fetch(url);
  if(!res.ok){ throw new Error(`HTTP ${res.status}`); }
  const j = await res.json();
  const followers = Number(j?.followers_count);
  const handle = String(j?.username||"").trim();
  if(!handle || !Number.isFinite(followers)) throw new Error("invalid payload");

  const tsDir = path.join("data","timeseries");
  await ensure(tsDir);
  const tsPath = path.join(tsDir, `${handle}.json`);
  let arr = [];
  try{
    if(existsSync(tsPath)){ arr = JSON.parse(await readFile(tsPath,"utf8")||"[]"); }
  }catch{}
  arr.push({ t: await jstNowISO(), followers });
  // 重複t後勝ち＋最大4000点
  const map = new Map(arr.filter(x=>x?.t).map(x=>[x.t, x.followers]));
  arr = [...map.entries()].map(([t,v])=>({t, followers:v}))
       .sort((a,b)=> new Date(a.t)-new Date(b.t));
  if(arr.length>4000) arr.splice(0, arr.length-4000);
  await writeFile(tsPath, JSON.stringify(arr,null,2));
  console.log(`updated: ${tsPath} (${arr.length} pts)`);
}

main().catch(e=>{ console.error(e); process.exit(1); });
