import { API_BASE_URL } from './config';

const CITIZEN = `${API_BASE_URL}/api/citizen`;
const AUTH = `${API_BASE_URL}/api/auth/citizen`;

export class ApiError extends Error {
  constructor(status, message) {
    super(message || `Request failed (${status})`);
    this.status = status;
  }
}

async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { credentials: 'include', cache: 'no-store', ...options });
  } catch {
    throw new ApiError(0, 'Tidak dapat terhubung ke server');
  }
  if (!response.ok) {
    const text = (await response.text().catch(() => '')).trim();
    throw new ApiError(response.status, text || undefined);
  }
  return response.status === 204 ? null : response.json();
}

export const httpAdapter = {
  async getSession() {
    try {
      return await request(`${AUTH}/session`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },

  loginUrl: () => `${AUTH}/login`,
  registerUrl: () => `${AUTH}/login?action=register`,

  // The backend logout is a same-site POST that answers with a redirect to Keycloak.
  async logout() {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = `${AUTH}/logout`;
    document.body.appendChild(form);
    form.submit();
  },

  async createComplaint({ description, photo, latitude, longitude }) {
    const complaint = { description };
    if (latitude != null && longitude != null) Object.assign(complaint, { latitude, longitude });
    const headers = { 'Idempotency-Key': crypto.randomUUID() };
    let body;
    if (photo) {
      body = new FormData();
      body.append('complaint', JSON.stringify(complaint));
      body.append('photo', photo);
    } else {
      body = JSON.stringify(complaint);
      headers['Content-Type'] = 'application/json';
    }
    return request(`${CITIZEN}/complaints`, { method: 'POST', headers, body });
  },

  async listComplaints() {
    const data = await request(`/complaints`);
    return data.complaints;
  },

  getComplaint: (id) => request(`${CITIZEN}/complaints/${encodeURIComponent(id)}`),
  photoUrl: (id) => `${CITIZEN}/complaints/${encodeURIComponent(id)}/photo`,
};
