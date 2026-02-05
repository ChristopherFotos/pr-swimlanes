const listEl = document.getElementById('boardsList');

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

function render(boards) {
  if (!boards.length) {
    listEl.innerHTML = '<div class="emptyNote">No boards yet.</div>';
    return;
  }

  listEl.innerHTML = boards.map((b) => `
    <div class="boardRow">
      <div class="boardInfo">
        <div class="boardName">${b.name}</div>
        <div class="boardSlug">/${b.slug}</div>
      </div>
      <div class="boardActions">
        <a class="btn small" href="/board/${encodeURIComponent(b.slug)}">Open</a>
        <button class="btn small danger" data-delete="${b.slug}">Delete</button>
      </div>
    </div>
  `).join('');

  listEl.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const slug = btn.dataset.delete;
      const ok = confirm(`Delete board "${slug}" and all its cards?`);
      if (!ok) return;
      await api(`/api/boards/${encodeURIComponent(slug)}`, { method: 'DELETE' });
      await load();
    });
  });
}

async function load() {
  const boards = await api('/api/boards');
  render(boards);
}

load().catch((err) => {
  console.error(err);
  listEl.innerHTML = `<div class="emptyNote">Failed to load: ${err.message}</div>`;
});
