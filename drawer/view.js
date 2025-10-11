// ドロワーのDOMを構築（タブ・日付入力・表示領域）
// 依存なし
export function renderDrawerView($dash, { handle, date, tab }){
  const active = (name) => name === tab ? 'is-active' : '';
  const isAll = (handle === 'ALL');
  const title = isAll ? '全店ダッシュボード' : `@${handle}`;

  $dash.innerHTML = `
    <div class="drawer-head" style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
      <div>
        <div class="drawer-title" style="font-weight:700;font-size:18px;">${title}</div>
        <div style="font-size:12px;color:#789;">レンジに応じて粒度が切り替わります（1h=1時間、1d=日、1m=週）</div>
      </div>
      <button class="drawer-close" title="閉じる" aria-label="閉じる" style="border:none;background:#233; color:#fff; padding:6px 8px; border-radius:6px; cursor:pointer;">×</button>
    </div>

    <div class="drawer-toolbar" style="display:flex;align-items:center;gap:12px;margin:10px 0;">
      <label style="font-size:12px;color:#789;">日にち
        <input type="date" class="drawer-date" value="${date}" style="margin-left:6px;">
      </label>
        <div class="date-nav" style="display:flex;gap:6px;">
        <button class="drawer-date-nav" data-nav="-1" style="padding:4px 8px;border:1px solid #345;border-radius:6px;">◀ 前</button>
        <button class="drawer-date-nav" data-nav="0"  style="padding:4px 8px;border:1px solid #345;border-radius:6px;">今日</button>
        <button class="drawer-date-nav" data-nav="+1" style="padding:4px 8px;border:1px solid #345;border-radius:6px;">次 ▶</button>
      </div>
      <div style="margin-left:auto;display:flex;gap:8px;">
        <button class="drawer-tab-btn ${active('trend')}" data-tab="trend" style="padding:6px 10px;border-radius:8px;border:1px solid #345;">推移</button>
        <button class="drawer-tab-btn ${active('insights')}" data-tab="insights" style="padding:6px 10px;border-radius:8px;border:1px solid #345;">数値</button>
      </div>
    </div>

    <div class="drawer-body">
      <section class="drawer-tab ${tab==='trend'?'':'is-hidden'}" data-pane="trend">
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px;">
          <span class="drawer-value" style="font-weight:800;font-size:22px;">—</span>
          <span class="drawer-delta" style="font-size:14px;color:#9bd;"> </span>
        </div>
        <div class="mini-chart" style="position:relative;width:100%;height:220px;background:#0b1e33;border:1px solid #234;border-radius:10px;overflow:hidden;">
        <div class="mini-tip" hidden style="position:absolute;inset:auto auto 8px 8px;background:#13263f;border:1px solid #234;border-radius:6px;padding:4px 6px;font-size:12px;color:#def;"></div>
        </div>
      </section>

      <section class="drawer-tab ${tab==='insights'?'':'is-hidden'}" data-pane="insights">
        <div style="font-size:13px;color:#789;">（準備中）数値タブは後続で reach / impressions などを表示します。</div>
      </section>
    </div>
  `;
}
