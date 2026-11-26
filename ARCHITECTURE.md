# Architecture

## Shape

One deployable: a FastAPI process serves the JSON API under `/api` and the built React SPA from the same origin (no CORS, no second service). Local dev runs Vite on `:5173` with `/api` proxied to uvicorn on `:8000`.

- **Frontend:** React 19 + Vite, TipTap 3 (StarterKit gives bold, italic, underline, headings, lists) storing HTML.
- **Backend:** FastAPI + SQLAlchemy 2, Pydantic request models.
- **Storage:** SQLite by default (`backend/data.db`); Postgres (Neon free tier) in production via `DATABASE_URL`. Schema is created with `create_all` plus an idempotent seed on startup — no migration tooling for a 3-table app.
- **Auth:** intentionally mocked. `GET /api/users` lists seeded accounts; `POST /api/auth/login` sets a signed, httpOnly session cookie (Starlette `SessionMiddleware`). No passwords, no JWT.

## Data model

```
users(id, email unique, name)
documents(id, owner_id → users, title, content_html, created_at, updated_at)
shares(id, document_id → documents, user_id → users, role)   role ∈ {editor, viewer}
                                                             unique(document_id, user_id)
```

Ownership is a column on the document; sharing is a separate row per user. A document is never duplicated.

## Access model

Every document route goes through one helper, `get_doc(db, user, doc_id, need)`:

| `need` | Owner | Editor share | Viewer share | No share |
|---|---|---|---|---|
| `view` | allowed | allowed | allowed | 403 |
| `edit` | allowed | allowed | 403 | 403 |
| `own` (share/unshare) | allowed | 403 | 403 | 403 |

Unknown document IDs return 404; known documents without access return 403. The owner-only mode exists because view/edit alone would let an editor re-share the document — a real permission bug the automated test pins down.

## Editing and persistence

- TipTap emits HTML on every change; a 600 ms debounce PATCHes `content_html` (and title edits use the same queue, coalesced).
- Pending edits are flushed when the editor unmounts and, on tab close, via a `keepalive` fetch — so type-and-refresh does not lose the last keystrokes.
- The editor is only mounted after the document is fetched, keyed by document id, so loading content cannot trigger a save and switching documents cannot leak state between them.
- Last-write-wins is deliberate: no real-time sync, no OT/CRDT, no versioning.

## Import

Import is entirely client-side: `FileReader` reads the file, `marked` converts Markdown (plain text is wrapped in paragraphs), and the HTML is created as a new document through the normal create API. There is no upload endpoint and no server-side file handling. Stored HTML is only ever rendered through TipTap's schema parser, which drops unknown nodes and attributes, so there is no raw-HTML rendering path.

## Deliberate cuts

- No real-time collaboration or presence — the single hardest part to do well, explicitly out of scope
- No comments, suggestions, version history, or document deletion
- `.docx` import dropped: messy HTML from tables/images, and a server-side parser for marginal demo value
- No passwords or OAuth: the brief permits mocked auth, and a user picker makes the sharing flow faster for a reviewer
- No Alembic: `create_all` is enough for this schema size; the upgrade path is documented as a next step

## If this grew

Real-time editing via Yjs/WebSocket (the natural next step), proper migrations, per-document ETags or version numbers for optimistic concurrency, an owner-only delete/trash flow, and Playwright coverage of the two-user sharing flow.
