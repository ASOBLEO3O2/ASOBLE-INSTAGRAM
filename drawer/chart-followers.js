// フォロワー推移：1h=時間足 / 1d=日足(7点) / 1m=週足（選択月）
// 依存なし（stateとDOMのみ） — SVGで軽量描画

const JST = 'Asia/Tokyo';

function toTime(t){ return (t instanceof Date) ? +t : new Date(t).getTime(); }
function startOfDayJST(isoYmd){
  const [y,m,d] = (isoYmd||'').split('-').map(Number);
  if (!y||!m||!d) return NaN;
  // JSTの0時
  const s = new Date(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T00:00:00+09:00`);
  return +s;
}
function weekOf(d){
  // 月曜始まりの週キー
  const dt = new Date(d);
  const day = (dt.getDay()+6)%7; // Mon=0
  const monday = new Date(dt); monday.setDate(dt.getDate() - day); monday.setHours(0,0,0,0);
  return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate()).getTime();
}

export function buildDrawerSeries(state, handle, range, isoDate){
  const target = handle || 'ALL';
  const dateMs0 = startOfDayJST(isoDate);
  if (!Number.isFinite(dateMs0)) return [];

  // --- 1) 単店 or 全店の時系列を得る
  function seriesFor(h){
    const arr = state.series.get(h) || [];
    return arr.map(x=>({ t: toTime(x.t), v: Number(x.followers)||0 }))
              .filter(x=>Number.isFinite(x.t))
              .sort((a,b)=>a.t-b.t);
  }
  let rows = [];
  if (target === 'ALL'){
    const bucket = new Map();
    state.accounts.forEach(h=>{
      seriesFor(h).forEach(p=>{
        bucket.set(p.t, (bucket.get(p.t)||0) + p.v);
      });
    });
    rows = [...bucket.entries()].map(([t,v])=>({t:+t,v}));
    rows.sort((a,b)=>a.t-b.t);
  }else{
    rows = seriesFor(target);
  }
  if (!rows.length) return [];

  // --- 2) 粒度別に抽出
  if (range === '1h'){
    // 選択日の 0:00〜23:59 の時間足（存在するサンプルの「最後値」を1時間ごとに）
    const from = dateMs0;
    const to   = from + 24*3600e3 - 1;
    const hourly = new Map(); // key=hourBucket, val=lastV
    rows.forEach(x=>{
      if (x.t < from || x.t > to) return;
      const k = Math.floor((x.t - from)/3600e3); // 0..23
      hourly.set(k, x.v);
    });
    return [...hourly.entries()].map(([k,v])=>({ t: from + k*3600e3, v })).sort((a,b)=>a.t-b.t);
  }

  if (range === '1d'){
    // 選択日±3日 = 7点の日足（各日の「最後値」）
    const center = dateMs0;
    const from = center - 3*86400e3;
    const to   = center + 3*86400e3 + (86400e3-1);
    const daily = new Map(); // key=dayBucket, val=lastV
    rows.forEach(x=>{
      if (x.t < from || x.t > to) return;
      const k = Math.floor(x.t/86400e3);
      daily.set(k, x.v);
    });
    return [...daily.entries()].map(([k,v])=>({ t: k*86400e3, v })).sort((a,b)=>a.t-b.t);
  }

  // range === '1m' : 選択月の週足（各週の「最後値」）
  {
    const d = new Date(isoDate + 'T00:00:00+09:00');
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const monthEnd   = new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999).getTime();
    const weekly = new Map(); // key=weekStart(Mon), val=lastV
    rows.forEach(x=>{
      if (x.t < monthStart || x.t > monthEnd) return;
      const wk = weekOf(x.t);
      weekly.set(wk, x.v);
    });
    return [...weekly.entries()].map(([k,v])=>({ t: k, v })).sort((a,b)=>a.t-b.t);
  }
}

export function drawDrawerChart($container, data){
  $container.innerHTML = '';
  const W = $container.clientWidth || 600;
  const H = $container.clientHeight || 220;
  if (!data || data.length === 0){
    $container.innerHTML = `<div style="color:#9ab;padding:16px;font-size:13px;">データがありません</div>`;
    return;
  }
  if (data.length === 1){
    const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="followers trend">
      <circle cx="${W/2}" cy="${H/2}" r="3" fill="#6ad1e3"/>
    </svg>`;
    $container.innerHTML = svg;
    return;
  }
  const xs = data.map(d=>d.t), ys = data.map(d=>d.v);
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const ymin = Math.min(...ys), ymax = Math.max(...ys);
  const L=24,R=8,T=12,B=18;
  const x = t => L + (W-L-R) * ((t - xmin) / Math.max(1,(xmax-xmin)));
  const y = v => T + (H-T-B) * (1 - ((v - ymin) / Math.max(1,(ymax-ymin))));

  const path = data.map((p,i)=> (i? 'L':'M') + x(p.t).toFixed(1) + ' ' + y(p.v).toFixed(1)).join(' ');
  const last = data[data.length-1];
  const svg = `
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="followers trend">
    <rect x="0" y="0" width="${W}" height="${H}" fill="transparent"/>
    <!-- grid -->
    ${[0,1,2,3,4].map(i=>{
      const yy = T + (H-T-B)*i/4;
      return `<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#fff" opacity="0.15" stroke-width="1"/>`;
    }).join('')}
    <!-- line -->
    <path d="${path}" fill="none" stroke="#6ad1e3" stroke-width="2" opacity="0.95"/>
    <!-- last dot -->
    <circle cx="${x(last.t)}" cy="${y(last.v)}" r="3" fill="#6ad1e3"/>
  </svg>`;
  $container.innerHTML = svg;
}
