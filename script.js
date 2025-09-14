(async function main(){
  const $cards = document.getElementById('cards');
  const $openAll = document.getElementById('open-all');
  try{
    const res = await fetch('./accounts.json', { cache:'no-cache' });
    const data = await res.json();
    const list = Array.isArray(data.accounts) ? data.accounts : [];
    render(list);
    $openAll.addEventListener('click', () => openAll(list));
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
  }
  function cardHTML(handle){
    const url = `https://www.instagram.com/${handle}/`;
    return `
      <article class="card">
        <div class="handle">@${handle}</div>
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
+})();
