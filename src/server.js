import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { ensureSchema, getBoard, listBoards, createBoard, deleteBoard, createCard, updateCard, deleteCard } from './store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5173;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'board.db');

const app = express();
app.use(express.json({ limit: '1mb' }));

// Initialize DB
const db = new Database(DB_PATH);
ensureSchema(db);

// Static UI
app.use('/', express.static(path.join(__dirname, 'public')));

// API
app.get('/api/board/:slug', (req, res) => {
  try {
    res.json(getBoard(db, req.params.slug));
  } catch (e) {
    res.status(e.code === 'BOARD_NOT_FOUND' ? 404 : 400).json({ error: e.message });
  }
});

app.get('/boards', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'boards.html'));
});

app.get('/api/boards', (req, res) => {
  res.json(listBoards(db));
});

app.post('/api/boards', (req, res) => {
  try {
    const board = createBoard(db, req.body || {});
    res.status(201).json(board);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/boards/:slug', (req, res) => {
  try {
    deleteBoard(db, req.params.slug);
    res.status(204).end();
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/boards/:slug/cards', (req, res) => {
  try {
    const payload = { ...(req.body || {}), boardSlug: req.params.slug };
    const card = createCard(db, payload);
    res.status(201).json(card);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/cards', (req, res) => {
  try {
    const card = createCard(db, req.body || {});
    res.status(201).json(card);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/cards/:id', (req, res) => {
  try {
    const card = updateCard(db, req.params.id, req.body || {});
    res.json(card);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/cards/:id', (req, res) => {
  try {
    deleteCard(db, req.params.id);
    res.status(204).end();
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// SPA fallback (optional)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`PR Swimlanes running at http://localhost:${PORT}`);
  console.log(`SQLite: ${DB_PATH}`);
});
