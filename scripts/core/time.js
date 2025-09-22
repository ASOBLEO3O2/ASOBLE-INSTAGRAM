// JST helpers
export function nowJST(){ return new Date(Date.now() + 9*60*60*1000); }
export function isoJST(d = nowJST()){ return d.toISOString().replace('Z','+09:00'); }
export function ymdJST(d = nowJST()){
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth()+1).padStart(2,'0');
  const dd = String(d.getUTCDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}
export function yesterdayJST(){
  const d = nowJST(); d.setUTCHours(d.getUTCHours()-24);
  return d;
}
