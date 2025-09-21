(async function main(){
  const $cards   = document.getElementById('cards');
  const $openAll = document.getElementById('open-all');
  const $refresh = document.getElementById('refresh');
  const $chart   = document.getElementById('trend');
  const $range   = document.querySelector('.range-toggle');
 const state = { range: '1h', accounts: [], series: new Map(), overlays: new Set() }; // overlays: Set<string>
  try{
    const res = await fetch('./accounts.json', { cache:'no-cache' });
    const data = await res.json();
    const list = Array.isArray(data.accounts) ? data.accounts : [];
      state.accounts = list;
    await loadAllSeries(list); // series を先に埋める
    render(list);              // DOM生成
    applyCounts();             // ← DOM直後に必ず実行
    draw();
    $openAll.addEventListener('click', () => openAll(list));
    $refresh?.addEventListener('click', async ()=>{
      await loadAllSeries(state.accounts);   // JSON再読込
      try { applyCounts(); } catch {}
    // --- deterministic color palette ---
  function colorFor(handle){
    const palette = [
      '#f26d6d','#6db3f2','#f2c26d','#7bd389','#b28df2',
      '#f28def','#6df2d0','#d3f26d','#f29e6d','#6d8ff2'
    ];
    let h = 2166136261>>>0; // FNV-1a
    for(let i=0;i<handle.length;i++){ h ^= handle.charCodeAt(i); h = Math.imul(h, 16777619); }
    return palette[Math.abs(h)%palette.length];
  }

  // 既存の renderChips がある前提で最小差分（無い場合は無害）
  function renderChips(handles){
    const $chips = document.getElementById('chips');
    if(!$chips) return;
    $chips.innerHTML = handles.map(h=>(
      `<span class="chip" data-h="${h}"><i class="swatch" style="background:${colorFor(h)}"></i>@${h}</span>`
    )).join('');
    $chips.querySelectorAll('.chip').forEach(ch=>{
      ch.addEventListener('click', ()=>{
        const h = ch.getAttribute('data-h');
        if(state.overlays.has(h)) state.overlays.delete(h); else state.overlays.add(h);
        ch.classList.toggle('active', state.overlays.has(h));
        draw();
      });
    });
  }
      draw();                                // グラフ再描画
    });

    $range?.addEventListener('click', (e)=>{
      const btn = e.target.closest('[data-range]');
      if(!btn) return;
      state.range = btn.dataset.range;
      $range.querySelectorAll('.rt-btn').forEach(b=>b.classList.toggle('is-active', b===btn));
      draw();
    });
  // ※ refresh は上で1回だけバインド（重複回避）
    
  }catch(e){
    $cards.innerHTML = `<div class="card"><div class="handle">読み込み失敗</div><div class="muted">${String(e)}</div></div>`;
    $openAll.disabled = true;
  }
  function render(handles){
    if (!handles.length){
      $cards.innerHTML = `<div class="card"><div class="handle">アカウント未登録</div><div class="muted">accounts.json に追記してください。</div></div>`;
      return;
    }
    $cards.innerHTML = handles.map(h => cardHTML(h)).join('');
    // 個別ボタンにイベント付与
    $cards.querySelectorAll('[data-open]').forEach(btn=>{
      btn.addEventListener('click', () => openOne(btn.getAttribute('data-open')));
    });
   // DOM生成直後の同期タイミングで一度実行
   try { applyCounts(); } catch {}
   }

  function cardHTML(handle){
    const url = `https://www.instagram.com/${handle}/`;
    return `
      <article class="card">
        <div class="handle">@${handle}</div>
        <div class="stats">
          <span class="count" data-h="${handle}">—</span>
          <span class="delta" data-h="${handle}"></span>
          <span class="updated" data-h="${handle}"></span>
        </div>
        <div class="links">
          <a href="${url}" target="_blank" rel="noopener">プロフィールを開く</a>
          <button data-open="${handle}" title="新規タブで開く">新規タブ</button>
        </div>
        <div class="muted">※ Instagram は埋め込みが制限されているため外部リンクで表示します。</div>
      </article>`;
  }
  function openOne(handle){
    window.open(`https://www.instagram.com/${handle}/`, '_blank', 'noopener');
  }
  function openAll(handles){
    // まとめて開く（ポップアップブロック回避のため、ユーザー操作1回で連続 open）
    handles.forEach(h => openOne(h));
  }

  /** === data & chart === */
  async function loadAllSeries(handles){
    await Promise.all(handles.map(async h=>{
      try{
        // 期待パス：data/timeseries/<handle>.json  （無ければ空配列）
        const r = await fetch(`./data/timeseries/${h}.json?t=${Date.now()}`, { cache:'no-cache' });
        if(!r.ok) throw 0;
        const arr = await r.json();
        // 正規化：{t, followers} のみ
       const norm = (Array.isArray(arr)?arr:[]).map(x=>({ 
          t:String(x.t||x.time||x.date), followers: Number(x.followers ?? x.count ?? x.value)
        })).filter(x=>x.t && !Number.isNaN(x.followers));
        }catch(e){
         console.warn('timeseries missing or unreadable:', h, e);
         state.series.set(h, []);
       }
     }));
    // series 構築直後に実行（初回 DOM 未生成でも後でまた呼ぶのでOK）
    try { applyCounts(); } catch {}
   renderChips(handles);
   }

  function renderChips(handles){
    const $chips = document.getElementById('chips');
    if(!$chips) return;
    $chips.innerHTML = handles.map(h=>`<span class="chip" data-h="${h}">@${h}</span>`).join('');
    $chips.querySelectorAll('.chip').forEach(ch=>{
      ch.addEventListener('click', ()=>{
        const h = ch.getAttribute('data-h');
        if(state.overlays.has(h)) state.overlays.delete(h); else state.overlays.add(h);
        ch.classList.toggle('active', state.overlays.has(h));
        draw();
      });
    });
  }
     
  function applyCounts(){
    state.accounts.forEach(h=>{
      const arr = state.series.get(h)||[];
      const last = arr[arr.length-1];
      const $c = document.querySelector(`.count[data-h="${h}"]`);
      const $u = document.querySelector(`.updated[data-h="${h}"]`);
       const $d = document.querySelector(`.delta[data-h="${h}"]`);
      if(!$c||!$u) return;
      if(last){
        $c.textContent = last.followers.toLocaleString();
        const d = new Date(last.t);
        const y = d.getFullYear(), m = (d.getMonth()+1).toString().padStart(2,'0'), day = d.getDate().toString().padStart(2,'0');
        const hh = d.getHours().toString().padStart(2,'0'), mm = d.getMinutes().toString().padStart(2,'0');
        $u.textContent = `${y}/${m}/${day} ${hh}:${mm}`;
         // Δ（選択レンジの増減）：欠測は0化せず、ウィンドウ内の最初と最後のみで算出
        try {
          const win = pickWindow(arr, state.range);
          if ($d) {
            if (Array.isArray(win) && win.length >= 2) {
              const first = win[0].v;
              const lastv = win[win.length - 1].v;
              const diff = lastv - first;
              $d.textContent = (diff === 0 || Number.isNaN(diff)) ? '' :
                `(${diff>0?'+':''}${diff.toLocaleString()})`;
            } else {
              $d.textContent = '';
            }
          }
        } catch {}
      }else{
        $c.textContent = '—';
        $u.textContent = '';
        if($d) $d.textContent = '';
      }
    });
  }

  function pickWindow(arr, range){
    const now = Date.now();
    const tzOffsetMin = new Date().getTimezoneOffset(); // JST なら -540
    const ms = (k)=>({ '1h':60e3, '1d':3600e3, '1m':86400e3*32 }[k]); // '1m' は当月用に日足で後で絞る
    // ISO(+09:00等)をDateに
    const rows = arr.map(x=>({ t:new Date(x.t).getTime(), v:x.followers }))
                    .filter(x=>Number.isFinite(x.t) && x.t<=now)
                    .sort((a,b)=>a.t-b.t);
    if(range==='1h'){
      const from = now - 60*60e3;
      return rows.filter(x=>x.t>=from);
    }
    if(range==='1d'){
      const from = now - 24*60*60e3;
      // 1時間足（各時間の最後のサンプル）
      const hourly = new Map();
      rows.forEach(x=>{
        if(x.t<from) return;
        const key = Math.floor(x.t/3600e3); // 時間バケット
        hourly.set(key, x.v);
      });
      return [...hourly.entries()].map(([k,v])=>({ t:k*3600e3, v }));
    }
    // '1m' 当月日足（各日の最後のサンプル）
    const d = new Date();
    const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const daily = new Map();
    rows.forEach(x=>{
      if(x.t<start) return;
      const dayKey = Math.floor(x.t/86400e3);
      daily.set(dayKey, x.v);
    });
     const daySeries = [...daily.entries()].map(([k,v])=>({ t:k*86400e3, v }));
  // フォールバック：同一日内しかデータが無く1点に潰れた場合は、生データ（当月内）をそのまま使う
  if (daySeries.length <= 1) {
    return rows.filter(x=>x.t>=start);
  }
  return daySeries;
  }

  function compose(range){
    // 全アカウントを重ねず、まずは「合計」を描く（必要なら個別オーバーレイは後段で追加）
    const merged = [];
    state.accounts.forEach(h=>{
      const arr = state.series.get(h)||[];
      pickWindow(arr, range).forEach(p=>{
        const key = p.t;
        const i = merged.findIndex(x=>x.t===key);
        if(i>=0) merged[i].v += p.v; else merged.push({ t:key, v:p.v });
      });
    });
    merged.sort((a,b)=>a.t-b.t);
    return merged;
  }

  function draw(){
    const ctx = $chart?.getContext?.('2d');
    if(!ctx) return;
    const data = compose(state.range);
    ctx.clearRect(0,0,$chart.width,$chart.height);
    if(!data.length){
      const W=$chart.width, H=$chart.height;
      ctx.save();
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = '#bcd';
      ctx.font = '16px system-ui, -apple-system, "Noto Sans JP", sans-serif';
      const msg1 = 'データがありません（timeseries未配置または期間内0件）';
      const msg2 = 'data/timeseries/<handle>.json を用意（[]でも可）';
      ctx.fillText(msg1, (W-ctx.measureText(msg1).width)/2, H/2 - 6);
      ctx.fillText(msg2, (W-ctx.measureText(msg2).width)/2, H/2 + 18);
      ctx.restore();
      return;
    }    
    // padding
  if (data.length === 1) {
    const L=40,R=8,T=16,B=24,W=$chart.width,H=$chart.height;
    const p = data[0];
    const x = L + (W-L-R)*0.5;
    const y = T + (H-T-B)*0.5;
    // 値に応じたスケールが無いので中央に目印を出す（UI的に「データあり」を明示）
    const ctx = $chart.getContext('2d');
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI*2);
    ctx.fillStyle = '#6ad1e3';
    ctx.fill();
    return;
  }
    const L=40,R=8,T=16,B=24,W=$chart.width,H=$chart.height;
    const xs = data.map(d=>d.t), ys = data.map(d=>d.v);
    const xmin = Math.min(...xs), xmax = Math.max(...xs);
    const ymin = Math.min(...ys), ymax = Math.max(...ys);
    const x = t => L + (W-L-R) * ( (t - xmin) / Math.max(1,(xmax-xmin)) );
    const y = v => T + (H-T-B) * (1 - ( (v - ymin) / Math.max(1,(ymax-ymin)) ));
    // grid
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    for(let i=0;i<5;i++){
      const yy = T + (H-T-B)*i/4;
      ctx.beginPath(); ctx.moveTo(L,yy); ctx.lineTo(W-R,yy); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // line
    ctx.beginPath();
    data.forEach((p,i)=>{ i?ctx.lineTo(x(p.t), y(p.v)) : ctx.moveTo(x(p.t), y(p.v)); });
    ctx.strokeStyle = '#6ad1e3';
    ctx.lineWidth = 2;
    ctx.stroke();

   // overlays: 個別アカウント線（色分け）
    state.overlays.forEach(h=>{
      const arr = pickWindow(state.series.get(h)||[], state.range);
      if(arr.length<2) return;
      ctx.beginPath();
      arr.forEach((p,i)=>{ i?ctx.lineTo(x(p.t), y(p.v)) : ctx.moveTo(x(p.t), y(p.v)); });
      ctx.strokeStyle = colorFor(h);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  } 
})();
