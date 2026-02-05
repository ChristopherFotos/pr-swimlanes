const boardEl = document.getElementById('board');
const modal = document.getElementById('modal');
const form = document.getElementById('cardForm');
const boardModal = document.getElementById('boardModal');
const boardForm = document.getElementById('boardForm');

const newCardBtn = document.getElementById('newCardBtn');
const newBoardBtn = document.getElementById('newBoardBtn');
const refreshBtn = document.getElementById('refreshBtn');
const deleteBtn = document.getElementById('deleteBtn');
const cancelBtn = document.getElementById('cancelBtn');
const modalTitle = document.getElementById('modalTitle');
const currentBoardLabel = document.getElementById('currentBoardLabel');
const boardCancelBtn = document.getElementById('boardCancelBtn');
const addChecklistBtn = document.getElementById('addChecklistBtn');
const addLinkBtn = document.getElementById('addLinkBtn');

const fields = {
  id: document.getElementById('cardId'),
  lane: document.getElementById('lane'),
  jiraKey: document.getElementById('jiraKey'),
  jiraTitle: document.getElementById('jiraTitle'),
  jiraUrl: document.getElementById('jiraUrl'),
  prTitle: document.getElementById('prTitle'),
  prUrl: document.getElementById('prUrl'),
  notes: document.getElementById('notes'),
  buildGeneratedGivenToQE: document.getElementById('buildGeneratedGivenToQE'),
  androidBuild: document.getElementById('androidBuild'),
  androidBuildUrl: document.getElementById('androidBuildUrl'),
  iosBuild: document.getElementById('iosBuild'),
  iosBuildUrl: document.getElementById('iosBuildUrl'),
  oneApproval: document.getElementById('oneApproval'),
  twoApprovals: document.getElementById('twoApprovals'),
  qeApprove: document.getElementById('qeApprove')
};

const boardFields = {
  name: document.getElementById('boardName'),
  slug: document.getElementById('boardSlug')
};

const CHECKLIST_KEYS = [
  'buildGeneratedGivenToQE',
  'androidBuild',
  'iosBuild',
  'oneApproval',
  'twoApprovals',
  'qeApprove'
];

let state = { lanes: [], cards: [] };
let draggingId = null;
const currentBoardSlug = getBoardSlugFromPath();
let laneWidths = null;

function getBoardSlugFromPath() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts[0] === 'board' && parts[1]) {
    return decodeURIComponent(parts[1]);
  }
  return 'default';
}

function laneWidthsKey() {
  return `laneWidths:${currentBoardSlug}`;
}

function loadLaneWidths() {
  try {
    const raw = localStorage.getItem(laneWidthsKey());
    laneWidths = raw ? JSON.parse(raw) : null;
  } catch {
    laneWidths = null;
  }
}

function saveLaneWidths() {
  if (!laneWidths) return;
  localStorage.setItem(laneWidthsKey(), JSON.stringify(laneWidths));
}

function applyLaneWidths() {
  if (!laneWidths || !Array.isArray(laneWidths) || laneWidths.length === 0) {
    boardEl.style.gridTemplateColumns = '';
    return;
  }
  const cols = state.lanes.map((_, idx) => {
    const w = laneWidths[idx];
    return typeof w === 'number' && w > 0 ? `${w}px` : 'minmax(260px, 1fr)';
  });
  boardEl.style.gridTemplateColumns = cols.join(' ');
}

function isCollapsed(card) {
  return !!card.collapsed;
}

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

function checklistSummary(c) {
  const done = CHECKLIST_KEYS.filter((key) => c.checklist?.[key]).length;
  const total = CHECKLIST_KEYS.length;
  return `${done}/${total}`;
}

function safeText(s) {
  return (s || '').toString();
}

