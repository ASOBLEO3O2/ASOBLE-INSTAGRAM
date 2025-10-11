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
  
  // rows は関数スコープで必ず確保（ALLでも空配列で存在させる）
  let rows = [];

  // --- 1) 単店 or 全店の時系列を得る
  function seriesFor(h){
    const arr = state.series.get(h) || [];
    return arr.map(x=>({ t: toTime(x.t), v: Number(x.followers)||0 }))
              .filter(x=>Number.isFinite(x.t))
              .sort((a,b)=>a.t-b.t);
  }
 
  if (target !== 'ALL') {
    rows = seriesFor(target);
    if (!rows.length) return [];
  }
  // 念のための防御（どこかで再代入されても未定義にはならない）
  if (!Array.isArray(rows)) rows = [];
 
  // --- 2) 粒度別に抽出
  if (range === '1h'){
    // 選択日の 0:00〜23:59 の時間足（存在するサンプルの「最後値」を1時間ごとに）
    const from = dateMs0;
    const to   = from + 24*3600e3 - 1;
    const hourly = new Map(); // key=0..23, val=合計終値
    if (target==='ALL'){
      // 店舗ごとに「時間バケットの終値」を取り、それらを同じバケットで加算
      state.accounts.forEach(h=>{
        const per = new Map();
        seriesFor(h).forEach(x=>{
          if (x.t < from || x.t > to) return;
          const k = Math.floor((x.t - from)/3600e3);
          per.set(k, x.v); // その店舗のその時間の「最後値」
        });
        per.forEach((v,k)=> hourly.set(k, (hourly.get(k)||0)+v));
      });
    }else{
      rows.forEach(x=>{
        if (x.t < from || x.t > to) return;
        const k = Math.floor((x.t - from)/3600e3);
        hourly.set(k, x.v); // 単店は終値で上書き
      });
    }
    return [...hourly.entries()].map(([k,v])=>({ t: from + k*3600e3, v })).sort((a,b)=>a.t-b.t);
  }

  if (range === '1d'){
    // 選択日±3日 = 7点の日足（各日の「最後値」）
    const center = dateMs0;
    const from = center - 3*86400e3;
    const to   = center + 3*86400e3 + (86400e3-1);
    const daily = new Map(); // key=dayBucket, val=合計終値
    if (target==='ALL'){
      state.accounts.forEach(h=>{
        const per = new Map();
        seriesFor(h).forEach(x=>{
          if (x.t < from || x.t > to) return;
          const k = Math.floor(x.t/86400e3);
          per.set(k, x.v);
        });
        per.forEach((v,k)=> daily.set(k, (daily.get(k)||0)+v));
      });
    }else{
      rows.forEach(x=>{
        if (x.t < from || x.t > to) return;
        const k = Math.floor(x.t/86400e3);
        daily.set(k, x.v);
      });
    }
    return [...daily.entries()].map(([k,v])=>({ t: k*86400e3, v })).sort((a,b)=>a.t-b.t);
   }
  
  // range === '1m' : 選択月の週足（各週の「最後値」）
  {
    const d = new Date(isoDate + 'T00:00:00+09:00');
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const monthEnd   = new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999).getTime();
    const weekly = new Map(); // key=weekStart(Mon), val=合計終値
    if (target==='ALL'){
      state.accounts.forEach(h=>{
        const per = new Map();
        seriesFor(h).forEach(x=>{
          if (x.t < monthStart || x.t > monthEnd) return;
          const wk = weekOf(x.t);
          per.set(wk, x.v); // 週内の最後値
        });
        per.forEach((v,k)=> weekly.set(k, (weekly.get(k)||0)+v));
      });
    }else{
      rows.forEach(x=>{
        if (x.t < monthStart || x.t > monthEnd) return;
        const wk = weekOf(x.t);
        weekly.set(wk, x.v);
      });
    }
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
  // 軸目盛の作成（rangeをコンテナのdata-rangeで受ける：controller側から不要。簡易に推定）
  const guessRange = (()=>{ const n=data.length; if(n<=8) return '1d'; if((xmax-xmin)<=24*3600e3) return '1h'; return '1m'; })();
  const ticks = buildTicks(guessRange, xmin, xmax, data);
  const tickLines = ticks.map(tx => `<line x1="${x(tx)}" y1="${T}" x2="${x(tx)}" y2="${H-B}" stroke="#fff" opacity="0.20" stroke-width="1"/>`).join('');
  const tickLabels = ticks.map(tx => `<text x="${x(tx)}" y="${H-4}" font-size="11" text-anchor="middle" fill="#bcd" opacity="0.95">${formatTick(tx, guessRange)}</text>`).join('');

  const svg = `
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="followers trend">
    <rect x="0" y="0" width="${W}" height="${H}" fill="transparent"/>
    <!-- grid -->
    ${[0,1,2,3,4].map(i=>{
      const yy = T + (H-T-B)*i/4;
      return `<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#fff" opacity="0.15" stroke-width="1"/>`;
    }).join('')}
    <!-- x ticks -->
    ${tickLines}
    ${tickLabels}
    <!-- line -->
    <path d="${path}" fill="none" stroke="#6ad1e3" stroke-width="2" opacity="0.95"/>
    <!-- last dot -->
    <circle cx="${x(last.t)}" cy="${y(last.v)}" r="3" fill="#6ad1e3"/>
  </svg>`;
  $container.innerHTML = svg;
}

// 目盛位置の生成
function buildTicks(range, xmin, xmax, data){
  const out = [];
  if (range==='1h'){
    // 0,6,12,18,24（実データ範囲に収まるものだけ）
    const day0 = new Date(new Date(xmin).toLocaleString('ja-JP',{timeZone:JST})); day0.setHours(0,0,0,0);
    [0,6,12,18,24].forEach(h=>{
      const t = +day0 + h*3600e3;
      if (t>=xmin && t<=xmax) out.push(t);
    });
    return out;
  }
  if (range==='1d'){
    // 7点の日足 → それぞれのtをそのままラベル
    return data.map(d=>d.t);
  }
  // 1m：週始まり（推定）。最初の点の週頭、以降+7日
  const first = data[0]?.t ?? xmin;
  const monday = (d => { const dt=new Date(d); const k=(dt.getDay()+6)%7; dt.setDate(dt.getDate()-k); dt.setHours(0,0,0,0); return +dt; })(first);
  for(let t=monday; t<=xmax+1; t+=7*86400e3){ if(t>=xmin) out.push(t); }
  return out;
}

// 目盛ラベルのフォーマット
function formatTick(t, range){
  const d = new Date(t);
  if (range==='1h'){
    const hh = String(d.getHours()).padStart(2,'0');
    return `${hh}:00`;
  }
  if (range==='1d' || range==='1m'){
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${mm}/${dd}`;
  }
  return '';
}
