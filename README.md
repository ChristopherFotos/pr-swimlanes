# PR Swimlanes (SQLite)

A tiny local web app for tracking pull requests across swimlanes (Kanban-style) with a **SQLite** backend.

## Features
- 5 fixed lanes: **PR ready**, **testing**, **Needs review**, **bugfixes/merge conflicts/ changes requested**, **Merged!**
- Create/edit/delete PR cards
- Toggle checklist items
- Drag & drop cards between lanes
- Persists everything to `data/board.db` (SQLite)

## Prerequisites
- **Node.js 18+** (uses `crypto.randomUUID()`)

## Setup

```bash
# 1) Unzip / clone
cd pr-swimlanes-sqlite

# 2) Install dependencies
npm install

# 3) Start the server
npm start
```

Then open:
- http://localhost:5173

## Dev (auto-reload)

```bash
npm run dev
```

## Data location
- SQLite DB file: `data/board.db`

To back up your board, just copy `data/board.db`.

## API (for reference)
- `GET /api/board` → lanes + cards
- `POST /api/cards` → create card
- `PUT /api/cards/:id` → update card (lane, fields, checklist)
- `DELETE /api/cards/:id` → delete card

## Notes
- This is intentionally minimal: no auth, single-user friendly.
- If you want multi-user + history, we can add users, audit table, and optimistic concurrency.
