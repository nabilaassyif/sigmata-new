const KEY = 'sigmata.mock.complaints.v3';
const FEED_KEY = 'sigmata.mock.feed.v2';
const delay = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));
const load = () => JSON.parse(localStorage.getItem(KEY) || '{}');
const save = (value) => localStorage.setItem(KEY, JSON.stringify(value));

function computeScore(upvotes = 1, corroborations = 0) {
  return 1.0 + Math.log1p(Math.max(0, upvotes)) * 2.0 + Math.max(0, corroborations) * 3.5;
}

// Mock payload mimics authoritative backend SLA structures (for mock mode UI previews only).
function buildMockSLASummary(item, status) {
  const createdMs = typeof item.createdAt === 'number' ? item.createdAt : new Date(item.createdAt).getTime();
  const startedIso = new Date(createdMs).toISOString();
  const verifDueIso = new Date(createdMs + 3 * 24 * 3600 * 1000).toISOString();
  const resDueIso = new Date(createdMs + 14 * 24 * 3600 * 1000).toISOString();
  const isForwarded = status === 'forwarded';

  const responseClock = {
    instanceId: `mock-resp-${item.complaintId}`,
    ruleCode: 'TNG_VERIFICATION',
    ruleName: 'Verifikasi dan Telaahan Pengaduan',
    workflowStage: 'verification',
    deadlineKind: 'response',
    complaintType: item.complaintType || 'non_oversight',
    responsibleActor: 'operator',
    assignedAgency: null,
    triggeringEvent: 'complaint_received',
    startedAt: startedIso,
    originalDueAt: verifDueIso,
    dueAt: verifDueIso,
    remainingSeconds: Math.floor((new Date(verifDueIso).getTime() - Date.now()) / 1000),
    remainingDisplay: isForwarded ? 'Selesai sesuai tahap' : 'Dalam batas verifikasi (3 hari kerja)',
    durationValue: 3,
    timeUnit: 'working_days',
    status: isForwarded ? 'completed' : 'active',
    complianceStatus: isForwarded ? 'completed' : 'on_track',
    approachingWarning: false,
    overdue: false,
    extensionCount: 0,
    extendedUntil: null,
    extensionReason: null,
    extensionPermitted: false,
    pausePermitted: false,
    escalationTarget: 'pejabat_pengelola_pengaduan',
    legalBasis: 'Perwali Kota Tangerang No. 40 Tahun 2025',
    articleReference: 'Pasal 17 ayat (2)',
    completedAt: isForwarded ? startedIso : null,
    breachedAt: null,
  };

  const resolutionClock = isForwarded
    ? {
        instanceId: `mock-res-${item.complaintId}`,
        ruleCode: item.complaintType === 'oversight' ? 'TNG_OVERSIGHT_STATUS' : 'TNG_ORDINARY_RESPONSE',
        ruleName:
          item.complaintType === 'oversight'
            ? 'Informasi Status Pengawasan (APIP)'
            : 'Penyampaian Tanggapan Pengaduan',
        workflowStage: item.complaintType === 'oversight' ? 'apip_oversight_handling' : 'opd_handling',
        deadlineKind: 'resolution',
        complaintType: item.complaintType || 'non_oversight',
        responsibleActor: item.complaintType === 'oversight' ? 'apip' : 'opdStaff',
        assignedAgency: item.agency || 'Dinas Pekerjaan Umum',
        triggeringEvent: 'distributed_to_liaison',
        startedAt: startedIso,
        originalDueAt: resDueIso,
        dueAt: resDueIso,
        remainingSeconds: Math.floor((new Date(resDueIso).getTime() - Date.now()) / 1000),
        remainingDisplay: 'Dalam penanganan OPD (14 hari kerja)',
        durationValue: item.complaintType === 'oversight' ? 60 : 14,
        timeUnit: 'working_days',
        status: 'active',
        complianceStatus: 'on_track',
        approachingWarning: false,
        overdue: false,
        extensionCount: 0,
        extendedUntil: null,
        extensionReason: null,
        extensionPermitted: false,
        pausePermitted: false,
        escalationTarget: 'penanggung_jawab_opd',
        legalBasis: 'Perwali Kota Tangerang No. 40 Tahun 2025',
        articleReference: item.complaintType === 'oversight' ? 'Pasal 22 ayat (3)' : 'Pasal 21 ayat (3)',
        completedAt: null,
        breachedAt: null,
      }
    : null;

  const clocks = resolutionClock ? [responseClock, resolutionClock] : [responseClock];
  const activeClocks = clocks.filter((c) => c.status === 'active');

  return {
    complaintId: item.complaintId,
    municipalityId: '00000000-0000-0000-0000-000000000001',
    municipalityName: 'Kota Tangerang',
    policyCode: 'TNG-PERWALI-40-2025',
    policyVersion: 1,
    regulationTitle: 'Peraturan Wali Kota Tangerang Nomor 40 Tahun 2025 tentang Pengelolaan Pengaduan Pelayanan Publik',
    timezone: 'Asia/Jakarta',
    currentStage: isForwarded ? 'opd_handling' : 'verification',
    complaintType: item.complaintType || 'non_oversight',
    resolutionState: 'open',
    responsibleActor: isForwarded ? 'opdStaff' : 'operator',
    responsibleAgency: isForwarded ? item.agency || 'Dinas Pekerjaan Umum' : null,
    citizenActionRequired: false,
    citizenActionStage: null,
    citizenActionDeadline: null,
    overallComplianceStatus: 'on_track',
    approachingDeadlineWarning: false,
    overdue: false,
    responseDeadline: responseClock,
    resolutionDeadline: resolutionClock,
    activeClocks,
    clocks,
    approvedExtensions: [],
    events: [
      {
        id: 1,
        slaInstanceId: responseClock.instanceId,
        complaintId: item.complaintId,
        idempotencyKey: `start:${item.complaintId}`,
        eventType: 'started',
        actor: 'citizen',
        previousStatus: null,
        newStatus: 'active',
        previousDueAt: null,
        newDueAt: verifDueIso,
        legalBasis: 'Perwali Kota Tangerang No. 40 Tahun 2025 (Pasal 17 ayat (2))',
        details: {},
        occurredAt: startedIso,
      },
    ],
    gracePrediction: {
      predictedResolutionRisk: 'research_target_gt_7d_independent',
      statutoryComplianceIndependent: true,
      note: 'GRACE-LAKSA >7d resolution prediction is a research target only and is never treated as statutory SLA compliance.',
    },
  };
}

