const boardEl = document.getElementById('board');
const boardModal = document.getElementById('boardModal');
const boardForm = document.getElementById('boardForm');
const mainEl = document.querySelector('main');

const newCardBtn = document.getElementById('newCardBtn');
const newBoardBtn = document.getElementById('newBoardBtn');
const refreshBtn = document.getElementById('refreshBtn');
const currentBoardLabel = document.getElementById('currentBoardLabel');
const boardCancelBtn = document.getElementById('boardCancelBtn');

const boardFields = {
  name: document.getElementById('boardName'),
  slug: document.getElementById('boardSlug')
};

let state = { lanes: [], cards: [] };
let draggingId = null;
let activeDragCardEl = null;
let lastDropLane = null;
let dragAutoScrollRaf = null;
let lastTouchX = null;
let lastPointerX = null;
let lastMouseX = null;
let prevScrollSnap = null;
const saveTimers = new Map();
let draggingLaneId = null;
let laneWidthsMap = null;

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
    laneWidthsMap = raw ? JSON.parse(raw) : null;
  } catch {
    laneWidthsMap = null;
  }
}

function saveLaneWidths() {
  if (!laneWidthsMap) return;
  localStorage.setItem(laneWidthsKey(), JSON.stringify(laneWidthsMap));
}

function applyLaneWidths() {
  if (window.matchMedia('(max-width: 860px)').matches) {
    return;
  }
  if (!laneWidthsMap || typeof laneWidthsMap !== 'object') {
    boardEl.querySelectorAll('.lane').forEach((lane) => {
      lane.style.removeProperty('width');
      lane.style.removeProperty('flex-basis');
    });
    return;
  }
  boardEl.querySelectorAll('.lane').forEach((lane) => {
    const idx = Number(lane.dataset.index);
    const laneId = lane.dataset.laneId;
    const w = laneId ? laneWidthsMap[laneId] : null;
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

function scheduleSave(cardId, notesValue, flush = false) {
  const key = `save:${cardId}`;
  const existing = saveTimers.get(key);
  if (existing) {
    clearTimeout(existing);
  }
  const run = async () => {
    try {
      await api(`/api/cards/${encodeURIComponent(cardId)}`, {
        method: 'PUT',
        body: JSON.stringify({ notes: notesValue })
      });
    } catch (err) {
      console.error(err);
    }
  };
  if (flush) {
    run();
    return;
  }
  const timer = setTimeout(run, 500);
  saveTimers.set(key, timer);
}

function render() {
  boardEl.innerHTML = '';
  currentBoardLabel.textContent = `Board: ${currentBoardSlug}`;
  updateMobileClass();
  updateMobileLaneWidth();

  for (const [laneIndex, lane] of state.lanes.entries()) {
    const laneCards = state.cards.filter(c => c.lane === lane.name);

    const laneEl = document.createElement('section');
    laneEl.className = 'lane';
    laneEl.dataset.index = laneIndex;
    laneEl.dataset.lane = lane.name;
    laneEl.dataset.laneId = lane.id;

    const header = document.createElement('div');
    header.className = 'laneHeader';
    header.innerHTML = `
      <div class="laneTitle">${lane.name}</div>
      <div class="laneCount">${laneCards.length}</div>
      <div class="laneActions">
        <button class="laneBtn" type="button" data-lane-rename>Rename</button>
        <button class="laneBtn danger" type="button" data-lane-delete>Delete</button>
      </div>
      <div class="laneDrag" title="Drag to reorder" aria-label="Drag lane" data-lane-drag>≡</div>
      <div class="laneResize" data-resize-handle="true" title="Drag to resize"></div>
    `;

    const dropzone = document.createElement('div');
    dropzone.className = 'dropzone';
    dropzone.dataset.lane = lane.name;

    const handleDragOver = (e) => {
      e.preventDefault();
    };

    const handleDrop = async (e) => {
      e.preventDefault();
      if (!draggingId) return;
      await moveCard(draggingId, lane.name);
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

    const laneDragHandle = header.querySelector('[data-lane-drag]');
    if (laneDragHandle) {
      laneDragHandle.setAttribute('draggable', 'true');
      laneDragHandle.addEventListener('dragstart', (event) => {
        draggingLaneId = lane.id;
        laneEl.classList.add('dragging');
        event.dataTransfer?.setData('text/plain', lane.id);
      });
      laneDragHandle.addEventListener('dragend', () => {
        laneEl.classList.remove('dragging');
        draggingLaneId = null;
      });
    }

    laneEl.addEventListener('dragover', (event) => {
      if (!draggingLaneId) return;
      event.preventDefault();
      laneEl.classList.add('laneDropTarget');
    });
    laneEl.addEventListener('dragleave', () => {
      laneEl.classList.remove('laneDropTarget');
    });
    laneEl.addEventListener('drop', async (event) => {
      if (!draggingLaneId) return;
      event.preventDefault();
      laneEl.classList.remove('laneDropTarget');
      const targetId = lane.id;
      if (draggingLaneId === targetId) return;
      const ids = state.lanes.map((l) => l.id);
      const fromIndex = ids.indexOf(draggingLaneId);
      const toIndex = ids.indexOf(targetId);
      if (fromIndex === -1 || toIndex === -1) return;
      ids.splice(toIndex, 0, ids.splice(fromIndex, 1)[0]);
      state.lanes = ids.map((id) => state.lanes.find((l) => l.id === id)).filter(Boolean);
      render();
      try {
        await api(`/api/boards/${encodeURIComponent(currentBoardSlug)}/lanes/reorder`, {
          method: 'PUT',
          body: JSON.stringify({ laneIds: ids })
        });
        await load();
      } catch (err) {
        console.error(err);
        alert(`Failed to reorder lanes: ${err.message}`);
        await load();
      }
    });

    const renameBtn = header.querySelector('[data-lane-rename]');
    if (renameBtn) {
      renameBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        const next = prompt('Rename lane', lane.name);
        if (!next || next.trim() === lane.name) return;
        await api(`/api/boards/${encodeURIComponent(currentBoardSlug)}/lanes/${encodeURIComponent(lane.id)}`, {
          method: 'PUT',
          body: JSON.stringify({ name: next.trim() })
        });
        await load();
      });
    }
    const deleteBtn = header.querySelector('[data-lane-delete]');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        const ok = confirm(`Delete lane "${lane.name}" and move its cards to the first lane?`);
        if (!ok) return;
        await api(`/api/boards/${encodeURIComponent(currentBoardSlug)}/lanes/${encodeURIComponent(lane.id)}`, {
          method: 'DELETE'
        });
        await load();
      });
    }

    const resizeHandle = header.querySelector('[data-resize-handle="true"]');
    if (resizeHandle) {
      resizeHandle.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!laneWidthsMap || typeof laneWidthsMap !== 'object') {
          laneWidthsMap = {};
        }
        const startX = event.clientX;
        const startWidth = laneEl.getBoundingClientRect().width;
        const minWidth = 220;

        const onMove = (moveEvent) => {
          const delta = moveEvent.clientX - startX;
          const nextWidth = Math.max(minWidth, startWidth + delta);
          laneWidthsMap[lane.id] = Math.round(nextWidth);
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

  el.innerHTML = `
    <div class="cardHeader">
      <div class="cardTitle">Notes</div>
      <div class="cardActions">
        <button class="dragHandle" type="button" aria-label="Drag card" data-drag-handle="true" title="Drag to move">≡</button>
      </div>
    </div>
    <div class="cardBody">
      <div class="sectionRow">
        <div class="sectionTitle">Markdown</div>
        <div class="notesToolbar">
          <button type="button" class="btn small" data-notes-checklist>+ Checklist</button>
          <button type="button" class="btn small" data-notes-link>Add Link</button>
        </div>
      </div>
      <textarea rows="6" class="notesInput" spellcheck="true"></textarea>
      <div class="notesPreview markdown" data-notes-preview>${renderMarkdownWithTasks(card.notes)}</div>
    </div>
  `;

  const notesPreview = el.querySelector('[data-notes-preview]');
  const notesInput = el.querySelector('.notesInput');
  const notesChecklistBtn = el.querySelector('[data-notes-checklist]');
  const notesLinkBtn = el.querySelector('[data-notes-link]');

  const updatePreview = (notesValue) => {
    if (!notesPreview) return;
    notesPreview.innerHTML = renderMarkdownWithTasks(notesValue);
    notesPreview.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', (event) => event.stopPropagation());
    });
    notesPreview.querySelectorAll('.mdTaskToggle').forEach((input) => {
      input.addEventListener('click', (event) => event.stopPropagation());
      input.addEventListener('change', async (event) => {
        event.stopPropagation();
        const lineIndex = Number(input.dataset.mdLine);
        const updatedNotes = toggleMarkdownTask(notesInput.value || '', lineIndex, input.checked);
        notesInput.value = updatedNotes;
        scheduleSave(card.id, updatedNotes);
        updatePreview(updatedNotes);
      });
    });
  };

  if (notesInput) {
    notesInput.value = card.notes || '';
    updatePreview(notesInput.value);
    const setEditing = (isEditing) => {
      el.classList.toggle('is-editing', isEditing);
      if (isEditing) {
        notesInput.focus();
      }
    };
    setEditing(false);
    notesInput.addEventListener('click', (event) => event.stopPropagation());
    notesInput.addEventListener('keydown', handleNotesKeydown);
    notesInput.addEventListener('input', () => {
      updatePreview(notesInput.value);
      scheduleSave(card.id, notesInput.value);
    });
    notesInput.addEventListener('blur', () => {
      scheduleSave(card.id, notesInput.value, true);
      setTimeout(() => setEditing(false), 0);
    });
    notesInput.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        scheduleSave(card.id, notesInput.value, true);
        setEditing(false);
      }
    });

    if (notesPreview) {
      notesPreview.addEventListener('click', (event) => {
        event.stopPropagation();
        setEditing(true);
      });
    }
  }

  if (notesChecklistBtn && notesInput) {
    notesChecklistBtn.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });
    notesChecklistBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      insertChecklistItem(notesInput);
      updatePreview(notesInput.value);
      scheduleSave(card.id, notesInput.value);
      el.classList.add('is-editing');
    });
  }

  if (notesLinkBtn && notesInput) {
    notesLinkBtn.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });
    notesLinkBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      wrapSelectionWithLink(notesInput);
      updatePreview(notesInput.value);
      scheduleSave(card.id, notesInput.value);
      el.classList.add('is-editing');
    });
  }

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
  render();
  boardEl.scrollLeft = scrollLeft;
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

