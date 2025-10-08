*** Begin Patch
*** Add File: scripts/extract_followers_from_daily.mjs
// 既存の日次スナップ(JSON)から followers_count を毎時抽出して
// data/derived/followers_hourly/<STORE>.jsonl に追記する軽量スクリプト
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'data', 'account');
const OUT_DIR = path.join(ROOT, 'data', 'derived', 'followers_hourly');

function toStoreCodeFromAccount(acc) {
  if (!acc || typeof acc !== 'string') return null;
  const ix = acc.indexOf('_');
  return (ix >= 0 ? acc.slice(ix + 1) : acc).toUpperCase();
}

function* walkJsonFiles(dir) {
  const st = fs.statSync(dir);
  if (!st.isDirectory()) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const s = fs.statSync(p);
    if (s.isDirectory()) yield* walkJsonFiles(p);
    else if (s.isFile() && name.toLowerCase().endsWith('.json')) yield p;
  }
}

function loadJsonSafe(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

function pickLatestByAccount() {
  const byAcc = {};
  for (const file of walkJsonFiles(SRC_DIR)) {
    const j = loadJsonSafe(file);
    if (!j || !j.account || !j.metrics || typeof j.metrics.followers_count !== 'number') continue;
    const rec = {
      file,
      date: String(j.date ?? ''),
      generated_at: String(j.generated_at ?? ''),
      followers: Number(j.metrics.followers_count),
    };
    const key = String(j.account);
    const prev = byAcc[key];
    const newer =
      !prev ||
      rec.date > prev.date ||
      (rec.date === prev.date && rec.generated_at > prev.generated_at);
    if (newer) byAcc[key] = rec;
  }
  return byAcc;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function formatIsoJstTopOfHour(d = new Date()) {
  const tzOffsetMin = -9 * 60;
  const dt = new Date(d);
  dt.setMinutes(0, 0, 0);
  const iso = new Date(dt.getTime() - tzOffsetMin * 60 * 1000).toISOString().replace('Z', '+09:00');
  return iso;
}

function appendIfNeeded(outFile, line) {
  ensureDir(path.dirname(outFile));
  let last = null;
  if (fs.existsSync(outFile)) {
    const fd = fs.openSync(outFile, 'r');
    try {
      const stat = fs.fstatSync(fd);
      const size = stat.size;
      const bufSize = Math.min(4096, size);
      const buf = Buffer.alloc(bufSize);
      fs.readSync(fd, buf, 0, bufSize, Math.max(0, size - bufSize));
      const chunk = buf.toString('utf8');
      const lines = chunk.trim().split(/\r?\n/);
      last = lines[lines.length - 1] || null;
    } finally {
      fs.closeSync(fd);
    }
  }
  if (last === line) return false;
  fs.appendFileSync(outFile, line + '\n', 'utf8');
  return true;
}

function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.warn(`[extract] source dir not found: ${SRC_DIR}`);
    return;
  }
  ensureDir(OUT_DIR);
  const byAcc = pickLatestByAccount();
  const ts = formatIsoJstTopOfHour(new Date());
  let wrote = 0;
  for (const [account, rec] of Object.entries(byAcc)) {
    const store = toStoreCodeFromAccount(account);
    if (!store) continue;
    const obj = {
      ts,
      store,
      account,
      followers: rec.followers,
      src_date: rec.date || null,
      src_path: path.relative(ROOT, rec.file).replace(/\\/g, '/'),
    };
    const line = JSON.stringify(obj);
    const out = path.join(OUT_DIR, `${store}.jsonl`);
    if (appendIfNeeded(out, line)) wrote++;
  }
  console.log(`[extract] done: wrote=${wrote}, accounts=${Object.keys(byAcc).length}`);
}

main();
*** End Patch
