const LANES = [
  'PR ready',
  'testing',
  'Needs review',
  'bugfixes/merge conflicts/ changes requested',
  'Merged!'
];

function nowIso() {
  return new Date().toISOString();
}

function normalizeChecklist(input) {
  const base = {
    buildGeneratedGivenToQE: false,
    androidBuild: false,
    androidBuildUrl: '',
    iosBuild: false,
    iosBuildUrl: '',
    oneApproval: false,
    twoApprovals: false,
    qeApprove: false
  };
  if (!input || typeof input !== 'object') return base;
  const filtered = Object.fromEntries(
    Object.entries(input).filter(([k, v]) => {
      if (!(k in base)) return false;
      const baseType = typeof base[k];
      if (baseType === 'boolean') return typeof v === 'boolean';
      if (baseType === 'string') return typeof v === 'string';
      return false;
    })
  );
  return { ...base, ...filtered };
}

export function ensureSchema(db) {
  db.exec(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      lane TEXT NOT NULL,
      jira_key TEXT,
      jira_url TEXT,
      jira_title TEXT,
      pr_url TEXT,
      pr_title TEXT,
      notes TEXT,
      collapsed INTEGER NOT NULL DEFAULT 0,
      checklist_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cards_lane ON cards(lane);
  `);

  const boardIdColumn = db
    .prepare(`PRAGMA table_info(cards)`)
    .all()
    .some(col => col.name === 'board_id');
  if (!boardIdColumn) {
    db.exec(`ALTER TABLE cards ADD COLUMN board_id TEXT NOT NULL DEFAULT 'default';`);
  }

  const collapsedColumn = db
    .prepare(`PRAGMA table_info(cards)`)
    .all()
    .some(col => col.name === 'collapsed');
  if (!collapsedColumn) {
    db.exec(`ALTER TABLE cards ADD COLUMN collapsed INTEGER NOT NULL DEFAULT 0;`);
  }

  db.exec(`CREATE INDEX IF NOT EXISTS idx_cards_board ON cards(board_id);`);

  const defaultBoard = db.prepare('SELECT id FROM boards WHERE slug = ?').get('default');
  if (!defaultBoard) {
    createBoard(db, { slug: 'default', name: 'Default' }, { forceId: 'default' });
  }

  // Seed one template card if empty
  const count = db.prepare('SELECT COUNT(*) AS c FROM cards').get().c;
  if (count === 0) {
    const template = {
      lane: 'PR ready',
      jira: {
        key: 'ABC-123',
        url: 'https://jira.example.com/browse/ABC-123',
        title: 'Ticket Title'
      },
      pr: {
        url: 'https://github.com/org/repo/pull/1234',
        title: '#1234 — PR Title'
      },
      notes: '',
      checklist: {
        buildGeneratedGivenToQE: false,
        androidBuild: false,
        androidBuildUrl: '',
        iosBuild: false,
        iosBuildUrl: '',
        oneApproval: false,
        twoApprovals: false,
        qeApprove: false
      }
    };
    createCard(db, template, { forceId: 'pr_template' });
  }
}

export function listBoards(db) {
  return db.prepare('SELECT id, slug, name, created_at FROM boards ORDER BY created_at ASC').all();
}

export function getBoard(db, slug = 'default') {
  const board = db.prepare('SELECT id, slug, name, created_at FROM boards WHERE slug = ?').get(slug);
  if (!board) {
    const err = new Error('Board not found');
    err.code = 'BOARD_NOT_FOUND';
    throw err;
  }

  const rows = db.prepare('SELECT * FROM cards WHERE board_id = ? ORDER BY updated_at DESC').all(board.id);
  const cards = rows.map(r => ({
    id: r.id,
    boardId: r.board_id,
    lane: r.lane,
    collapsed: !!r.collapsed,
    jira: {
      key: r.jira_key || '',
      url: r.jira_url || '',
      title: r.jira_title || ''
    },
    pr: {
      url: r.pr_url || '',
      title: r.pr_title || ''
    },
    notes: r.notes || '',
    checklist: JSON.parse(r.checklist_json),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
  return { lanes: LANES, cards, board };
}

export function createBoard(db, payload, opts = {}) {
  const slug = (payload.slug || '').trim();
  const name = (payload.name || '').trim();
  if (!slug) throw new Error('Board slug is required');
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error('Board slug must be lowercase letters, numbers, or dashes');
  }
  if (!name) throw new Error('Board name is required');

  const id = opts.forceId || slug;
  db.prepare(`
    INSERT INTO boards (id, slug, name, created_at)
    VALUES (@id, @slug, @name, @created_at)
  `).run({
    id,
    slug,
    name,
    created_at: nowIso()
  });

  return db.prepare('SELECT id, slug, name, created_at FROM boards WHERE id = ?').get(id);
}

export function createCard(db, payload, opts = {}) {
  const id = opts.forceId || (globalThis.crypto?.randomUUID?.() ?? `pr_${Math.random().toString(16).slice(2)}`);
  const lane = LANES.includes(payload.lane) ? payload.lane : 'PR ready';
  const boardSlug = (payload.boardSlug || 'default').trim();
  const board = db.prepare('SELECT id FROM boards WHERE slug = ?').get(boardSlug);
  if (!board) throw new Error('Board not found');

  const jira = payload.jira || {};
  const pr = payload.pr || {};
  const checklist = normalizeChecklist(payload.checklist);
  const collapsed = payload.collapsed ? 1 : 0;
  const ts = nowIso();

  const stmt = db.prepare(`
    INSERT INTO cards (id, board_id, lane, jira_key, jira_url, jira_title, pr_url, pr_title, notes, collapsed, checklist_json, created_at, updated_at)
    VALUES (@id, @board_id, @lane, @jira_key, @jira_url, @jira_title, @pr_url, @pr_title, @notes, @collapsed, @checklist_json, @created_at, @updated_at)
  `);

  stmt.run({
    id,
    board_id: board.id,
    lane,
    jira_key: jira.key || '',
    jira_url: jira.url || '',
    jira_title: jira.title || '',
    pr_url: pr.url || '',
    pr_title: pr.title || '',
    notes: payload.notes || '',
    collapsed,
    checklist_json: JSON.stringify(checklist),
    created_at: ts,
    updated_at: ts
  });

  return getCard(db, id);
}

export function updateCard(db, id, patch) {
  const current = getCard(db, id);
  if (!current) throw new Error('Card not found');

  const lane = (typeof patch.lane === 'string' && LANES.includes(patch.lane)) ? patch.lane : current.lane;

  const jiraPatch = patch.jira || {};
  const prPatch = patch.pr || {};

  const jira = {
    key: (typeof jiraPatch.key === 'string') ? jiraPatch.key : current.jira.key,
    url: (typeof jiraPatch.url === 'string') ? jiraPatch.url : current.jira.url,
    title: (typeof jiraPatch.title === 'string') ? jiraPatch.title : current.jira.title
  };

  const pr = {
    url: (typeof prPatch.url === 'string') ? prPatch.url : current.pr.url,
    title: (typeof prPatch.title === 'string') ? prPatch.title : current.pr.title
  };

  const notes = (typeof patch.notes === 'string') ? patch.notes : current.notes;
  const collapsed = (typeof patch.collapsed === 'boolean') ? patch.collapsed : current.collapsed;

  const checklist = patch.checklist ? normalizeChecklist({ ...current.checklist, ...patch.checklist }) : current.checklist;

  db.prepare(`
    UPDATE cards
      SET lane=@lane,
          jira_key=@jira_key,
          jira_url=@jira_url,
          jira_title=@jira_title,
          pr_url=@pr_url,
          pr_title=@pr_title,
          notes=@notes,
          collapsed=@collapsed,
          checklist_json=@checklist_json,
          updated_at=@updated_at
      WHERE id=@id
  `).run({
    id,
    lane,
    jira_key: jira.key,
    jira_url: jira.url,
    jira_title: jira.title,
    pr_url: pr.url,
    pr_title: pr.title,
    notes,
    collapsed: collapsed ? 1 : 0,
    checklist_json: JSON.stringify(checklist),
    updated_at: nowIso()
  });

  return getCard(db, id);
}

export function deleteCard(db, id) {
  db.prepare('DELETE FROM cards WHERE id = ?').run(id);
}

function getCard(db, id) {
  const r = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
  if (!r) return null;
  return {
    id: r.id,
    boardId: r.board_id,
    lane: r.lane,
    collapsed: !!r.collapsed,
    jira: { key: r.jira_key || '', url: r.jira_url || '', title: r.jira_title || '' },
    pr: { url: r.pr_url || '', title: r.pr_title || '' },
    notes: r.notes || '',
    checklist: JSON.parse(r.checklist_json),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

export { LANES };