function escapeHtml(input) {
  return safeText(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInlineMarkdown(text) {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return html;
}

function renderMarkdownWithTasks(markdown) {
  const lines = safeText(markdown).split('\n');
  let html = '';
  let inParagraph = false;
  let inList = false;

  const closeParagraph = () => {
    if (inParagraph) {
      html += '</p>';
      inParagraph = false;
    }
  };

  const closeList = () => {
    if (inList) {
      html += '</ul>';
      inList = false;
    }
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      closeParagraph();
      closeList();
      return;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      closeParagraph();
      closeList();
      const level = headingMatch[1].length;
      html += `<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`;
      return;
    }

    const taskMatch = line.match(/^(\s*)[-*+]\s+\[( |x|X)\]\s+(.*)$/);
    if (taskMatch) {
      closeParagraph();
      if (!inList) {
        html += '<ul class="mdList">';
        inList = true;
      }
      const indentSpaces = taskMatch[1].length;
      const depth = Math.floor(indentSpaces / 2);
      const checked = taskMatch[2].toLowerCase() === 'x';
      const content = renderInlineMarkdown(taskMatch[3]);
      html += `
        <li class="mdTask ${checked ? 'done' : ''}" style="margin-left: ${depth * 16}px">
          <label class="mdTaskLabel">
            <input class="mdTaskToggle" type="checkbox" data-md-line="${idx}" ${checked ? 'checked' : ''} />
            <span>${content}</span>
          </label>
        </li>
      `;
      return;
    }

    const listMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (listMatch) {
      closeParagraph();
      if (!inList) {
        html += '<ul class="mdList">';
        inList = true;
      }
      const indentSpaces = listMatch[1].length;
      const depth = Math.floor(indentSpaces / 2);
      html += `<li style="margin-left: ${depth * 16}px">${renderInlineMarkdown(listMatch[2])}</li>`;
      return;
    }

    closeList();
    if (!inParagraph) {
      html += '<p>';
      inParagraph = true;
    } else {
      html += '<br />';
    }
    html += renderInlineMarkdown(trimmed);
  });

  closeParagraph();
  closeList();

  return html || '<span class="emptyNote">—</span>';
}

function toggleMarkdownTask(notes, lineIndex, isChecked) {
  const lines = safeText(notes).split('\n');
  if (lineIndex < 0 || lineIndex >= lines.length) return notes;
  const line = lines[lineIndex];
  const match = line.match(/^(\s*[-*+]\s+\[)( |x|X)(\]\s+)(.*)$/);
  if (!match) return notes;
  const next = `${match[1]}${isChecked ? 'x' : ' '}${match[3]}${match[4]}`;
  lines[lineIndex] = next;
  return lines.join('\n');
}

function renderChecklistItem({ label, done, url, key }) {
  const labelText = url
    ? `<a href="${safeText(url)}" target="_blank" rel="noreferrer">${label}</a>`
    : label;
  return `
    <li class="checkItem ${done ? 'done' : ''}">
      <label class="checkToggle">
        <input type="checkbox" data-check-key="${key}" ${done ? 'checked' : ''} />
        <span class="checkLabel">${labelText}</span>
      </label>
    </li>
  `;
}

function render() {
  boardEl.innerHTML = '';
  currentBoardLabel.textContent = `Board: ${currentBoardSlug}`;
  applyLaneWidths();

  for (const lane of state.lanes) {
    const laneIndex = state.lanes.indexOf(lane);
    const laneCards = state.cards.filter(c => c.lane === lane);

    const laneEl = document.createElement('section');
    laneEl.className = 'lane';
    laneEl.dataset.index = laneIndex;

    const header = document.createElement('div');
    header.className = 'laneHeader';
    header.innerHTML = `
      <div class="laneTitle">${lane}</div>
      <div class="laneCount">${laneCards.length}</div>
      <div class="laneResize" data-resize-handle="true" title="Drag to resize"></div>
    `;

    const dropzone = document.createElement('div');
    dropzone.className = 'dropzone';
    dropzone.dataset.lane = lane;

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    dropzone.addEventListener('drop', async (e) => {
      e.preventDefault();
      if (!draggingId) return;
      await moveCard(draggingId, lane);
      draggingId = null;
    });

    for (const card of laneCards) {
      dropzone.appendChild(renderCard(card));
    }

    laneEl.appendChild(header);
    laneEl.appendChild(dropzone);
    boardEl.appendChild(laneEl);

    const resizeHandle = header.querySelector('[data-resize-handle="true"]');
    if (resizeHandle) {
      resizeHandle.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!laneWidths || !Array.isArray(laneWidths)) {
          laneWidths = state.lanes.map(() => null);
        }
        const startX = event.clientX;
        const startWidth = laneEl.getBoundingClientRect().width;
        const minWidth = 220;

        const onMove = (moveEvent) => {
          const delta = moveEvent.clientX - startX;
          const nextWidth = Math.max(minWidth, startWidth + delta);
          laneWidths[laneIndex] = Math.round(nextWidth);
          applyLaneWidths();
        };

        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          saveLaneWidths();
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });
    }
  }
}

