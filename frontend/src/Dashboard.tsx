import { useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import { api, errMsg, type DocSummary, type User } from './api'

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function textToHtml(text: string) {
  return text
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

export default function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [docs, setDocs] = useState<{ owned: DocSummary[]; shared: DocSummary[] } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api
      .listDocs()
      .then(setDocs)
      .catch((e) => setError(errMsg(e)))
  }, [])

  const newDoc = async () => {
    setBusy(true)
    setError('')
    try {
      const d = await api.createDoc('Untitled')
      window.location.hash = `#/doc/${d.id}`
    } catch (e) {
      setError(errMsg(e))
      setBusy(false)
    }
  }

  const onImport = async (file: File) => {
    setBusy(true)
    setError('')
    try {
      const name = file.name.replace(/\.(md|txt)$/i, '')
      const text = await file.text()
      const html =
        /\.md$/i.test(file.name) ? (marked.parse(text) as string) : textToHtml(text)
      const d = await api.createDoc(name || 'Imported document', html)
      window.location.hash = `#/doc/${d.id}`
    } catch (e) {
      setError(errMsg(e))
      setBusy(false)
    }
  }

  const rows = (list: DocSummary[], showOwner: boolean) =>
    list.map((d) => (
      <a key={d.id} className="doc-row" href={`#/doc/${d.id}`}>
        <span className="doc-title">{d.title}</span>
        {showOwner && <span className="muted small">by {d.owner_name}</span>}
        <span className="doc-date muted small">
          {new Date(d.updated_at).toLocaleDateString()}
        </span>
        <span className={`chip ${d.role}`}>{d.role}</span>
      </a>
    ))

  return (
    <div className="page">
      <header className="topbar">
        <strong>Ajaia Docs</strong>
        <span className="spacer" />
        <span className="muted">{user.name}</span>
        <button className="btn ghost" onClick={onLogout}>
          Log out
        </button>
      </header>
      <main className="content">
        <div className="actions">
          <button className="btn primary" onClick={newDoc} disabled={busy}>
            New document
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
            Import .md / .txt
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".md,.txt"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onImport(f)
              e.target.value = ''
            }}
          />
        </div>
        <p className="muted small">Import supports Markdown (.md) and plain text (.txt) only.</p>
        {error && <p className="error">{error}</p>}
        {docs === null ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <section>
              <h2>My documents</h2>
              {docs.owned.length ? (
                rows(docs.owned, false)
              ) : (
                <p className="muted small">Nothing yet — create a document or import a file.</p>
              )}
            </section>
            <section>
              <h2>Shared with me</h2>
              {docs.shared.length ? (
                rows(docs.shared, true)
              ) : (
                <p className="muted small">Nothing shared with you yet.</p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
