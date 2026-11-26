import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { EditorContent, useEditor, type Editor as TiptapEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { api, errMsg, type DocDetail, type Share, type User } from './api'

type Status = 'idle' | 'saving' | 'saved' | 'error'
type Patch = { title?: string; content_html?: string }

export default function DocumentView({ id, user }: { id: number; user: User }) {
  const [doc, setDoc] = useState<DocDetail | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .getDoc(id)
      .then(setDoc)
      .catch((e) => setError(errMsg(e)))
  }, [id])

  if (error) {
    return (
      <div className="page">
        <header className="topbar">
          <a href="#/" className="btn ghost">
            ← Documents
          </a>
          <strong>Document</strong>
        </header>
        <main className="content">
          <p className="error">{error}</p>
        </main>
      </div>
    )
  }
  if (!doc) return <div className="center muted">Loading…</div>
  return <DocumentEditor doc={doc} user={user} />
}

function DocumentEditor({ doc, user }: { doc: DocDetail; user: User }) {
  const canEdit = doc.role !== 'viewer'
  const [title, setTitle] = useState(doc.title)
  const [status, setStatus] = useState<Status>('idle')
  const [shareOpen, setShareOpen] = useState(false)
  const [tick, setTick] = useState(0)

  const pending = useRef<Patch>({})
  const timer = useRef<number>(0)
  const flush = useCallback(() => {
    window.clearTimeout(timer.current)
    const patch = pending.current
    if (patch.title === undefined && patch.content_html === undefined) return
    pending.current = {}
    setStatus('saving')
    api
      .patchDoc(doc.id, patch)
      .then(() => setStatus('saved'))
      .catch(() => setStatus('error'))
  }, [doc.id])

  const queue = useCallback(
    (patch: Patch) => {
      pending.current = { ...pending.current, ...patch }
      setStatus('saving')
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(flush, 600)
    },
    [flush],
  )

  useEffect(() => {
    const unload = () => {
      const patch = pending.current
      if (patch.title === undefined && patch.content_html === undefined) return
      fetch(`/api/documents/${doc.id}`, {
        method: 'PATCH',
        keepalive: true,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    }
    window.addEventListener('beforeunload', unload)
    return () => {
      window.removeEventListener('beforeunload', unload)
      flush()
    }
  }, [doc.id, flush])

  const editor = useEditor({
    extensions: [StarterKit],
    content: doc.content_html,
    editable: canEdit,
    onUpdate: ({ editor }) => queue({ content_html: editor.getHTML() }),
  })

  useEffect(() => {
    if (!editor) return
    const onChange = () => setTick((n) => n + 1)
    editor.on('transaction', onChange)
    return () => {
      editor.off('transaction', onChange)
    }
  }, [editor])
  void tick

  const onTitle = (value: string) => {
    setTitle(value)
    queue({ title: value.trim() ? value : 'Untitled' })
  }

  return (
    <div className="page editor-page">
      <header className="topbar">
        <a href="#/" className="btn ghost">
          ← Documents
        </a>
        <input
          className="title-input"
          value={title}
          disabled={!canEdit}
          onChange={(e) => onTitle(e.target.value)}
          onBlur={() => {
            if (!title.trim()) setTitle('Untitled')
          }}
          aria-label="Document title"
        />
        {canEdit && (
          <span className={`status ${status}`}>
            {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? 'Save failed' : ''}
          </span>
        )}
        {doc.role === 'owner' && (
          <button className="btn" onClick={() => setShareOpen(true)}>
            Share
          </button>
        )}
        <span className={`chip ${doc.role}`}>{doc.role}</span>
      </header>

      {canEdit && editor && <Toolbar editor={editor} />}

      <main className="content">
        <div className="editor-shell">
          <EditorContent editor={editor} />
        </div>
        {!canEdit && (
          <p className="muted small">
            You have view-only access to this document, shared by {doc.owner_name}.
          </p>
        )}
      </main>

      {shareOpen && <ShareDialog doc={doc} user={user} onClose={() => setShareOpen(false)} />}
    </div>
  )
}

function Toolbar({ editor }: { editor: TiptapEditor }) {
  const btn = (label: ReactNode, active: boolean, run: () => void) => (
    <button
      type="button"
      className={`tbtn${active ? ' active' : ''}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      {label}
    </button>
  )
  return (
    <div className="toolbar">
      {btn(<b>B</b>, editor.isActive('bold'), () => editor.chain().focus().toggleBold().run())}
      {btn(<i>I</i>, editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run())}
      {btn(<u>U</u>, editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run())}
      <span className="sep" />
      {btn('H1', editor.isActive('heading', { level: 1 }), () =>
        editor.chain().focus().toggleHeading({ level: 1 }).run(),
      )}
      {btn('H2', editor.isActive('heading', { level: 2 }), () =>
        editor.chain().focus().toggleHeading({ level: 2 }).run(),
      )}
      <span className="sep" />
      {btn('• List', editor.isActive('bulletList'), () =>
        editor.chain().focus().toggleBulletList().run(),
      )}
      {btn('1. List', editor.isActive('orderedList'), () =>
        editor.chain().focus().toggleOrderedList().run(),
      )}
    </div>
  )
}

function ShareDialog({ doc, user, onClose }: { doc: DocDetail; user: User; onClose: () => void }) {
  const [users, setUsers] = useState<User[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'editor' | 'viewer'>('viewer')
  const [shares, setShares] = useState<Share[]>(doc.shares ?? [])
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .users()
      .then(setUsers)
      .catch((e) => setError(errMsg(e)))
  }, [])

  const sharedIds = new Set(shares.map((s) => s.user_id))
  const candidates = users.filter((u) => u.id !== user.id && !sharedIds.has(u.id))

  const add = async () => {
    setError('')
    try {
      await api.share(doc.id, email, role)
      const fresh = await api.getDoc(doc.id)
      setShares(fresh.shares ?? [])
      setEmail('')
    } catch (e) {
      setError(errMsg(e))
    }
  }

  const remove = async (userId: number) => {
    setError('')
    try {
      await api.unshare(doc.id, userId)
      setShares((s) => s.filter((x) => x.user_id !== userId))
    } catch (e) {
      setError(errMsg(e))
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>Share “{doc.title}”</h2>
        <div className="row">
          <select value={email} onChange={(e) => setEmail(e.target.value)} aria-label="User">
            <option value="">Choose a user…</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.email}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')}
            aria-label="Role"
          >
            <option value="viewer">Can view</option>
            <option value="editor">Can edit</option>
          </select>
          <button className="btn primary" disabled={!email} onClick={add}>
            Add
          </button>
        </div>
        {shares.length > 0 && (
          <ul className="share-list">
            {shares.map((s) => (
              <li key={s.user_id}>
                <span>
                  {s.name} <span className="muted small">{s.email}</span>
                </span>
                <span className={`chip ${s.role}`}>{s.role}</span>
                <button className="btn ghost small" onClick={() => remove(s.user_id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="error">{error}</p>}
        <div className="dialog-actions">
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
