// ドロワー制御：openDashboard(handle, state)
// 依存: view.js, chart-followers.js
import { renderDrawerView } from './view.js';
import { buildDrawerSeries, drawDrawerChart } from './chart-followers.js';

const JST = 'Asia/Tokyo';

function todayJST() {
  const d = new Date();
  // toLocaleStringでJSTに寄せ、再度Date化
  const s = d.toLocaleString('ja-JP', { timeZone: JST });
  const d2 = new Date(s.replace(/\//g, '-')); // Safari対策
  const y = d2.getFullYear(), m = d2.getMonth()+1, da = d2.getDate();
  return `${y}-${String(m).padStart(2,'0')}-${String(da).padStart(2,'0')}`;
}

function pickRangeToggleEl(){
  return document.querySelector('.range-toggle');
}

export function openDashboard(handle, state){
  const $dash = document.getElementById('dashboard');
  if (!$dash) return;

  // 初期化（state.drawer）
  state.target = handle || 'ALL';
  state.drawer = state.drawer || {};
  if (!state.drawer.date) state.drawer.date = todayJST();
  if (!state.drawer.tab)  state.drawer.tab  = 'trend';

  // DOM構築
  renderDrawerView($dash, { handle: state.target, date: state.drawer.date, tab: state.drawer.tab });

  // 初回描画
  renderTrend(state);

  // 開く
  $dash.hidden = false;
  $dash.classList.add('is-open');

  // イベント（重複バインド防止のため都度解除→再付与）
  hookDrawerEvents($dash, state);
  hookRangeRelay(state);
}

function renderTrend(state){
  const $dash = document.getElementById('dashboard');
  if (!$dash) return;
  const $chart = $dash.querySelector('.mini-chart');
  if (!$chart) return;
  const series = buildDrawerSeries(state, state.target, state.range, state.drawer?.date);
  drawDrawerChart($chart, series);
  // タイトル等の表示値
  const last = series.length ? series[series.length-1].v : null;
  const first = series.length ? series[0].v : null;
  const diff = (last!=null && first!=null) ? (last-first) : null;
  const $title = $dash.querySelector('.drawer-title');
  const $value = $dash.querySelector('.drawer-value');
  const $delta = $dash.querySelector('.drawer-delta');
  if ($title) $title.textContent = (state.target==='ALL') ? '全店ダッシュボード' : `@${state.target}`;
  if ($value) $value.textContent = (last==null)? '—' : Number(last).toLocaleString();
  if ($delta) $delta.textContent = (diff==null)? '' : `(${diff>0?'+':''}${Number(diff).toLocaleString()})`;
}

function hookDrawerEvents($dash, state){
  // 日付変更
  const $date = $dash.querySelector('.drawer-date');
  if ($date) {
    $date.onchange = () => {
      state.drawer.date = $date.value || state.drawer.date;
      renderTrend(state);
    };
  }
  // 日付ナビ（◀/今日/▶）
  $dash.querySelectorAll('.drawer-date-nav').forEach(btn=>{
    btn.onclick = ()=>{
      const step = btn.getAttribute('data-nav'); // "-1" | "0" | "+1"
      shiftDrawerDate(state, step);
    };
  });
  // タブ切替（今回は trend/insights の枠。insightsは後段実装）
  $dash.querySelectorAll('[data-tab]').forEach(el=>{
    el.onclick = () => {
      const tab = el.getAttribute('data-tab');
      state.drawer.tab = tab;
      // 表示切替
      $dash.querySelectorAll('.drawer-tab').forEach(p => p.classList.add('is-hidden'));
      const pane = $dash.querySelector(`.drawer-tab[data-pane="${tab}"]`);
      if (pane) pane.classList.remove('is-hidden');
      // trendタブに戻ったら再描画
      if (tab === 'trend') renderTrend(state);
    };
  });

  // 閉じる（右上×）
  const $close = $dash.querySelector('.drawer-close');
  if ($close) $close.onclick = () => {
    $dash.classList.remove('is-open');
    $dash.hidden = true;
  };
}

function hookRangeRelay(state){
  // メインの range-toggle クリック後にドロワーを追従再描画
  const $rt = pickRangeToggleEl();
  if (!$rt) return;
  // 既に付与済みなら一旦外す
  $rt.removeEventListener('click', __relayHandler, true);
  $rt.addEventListener('click', __relayHandler, true);

  function __relayHandler(){
    // script.js側で state.range が更新された後に反映
    setTimeout(()=>renderTrend(state), 0);
  }
}

// rangeに応じて日にちをシフト
function shiftDrawerDate(state, stepStr){
  const step = Number(stepStr);
  if (Number.isNaN(step)) return;
  const d = state.drawer?.date;
  if (!d) return;
  const base = new Date(d + 'T00:00:00+09:00');
  if (step === 0){
    // 今日に戻す
    const y = new Date().toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'});
    const dt = new Date(y.replace(/\//g,'-'));
    state.drawer.date = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  }else{
    const deltaDays = (state.range==='1m') ? 7*step : 1*step;
    base.setDate(base.getDate() + deltaDays);
    const yy = base.getFullYear();
    const mm = String(base.getMonth()+1).padStart(2,'0');
    const dd = String(base.getDate()).padStart(2,'0');
    state.drawer.date = `${yy}-${mm}-${dd}`;
  }
  // 画面反映
  const $date = document.querySelector('.drawer-date');
  if ($date) $date.value = state.drawer.date;
  const $dash = document.getElementById('dashboard');
  if ($dash) renderTrend(state);
}
