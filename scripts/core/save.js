import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export async function ensureDir(dir){ if(!existsSync(dir)) await mkdir(dir, { recursive:true }); }
export async function writeJsonPretty(p, obj){
  const next = JSON.stringify(obj, null, 2);
  let curr = null;
  try{ if(existsSync(p)) curr = await readFile(p, 'utf8'); }catch{}
  if(curr === next) return false; // no change
  await ensureDir(path.dirname(p));
  await writeFile(p, next);
  return true;
}
