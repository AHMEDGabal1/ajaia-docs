import { useEffect, useState } from 'react'
import { api, type User } from './api'
import Login from './Login'
import Dashboard from './Dashboard'
import DocumentView from './DocumentView'

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [hash, setHash] = useState(window.location.hash)

  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null))
  }, [])

  useEffect(() => {
    const onHash = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (user === undefined) return <div className="center muted">Loading…</div>
  if (!user) return <Login onLogin={setUser} />

  const docMatch = hash.match(/^#\/doc\/(\d+)/)
  if (docMatch) {
    return <DocumentView key={docMatch[1]} id={Number(docMatch[1])} user={user} />
  }

  return (
    <Dashboard
      user={user}
      onLogout={async () => {
        await api.logout()
        window.location.hash = ''
        setUser(null)
      }}
    />
  )
}
