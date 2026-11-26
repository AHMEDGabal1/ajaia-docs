# Submission

## Links

- **Live app:** TODO — add the Render URL here and in the Google Drive folder
- **Walkthrough video:** TODO — add the Loom/YouTube link to `video.txt`
- **Source:** https://github.com/AHMEDGabal1/ajaia-docs

## Test accounts

Mocked auth — no passwords. On the login screen, pick one of:

| User | Email | Seeded state |
|---|---|---|
| Alice | `alice@example.com` | Owns "Welcome to Ajaia Docs" |
| Bob | `bob@example.com` | Welcome doc shared with him as **viewer** |
| Carol | `carol@example.com` | No documents |

To test sharing: sign in as Alice → open a document → **Share** → add Bob (viewer or editor) → open a second browser/incognito window as Bob. Bob sees it under **Shared with me**; viewer mode is read-only.

## What is included

```
ajaia-docs/
├── backend/
│   ├── app.py              FastAPI app: models, auth, access helper, routes, seed, SPA serving
│   ├── test_app.py         Access-control + content round-trip tests
│   ├── conftest.py         Test DB setup
│   └── requirements.txt    Pinned Python dependencies
├── frontend/
│   ├── src/App.tsx         Session + hash routing
│   ├── src/Login.tsx       Seeded-user picker (mocked auth)
│   ├── src/Dashboard.tsx   Owned / Shared tabs, create, .md/.txt import
│   ├── src/DocumentView.tsx TipTap editor, toolbar, autosave, share dialog
│   ├── src/api.ts          Typed API client
│   ├── src/styles.css      UI styles
│   ├── index.html, vite.config.ts, tsconfig.json, package.json, package-lock.json
├── Dockerfile              Multi-stage build (Vite → static files, FastAPI serves both)
├── .dockerignore, .gitignore
├── README.md               Setup, run, deploy, accounts, limitations
├── ARCHITECTURE.md         Stack, data model, access model, cuts
├── AI_WORKFLOW.md          Tools, speed-ups, rejected output, verification
├── SUBMISSION.md           This file
└── video.txt               Walkthrough video link
```

## Working end to end

- Create, rename, edit, and reopen documents; content and formatting persist across refresh
- Rich text: bold, italic, underline, H1/H2, bulleted and numbered lists
- Debounced autosave with flush on navigation and tab close
- Import `.md` and `.txt` as new documents (client-side); supported types stated in the UI
- Owner can share with another user as viewer or editor, change role, or remove access
- Viewer sees a read-only editor with no toolbar; editor can edit but cannot re-share
- Dashboard distinguishes owned vs shared documents
- Seeded users, Dockerized single-service deploy, automated access-control test

## Incomplete / known limitations

- Last-write-wins only: no real-time collaboration, presence, or conflict handling
- No version history, comments, document deletion, or link-based sharing
- `.docx` import intentionally unsupported
- No password/OAuth login (mocked auth is allowed by the brief)
- If a viewer's access is revoked while the document is open, the next autosave shows "Save failed" rather than redirecting them
- No automated browser (E2E) test; UI was verified manually and via the HTTP smoke test

## Next 2–4 hours

1. Real-time collaboration (Yjs + WebSocket) or at least optimistic-concurrency via document version numbers
2. Document deletion / trash for owners
3. Export to Markdown or PDF
4. Playwright test for the two-user sharing flow
5. Alembic migrations and a small CI workflow (lint + tests)
