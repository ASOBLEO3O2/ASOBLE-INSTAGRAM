// Minimal Graph API caller with retry (Node 18+)
export async function callGraph(endpoint, params = {}, { token, base = 'https://graph.facebook.com/v23.0' } = {}) {
  if (!token) throw new Error('FB token missing');
  const usp = new URLSearchParams({ ...params, access_token: token });
  const url = `${base}${endpoint}?${usp.toString()}`;
  const max = 3;
  let last;
  for (let i = 0; i < max; i++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    last = await safeJson(res);
    // 429/5xx は軽くリトライ
    if (res.status === 429 || res.status >= 500) await sleep(400 * (i + 1));
    else break;
  }
  const msg = (last && (last.error?.message || JSON.stringify(last))) || 'unknown';
  throw new Error(`Graph call failed: ${msg}`);
}

const sleep = (ms)=> new Promise(r=>setTimeout(r, ms));
async function safeJson(res){ try{ return await res.json(); }catch{ return {}; } }
