const boardEl = document.getElementById('board');
const modal = document.getElementById('modal');
const form = document.getElementById('cardForm');
const boardModal = document.getElementById('boardModal');
const boardForm = document.getElementById('boardForm');
const mainEl = document.querySelector('main');

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

const dragDebug = document.createElement('div');
dragDebug.id = 'dragDebug';
dragDebug.style.cssText = [
  'position:fixed',
  'bottom:8px',
  'left:8px',
  'z-index:9999',
  'background:rgba(0,0,0,0.7)',
  'color:#fff',
  'padding:6px 8px',
  'border-radius:8px',
  'font-size:11px',
  'font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
].join(';');
document.body.appendChild(dragDebug);
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
let activeDragCardEl = null;
let lastDropLane = null;
let dragAutoScrollRaf = null;
let lastTouchX = null;
let lastPointerX = null;
let lastMouseX = null;
let prevScrollSnap = null;

function startDrag(cardId, cardEl) {
  draggingId = cardId;
  activeDragCardEl = cardEl;
  cardEl.classList.add('dragging');
  prevScrollSnap = boardEl.style.scrollSnapType;
  boardEl.style.scrollSnapType = 'none';
  boardEl.style.scrollBehavior = 'auto';
}

function endDrag() {
  if (activeDragCardEl) {
    activeDragCardEl.classList.remove('dragging');
  }
  draggingId = null;
  activeDragCardEl = null;
  lastTouchX = null;
  lastPointerX = null;
  lastMouseX = null;
  if (dragAutoScrollRaf) {
    cancelAnimationFrame(dragAutoScrollRaf);
    dragAutoScrollRaf = null;
  }
  boardEl.style.scrollSnapType = prevScrollSnap ?? '';
  boardEl.style.scrollBehavior = '';
}
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
  if (window.matchMedia('(max-width: 860px)').matches) {
    return;
  }
  if (!laneWidths || !Array.isArray(laneWidths) || laneWidths.length === 0) {
    boardEl.querySelectorAll('.lane').forEach((lane) => {
      lane.style.removeProperty('width');
      lane.style.removeProperty('flex-basis');
    });
    return;
  }
  boardEl.querySelectorAll('.lane').forEach((lane) => {
    const idx = Number(lane.dataset.index);
    const w = laneWidths[idx];
    if (typeof w === 'number' && w > 0) {
      lane.style.width = `${w}px`;
      lane.style.flexBasis = `${w}px`;
    } else {
      lane.style.removeProperty('width');
      lane.style.removeProperty('flex-basis');
    }
  });
}

function updateMobileClass() {
  const isMobile = window.matchMedia('(max-width: 860px)').matches;
  document.body.classList.toggle('is-mobile', isMobile);
}