function renderCard(card) {
  const el = document.createElement('article');
  el.className = 'card';
  el.draggable = true;
  el.dataset.id = card.id;
  if (isCollapsed(card)) {
    el.classList.add('collapsed');
  }

  const jiraLine = card.jira?.url
    ? `<a href="${card.jira.url}" target="_blank" rel="noreferrer">${safeText(card.jira.key || 'JIRA')}</a> — ${safeText(card.jira.title)}`
    : `${safeText(card.jira?.key)} — ${safeText(card.jira?.title)}`;

  const prLine = card.pr?.url
    ? `<a href="${card.pr.url}" target="_blank" rel="noreferrer">PR</a> — ${safeText(card.pr.title)}`
    : safeText(card.pr?.title);

  const checklistItems = [
    {
      label: 'Build generated, given to QE',
      done: !!card.checklist.buildGeneratedGivenToQE,
      key: 'buildGeneratedGivenToQE'
    },
    {
      label: 'Android build',
      done: !!card.checklist.androidBuild,
      url: card.checklist.androidBuildUrl || '',
      key: 'androidBuild'
    },
    {
      label: 'iOS build',
      done: !!card.checklist.iosBuild,
      url: card.checklist.iosBuildUrl || '',
      key: 'iosBuild'
    },
    {
      label: '1 approval',
      done: !!card.checklist.oneApproval,
      key: 'oneApproval'
    },
    {
      label: '2 approvals',
      done: !!card.checklist.twoApprovals,
      key: 'twoApprovals'
    },
    {
      label: 'qe-approve',
      done: !!card.checklist.qeApprove,
      key: 'qeApprove'
    }
  ];

  el.innerHTML = `
    <div class="cardHeader">
      <div class="cardTitle">${safeText(card.jira?.key || card.pr?.title || 'Untitled')}</div>
      <button class="collapseBtn" type="button" aria-label="Collapse card" data-collapse="toggle">
        ${isCollapsed(card) ? 'Expand' : 'Collapse'}
      </button>
    </div>
    <div class="meta">
      <div>${jiraLine}</div>
      <div>${prLine}</div>
      <div>Checklist: ${checklistSummary(card)} · Updated: ${new Date(card.updatedAt).toLocaleString()}</div>
    </div>
    <div class="cardBody">
      <div class="sectionTitle">Notes</div>
      <div class="notes markdown">${renderMarkdownWithTasks(card.notes)}</div>
      <div class="sectionTitle">Checklist</div>
      <ul class="checklist">
        ${checklistItems.map(renderChecklistItem).join('')}
      </ul>
    </div>
    <div class="tags">
      ${card.checklist.qeApprove ? '<span class="tag">QE ✅</span>' : ''}
      ${card.checklist.twoApprovals ? '<span class="tag">2 approvals ✅</span>' : ''}
      ${card.checklist.oneApproval && !card.checklist.twoApprovals ? '<span class="tag">1 approval</span>' : ''}
      ${card.checklist.buildGeneratedGivenToQE ? '<span class="tag">Build sent</span>' : ''}
      ${card.notes ? '<span class="tag">Notes</span>' : ''}
    </div>
  `;

  el.addEventListener('click', () => openModal(card));
  el.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', (event) => event.stopPropagation());
  });
  el.querySelectorAll('.mdTaskToggle').forEach((input) => {
    input.addEventListener('click', (event) => event.stopPropagation());
    input.addEventListener('change', async (event) => {
      event.stopPropagation();
      const lineIndex = Number(input.dataset.mdLine);
      const updatedNotes = toggleMarkdownTask(card.notes || '', lineIndex, input.checked);
      await api(`/api/cards/${encodeURIComponent(card.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ notes: updatedNotes })
      });
      await load();
    });
  });
  const collapseBtn = el.querySelector('[data-collapse="toggle"]');
  if (collapseBtn) {
    collapseBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      el.classList.toggle('collapsed');
      const isCollapsedNow = el.classList.contains('collapsed');
      collapseBtn.textContent = isCollapsedNow ? 'Expand' : 'Collapse';
      api(`/api/cards/${encodeURIComponent(card.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ collapsed: isCollapsedNow })
      }).catch((err) => {
        console.error(err);
        alert(`Failed to update card: ${err.message}`);
      });
    });
  }
  el.querySelectorAll('input[type="checkbox"][data-check-key]').forEach((input) => {
    input.addEventListener('click', (event) => event.stopPropagation());
    input.addEventListener('change', async (event) => {
      event.stopPropagation();
      const key = input.dataset.checkKey;
      if (!key) return;
      await api(`/api/cards/${encodeURIComponent(card.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ checklist: { [key]: input.checked } })
      });
      await load();
    });
  });

  el.addEventListener('dragstart', () => {
    draggingId = card.id;
    el.classList.add('dragging');
  });

  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
  });

  return el;
}

async function load() {
  loadLaneWidths();
  state = await api(`/api/board/${encodeURIComponent(currentBoardSlug)}`);
  // Populate lane dropdown
  fields.lane.innerHTML = '';
  for (const l of state.lanes) {
    const opt = document.createElement('option');
    opt.value = l;
    opt.textContent = l;
    fields.lane.appendChild(opt);
  }
  render();
}

function openModal(card = null) {
  const isEdit = !!card;
  modalTitle.textContent = isEdit ? 'Edit PR' : 'New PR';
  deleteBtn.style.display = isEdit ? 'inline-flex' : 'none';

  fields.id.value = card?.id || '';
  fields.lane.value = card?.lane || 'PR ready';

  fields.jiraKey.value = card?.jira?.key || '';
  fields.jiraTitle.value = card?.jira?.title || '';
  fields.jiraUrl.value = card?.jira?.url || '';

  fields.prTitle.value = card?.pr?.title || '';
  fields.prUrl.value = card?.pr?.url || '';

  fields.notes.value = card?.notes || '';

  const cl = card?.checklist || {};
  fields.buildGeneratedGivenToQE.checked = !!cl.buildGeneratedGivenToQE;
  fields.androidBuild.checked = !!cl.androidBuild;
  fields.androidBuildUrl.value = cl.androidBuildUrl || '';
  fields.iosBuild.checked = !!cl.iosBuild;
  fields.iosBuildUrl.value = cl.iosBuildUrl || '';
  fields.oneApproval.checked = !!cl.oneApproval;
  fields.twoApprovals.checked = !!cl.twoApprovals;
  fields.qeApprove.checked = !!cl.qeApprove;

  modal.showModal();
}

function closeModal() {
  modal.close();
}

function openBoardModal() {
  boardFields.name.value = '';
  boardFields.slug.value = '';
  boardModal.showModal();
}

function closeBoardModal() {
  boardModal.close();
}

async function createBoardFromForm(e) {
  e.preventDefault();
  const payload = {
    name: boardFields.name.value.trim(),
    slug: boardFields.slug.value.trim()
  };
  const board = await api('/api/boards', { method: 'POST', body: JSON.stringify(payload) });
  window.location.href = `/board/${encodeURIComponent(board.slug)}`;
}

function formToPayload() {
  return {
    lane: fields.lane.value,
    jira: {
      key: fields.jiraKey.value.trim(),
      title: fields.jiraTitle.value.trim(),
      url: fields.jiraUrl.value.trim()
    },
    pr: {
      title: fields.prTitle.value.trim(),
      url: fields.prUrl.value.trim()
    },
    notes: fields.notes.value,
    checklist: {
      buildGeneratedGivenToQE: fields.buildGeneratedGivenToQE.checked,
      androidBuild: fields.androidBuild.checked,
      androidBuildUrl: fields.androidBuildUrl.value.trim(),
      iosBuild: fields.iosBuild.checked,
      iosBuildUrl: fields.iosBuildUrl.value.trim(),
      oneApproval: fields.oneApproval.checked,
      twoApprovals: fields.twoApprovals.checked,
      qeApprove: fields.qeApprove.checked
    }
  };
}

function getLineInfo(text, cursorIndex) {
  const before = text.slice(0, cursorIndex);
  const lineStart = before.lastIndexOf('\n') + 1;
  const lineEnd = text.indexOf('\n', cursorIndex);
  const end = lineEnd === -1 ? text.length : lineEnd;
  const line = text.slice(lineStart, end);
  return { lineStart, lineEnd: end, line };
}

function replaceRange(text, start, end, insert) {
  return text.slice(0, start) + insert + text.slice(end);
}

function insertAtCursor(textarea, insertText) {
  const { selectionStart, selectionEnd, value } = textarea;
  const nextValue = replaceRange(value, selectionStart, selectionEnd, insertText);
  const nextPos = selectionStart + insertText.length;
  textarea.value = nextValue;
  textarea.selectionStart = nextPos;
  textarea.selectionEnd = nextPos;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function handleNotesKeydown(event) {
  if (event.key === 'Enter') {
    const { selectionStart, selectionEnd, value } = event.target;
    if (selectionStart !== selectionEnd) return;
    const { line } = getLineInfo(value, selectionStart);
    const match = line.match(/^(\s*)[-*+]\s+\[( |x|X)\]\s+(.*)$/);
    if (!match) return;
    event.preventDefault();
    const indent = match[1] || '';
    insertAtCursor(event.target, `\n${indent}- [ ] `);
    return;
  }

  if (event.key === 'Tab') {
    const { selectionStart, selectionEnd, value } = event.target;
    if (selectionStart !== selectionEnd) return;
    const { lineStart, line } = getLineInfo(value, selectionStart);
    const match = line.match(/^(\s*)[-*+]\s+\[( |x|X)\]\s+(.*)$/);
    if (!match) return;
    event.preventDefault();
    const isOutdent = event.shiftKey;
    const indentSize = 2;
    if (isOutdent) {
      const currentIndent = match[1] || '';
      if (!currentIndent) return;
      const remove = Math.min(indentSize, currentIndent.length);
      const nextLine = line.slice(remove);
      event.target.value = replaceRange(value, lineStart, lineStart + line.length, nextLine);
      const nextPos = Math.max(selectionStart - remove, lineStart);
      event.target.selectionStart = nextPos;
      event.target.selectionEnd = nextPos;
      event.target.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    event.target.value = replaceRange(value, lineStart, lineStart + line.length, ' '.repeat(indentSize) + line);
    const nextPos = selectionStart + indentSize;
    event.target.selectionStart = nextPos;
    event.target.selectionEnd = nextPos;
    event.target.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function insertChecklistItem() {
  const textarea = fields.notes;
  const { selectionStart, value } = textarea;
  const { lineStart, line } = getLineInfo(value, selectionStart);
  const match = line.match(/^(\s*)[-*+]\s+\[( |x|X)\]\s+/);
  const indent = match ? (match[1] || '') : '';
  const prefix = line.trim().length === 0 ? '' : '\n';
  insertAtCursor(textarea, `${prefix}${indent}- [ ] `);
  textarea.focus();
}

function wrapSelectionWithLink() {
  const textarea = fields.notes;
  const { selectionStart, selectionEnd, value } = textarea;
  if (selectionStart === selectionEnd) {
    alert('Select text to turn into a link.');
    textarea.focus();
    return;
  }
  const selected = value.slice(selectionStart, selectionEnd);
  const url = prompt('Enter URL for link:', 'https://');
  if (!url) {
    textarea.focus();
    return;
  }
  const linkText = `[${selected}](${url.trim()})`;
  const nextValue = replaceRange(value, selectionStart, selectionEnd, linkText);
  textarea.value = nextValue;
  const nextPos = selectionStart + linkText.length;
  textarea.selectionStart = nextPos;
  textarea.selectionEnd = nextPos;
  textarea.focus();
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

async function saveCard(e) {
  e.preventDefault();
  const id = fields.id.value;
  const payload = formToPayload();

  if (id) {
    await api(`/api/cards/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) });
  } else {
    await api(`/api/boards/${encodeURIComponent(currentBoardSlug)}/cards`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  await load();
  closeModal();
}

async function removeCard() {
  const id = fields.id.value;
  if (!id) return;
  const ok = confirm('Delete this card?');
  if (!ok) return;
  await api(`/api/cards/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await load();
  closeModal();
}

async function moveCard(id, lane) {
  await api(`/api/cards/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ lane })
  });
  await load();
}

newCardBtn.addEventListener('click', () => openModal(null));
newBoardBtn.addEventListener('click', openBoardModal);
refreshBtn.addEventListener('click', load);
form.addEventListener('submit', saveCard);
deleteBtn.addEventListener('click', removeCard);
cancelBtn.addEventListener('click', closeModal);
boardForm.addEventListener('submit', createBoardFromForm);
boardCancelBtn.addEventListener('click', closeBoardModal);
fields.notes.addEventListener('keydown', handleNotesKeydown);
addChecklistBtn.addEventListener('click', insertChecklistItem);
addLinkBtn.addEventListener('click', wrapSelectionWithLink);

load().catch(err => {
  console.error(err);
  if (err.message === 'Board not found') {
    openBoardModal();
    alert(`Board "${currentBoardSlug}" not found. Create it to continue.`);
    return;
  }
  alert(`Failed to load board: ${err.message}`);
});
