export type User = { id: number; email: string; name: string }
export type DocSummary = {
  id: number
  title: string
  updated_at: string
  role: string
  owner_name: string
}
export type Share = { user_id: number; email: string; name: string; role: string }
export type DocDetail = {
  id: number
  title: string
  content_html: string
  updated_at: string
  role: string
  owner_name: string
  shares?: Share[]
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (options.body) headers['Content-Type'] = 'application/json'
  const res = await fetch(`/api${path}`, { credentials: 'include', ...options, headers })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new ApiError(res.status, data?.detail || res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  users: () => req<User[]>('/users'),
  me: () => req<User>('/me'),
  login: (email: string) =>
    req<User>('/auth/login', { method: 'POST', body: JSON.stringify({ email }) }),
  logout: () => req('/auth/logout', { method: 'POST' }),
  listDocs: () => req<{ owned: DocSummary[]; shared: DocSummary[] }>('/documents'),
  createDoc: (title: string, content_html = '') =>
    req<DocDetail>('/documents', { method: 'POST', body: JSON.stringify({ title, content_html }) }),
  getDoc: (id: number) => req<DocDetail>(`/documents/${id}`),
  patchDoc: (id: number, patch: { title?: string; content_html?: string }) =>
    req(`/documents/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  share: (id: number, email: string, role: string) =>
    req(`/documents/${id}/share`, { method: 'POST', body: JSON.stringify({ email, role }) }),
  unshare: (id: number, userId: number) =>
    req(`/documents/${id}/share/${userId}`, { method: 'DELETE' }),
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