function updateMobileLaneWidth() {
  const isMobile = window.matchMedia('(max-width: 860px)').matches;
  if (isMobile) {
    boardEl.style.display = 'flex';
    boardEl.style.gap = '12px';
    boardEl.style.overflowX = 'auto';
    boardEl.style.scrollSnapType = 'x mandatory';
    boardEl.style.padding = '0 12px 8px';
    const containerWidth = Math.round(boardEl.clientWidth);
    const width = Math.max(0, containerWidth);
    boardEl.style.setProperty('--lane-width', `${width}px`);
    
    boardEl.querySelectorAll('.lane').forEach((lane) => {
      lane.style.width = `${width}px`;
      lane.style.flexBasis = `${width}px`;
    });
  } else {
    boardEl.style.removeProperty('--lane-width');
    
    boardEl.style.removeProperty('display');
    boardEl.style.removeProperty('gap');
    boardEl.style.removeProperty('overflow-x');
    boardEl.style.removeProperty('scroll-snap-type');
    boardEl.style.removeProperty('padding');
    boardEl.querySelectorAll('.lane').forEach((lane) => {
      lane.style.removeProperty('width');
      lane.style.removeProperty('flex-basis');
    });
  }
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
  updateMobileClass();
  updateMobileLaneWidth();

  for (const lane of state.lanes) {
    const laneIndex = state.lanes.indexOf(lane);
    const laneCards = state.cards.filter(c => c.lane === lane);

    const laneEl = document.createElement('section');
    laneEl.className = 'lane';
    laneEl.dataset.index = laneIndex;
    laneEl.dataset.lane = lane;

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

    const handleDragOver = (e) => {
      e.preventDefault();
    };

    const handleDrop = async (e) => {
      e.preventDefault();
      if (!draggingId) return;
      await moveCard(draggingId, lane);
      draggingId = null;
    };

    dropzone.addEventListener('dragover', handleDragOver);
    dropzone.addEventListener('drop', handleDrop);
    laneEl.addEventListener('dragover', handleDragOver);
    laneEl.addEventListener('drop', handleDrop);

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

  applyLaneWidths();
}

function renderCard(card) {
  const el = document.createElement('article');
  el.className = 'card';
  el.draggable = false;
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
      <div class="cardActions">
        <button class="collapseBtn" type="button" aria-label="Collapse card" data-collapse="toggle">
        ${isCollapsed(card) ? 'Expand' : 'Collapse'}
        </button>
        <button class="dragHandle" type="button" aria-label="Drag card" data-drag-handle="true" title="Drag to move">≡</button>
      </div>
    </div>
    <div class="meta">
      <div>${jiraLine}</div>
      <div>${prLine}</div>
      <div>Checklist: ${checklistSummary(card)} · Updated: ${new Date(card.updatedAt).toLocaleString()}</div>
    </div>
    <div class="cardBody">
      <div class="sectionRow">
        <div class="sectionTitle">Notes</div>
        <button class="btn small ghost" type="button" data-notes-edit>Edit</button>
      </div>
      <div class="notes markdown" data-notes-preview>${renderMarkdownWithTasks(card.notes)}</div>
      <div class="notesEditor" data-notes-editor>
        <div class="notesToolbar">
          <button type="button" class="btn small" data-notes-checklist>+ Checklist</button>
          <button type="button" class="btn small" data-notes-link>Add Link</button>
        </div>
        <textarea rows="4" class="notesInput"></textarea>
        <div class="notesActions">
          <button class="btn small" type="button" data-notes-cancel>Cancel</button>
          <button class="btn small primary" type="button" data-notes-save>Save</button>
        </div>
      </div>
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
  const notesPreview = el.querySelector('[data-notes-preview]');
  const notesEditor = el.querySelector('[data-notes-editor]');
  const notesEditBtn = el.querySelector('[data-notes-edit]');
  const notesSaveBtn = el.querySelector('[data-notes-save]');
  const notesCancelBtn = el.querySelector('[data-notes-cancel]');
  const notesInput = el.querySelector('.notesInput');
  const notesChecklistBtn = el.querySelector('[data-notes-checklist]');
  const notesLinkBtn = el.querySelector('[data-notes-link]');
  if (notesEditor && notesPreview && notesEditBtn && notesSaveBtn && notesCancelBtn && notesInput) {
    notesEditor.style.display = 'none';
    notesEditBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      notesInput.value = card.notes || '';
      notesPreview.style.display = 'none';
      notesEditor.style.display = 'grid';
      notesInput.focus();
    });
    notesCancelBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      notesEditor.style.display = 'none';
      notesPreview.style.display = 'block';
    });
    notesSaveBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      await api(`/api/cards/${encodeURIComponent(card.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ notes: notesInput.value })
      });
      await load();
    });
    notesInput.addEventListener('click', (event) => event.stopPropagation());
    notesInput.addEventListener('keydown', handleNotesKeydown);
    if (notesChecklistBtn) {
      notesChecklistBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        insertChecklistItem(notesInput);
      });
    }
    if (notesLinkBtn) {
      notesLinkBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        wrapSelectionWithLink(notesInput);
      });
    }
    notesInput.addEventListener('keydown', async (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        await api(`/api/cards/${encodeURIComponent(card.id)}`, {
          method: 'PUT',
          body: JSON.stringify({ notes: notesInput.value })
        });
        await load();
      }
    });
  }
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

  const dragHandle = el.querySelector('[data-drag-handle="true"]');
  if (dragHandle) {
    dragHandle.addEventListener('click', (event) => event.stopPropagation());
    const isMobile = window.matchMedia('(max-width: 860px)').matches;
    dragHandle.setAttribute('draggable', isMobile ? 'false' : 'true');
    if (!isMobile) {
      dragHandle.addEventListener('dragstart', () => {
        startDrag(card.id, el);
      });
      dragHandle.addEventListener('dragend', () => {
        endDrag();
      });
    }

    dragHandle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      dragHandle.setPointerCapture(event.pointerId);
      startDrag(card.id, el);
      lastPointerX = event.clientX;
      dragDebug.textContent = `pointerdown id=${card.id} scrollLeft=${boardEl.scrollLeft}`;

      if (!dragAutoScrollRaf) {
        const step = () => {
          if (!draggingId) {
            dragAutoScrollRaf = null;
            return;
          }
          if (lastPointerX !== null) {
            const rect = boardEl.getBoundingClientRect();
            const edge = 56;
            if (lastPointerX < rect.left + edge) {
              boardEl.scrollLeft -= 14;
            } else if (lastPointerX > rect.right - edge) {
              boardEl.scrollLeft += 14;
            }
          }
          dragAutoScrollRaf = requestAnimationFrame(step);
        };
        dragAutoScrollRaf = requestAnimationFrame(step);
      }
    });

    dragHandle.addEventListener('pointermove', (event) => {
      if (!draggingId) return;
      event.preventDefault();
      if (lastPointerX !== null) {
        const delta = event.clientX - lastPointerX;
        boardEl.scrollLeft -= delta;
      }
      lastPointerX = event.clientX;
      dragDebug.textContent = `pointermove x=${event.clientX} scrollLeft=${boardEl.scrollLeft}`;
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const laneEl = target?.closest?.('.lane');
      document.querySelectorAll('.lane').forEach((lane) => lane.classList.remove('dragTarget'));
      if (laneEl) {
        laneEl.classList.add('dragTarget');
        lastDropLane = laneEl.dataset.lane || null;
      }
    });

    dragHandle.addEventListener('pointerup', async (event) => {
      if (!draggingId) return;
      event.preventDefault();
      dragDebug.textContent = `pointerup x=${event.clientX} scrollLeft=${boardEl.scrollLeft}`;
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const laneEl = target?.closest?.('.lane');
      document.querySelectorAll('.lane').forEach((lane) => lane.classList.remove('dragTarget'));
      if (laneEl) {
        const lane = laneEl.querySelector('.laneTitle')?.textContent;
        if (lane) {
          await moveCard(draggingId, lane);
        }
      }
      if (!laneEl && lastDropLane) {
        await moveCard(draggingId, lastDropLane);
      }
      endDrag();
      dragHandle.releasePointerCapture(event.pointerId);
    });

    if (isMobile) {
      const onMouseMove = (moveEvent) => {
        if (!draggingId) return;
        if (lastMouseX !== null) {
          const delta = moveEvent.clientX - lastMouseX;
          boardEl.scrollLeft -= delta;
        }
        lastMouseX = moveEvent.clientX;
        dragDebug.textContent = `mousemove x=${moveEvent.clientX} scrollLeft=${boardEl.scrollLeft}`;
        const target = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
        const laneEl = target?.closest?.('.lane');
        document.querySelectorAll('.lane').forEach((lane) => lane.classList.remove('dragTarget'));
        if (laneEl) {
          laneEl.classList.add('dragTarget');
          lastDropLane = laneEl.dataset.lane || null;
        }
      };

      const onMouseUp = async (upEvent) => {
        if (!draggingId) return;
        dragDebug.textContent = `mouseup x=${upEvent.clientX} scrollLeft=${boardEl.scrollLeft}`;
        const target = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
        const laneEl = target?.closest?.('.lane');
        document.querySelectorAll('.lane').forEach((lane) => lane.classList.remove('dragTarget'));
        if (laneEl) {
          const lane = laneEl.querySelector('.laneTitle')?.textContent;
          if (lane) {
            await moveCard(draggingId, lane);
          }
        } else if (lastDropLane) {
          await moveCard(draggingId, lastDropLane);
        }
        endDrag();
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      dragHandle.addEventListener('mousedown', (downEvent) => {
        downEvent.preventDefault();
        startDrag(card.id, el);
        lastMouseX = downEvent.clientX;
        dragDebug.textContent = `mousedown id=${card.id} scrollLeft=${boardEl.scrollLeft}`;
        if (!dragAutoScrollRaf) {
          const step = () => {
            if (!draggingId) {
              dragAutoScrollRaf = null;
              return;
            }
            if (lastPointerX !== null) {
              const rect = boardEl.getBoundingClientRect();
              const edge = 56;
              if (lastPointerX < rect.left + edge) {
                boardEl.scrollLeft -= 14;
              } else if (lastPointerX > rect.right - edge) {
                boardEl.scrollLeft += 14;
              }
            }
            dragAutoScrollRaf = requestAnimationFrame(step);
          };
          dragAutoScrollRaf = requestAnimationFrame(step);
        }
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    }

    let touchMoveHandler = null;
    let touchEndHandler = null;

    dragHandle.addEventListener('touchstart', (event) => {
      event.preventDefault();
      startDrag(card.id, el);
      lastTouchX = event.touches[0]?.clientX ?? null;
      dragDebug.textContent = `touchstart id=${card.id} scrollLeft=${boardEl.scrollLeft}`;

      touchMoveHandler = (moveEvent) => {
        if (!draggingId) return;
        moveEvent.preventDefault();
        const touch = moveEvent.touches[0];
        if (!touch) return;
        if (lastTouchX !== null) {
          const delta = touch.clientX - lastTouchX;
          boardEl.scrollLeft -= delta;
        }
        lastTouchX = touch.clientX;
        dragDebug.textContent = `touchmove x=${touch.clientX} scrollLeft=${boardEl.scrollLeft}`;
        const prevPointerEvents = dragHandle.style.pointerEvents;
        const prevCardPointerEvents = activeDragCardEl?.style.pointerEvents;
        dragHandle.style.pointerEvents = 'none';
        if (activeDragCardEl) {
          activeDragCardEl.style.pointerEvents = 'none';
        }
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        dragHandle.style.pointerEvents = prevPointerEvents;
        if (activeDragCardEl) {
          activeDragCardEl.style.pointerEvents = prevCardPointerEvents || '';
        }
        const laneEl = target?.closest?.('.lane');
        document.querySelectorAll('.lane').forEach((lane) => lane.classList.remove('dragTarget'));
        if (laneEl) {
          laneEl.classList.add('dragTarget');
          lastDropLane = laneEl.dataset.lane || null;
        }
      };

      touchEndHandler = async (endEvent) => {
        if (!draggingId) return;
        endEvent.preventDefault();
        const touch = endEvent.changedTouches[0];
        if (touch) {
          dragDebug.textContent = `touchend x=${touch.clientX} scrollLeft=${boardEl.scrollLeft}`;
        }
        if (touch) {
          const prevPointerEvents = dragHandle.style.pointerEvents;
          const prevCardPointerEvents = activeDragCardEl?.style.pointerEvents;
          dragHandle.style.pointerEvents = 'none';
          if (activeDragCardEl) {
            activeDragCardEl.style.pointerEvents = 'none';
          }
          const target = document.elementFromPoint(touch.clientX, touch.clientY);
          dragHandle.style.pointerEvents = prevPointerEvents;
          if (activeDragCardEl) {
            activeDragCardEl.style.pointerEvents = prevCardPointerEvents || '';
          }
          const laneEl = target?.closest?.('.lane');
          document.querySelectorAll('.lane').forEach((lane) => lane.classList.remove('dragTarget'));
          if (laneEl) {
            const lane = laneEl.querySelector('.laneTitle')?.textContent;
            if (lane) {
              await moveCard(draggingId, lane);
            }
          }
          if (!laneEl && lastDropLane) {
            await moveCard(draggingId, lastDropLane);
          }
        }
        endDrag();
        document.removeEventListener('touchmove', touchMoveHandler, { passive: false });
        document.removeEventListener('touchend', touchEndHandler, { passive: false });
        document.removeEventListener('touchcancel', touchEndHandler, { passive: false });
      };

      document.addEventListener('touchmove', touchMoveHandler, { passive: false });
      document.addEventListener('touchend', touchEndHandler, { passive: false });
      document.addEventListener('touchcancel', touchEndHandler, { passive: false });

      const startAutoScroll = () => {
        if (dragAutoScrollRaf) return;
        const step = () => {
          if (!draggingId) {
            dragAutoScrollRaf = null;
            return;
          }
          if (lastTouchX !== null) {
            const rect = boardEl.getBoundingClientRect();
            const edge = 56;
            if (lastTouchX < rect.left + edge) {
              boardEl.scrollLeft -= 14;
            } else if (lastTouchX > rect.right - edge) {
              boardEl.scrollLeft += 14;
            }
          }
          dragAutoScrollRaf = requestAnimationFrame(step);
        };
        dragAutoScrollRaf = requestAnimationFrame(step);
      };

      startAutoScroll();
    }, { passive: false });
  }

  return el;
}

async function load() {
  const scrollLeft = boardEl.scrollLeft;
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
  boardEl.scrollLeft = scrollLeft;
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
  const textarea = event.target;
  if (event.key === 'Enter') {
    const { selectionStart, selectionEnd, value } = textarea;
    if (selectionStart !== selectionEnd) return;
    const { line } = getLineInfo(value, selectionStart);
    const match = line.match(/^(\s*)[-*+]\s+\[( |x|X)\]\s+(.*)$/);
    if (!match) return;
    event.preventDefault();
    const indent = match[1] || '';
    insertAtCursor(textarea, `\n${indent}- [ ] `);
    return;
  }

  if (event.key === 'Tab') {
    const { selectionStart, selectionEnd, value } = textarea;
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
      textarea.value = replaceRange(value, lineStart, lineStart + line.length, nextLine);
      const nextPos = Math.max(selectionStart - remove, lineStart);
      textarea.selectionStart = nextPos;
      textarea.selectionEnd = nextPos;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    textarea.value = replaceRange(value, lineStart, lineStart + line.length, ' '.repeat(indentSize) + line);
    const nextPos = selectionStart + indentSize;
    textarea.selectionStart = nextPos;
    textarea.selectionEnd = nextPos;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function insertChecklistItem(textarea = fields.notes) {
  const { selectionStart, value } = textarea;
  const { lineStart, line } = getLineInfo(value, selectionStart);
  const match = line.match(/^(\s*)[-*+]\s+\[( |x|X)\]\s+/);
  const indent = match ? (match[1] || '') : '';
  const prefix = line.trim().length === 0 ? '' : '\n';
  insertAtCursor(textarea, `${prefix}${indent}- [ ] `);
  textarea.focus();
}

function wrapSelectionWithLink(textarea = fields.notes) {
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
addChecklistBtn.addEventListener('click', () => insertChecklistItem(fields.notes));
addLinkBtn.addEventListener('click', () => wrapSelectionWithLink(fields.notes));
window.addEventListener('resize', updateMobileLaneWidth);
window.addEventListener('resize', updateMobileClass);

load().catch(err => {
  console.error(err);
  if (err.message === 'Board not found') {
    openBoardModal();
    alert(`Board "${currentBoardSlug}" not found. Create it to continue.`);
    return;
  }
  alert(`Failed to load board: ${err.message}`);
});
