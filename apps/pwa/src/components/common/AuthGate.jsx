import { useEffect, useState } from 'react';
import { api, IS_MOCK, API_MODE } from '../../api';

// Blocks the app until a citizen session exists (always signed in when running against the mock API).
export function AuthGate({ children }) {
  const [state, setState] = useState('loading'); // loading | signedIn | signedOut | error

  useEffect(() => {
    let cancelled = false;
    api
      .getSession()
      .then((session) => !cancelled && setState(session ? 'signedIn' : 'signedOut'))
      .catch(() => !cancelled && setState('error'));
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'signedIn') return children;

  return (
    <div className="sig-page" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center', minHeight: '100vh' }}>
      <h1 style={{ margin: 0 }}>Sigmata</h1>
      {state === 'loading' && <p>Memeriksa sesi...</p>}
      {state === 'error' && (
        <>
          <p>Tidak dapat terhubung ke server ({API_MODE}). Pastikan API berjalan.</p>
          <button type="button" className="sig-button sig-button--primary sig-button--full" onClick={() => window.location.reload()}>
            Coba lagi
          </button>
        </>
      )}
      {state === 'signedOut' && !IS_MOCK && (
        <>
          <p>Masuk untuk membuat dan melihat laporan.</p>
          <a className="sig-button sig-button--primary sig-button--full" href={api.loginUrl()}>
            Masuk
          </a>
          <a className="sig-button sig-button--secondary sig-button--full" href={api.registerUrl()}>
            Daftar
          </a>
        </>
      )}
    </div>
  );
}
