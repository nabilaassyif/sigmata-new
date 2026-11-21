import { useCallback, useEffect, useState } from 'react'

type Session = { subject: string; roles: string[] | null }
type SessionStatus = 'loading' | 'signedIn' | 'signedOut' | 'error'

const authPath = '/api/auth/internal'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<SessionStatus>('loading')

  const checkSession = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`${authPath}/session`, { credentials: 'same-origin', cache: 'no-store', signal })
      if (response.status === 401) {
        setSession(null)
        setStatus('signedOut')
        return
      }
      if (!response.ok) throw new Error('Session request failed')
      const data: Session = await response.json()
      setSession(data)
      setStatus('signedIn')
    } catch {
      if (signal?.aborted) return
      setSession(null)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void checkSession(controller.signal)
    return () => controller.abort()
  }, [checkSession])

  return (
    <main className="mx-auto max-w-xl px-5 py-12 text-black">
      <h1 className="text-2xl font-bold">SIGMATA Staff - Auth Test</h1>
      <p className="mt-2 text-sm text-neutral-600">Test the shared Go authentication service.</p>

      <section className="mt-8 border border-black p-5" aria-labelledby="sessionTitle">
        <h2 id="sessionTitle" className="text-lg font-semibold">Session</h2>
        <div className="mt-3 text-sm" role="status" aria-live="polite">
          {status === 'loading' && <p>Checking session...</p>}
          {status === 'signedOut' && <p>Not signed in.</p>}
          {status === 'error' && <p>Could not check the session. Make sure the API and Redis are running.</p>}
          {status === 'signedIn' && session && (
            <div className="space-y-2 break-words">
              <p>Signed in.</p>
              <p><strong>Subject:</strong> {session.subject}</p>
              <p><strong>Roles:</strong> {session.roles?.join(', ') || 'None'}</p>
            </div>
          )}
        </div>
        <button type="button" className="mt-4 border border-black px-3 py-2 text-sm hover:bg-neutral-100 disabled:opacity-50" disabled={status === 'loading'} onClick={() => { setStatus('loading'); void checkSession() }}>
          Check session
        </button>
      </section>

      <section className="mt-6" aria-label="Authentication actions">
        <div className="flex flex-wrap items-center gap-3">
          <a href={`${authPath}/login`} className="inline-block bg-black px-4 py-2 text-sm text-white hover:bg-neutral-800">Log in</a>
          
          <form action={`${authPath}/logout`} method="post">
            <button type="submit" className="border border-black px-4 py-2 text-sm hover:bg-neutral-100 disabled:opacity-50" disabled={status !== 'signedIn'}>Log out</button>
          </form>
        </div>
        <p className="mt-4 text-sm text-neutral-600">Staff accounts are created by an administrator.</p>
      </section>
    </main>
  )
}

export default App
