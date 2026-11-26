# AI Workflow Note

## Tools used

- **opencode CLI (AI coding agent)** — plan critique, full implementation pass, tests, Dockerfile, and these docs.
- An earlier AI-drafted plan for the assignment (stack choice, data model, API, 240-minute schedule) served as the starting point. The first thing done was to stress-test that plan before writing code.

## Where AI materially sped things up

- Generating the complete FastAPI app (models, auth, access helper, routes, seed, static serving) in one pass instead of an hour of boilerplate.
- Wiring TipTap 3 + React 19 + Vite, including the autosave queue, unmount/beforeunload flush, and the viewer/editor permission UI states.
- Producing the pytest fixture pattern (temp SQLite DB set via env before app import) and the access-control test matrix.
- Writing the multi-stage Dockerfile and the HTTP smoke script used to verify both the bare server and the built image.

## What AI proposed and what was changed or rejected

The first plan was plausible but over-scoped for a 240-minute cap. Concrete rejections:

1. **JWT *or* session cookie → session cookie only.** A signed httpOnly cookie via Starlette's `SessionMiddleware` deletes token plumbing in React and the JWT branch entirely. There was no requirement JWT served.
2. **Password login with a shared demo password → user picker over seeded accounts.** The brief explicitly allows mocked auth. The picker removes password hashing, a shared-password README caveat, and makes switching between Alice and Bob (the whole point of a sharing demo) one click instead of an incognito-window dance.
3. **Server-side import endpoint supporting `.docx` → client-side `.md`/`.txt` import.** `FileReader` + `marked` is a few lines and deletes a multipart endpoint, file-type/size validation on the server, and a `python-docx` dependency. `.docx` was cut and the limitation stated in the UI and README.
4. **Permission logic in each route → one `get_doc(..., need=view|edit|own)` helper.** The original plan only had view/edit, which would have let an *editor* re-share a document — a real permission bug. The third mode (`own`) fixes it and the test asserts an editor gets 403 on `POST /share`.
5. **Duplicate process/AI notes → one `AI_WORKFLOW.md`** kept as the single running log.

## Bugs and traps caught during the build

- **Load-triggered autosave:** mounting the editor with fetched content risks an immediate PATCH (possibly an empty one) on open. The editor is mounted only after the document loads, with `content` passed once; saves only come from user updates.
- **Lost edits on quick refresh:** a plain debounce loses keystrokes when the reviewer types and refreshes within the debounce window. Added an unmount flush plus a `keepalive` fetch on `beforeunload`.
- **Redundant dependency:** verified that TipTap 3's StarterKit already bundles Underline instead of adding `@tiptap/extension-underline` blindly — the package is not in `package.json`.
- **Deploy-time DB surprises:** `DATABASE_URL` values starting with `postgres://` are normalized to `postgresql://`, and seeding is idempotent so restarts do not duplicate users.

## How correctness was verified

- **Automated:** `pytest` — access matrix (Bob 403 → share as viewer → 200 → PATCH 403 → re-share 403; editor can PATCH but not share) and an HTML content round-trip.
- **Integration:** a Python smoke script run against a real uvicorn process and then against the built Docker image on a separate port: login as two users, create/patch/read a document, share, assert viewer restrictions, assert the seeded shared document appears for Bob.
- **Manual (submitter):** two-browser sharing walkthrough and formatting round-trip after refresh, recorded in the walkthrough video.

## What was not delegated to AI

Scope decisions, the cut list, and the permission model were chosen deliberately (see `ARCHITECTURE.md`); AI output was reviewed against those decisions rather than accepted wholesale.
