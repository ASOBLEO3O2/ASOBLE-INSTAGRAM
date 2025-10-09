(async function main(){
  const $cards   = document.getElementById('cards');
  const $openAll = document.getElementById('open-all');
  const $refresh = document.getElementById('refresh');
  const $chart   = document.getElementById('trend');
  const $range   = document.querySelector('.range-toggle');
  const $dash    = document.getElementById('dashboard');
 const state = { range: '1h', accounts: [], series: new Map(), overlays: new Set(), target: 'ALL' };
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
      draw();                                // グラフ再描画
    });

    $range?.addEventListener('click', (e)=>{
      const btn = e.target.closest('[data-range]');
      if(!btn) return;
      state.range = btn.dataset.range;
      $range.querySelectorAll('.rt-btn').forEach(b=>b.classList.toggle('is-active', b===btn));
      try { applyCounts(); } catch {}
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
    // 先頭に「全店集計カード（ALL）」を挿入
    const htmlALL = cardHTML('ALL');
    const htmlStores = handles.map(h => cardHTML(h)).join('');
    $cards.innerHTML = htmlALL + htmlStores;
    // 個別ボタンにイベント付与
    $cards.querySelectorAll('[data-open]').forEach(btn=>{
      btn.addEventListener('click', () => openOne(btn.getAttribute('data-open')));
    });
    // カードクリックで右ドロワーを開く
    $cards.querySelectorAll('.card[data-target]').forEach(card=>{
      card.addEventListener('click', (e)=>{
        // リンク/ボタンはドロワー開閉の対象外
        if (e.target.closest('a,button')) return;
        const h = card.getAttribute('data-target');
        openDashboard(h);
      });
    });
   // DOM生成直後の同期タイミングで一度実行
   try { applyCounts(); } catch {}
   }

   function cardHTML(handle){
    const isALL = (handle==='ALL');
    const url = isALL ? null : `https://www.instagram.com/${handle}/`;
    return `
  <article class="card" ${isALL?'data-target="ALL"':'data-target="'+handle+'"'}>
        <div class="handle">${isALL?'全店合計':'@'+handle}</div>
        <div class="stats">
          <span class="count" data-h="${handle}">—</span>
          <span class="delta" data-h="${handle}"></span>
          <span class="updated" data-h="${handle}"></span>
        </div>
        <canvas class="sparkline" data-h="${handle}" width="320" height="${isALL?48:36}"></canvas>     
             ${isALL ? '' : `
             <div class="links">
          <a href="${url}" target="_blank" rel="noopener">プロフィールを開く</a>
          <button data-open="${handle}" title="新規タブで開く">新規タブ</button>
        </div>
        <div class="muted">※ Instagram は埋め込みが制限されているため外部リンクで表示します。</div>`}
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
  // 安全パーサ：空/壊れ/HTMLでも [] を返す
    const safeParseArray = (txt) => {
      if (!txt || !txt.trim()) return [];
      try {
        const v = JSON.parse(txt);
        return Array.isArray(v) ? v : [];
      } catch {
        return [];
      }
    };
    await Promise.all(handles.map(async h=>{
      // 期待パス：data/timeseries/<handle>.json  （無ければ空配列）
      let arr = [];
      try{
        const r = await fetch(`./data/timeseries/${h}.json?t=${Date.now()}`, { cache:'no-cache' });
        if(!r.ok){
          console.warn('timeseries missing (HTTP):', h, r.status);
        } else {
          const txt = await r.text();          // ← 常に text で取得
          arr = safeParseArray(txt);           // ← ここで例外を吸収
          if (arr.length === 0) {
            console.warn('timeseries unreadable or empty:', h);
          }
        }
      }catch{
        console.warn('timeseries fetch failed:', h);
      }
      // 正規化：{t, followers} のみ
      const norm = arr.map(x=>({ 
        t:String(x?.t ?? x?.time ?? x?.date ?? ''), 
        followers: Number(x?.followers ?? x?.count ?? x?.value)
      })).filter(x=>x.t && !Number.isNaN(x.followers));
      state.series.set(h, norm);
    }));
    // series 構築直後に実行（初回 DOM 未生成でも後でまた呼ぶのでOK）
    try { applyCounts(); } catch {}
   renderChips(handles);
   }

  // --- deterministic color palette (global) ---
  function colorFor(handle){
    const palette = ['#f26d6d','#6db3f2','#f2c26d','#7bd389','#b28df2','#f28def','#6df2d0','#d3f26d','#f29e6d','#6d8ff2'];
    let h = 2166136261>>>0; // FNV-1a
    for(let i=0;i<handle.length;i++){ h ^= handle.charCodeAt(i); h = Math.imul(h, 16777619); }
    return palette[Math.abs(h)%palette.length];
  }

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
     
   function applyCounts(){
   // 表示用：期間ラベル（range → 日本語ラベル）
   const RANGE_LABEL = {
      '1h': '1時間',
      '1d': '1日',
      '1m': '当月'
    };
    // 各店舗
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
        const f = new Intl.DateTimeFormat('ja-JP', {
          timeZone: 'Asia/Tokyo', hour12: false,
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit'
        }).formatToParts(d).reduce((o,p)=> (o[p.type]=p.value, o), {});
        $u.textContent = `${f.year}/${f.month}/${f.day} ${f.hour}:${f.minute} JST`;
         // Δ（選択レンジの増減）：欠測は0化せず、ウィンドウ内の最初と最後のみで算出
        try {
          const win = pickWindow(arr, state.range);
          let diff = NaN;
          // 通常：ウィンドウ内の最初と最後
          if (Array.isArray(win) && win.length >= 2) {
            diff = (win[win.length - 1].v) - (win[0].v);
          } else if (state.range === '1h') {
            // 1時間だけは「直近6時間以内の2点」をフォールバック
            const now = Date.now();
            const cut = now - 6*3600e3;
            const recent = arr.map(x=>({ t:new Date(x.t).getTime(), v:x.followers }))
                              .filter(x=>Number.isFinite(x.t) && x.t<=now && x.t>=cut)
                              .sort((a,b)=>a.t-b.t);
            if (recent.length >= 2) {
              diff = (recent[recent.length-1].v) - (recent[0].v);
            } else if (arr.length >= 1) {
              // 1点以下でも、1時間表示はラベル付きで0表示にする
              diff = 0;
            }
          }
          if ($d) {
            const lbl = RANGE_LABEL[state.range] || state.range;
            if (Number.isNaN(diff)) {
              $d.textContent = '';
            } else {
              $d.textContent = `(${diff>0?'+':''}${Number(diff).toLocaleString()} / ${lbl})`;
            }
          }
        } catch {}
      }else{
        $c.textContent = '—';
        $u.textContent = '';
        if($d) $d.textContent = '';
      }
     // スパークライン描画
      const $sp = document.querySelector(`.sparkline[data-h="${h}"]`);
      if($sp) drawSparkline($sp, arr);      
    });
    // 全店（ALL）: 表示用スナップショットは「各店ウィンドウを個別に合算」
    try {
      const $c = document.querySelector(`.count[data-h="ALL"]`);
      const $u = document.querySelector(`.updated[data-h="ALL"]`);
      const $d = document.querySelector(`.delta[data-h="ALL"]`);
      if ($c) {
        const acc = state.accounts.reduce((sum, h) => {
          const arr = state.series.get(h) || [];
          const win = pickWindow(arr, state.range);
          if (Array.isArray(win) && win.length) {
            const first = win[0];
            const last  = win[win.length - 1];
            sum.first   += Number(first.v) || 0;
            sum.last    += Number(last.v)  || 0;
            sum.tLatest  = Math.max(sum.tLatest, Number(last.t) || 0);
          }
          return sum;
        }, { first: 0, last: 0, tLatest: 0 });

        // 現在値
        $c.textContent = Number(acc.last).toLocaleString();
        // 最終更新（各店の最後の時刻の最大）
        if ($u && acc.tLatest > 0) {
          const d = new Date(acc.tLatest);
          const f = new Intl.DateTimeFormat('ja-JP', {
            timeZone: 'Asia/Tokyo', hour12: false,
            year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'
          }).formatToParts(d).reduce((o,p)=> (o[p.type]=p.value, o), {});
          $u.textContent = `${f.year}/${f.month}/${f.day} ${f.hour}:${f.minute} JST`;
        }
        // Δ（期間ウィンドウの最初と最後の合算）— 1時間はフォールバック
        if ($d) {
          let diffAll = acc.last - acc.first;
          if ((Number.isNaN(diffAll) || !Number.isFinite(diffAll)) && state.range==='1h') {
            // 1hで全店合算が定義しづらい場合は0表示（視認性優先）
            diffAll = 0;
          }
          const lbl = RANGE_LABEL[state.range] || state.range;
          if (Number.isNaN(diffAll)) $d.textContent = '';
          else $d.textContent = `(${diffAll>0?'+':''}${Number(diffAll).toLocaleString()} / ${lbl})`;
        }  
      }
      // スパークラインは従来どおり compose() で合成線を描画（表示目的）
      const allForSpark = compose(state.range);
      const $spAll = document.querySelector('.sparkline[data-h="ALL"]');
      if ($spAll && allForSpark.length) {
        const arrForSpark = allForSpark.map(x => ({
          t: new Date(x.t).toISOString(),
          followers: x.v
        }));
        drawSparkline($spAll, arrForSpark);
      }
    } catch (err) {
      console.warn('applyCounts(ALL) failed:', err);
    }

     // 数値クリックで短縮/通常切替
    document.querySelectorAll('.count').forEach(el=>{
      el.addEventListener('click', ()=>{
        const txt = el.textContent.replace(/[(),]/g,'');
        const num = Number(txt);
        if(Number.isNaN(num)) return;
        if(el.dataset.mode==='short'){
          el.textContent = num.toLocaleString();
          el.dataset.mode='full';
        }else{
          el.textContent = shorten(num);
          el.dataset.mode='short';
        }
      });
    });
   }

  // --- helper: shorten number (e.g., 1200 → 1.2k) ---
  function shorten(n){
    if(n>=1e9) return (n/1e9).toFixed(1).replace(/\.0$/,'')+'B';
    if(n>=1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'')+'M';
    if(n>=1e3) return (n/1e3).toFixed(1).replace(/\.0$/,'')+'k';
    return n.toLocaleString();
  }

  // --- sparkline ---
  function drawSparkline(canvas, arr){
    if(!canvas || !arr?.length) return;
    const ctx = canvas.getContext('2d');
    const W=canvas.width, H=canvas.height;
    ctx.clearRect(0,0,W,H);
    const rows = arr.map(x=>({t:new Date(x.t).getTime(),v:x.followers}))
                    .filter(x=>Number.isFinite(x.t));
    if(rows.length<2) return;
    const xs=rows.map(x=>x.t), ys=rows.map(x=>x.v);
    const xmin=Math.min(...xs), xmax=Math.max(...xs);
    const ymin=Math.min(...ys), ymax=Math.max(...ys);
    const x=t=> (t-xmin)/(xmax-xmin)*W;
    const y=v=> H-( (v-ymin)/(ymax-ymin)*H );
    ctx.beginPath();
    rows.forEach((p,i)=> i?ctx.lineTo(x(p.t),y(p.v)):ctx.moveTo(x(p.t),y(p.v)));
    ctx.strokeStyle='#6ad1e3';
    ctx.lineWidth=1.5;
    ctx.globalAlpha=0.8;
    ctx.stroke();
  }

  function pickWindow(arr, range){
    const now = Date.now();
  // (unused vars removed)
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
    // === 改良版: 時間単位で丸めて合計 ===
    const bucket = new Map(); // key: floor(t / interval)
    const arrAll = [];
    const now = Date.now();
    const rangeKey = range || '1h';
    const interval = (rangeKey==='1h') ? 60*60e3 :
                     (rangeKey==='1d') ? 3600e3 :
                     86400e3; // 1m → 日単位

    state.accounts.forEach(h=>{
      const series = state.series.get(h) || [];
      pickWindow(series, rangeKey).forEach(p=>{
        const key = Math.floor(p.t / interval) * interval;
        bucket.set(key, (bucket.get(key) ?? 0) + p.v);
      });
    });

    bucket.forEach((v,t)=> arrAll.push({ t, v }));
    arrAll.sort((a,b)=>a.t-b.t);
    return arrAll;
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
   // bars (diff layer): 隣接差分を棒で可視化（専用スケール）
    if (data.length >= 2) {
      // 隣接差分系列 [{t, d}]
      const diffs = [];
      for (let i = 1; i < data.length; i++) {
        diffs.push({ t: data[i].t, d: data[i].v - data[i - 1].v });
      }
      const dvals = diffs.map(o => o.d);
      const dmin = Math.min(...dvals);
      const dmax = Math.max(...dvals);
      // ゼロ基線を必ず含むスケール
      const ymin2 = Math.min(0, dmin), ymax2 = Math.max(0, dmax);
      const y2 = v => T + (H - T - B) * (1 - ((v - ymin2) / Math.max(1, (ymax2 - ymin2))));
      const y0 = y2(0);
      // 棒の幅（点数に応じて自動調整）
      const colW = Math.max(1, ((W - L - R) / Math.max(2, diffs.length)) * 0.6);
      ctx.save();
      ctx.globalAlpha = 0.35;
      diffs.forEach(pt => {
        const cx = x(pt.t); // 中心X（総数と同一の時間座標）
        const yy = y2(pt.d);
        const top = Math.min(y0, yy);
        const h   = Math.abs(y0 - yy);
        // 正: 青緑系 / 負: ピンク系（判別しやすい色）
        ctx.fillStyle = (pt.d >= 0) ? '#8ad1a3' : '#f28d8d';
        ctx.fillRect(cx - colW / 2, top, colW, Math.max(1, h));
      });
      ctx.restore();
    }

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

  /** === dashboard === */
  function openDashboard(handle){
    state.target = handle || 'ALL';
    renderDashboard(state.target);
    if ($dash){
      $dash.hidden = false;
      $dash.classList.add('is-open');
    }
  }
  function renderDashboard(target){
    if(!$dash) return;
    // 最小実装：タイトルと主要値のみ（詳細グラフは既存 draw/compose を流用して後続拡張）
    let title = (target==='ALL') ? '全店ダッシュボード' : `@${target} のダッシュボード`;
    let count = '—', delta = '';
    if (target === 'ALL') {
      // === ダッシュボードはカードの値をそのまま再利用 ===
      const $count = document.querySelector('.count[data-h="ALL"]');
      const $delta = document.querySelector('.delta[data-h="ALL"]');
      if ($count) count = $count.textContent;
      if ($delta) delta = $delta.textContent;
    } else {
       const arr = state.series.get(target)||[];
      const win = pickWindow(arr, state.range);
      if(win.length>=1){
        const first = win[0].v, last = win[win.length-1].v;
        count = Number(last).toLocaleString();
        const diff = last-first;
        delta = (diff===0||Number.isNaN(diff))? '' : `(${diff>0?'+':''}${diff.toLocaleString()})`;
      }
    }
    // === ランキング用データ作成（現在のレンジに連動） ===
    const records = state.accounts.map(h=>{
      const arr = state.series.get(h)||[];
      const win = pickWindow(arr, state.range);
      let diff = NaN;
      if (Array.isArray(win) && win.length >= 2) {
        diff = (win[win.length-1].v) - (win[0].v);
      } else if (state.range === '1h') {
        // 1時間だけは“見える化”優先で0にフォールバック
        diff = 0;
      }
      return { h, diff: Number(diff) };
    }).filter(x=>Number.isFinite(x.diff));
    // 上位3／下位3
    const top3  = [...records].sort((a,b)=>b.diff-a.diff).slice(0,3);
    const worst3= [...records].sort((a,b)=>a.diff-b.diff).slice(0,3);

    // === ダッシュボード描画 ===
    $dash.innerHTML = `
      <h2 style="margin:0 0 8px 0;font-size:18px;">${title}</h2>
      <div style="font-size:14px;display:flex;gap:8px;align-items:baseline;margin-bottom:8px;">
        <span style="font-weight:700;font-size:22px;">${count}</span>
        <span>${delta}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <div style="font-weight:600;margin-bottom:4px;">増加 上位3</div>
          <ol style="margin:0;padding-left:18px;">
            ${top3.map(x=>`<li class="rank-item" data-h="${x.h}" style="cursor:pointer;line-height:1.6;">
              <span style="display:inline-block;min-width:7em;">@${x.h}</span>
              <strong>${x.diff>0?'+':''}${x.diff.toLocaleString()}</strong>
            </li>`).join('')}
          </ol>
        </div>
        <div>
          <div style="font-weight:600;margin-bottom:4px;">減少 下位3</div>
          <ol style="margin:0;padding-left:18px;">
            ${worst3.map(x=>`<li class="rank-item" data-h="${x.h}" style="cursor:pointer;line-height:1.6;">
              <span style="display:inline-block;min-width:7em;">@${x.h}</span>
              <strong>${x.diff>0?'+':''}${x.diff.toLocaleString()}</strong>
            </li>`).join('')}
          </ol>
        </div>
      </div>
      <div style="margin-top:8px;font-size:12px;color:#789;">
        ※ 行をクリックすると、その店舗の線をメインチャートにオーバーレイ表示します。
      </div>
    `;
    // クリックでオーバーレイ線のトグル
    $dash.querySelectorAll('.rank-item').forEach(el=>{
      el.addEventListener('click', ()=>{
        const h = el.getAttribute('data-h');
        if (!h) return;
        if (state.overlays.has(h)) state.overlays.delete(h); else state.overlays.add(h);
        // chipsの見た目も同期
        const active = state.overlays.has(h);
        document.querySelectorAll(\`.chip[data-h="\${h}"]\`).forEach(c=>c.classList.toggle('active', active));
        draw();
      });
    });
   `;
  }
})();