function ensureSeedFeed() {
  const raw = localStorage.getItem(FEED_KEY);
  if (raw) return JSON.parse(raw);
  const now = Date.now();
  const seeds = {
    'seed-1': {
      complaintId: 'seed-1',
      description:
        'Lampu penerangan jalan umum (PJU) padam sepanjang 500 meter di Jl. Pajajaran arah Pasteur sejak 3 hari lalu, sangat gelap dan rawan kejahatan.',
      createdAt: now - 4 * 3600 * 1000,
      district: 'Kec. Cicendo',
      city: 'Kota Tangerang',
      username: '@warga_peduli',
      category: 'Penerangan Jalan',
      agency: 'Dinas Perhubungan',
      status: 'forwarded',
      complaintType: 'non_oversight',
      upvoteCount: 28,
      corroborationCount: 4,
      viewerUpvoted: false,
      viewerCorroborated: false,
      corroborations: [
        { note: 'Benar, saya lewat tiap malam gelap total di dekat perempatan.', distanceMeters: 320, createdAt: new Date(now - 2 * 3600 * 1000).toISOString() },
        { note: 'Sudah 3 malam mati, mohon segera ditangani.', distanceMeters: 480, createdAt: new Date(now - 3600 * 1000).toISOString() },
      ],
      images: ['placeholder-1'],
      scope: 'kecamatan',
      period: 'harian',
    },
    'seed-2': {
      complaintId: 'seed-2',
      description:
        'Jalan berlubang cukup dalam di depan gerbang sekolah dasar membuat pengendara motor sering oleng saat jam berangkat sekolah.',
      createdAt: now - 14 * 3600 * 1000,
      district: 'Kec. Cipondoh',
      city: 'Kota Tangerang',
      username: 'Anonymous',
      category: 'Infrastruktur Jalan',
      agency: 'Dinas Pekerjaan Umum',
      status: 'awaitingOperator',
      complaintType: 'non_oversight',
      upvoteCount: 15,
      corroborationCount: 2,
      viewerUpvoted: false,
      viewerCorroborated: false,
      corroborations: [
        { note: 'Lubang tergenang air kalau hujan, sangat berbahaya bagi anak sekolah.', distanceMeters: 150, createdAt: new Date(now - 5 * 3600 * 1000).toISOString() },
      ],
      images: ['placeholder-1', 'placeholder-2'],
      scope: 'kota',
      period: 'harian',
    },
  };
  localStorage.setItem(FEED_KEY, JSON.stringify(seeds));
  return seeds;
}

