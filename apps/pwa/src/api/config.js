const MODES = ['mock', 'localbe', 'prodbe'];

// Resolved from VITE_API_MODE, falling back to the Vite --mode (dev:mock / dev:localbe / dev:prodbe).
const requested = import.meta.env.VITE_API_MODE || import.meta.env.MODE;
export const API_MODE = MODES.includes(requested) ? requested : 'mock';

function resolveBaseUrl() {
  if (API_MODE === 'prodbe') {
    const url = import.meta.env.VITE_PROD_API_URL;
    if (!url) throw new Error('VITE_PROD_API_URL is required when VITE_API_MODE=prodbe');
    return url.replace(/\/+$/, '');
  }
  if (API_MODE === 'localbe') {
    const raw = (import.meta.env.VITE_LOCAL_API_URL || '').replace(/\/+$/, '');
    // Always prefer same-origin '/api' when running on the Vite dev server (:5173)
    // so Vite proxies '/api' without CORS issues and preserves HttpOnly session cookies.
    if (typeof window !== 'undefined' && window.location.port === '5173' && (!raw || raw.startsWith('http://localhost:8080') || raw.startsWith('http://127.0.0.1:8080'))) {
      return '';
    }
    return raw;
  }
  return '';
}

export const API_BASE_URL = API_MODE === 'mock' ? '' : resolveBaseUrl();
export const IS_MOCK = API_MODE === 'mock';
