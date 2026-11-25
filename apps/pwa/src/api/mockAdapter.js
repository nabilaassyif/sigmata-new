const KEY = 'sigmata.mock.complaints';
const delay = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));
const load = () => JSON.parse(localStorage.getItem(KEY) || '{}');
const save = (value) => localStorage.setItem(KEY, JSON.stringify(value));

// Fake lifecycle based on age so the UI shows each backend status.
function statusFor(createdAt) {
  const age = Date.now() - createdAt;
  if (age < 10_000) return 'pending';
  if (age < 30_000) return 'awaitingOperator';
  return 'forwarded';
}

function toPhotoDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export const mockAdapter = {
  async getSession() {
    await delay(100);
    return { subject: 'mock-citizen', roles: ['citizen'] };
  },
  loginUrl: () => '#',
  registerUrl: () => '#',
  async logout() {},

  async createComplaint({ description, photo }) {
    await delay();
    const id = crypto.randomUUID();
    const store = load();
    const createdAt = Date.now();
    store[id] = {
      complaintId: id,
      description,
      createdAt,
      photo: photo ? await toPhotoDataUrl(photo) : null,
      category: 'Infrastruktur Jalan',
      agency: 'Dinas Pekerjaan Umum',
    };
    save(store);
    return { complaintId: id, status: 'pending', replayed: false };
  },

  async listComplaints() {
    const ids = Object.keys(load());
    const items = await Promise.all(ids.map((id) => mockAdapter.getComplaint(id)));
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getComplaint(id) {
    await delay(150);
    const item = load()[id];
    if (!item) {
      const error = new Error('Not found');
      error.status = 404;
      throw error;
    }
    const status = statusFor(item.createdAt);
    const iso = new Date(item.createdAt).toISOString();
    return {
      complaintId: id,
      status,
      description: item.description,
      category: status === 'forwarded' ? item.category : null,
      agency: status === 'forwarded' ? item.agency : null,
      suggestedCategory: item.category,
      suggestedAgency: item.agency,
      reviewReason: null,
      createdAt: iso,
      updatedAt: iso,
      operatorStartedAt: null,
      forwardedAt: status === 'forwarded' ? iso : null,
      hasPhoto: Boolean(item.photo),
    };
  },

  photoUrl: (id) => load()[id]?.photo ?? null,
};