function insertChecklistItem(textarea) {
  if (!textarea) return;
  const { selectionStart, value } = textarea;
  const { lineStart, line } = getLineInfo(value, selectionStart);
  const match = line.match(/^(\s*)[-*+]\s+\[( |x|X)\]\s+/);
  const indent = match ? (match[1] || '') : '';
  const prefix = line.trim().length === 0 ? '' : '\n';
  insertAtCursor(textarea, `${prefix}${indent}- [ ] `);
  textarea.focus();
}

function wrapSelectionWithLink(textarea) {
  if (!textarea) return;
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

async function moveCard(id, lane) {
  await api(`/api/cards/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ lane })
  });
  await load();
}

async function createNewCard() {
  const lane = state.lanes?.[0]?.name || 'PR ready';
  await api(`/api/boards/${encodeURIComponent(currentBoardSlug)}/cards`, {
    method: 'POST',
    body: JSON.stringify({ lane, notes: '' })
  });
  await load();
}

async function createLane() {
  const name = prompt('Lane name');
  if (!name || !name.trim()) return;
  await api(`/api/boards/${encodeURIComponent(currentBoardSlug)}/lanes`, {
    method: 'POST',
    body: JSON.stringify({ name: name.trim() })
  });
  await load();
}

newCardBtn.addEventListener('click', createNewCard);
newBoardBtn.addEventListener('click', openBoardModal);
addLaneBtn.addEventListener('click', createLane);
refreshBtn.addEventListener('click', load);
boardForm.addEventListener('submit', createBoardFromForm);
boardCancelBtn.addEventListener('click', closeBoardModal);
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
