# Ajaia Docs — Submission

A small collaborative document editor: create, rename, edit, import, and share documents. Built to fit a 240-minute cap with deliberate scope cuts.

---

## 1. Links

| Item | Link |
|---|---|
| Live app | **TODO — add Render URL** |
| Walkthrough video | **TODO — add Loom/YouTube link (also in `video.txt`)** |
| Source code | https://github.com/AHMEDGabal1/ajaia-docs |
| Architecture note | `ARCHITECTURE.md` (in repo) |
| AI workflow note | `AI_WORKFLOW.md` (in repo) |

---

## 2. Test accounts

Auth is intentionally mocked (allowed by the brief): pick a seeded user on the login screen. **No passwords.**

| User | Email | Seeded state |
|---|---|---|
| Alice | `alice@example.com` | Owns the seeded "Welcome to Ajaia Docs" document |
| Bob | `bob@example.com` | Welcome doc is shared with him as **viewer** |
| Carol | `carol@example.com` | No documents initially |

### Testing sharing in 60 seconds

1. Sign in as **Alice**, open a document, click **Share**, add Bob as *viewer*.
2. In a second window (or incognito), sign in as **Bob**: the document appears under **Shared with me** with a `viewer` badge and the editor is read-only (no toolbar).
3. Back as Alice, change Bob's role to *editor*; Bob can now edit and autosave.
4. Only the owner can share or remove access — an editor calling the share API gets `403`.

---

## 3. What works end to end

- **Documents:** create, rename, edit, reopen; content persists across refresh and restarts.
- **Rich text (TipTap):** bold, italic, underline, H1/H2, bulleted and numbered lists; HTML persisted per document.
- **Autosave:** 600 ms debounce, flushed on navigation/unmount and on tab close (`keepalive` fetch) — type-and-refresh does not lose the last keystrokes.
- **Import:** `.md` and `.txt` files become new editable documents (client-side `FileReader` + `marked`). Supported types are stated in the UI and README; `.docx` is intentionally unsupported.
- **Sharing:** owner grants viewer or editor access to another seeded user, changes role, or removes access. Dashboard separates **My documents** and **Shared with me** with role badges.
- **Access control:** one `get_doc(..., need="view"|"edit"|"own")` helper guards every document route. No access → 403; viewer write → 403; editor re-share → 403.
- **Persistence:** SQLite locally, Postgres (Neon) in production; schema and seed are created idempotently on startup.
- **Deployment:** single Docker image — FastAPI serves the built React SPA and the API on one origin.
- **Tests:** `pytest` covers the access-control matrix and an HTML content round-trip.

---

## 4. How to run locally

### Option A — dev servers (two terminals)

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

Open `http://localhost:5173`.

### Option B — single server (production build)

```bash
cd frontend && npm run build
cd ../backend && .venv\Scripts\uvicorn app:app --port 8000
```

FastAPI serves the SPA and API together on `http://127.0.0.1:8000`.

### Option C — Docker

```bash
docker build -t ajaia-docs .
docker run -p 8000:8000 ajaia-docs
```

### Tests

```bash
cd backend
.venv\Scripts\python -m pytest -q     # or: python -m pytest -q
```

Expected: `2 passed`. The first test is the meaningful one: Bob 403 on Alice's doc → share as viewer → 200 → PATCH 403 → re-share 403; editor can PATCH but still cannot share.

---

## 5. Deployment (Render + Neon free tier)

