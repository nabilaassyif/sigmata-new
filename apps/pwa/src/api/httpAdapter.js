import { API_BASE_URL } from './config';

const CITIZEN = `${API_BASE_URL}/api/citizen`;
const V1 = `${API_BASE_URL}/api/v1`;
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

  // Sends a same-origin fetch POST with Origin header and follows Keycloak's seamless logout URL.
  async logout() {
    try {
      const data = await request(`${AUTH}/logout`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'fetch',
        },
      });
      if (data?.logoutUrl) {
        window.location.assign(data.logoutUrl);
        return;
      }
    } catch {
      // Fallback to form POST
    }
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = `${AUTH}/logout`;
    document.body.appendChild(form);
    form.submit();
  },

  async createComplaint({
    description,
    photo,
    latitude,
    longitude,
    isPublic = true,
    district = '',
    city = '',
    complaintType = 'non_oversight',
  }) {
    if (!photo) {
      throw new ApiError(400, 'Foto dokumentasi bukti wajib dilampirkan.');
    }
    const complaint = { description, isPublic, complaintType };
    if (district) complaint.district = district;
    if (city) complaint.city = city;
    if (latitude != null && longitude != null) Object.assign(complaint, { latitude, longitude });
    const headers = { 'Idempotency-Key': crypto.randomUUID() };
    const body = new FormData();
    body.append('complaint', JSON.stringify(complaint));
    body.append('photo', photo);
    return request(`${CITIZEN}/complaints`, { method: 'POST', headers, body });
  },

  async listComplaints() {
    const data = await request(`${CITIZEN}/complaints`);
    return data.complaints;
  },

  async listPublicFeed(sort = 'terbaru') {
    const data = await request(`${CITIZEN}/feed?sort=${encodeURIComponent(sort)}`);
    return data.complaints;
  },

  getComplaintSLA: (id) => request(`${V1}/complaints/${encodeURIComponent(id)}/sla`),

  submitCitizenSLAResponse: (id, action, note = '') =>
    request(`${CITIZEN}/complaints/${encodeURIComponent(id)}/sla/citizen-response`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({ action, note }),
    }),

  toggleUpvote: (id) =>
    request(`${CITIZEN}/complaints/${encodeURIComponent(id)}/upvote`, { method: 'POST' }),

  corroborateComplaint: (id, { note = '', latitude = null, longitude = null } = {}) => {
    const payload = { note };
    if (latitude != null && longitude != null) {
      payload.latitude = latitude;
      payload.longitude = longitude;
    }
    return request(`${CITIZEN}/complaints/${encodeURIComponent(id)}/corroborate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  getComplaint: (id) => request(`${CITIZEN}/complaints/${encodeURIComponent(id)}`),
  photoUrl: (id) => `${CITIZEN}/complaints/${encodeURIComponent(id)}/photo`,

  getProfile: () => request(`${CITIZEN}/profile`),
  uploadAvatar: (file) => {
    const body = new FormData();
    body.append('avatar', file);
    return request(`${CITIZEN}/profile/avatar`, { method: 'POST', body });
  },
  saveProfile: (profile) =>
    request(`${CITIZEN}/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    }),
};
