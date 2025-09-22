import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

async function ensureDir(dir){ if(!existsSync(dir)) await mkdir(dir, { recursive:true }); }
async function listStores(dir){
  if(!existsSync(dir)) return [];
  const names = await readdir(dir, { withFileTypes:true });
  return names.filter(d=>d.isDirectory()).map(d=>d.name);
}
async function readJson(p){ try{ return JSON.parse(await readFile(p,'utf8')); }catch{ return null; } }

async function rollupDomain(domain, date){
  const base = path.join('data', domain);
  const stores = await listStores(base);
  const out = { date, source:'rollup', items:{} };
  for(const s of stores){
    const p = path.join(base, s, `${date}.json`);
    const j = await readJson(p);
    if(j) out.items[s] = j; // そのままネスト（必要なら将来スリム化）
  }
  const outDir = path.join('data', domain, 'rollup');
  await ensureDir(outDir);
  const outPath = path.join(outDir, `${date}.json`);
  await writeFile(outPath, JSON.stringify(out, null, 2));
  console.log(`rollup(${domain}): ${outPath} <- ${stores.length} stores`);
}

async function main(){
  const d = new Date(Date.now() + 9*60*60*1000); // JST
  const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  for(const domain of ['account','audience','media','media_insights','stories']){
    await rollupDomain(domain, date);
  }
}

main().catch(e=>{ console.error(e); process.exit(1); });