1. Create a free Postgres database at [neon.tech](https://neon.tech) and copy the connection string (`postgresql://…?sslmode=require`).
2. On [render.com](https://render.com): **New → Web Service → Docker**, select this repo (root `Dockerfile` is used).
3. Environment variables:
   - `DATABASE_URL` — Neon connection string
   - `SESSION_SECRET` — any long random string
4. Deploy. Tables and seeded users are created automatically on first boot.

The free Render instance spins down when idle and Neon suspends when idle, so the first request after a pause can take up to ~1 minute. Data persists in Neon across redeploys; local SQLite would not.

---

## 6. Architecture note

### Shape

One deployable: a FastAPI process serves `/api/*` and the built React SPA from the same origin (no CORS, no second service). Local dev runs Vite on `:5173` with `/api` proxied to uvicorn on `:8000`.

- **Frontend:** React 19 + Vite, TipTap 3 (StarterKit gives bold/italic/underline/headings/lists), HTML storage.
- **Backend:** FastAPI + SQLAlchemy 2, Pydantic request models.
- **Storage:** SQLite by default; Postgres (Neon) in production via `DATABASE_URL`. Schema via `create_all` + idempotent seed on startup — no migration tooling for a 3-table app.
- **Auth:** mocked by design. `GET /api/users` lists seeded accounts; `POST /api/auth/login` sets a signed httpOnly session cookie (Starlette `SessionMiddleware`). No passwords, no JWT.

### Data model

```
users(id, email unique, name)
documents(id, owner_id → users, title, content_html, created_at, updated_at)
shares(id, document_id → documents, user_id → users, role)   role ∈ {editor, viewer}
                                                             unique(document_id, user_id)
```

Ownership is a column on the document; sharing is a row per user. A document is never duplicated.

### Access model

Every document route goes through one helper, `get_doc(db, user, doc_id, need)`:

| `need` | Owner | Editor share | Viewer share | No share |
|---|---|---|---|---|
| `view` | allowed | allowed | allowed | 403 |
| `edit` | allowed | allowed | 403 | 403 |
| `own` (share/unshare) | allowed | 403 | 403 | 403 |

Unknown document IDs return 404; known documents without access return 403. The owner-only mode exists because view/edit alone would let an editor re-share — a real permission bug the automated test pins down.

### Editing and persistence

- TipTap emits HTML on every change; a 600 ms debounce PATCHes `content_html` (title edits share the same queue and coalesce).
- Pending edits flush on unmount and, on tab close, via a `keepalive` fetch.
- The editor mounts only after the document is fetched, keyed by document id — loading content cannot trigger a save, and switching documents cannot leak state.
- Last-write-wins is deliberate: no real-time sync, no OT/CRDT, no versioning.

### Import

Entirely client-side: `FileReader` reads the file, `marked` converts Markdown (plain text is wrapped in paragraphs), and the HTML becomes a new document through the normal create API. There is no upload endpoint and no server-side file handling. Stored HTML is only rendered through TipTap's schema parser, which drops unknown nodes/attributes, so there is no raw-HTML rendering path.

### Deliberate cuts

- No real-time collaboration or presence — the hardest part to do well, explicitly out of scope
- No comments, suggestions, version history, or document deletion
- `.docx` import dropped: messy HTML from tables/images, server-side parser for marginal demo value
- No passwords or OAuth: the brief permits mocked auth, and a user picker makes the sharing flow faster for a reviewer
- No Alembic: `create_all` is enough at this size; upgrade path documented

---

## 7. AI workflow note

### Tools used

- **opencode CLI (AI coding agent)** — plan critique, full implementation pass, tests, Dockerfile, docs.
- An earlier AI-drafted plan (stack, data model, API, 240-minute schedule) was the starting point; the first action was stress-testing it before writing code.

### Where AI materially sped things up

- Complete FastAPI app (models, auth, access helper, routes, seed, SPA serving) in one pass.
- TipTap 3 + React 19 + Vite wiring, including autosave queue, unmount/beforeunload flush, and viewer/editor UI states.
- The pytest fixture pattern (temp SQLite via env before app import) and the access-control test matrix.
- Multi-stage Dockerfile and the HTTP smoke script used to verify both bare uvicorn and the built image.

### What AI proposed and what was changed or rejected

1. **JWT *or* session cookie → session cookie only.** Signed httpOnly cookie via `SessionMiddleware` deletes token plumbing in React and the JWT branch entirely.
2. **Password login with shared demo password → user picker.** The brief allows mocked auth; this removes hashing, a shared-password README caveat, and makes reviewer user-switching one click.
3. **Server-side import with `.docx` → client-side `.md`/`.txt`.** Deletes a multipart endpoint, server file validation, and a `python-docx` dependency. `.docx` cut and stated in UI/README.
4. **Permission checks in each route → one helper.** The original plan's view/edit-only helper would have let an *editor* re-share a document; the third mode (`own`) fixes it and the test asserts 403.
5. **Duplicate process/AI notes → one `AI_WORKFLOW.md`.**

### Bugs and traps caught during the build

- **Load-triggered autosave:** mounting the editor with fetched content risks an immediate PATCH. Fixed by mounting after load with `content` passed once; saves only come from user updates.
- **Lost edits on quick refresh:** added unmount flush + `keepalive` fetch on `beforeunload`.
- **Redundant dependency:** verified TipTap 3's StarterKit already bundles Underline instead of adding the extension package.
- **Deploy-time DB surprises:** `postgres://` normalized to `postgresql://`; seeding idempotent so restarts do not duplicate users.

### How correctness was verified

- **Automated:** `pytest` — access matrix and HTML round-trip.
- **Integration:** a Python smoke script run against real uvicorn and then the built Docker image: two users, create/patch/read, share, viewer restrictions, seeded shared document visible to Bob.
- **Manual:** two-browser sharing walkthrough and formatting round-trip after refresh (recorded in the video).

---

## 8. Incomplete / known limitations

- Last-write-wins only: no real-time collaboration, presence, or conflict handling
- No version history, comments, document deletion, or link-based sharing
- `.docx` import intentionally unsupported
- No password/OAuth login (mocked auth allowed by the brief)
- If a viewer's access is revoked while the document is open, the next autosave shows "Save failed" rather than redirecting
- No automated browser (E2E) test; UI verified manually and via the HTTP smoke test

## 9. Next 2–4 hours

1. Real-time collaboration (Yjs + WebSocket) or optimistic concurrency via document version numbers
2. Owner-only document deletion / trash
3. Export to Markdown or PDF
4. Playwright test for the two-user sharing flow
5. Alembic migrations + CI (lint + tests)

---

## 10. File inventory

```
ajaia-docs/
├── backend/
│   ├── app.py                 FastAPI app: models, auth, access helper, routes, seed, SPA serving
│   ├── test_app.py            Access-control + content round-trip tests
│   ├── conftest.py            Test DB setup
│   └── requirements.txt       Pinned Python dependencies
├── frontend/
│   ├── src/App.tsx            Session + hash routing
│   ├── src/Login.tsx          Seeded-user picker (mocked auth)
│   ├── src/Dashboard.tsx      Owned / Shared lists, create, .md/.txt import
│   ├── src/DocumentView.tsx   TipTap editor, toolbar, autosave, share dialog
│   ├── src/api.ts             Typed API client
│   ├── src/styles.css         UI styles
│   ├── index.html, vite.config.ts, tsconfig.json, package.json, package-lock.json
├── Dockerfile                 Multi-stage build (Vite → static files; FastAPI serves both)
├── .dockerignore, .gitignore
├── README.md                  Setup, run, deploy, accounts, limitations
├── ARCHITECTURE.md            Stack, data model, access model, cuts
├── AI_WORKFLOW.md             Tools, speed-ups, rejected output, verification
├── SUBMISSION.md              This document
└── video.txt                  Walkthrough video link
```

## 11. Deliverables checklist

- [x] Source code (public repo)
- [x] `README.md` — local run, seeded accounts, deploy
- [x] Architecture note — `ARCHITECTURE.md` (also summarized above)
- [x] AI workflow note — `AI_WORKFLOW.md` (also summarized above)
- [x] `SUBMISSION.md` — this file
- [x] Seeded accounts + sharing test steps
- [x] Automated test (`pytest`, access-control + round-trip)
- [x] Dockerfile / deployment path (Render + Neon instructions)
- [ ] Live URL — add after Render deploy
- [ ] `video.txt` — add Loom/YouTube link after recording
