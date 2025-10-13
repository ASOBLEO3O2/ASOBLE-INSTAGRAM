export function pad(n){ return String(n).padStart(2,'0'); }

export function nowUtcISO(){
  return new Date().toISOString();
}

export function nowJstISO(){
  const d = new Date();
  const j = new Date(d.getTime() + 9*60*60*1000);
  // ISO(擬似) with +09:00
  const y = j.getUTCFullYear();
  const m = pad(j.getUTCMonth()+1);
  const day = pad(j.getUTCDate());
  const hh = pad(j.getUTCHours());
  const mm = pad(j.getUTCMinutes());
  const ss = pad(j.getUTCSeconds());
  const ms = String(j.getUTCMilliseconds()).padStart(3,'0');
  return `${y}-${m}-${day}T${hh}:${mm}:${ss}.${ms}+09:00`;
}

export function jstYmd(d=new Date()){
  const j = new Date(d.getTime() + 9*60*60*1000);
  const y = j.getUTCFullYear();
  const m = pad(j.getUTCMonth()+1);
  const day = pad(j.getUTCDate());
  return `${y}-${m}-${day}`;
}

export function ensureOutDir(fs, path, baseDir, ymd){
  const [y,m,d] = ymd.split('-');
  const dir = path.join(baseDir, y, m);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${ymd}.json`);
}
