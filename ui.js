// Functions in this file are injected into pages via chrome.scripting.
// They are serialised by source, so each one must be fully self-contained —
// no imports, no references to module scope.

// Rename dialog. Resolves to the new title, '' to clear, or null on cancel.
export function renamePrompt(current) {
  return new Promise((resolve) => {
    const old = document.getElementById('__arcBitsDialog');
    if (old) old.remove();

    const host = document.createElement('div');
    host.id = '__arcBitsDialog';
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        .backdrop {
          position: fixed; inset: 0; display: flex;
          align-items: flex-start; justify-content: center;
          padding-top: 16vh; background: rgba(0,0,0,.28);
          font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .card { background:#fff; color:#1a1a1a; border-radius:12px;
                box-shadow:0 12px 48px rgba(0,0,0,.3); padding:16px;
                width:min(460px,88vw); }
        label { display:block; font-size:11px; text-transform:uppercase;
                letter-spacing:.06em; opacity:.55; margin-bottom:8px; }
        input { width:100%; box-sizing:border-box; font:inherit; font-size:15px;
                padding:9px 11px; border:1px solid rgba(0,0,0,.18);
                border-radius:8px; background:#fff; color:inherit; outline:none; }
        input:focus { border-color:#4b8bf5; box-shadow:0 0 0 3px rgba(75,139,245,.22); }
        .hint { margin-top:9px; font-size:11.5px; opacity:.5; }
        @media (prefers-color-scheme: dark) {
          .card { background:#232326; color:#f2f2f4; }
          input { background:rgba(255,255,255,.06); border-color:rgba(255,255,255,.16); }
        }
      </style>
      <div class="backdrop"><div class="card">
        <label>Rename tab</label>
        <input type="text" spellcheck="false" />
        <div class="hint">Enter to save · empty to restore original · Esc to cancel</div>
      </div></div>`;

    (document.body || document.documentElement).appendChild(host);
    const input = root.querySelector('input');
    input.value = current || '';
    input.focus();
    input.select();

    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      host.remove();
      resolve(v);
    };

    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(input.value.trim());
      if (e.key === 'Escape') finish(null);
    });
    const bd = root.querySelector('.backdrop');
    bd.addEventListener('mousedown', (e) => {
      if (e.target === bd) finish(null);
    });
  });
}

// Yes/no dialog. Resolves true only on an explicit confirm.
export function confirmPrompt(heading, detail, confirmLabel) {
  return new Promise((resolve) => {
    const old = document.getElementById('__arcBitsConfirm');
    if (old) old.remove();

    const host = document.createElement('div');
    host.id = '__arcBitsConfirm';
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        .backdrop {
          position: fixed; inset: 0; display: flex;
          align-items: flex-start; justify-content: center;
          padding-top: 18vh; background: rgba(0,0,0,.28);
          font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .card { background:#fff; color:#1a1a1a; border-radius:12px;
                box-shadow:0 12px 48px rgba(0,0,0,.3); padding:18px;
                width:min(420px,88vw); }
        h2 { margin:0 0 6px; font-size:15px; font-weight:600; }
        p  { margin:0 0 16px; font-size:13px; opacity:.62; }
        .row { display:flex; gap:8px; justify-content:flex-end; }
        button { font:inherit; font-size:13px; padding:7px 14px;
                 border-radius:7px; cursor:pointer; border:1px solid transparent; }
        .cancel { background:transparent; color:inherit; border-color:rgba(0,0,0,.18); }
        .go { background:#c0392b; color:#fff; }
        .go:focus-visible, .cancel:focus-visible { outline:2px solid #4b8bf5; outline-offset:2px; }
        @media (prefers-color-scheme: dark) {
          .card { background:#232326; color:#f2f2f4; }
          .cancel { border-color:rgba(255,255,255,.2); }
        }
      </style>
      <div class="backdrop"><div class="card">
        <h2></h2><p></p>
        <div class="row">
          <button class="cancel">Cancel</button>
          <button class="go"></button>
        </div>
      </div></div>`;

    root.querySelector('h2').textContent = heading;
    root.querySelector('p').textContent = detail;
    root.querySelector('.go').textContent = confirmLabel;

    (document.body || document.documentElement).appendChild(host);
    const go = root.querySelector('.go');
    go.focus();

    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      host.remove();
      resolve(v);
    };

    go.addEventListener('click', () => finish(true));
    root.querySelector('.cancel').addEventListener('click', () => finish(false));
    root.querySelector('.backdrop').addEventListener('keydown', (e) => {
      e.stopPropagation();
      // Enter is left to the focused button's native activation, so tabbing to
      // Cancel and pressing Enter cancels rather than confirms.
      if (e.key === 'Escape') finish(false);
    });
  });
}

// Group picker. `groups` is [{id, title, color}].
// Resolves {groupId} to move into an existing group, {create: title} to make a
// new one, or null on cancel.
export function groupPicker(groups, currentGroupId) {
  return new Promise((resolve) => {
    const COLORS = {
      grey: '#9aa0a6', blue: '#4b8bf5', red: '#e05a4f', yellow: '#e8b53a',
      green: '#3aa757', pink: '#e06ba0', purple: '#a562d4',
      cyan: '#1eaaa0', orange: '#e08a3c',
    };

    const old = document.getElementById('__arcBitsPicker');
    if (old) old.remove();

    const host = document.createElement('div');
    host.id = '__arcBitsPicker';
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        .backdrop {
          position: fixed; inset: 0; display: flex;
          align-items: flex-start; justify-content: center;
          padding-top: 15vh; background: rgba(0,0,0,.28);
          font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .card { background:#fff; color:#1a1a1a; border-radius:12px;
                box-shadow:0 12px 48px rgba(0,0,0,.3); padding:14px;
                width:min(440px,88vw); }
        input { width:100%; box-sizing:border-box; font:inherit; font-size:15px;
                padding:9px 11px; border:1px solid rgba(0,0,0,.18);
                border-radius:8px; background:#fff; color:inherit; outline:none; }
        input:focus { border-color:#4b8bf5; box-shadow:0 0 0 3px rgba(75,139,245,.22); }
        ul { list-style:none; margin:10px 0 0; padding:0;
             max-height:260px; overflow-y:auto; }
        li { display:flex; align-items:center; gap:9px; padding:8px 10px;
             border-radius:7px; cursor:pointer; font-size:13.5px; }
        li[aria-selected="true"] { background:rgba(75,139,245,.15); }
        .dot { width:9px; height:9px; border-radius:50%; flex:none; }
        .name { flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .tag { font-size:11px; opacity:.5; }
        .hint { margin-top:10px; font-size:11.5px; opacity:.5; }
        @media (prefers-color-scheme: dark) {
          .card { background:#232326; color:#f2f2f4; }
          input { background:rgba(255,255,255,.06); border-color:rgba(255,255,255,.16); }
          li[aria-selected="true"] { background:rgba(120,165,255,.22); }
        }
      </style>
      <div class="backdrop"><div class="card">
        <input type="text" spellcheck="false" placeholder="Move to group…" />
        <ul></ul>
        <div class="hint">↑↓ to choose · Enter to move · type a new name to create · Esc to cancel</div>
      </div></div>`;

    (document.body || document.documentElement).appendChild(host);
    const input = root.querySelector('input');
    const list = root.querySelector('ul');

    let rows = [];
    let cursor = 0;

    const render = () => {
      const q = input.value.trim().toLowerCase();
      const matches = groups.filter(
        (g) => !q || (g.title || '').toLowerCase().includes(q)
      );

      rows = matches.map((g) => ({ kind: 'move', group: g }));
      const exact = matches.some(
        (g) => (g.title || '').toLowerCase() === q
      );
      if (q && !exact) rows.push({ kind: 'create', title: input.value.trim() });

      if (cursor >= rows.length) cursor = Math.max(0, rows.length - 1);

      list.textContent = '';
      rows.forEach((row, i) => {
        const li = document.createElement('li');
        li.setAttribute('aria-selected', String(i === cursor));

        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background =
          row.kind === 'create' ? 'transparent' : COLORS[row.group.color] || '#9aa0a6';
        if (row.kind === 'create') dot.style.boxShadow = 'inset 0 0 0 1.5px currentColor';
        li.appendChild(dot);

        const name = document.createElement('span');
        name.className = 'name';
        name.textContent =
          row.kind === 'create'
            ? `Create “${row.title}”`
            : row.group.title || 'Untitled group';
        li.appendChild(name);

        if (row.kind === 'move' && row.group.id === currentGroupId) {
          const tag = document.createElement('span');
          tag.className = 'tag';
          tag.textContent = 'current';
          li.appendChild(tag);
        }

        li.addEventListener('mouseenter', () => {
          cursor = i;
          render();
        });
        li.addEventListener('click', () => choose(i));
        list.appendChild(li);
      });
    };

    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      host.remove();
      resolve(v);
    };
    const choose = (i) => {
      const row = rows[i];
      if (!row) return;
      finish(row.kind === 'create' ? { create: row.title } : { groupId: row.group.id });
    };

    input.addEventListener('input', () => {
      cursor = 0;
      render();
    });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        cursor = Math.min(cursor + 1, rows.length - 1);
        render();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        cursor = Math.max(cursor - 1, 0);
        render();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        choose(cursor);
      } else if (e.key === 'Escape') {
        finish(null);
      }
    });
    const bd = root.querySelector('.backdrop');
    bd.addEventListener('mousedown', (e) => {
      if (e.target === bd) finish(null);
    });

    render();
    input.focus();
  });
}

export function showToast(text) {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = [
    'all:initial', 'position:fixed', 'bottom:22px', 'left:50%',
    'transform:translateX(-50%)', 'z-index:2147483647',
    'background:rgba(20,20,22,.93)', 'color:#fff', 'padding:9px 16px',
    'border-radius:9px',
    'font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'box-shadow:0 6px 24px rgba(0,0,0,.34)', 'pointer-events:none',
    'opacity:0', 'transition:opacity .13s ease',
  ].join(';');
  (document.body || document.documentElement).appendChild(el);
  requestAnimationFrame(() => (el.style.opacity = '1'));
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 200);
  }, 1100);
}
