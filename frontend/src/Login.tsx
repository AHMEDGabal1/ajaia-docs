import { useEffect, useState } from 'react'
import { api, errMsg, type User } from './api'

export default function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [users, setUsers] = useState<User[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    api.users().then(setUsers).catch((e) => setError(errMsg(e)))
  }, [])

  return (
    <div className="center">
      <div className="card login-card">
        <h1>Ajaia Docs</h1>
        <p className="muted">
          Pick a seeded account to sign in. Auth is mocked for this demo — there are no passwords.
        </p>
        {users.map((u) => (
          <button
            key={u.id}
            className="btn block"
            onClick={() =>
              api
                .login(u.email)
                .then(onLogin)
                .catch((e) => setError(errMsg(e)))
            }
          >
            Continue as {u.name} <span className="muted">({u.email})</span>
          </button>
        ))}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  )
}