function saveSeedFeed(seeds) {
  localStorage.setItem(FEED_KEY, JSON.stringify(seeds));
}

function statusFor(createdAt) {
  const age = Date.now() - createdAt;
  if (age < 10_000) return 'pending';
  if (age < 25_000) return 'awaitingOperator';
  return 'forwarded';
}

function buildEvents(item, status) {
  const createdIso = new Date(item.createdAt).toISOString();
  const events = [{ eventType: 'submitted', actor: 'citizen', details: {}, createdAt: createdIso }];
  if (status === 'awaitingOperator') {
    events.push({
      eventType: 'awaitingOperator',
      actor: 'worker',
      details: { reason: 'Menunggu verifikasi operator' },
      createdAt: new Date(item.createdAt + 10_000).toISOString(),
    });
  } else if (status === 'forwarded') {
    events.push({
      eventType: 'forwarded',
      actor: 'worker',
      details: { agency: item.agency },
      createdAt: new Date(item.createdAt + 25_000).toISOString(),
    });
  }
  for (const corr of item.corroborations || []) {
    events.push({
      eventType: 'corroborated',
      actor: 'warga-sekitar',
      details: { note: corr.note, distanceMeters: corr.distanceMeters },
      createdAt: corr.createdAt,
    });
  }
  return events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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

  async createComplaint({
    description,
    photo,
    latitude = null,
    longitude = null,
    isPublic = true,
    district = 'Cipondoh',
    city = 'Kota Tangerang',
    complaintType = 'non_oversight',
  }) {
    await delay();
    if (!photo) {
      const error = new Error('Foto dokumentasi bukti wajib dilampirkan.');
      error.status = 400;
      throw error;
    }
    const id = crypto.randomUUID();
    const store = load();
    const createdAt = Date.now();
    const upvoteCount = 1;
    const corroborationCount = 0;
    const priorityScore = computeScore(upvoteCount, corroborationCount);
    store[id] = {
      complaintId: id,
      description,
      createdAt,
      latitude,
      longitude,
      isPublic,
      complaintType,
      district: district || 'Cipondoh',
      city: city || 'Kota Tangerang',
      photo: await toPhotoDataUrl(photo),
      category: 'Infrastruktur Jalan',
      agency: 'Dinas Pekerjaan Umum',
      upvoteCount,
      corroborationCount,
      viewerUpvoted: true,
      viewerCorroborated: false,
      corroborations: [],
    };
    save(store);
    const slaSummary = buildMockSLASummary(store[id], 'pending');
    return {
      complaintId: id,
      status: 'pending',
      replayed: false,
      slaDueAt: slaSummary.responseDeadline.dueAt,
      slaSummary,
      upvoteCount,
      corroborationCount,
      priorityScore,
    };
  },

  async listComplaints() {
    const ids = Object.keys(load());
    const items = await Promise.all(ids.map((id) => mockAdapter.getComplaint(id)));
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async listPublicFeed() {
    await delay(120);
    const seeds = ensureSeedFeed();
    const own = load();
    const list = [];
    for (const item of Object.values(own)) {
      if (item.isPublic !== false) {
        list.push(await mockAdapter.getComplaint(item.complaintId));
      }
    }
    for (const s of Object.values(seeds)) {
      const priorityScore = computeScore(s.upvoteCount, s.corroborationCount);
      const slaSummary = buildMockSLASummary(s, s.status);
      list.push({
        ...s,
        createdAt: new Date(s.createdAt).toISOString(),
        updatedAt: new Date(s.createdAt).toISOString(),
        priorityScore,
        slaDueAt: slaSummary.resolutionDeadline?.dueAt || slaSummary.responseDeadline.dueAt,
        slaSummary,
        hasPhoto: Boolean(s.images?.length),
        events: buildEvents(s, s.status),
      });
    }
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getComplaint(id) {
    await delay(100);
    const item = load()[id] || ensureSeedFeed()[id];
    if (!item) {
      const error = new Error('Not found');
      error.status = 404;
      throw error;
    }
    const status = item.status || statusFor(item.createdAt);
    const iso = new Date(item.createdAt).toISOString();
    const upvotes = item.upvoteCount ?? 1;
    const corroborations = item.corroborationCount ?? 0;
    const priorityScore = computeScore(upvotes, corroborations);
    const slaSummary = buildMockSLASummary(item, status);
    const slaDueAt = slaSummary.resolutionDeadline?.dueAt || slaSummary.responseDeadline.dueAt;
    return {
      complaintId: id,
      status,
      description: item.description,
      category: status === 'forwarded' ? item.category : null,
      agency: status === 'forwarded' ? item.agency : null,
      suggestedCategory: item.category,
      suggestedAgency: item.agency,
      reviewReason: status === 'awaitingOperator' ? 'Menunggu tinjauan operator' : null,
      createdAt: iso,
      updatedAt: iso,
      operatorStartedAt: status !== 'pending' ? iso : null,
      forwardedAt: status === 'forwarded' ? iso : null,
      hasPhoto: Boolean(item.photo || item.images?.length),
      isPublic: item.isPublic !== false,
      district: item.district || 'Cipondoh',
      city: item.city || 'Kota Tangerang',
      upvoteCount: upvotes,
      corroborationCount: corroborations,
      priorityScore,
      slaDueAt,
      slaSummary,
      viewerUpvoted: Boolean(item.viewerUpvoted),
      viewerCorroborated: Boolean(item.viewerCorroborated),
      corroborations: item.corroborations || [],
      events: buildEvents(item, status),
    };
  },

  async getComplaintSLA(id) {
    const detail = await mockAdapter.getComplaint(id);
    return detail.slaSummary;
  },

  async submitCitizenSLAResponse(id) {
    const sla = await mockAdapter.getComplaintSLA(id);
    return { replayed: false, sla };
  },

  async toggleUpvote(id) {
    await delay(100);
    const store = load();
    const seeds = ensureSeedFeed();
    const isOwn = Boolean(store[id]);
    const target = isOwn ? store[id] : seeds[id];
    if (!target) {
      return {
        complaintId: id,
        upvoted: true,
        upvoteCount: 1,
        corroborationCount: 0,
        priorityScore: computeScore(1, 0),
      };
    }
    const nextUpvoted = !target.viewerUpvoted;
    target.viewerUpvoted = nextUpvoted;
    target.upvoteCount = Math.max(0, (target.upvoteCount ?? 1) + (nextUpvoted ? 1 : -1));
    if (isOwn) save(store);
    else saveSeedFeed(seeds);

    const priorityScore = computeScore(target.upvoteCount, target.corroborationCount ?? 0);
    const sla = buildMockSLASummary(target, target.status || statusFor(target.createdAt));
    return {
      complaintId: id,
      upvoted: nextUpvoted,
      upvoteCount: target.upvoteCount,
      corroborationCount: target.corroborationCount ?? 0,
      priorityScore,
      slaDueAt: sla.resolutionDeadline?.dueAt || sla.responseDeadline.dueAt,
    };
  },

  async corroborateComplaint(id, { note = '', latitude = null, longitude = null } = {}) {
    await delay(150);
    const store = load();
    const seeds = ensureSeedFeed();
    const isOwn = Boolean(store[id]);
    const target = isOwn ? store[id] : seeds[id];
    if (!target) {
      return {
        complaintId: id,
        corroborated: true,
        upvoteCount: 1,
        corroborationCount: 1,
        priorityScore: computeScore(1, 1),
        distanceMeters: latitude != null && longitude != null ? 240 : null,
      };
    }
    const dist = latitude != null && longitude != null ? 240 : null;
    if (!target.viewerCorroborated) {
      target.viewerCorroborated = true;
      target.corroborationCount = (target.corroborationCount ?? 0) + 1;
    }
    target.corroborations = [
      {
        note: note.trim() || 'Warga sekitar mengonfirmasi kondisi ini sesuai kenyataan.',
        distanceMeters: dist,
        createdAt: new Date().toISOString(),
      },
      ...(target.corroborations || []),
    ];
    if (isOwn) save(store);
    else saveSeedFeed(seeds);

    const priorityScore = computeScore(target.upvoteCount ?? 1, target.corroborationCount);
    const sla = buildMockSLASummary(target, target.status || statusFor(target.createdAt));
    return {
      complaintId: id,
      corroborated: true,
      upvoteCount: target.upvoteCount ?? 1,
      corroborationCount: target.corroborationCount,
      priorityScore,
      slaDueAt: sla.resolutionDeadline?.dueAt || sla.responseDeadline.dueAt,
      distanceMeters: dist,
    };
  },

  photoUrl: (id) => load()[id]?.photo ?? null,

  async getProfile() {
    await delay(100);
    const saved = JSON.parse(localStorage.getItem('sigmata.mock.citizenProfile.v1') || 'null');
    const complaints = Object.values(load());
    const statistics = {
      totalSubmitted: complaints.length,
      pendingCount: complaints.filter((c) => statusFor(c.createdAt) === 'pending').length,
      awaitingOperatorCount: complaints.filter((c) => statusFor(c.createdAt) === 'awaitingOperator').length,
      forwardedCount: complaints.filter((c) => statusFor(c.createdAt) === 'forwarded').length,
      resolvedCount: 0,
      totalUpvotesReceived: complaints.reduce((acc, c) => acc + (c.upvoteCount ?? 1), 0),
      totalCorroborationsGiven: complaints.reduce((acc, c) => acc + (c.viewerCorroborated ? 1 : 0), 0),
    };
    return {
      onboarded: Boolean(saved && saved.accountStatus !== 'pending_onboarding'),
      identity: {
        subject: 'mock-citizen',
        email: saved?.email || 'warga@example.com',
        emailVerified: true,
        name: saved?.fullName || 'Warga SIGMATA',
        preferredUsername: 'mock-citizen',
        roles: ['citizen'],
      },
      profile: saved,
      statistics,
      sourceOfTruth: {
        credentials: 'Keycloak',
        emailVerification: 'Keycloak',
        authenticationRoles: 'Keycloak',
        resourceAuthorization: 'Go',
        citizenProfile: 'PostgreSQL',
        governmentAffiliation: 'PostgreSQL',
        complaintStatistics: 'Derived SQL queries',
        notificationPreferences: 'PostgreSQL',
        complaintIncidentLocation: 'PostGIS',
      },
    };
  },

  async uploadAvatar(file) {
    await delay(150);
    const dataUrl = await toPhotoDataUrl(file);
    return { avatarUrl: dataUrl };
  },

  async saveProfile(payload) {
    await delay(150);
    const prev = JSON.parse(localStorage.getItem('sigmata.mock.citizenProfile.v1') || 'null');
    const now = new Date().toISOString();
    const saved = {
      id: prev?.id || crypto.randomUUID(),
      identitySubject: 'mock-citizen',
      fullName: payload.fullName,
      email: payload.email,
      phoneNumber: payload.phoneNumber || null,
      avatarUrl: payload.avatarUrl || null,
      municipalityCode: payload.municipalityCode,
      districtCode: payload.districtCode || null,
      subdistrictCode: payload.subdistrictCode || null,
      preferredLanguage: payload.preferredLanguage || 'id',
      notificationPreferences: payload.notificationPreferences || {
        inApp: true,
        email: true,
        push: false,
        slaAlerts: true,
        statusUpdates: true,
        corroborationAlerts: true,
      },
      accountStatus: payload.accountStatus || 'active',
      createdAt: prev?.createdAt || now,
      updatedAt: now,
    };
    localStorage.setItem('sigmata.mock.citizenProfile.v1', JSON.stringify(saved));
    return mockAdapter.getProfile();
  },
};
