# Ajaia Docs

A small collaborative document editor: create, rename, edit, and import documents, then share them with other users as viewer or editor.

**Stack:** React + Vite + TipTap (editor) · FastAPI + SQLAlchemy (API) · SQLite locally / Postgres in production · one Docker image that serves both API and frontend.

## Features

- Create and rename documents, autosaved content, survives refresh
- Rich text: bold, italic, underline, H1/H2, bulleted and numbered lists
- Import `.md` and `.txt` files as new editable documents (client-side; `.docx` is not supported)
- Share a document with another seeded user as **viewer** (read-only) or **editor**
- Dashboard separates **My documents** from **Shared with me**
- Seeded demo accounts, mocked auth (pick a user, no passwords)

## Run locally

Backend (API on `http://127.0.0.1:8000`):

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows;  source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
uvicorn app:app --reload
```

Frontend (UI on `http://localhost:5173`, proxies `/api` to the backend):

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` and pick a seeded user:

| User | Email | Notes |
|---|---|---|
| Alice | `alice@example.com` | Owns the seeded "Welcome to Ajaia Docs" document |
| Bob | `bob@example.com` | Welcome doc is shared with him as viewer |
| Carol | `carol@example.com` | No documents initially |

There are no passwords — auth is intentionally mocked (the brief allows this). The SQLite database (`backend/data.db`) is created and seeded automatically on first start.

### Testing sharing in 60 seconds

1. Sign in as **Alice**, open a document, click **Share**, add Bob as *viewer*.
2. In a second browser window (or incognito), sign in as **Bob**: the doc appears under **Shared with me** with a `viewer` badge and is read-only.
3. Back as Alice, change Bob's role to *editor*; Bob can now edit.
4. Only the owner can share or remove access.

## Run the tests

```bash
cd backend
.venv\Scripts\python -m pytest -q     # or: python -m pytest -q
```

Two tests cover the access-control matrix (no access → 403, viewer can read but not write or re-share, editor can write but not re-share) and a content round-trip.

## Run the production build locally (single server)

```bash
cd frontend && npm run build
cd ../backend && .venv\Scripts\uvicorn app:app --port 8000
```

FastAPI serves the built SPA and the API on the same origin. Or with Docker:

```bash
docker build -t ajaia-docs .
docker run -p 8000:8000 ajaia-docs
```

## Deploy (Render + Neon, free tier)

1. Create a free Postgres database at [neon.tech](https://neon.tech) and copy its connection string (`postgresql://…?sslmode=require`).
2. Push this repo to GitHub.
3. On [Render](https://render.com): **New → Web Service → Docker**, pick the repo. Render uses the root `Dockerfile`.
4. Set environment variables:
   - `DATABASE_URL` — the Neon connection string
   - `SESSION_SECRET` — any long random string
5. Deploy. Tables and seeded users are created automatically on first boot.

Notes: the free Render instance spins down after inactivity and Neon suspends when idle, so the first request after a pause can take up to ~1 minute. Data persists in Neon across redeploys (local SQLite would not).

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./data.db` | SQLAlchemy URL; `postgres://` is normalized to `postgresql://` |
| `SESSION_SECRET` | `dev-only-secret` | Signs the session cookie — set a real value in production |
| `PORT` | `8000` | Port uvicorn listens on (used by the Docker image) |

## Known limitations

- Last-write-wins: no real-time collaboration, no conflict resolution
- No version history, comments, document deletion, or link sharing
- Import supports `.md` and `.txt` only; `.docx` is intentionally out of scope
- Mocked auth: seeded users with a user picker, no passwords
