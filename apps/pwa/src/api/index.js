import { API_MODE, IS_MOCK } from './config';
import { httpAdapter } from './httpAdapter';
import { mockAdapter } from './mockAdapter';

export { API_MODE, IS_MOCK };
export const api = IS_MOCK ? mockAdapter : httpAdapter;

const STATUS_LABEL = {
  pending: 'Dalam Proses',
  processing: 'Dalam Proses',
  awaitingOperator: 'Menunggu Tinjauan',
  forwarded: 'Diteruskan',
};
export const statusLabel = (status) => STATUS_LABEL[status] || status;

export function computePriorityScore(upvotes = 1, corroborations = 0) {
  const u = Math.max(0, upvotes);
  const c = Math.max(0, corroborations);
  return 1.0 + Math.log1p(u) * 2.0 + c * 3.5;
}

// Note: Statutory deadlines are computed authoritatively by the Go backend (Asia/Jakarta).
// The frontend only formats remaining time from backend-provided `dueAt` timestamps.
export function formatDeadlineCountdown(dueAt, status, nowMs = Date.now()) {
  if (status === 'completed' || status === 'Selesai') {
    return { text: 'Selesai', tone: 'teal', breached: false };
  }
  if (status === 'administratively_closed') {
    return { text: 'Ditutup administratif', tone: 'warning', breached: false };
  }
  if (status === 'paused') {
    return { text: 'Dijeda', tone: 'warning', breached: false };
  }
  if (!dueAt) {
    return { text: 'Menunggu jadwal SLA', tone: 'teal', breached: false };
  }
  const dueMs = new Date(dueAt).getTime();
  if (Number.isNaN(dueMs)) {
    return { text: 'Menunggu jadwal SLA', tone: 'teal', breached: false };
  }
  const diffMs = dueMs - nowMs;
  if (diffMs <= 0) {
    const overdueMins = Math.floor(Math.abs(diffMs) / 60000);
    const hours = Math.floor(overdueMins / 60);
    const mins = overdueMins % 60;
    return {
      text: `Melewati batas ${hours}j ${mins}m`,
      tone: 'danger',
      breached: true,
    };
  }
  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  let text;
  if (days > 0) {
    text = `${days}h ${hours}j ${mins}m tersisa`;
  } else if (hours > 0) {
    text = `${hours}j ${mins}m ${secs}d tersisa`;
  } else {
    text = `${mins}m ${secs}d tersisa`;
  }

  return {
    text,
    tone: diffMs < 24 * 3600 * 1000 ? 'warning' : 'teal',
    breached: false,
  };
}

export function formatSlaCountdown(slaDueAt, status, nowMs = Date.now(), slaSummary = null) {
  if (slaSummary) {
    const primaryClock =
      slaSummary.citizenActionDeadline ||
      slaSummary.resolutionDeadline ||
      slaSummary.responseDeadline ||
      slaSummary.activeClocks?.[0];
    if (primaryClock) {
      const formatted = formatDeadlineCountdown(primaryClock.dueAt, primaryClock.status, nowMs);
      if (slaSummary.overdue || primaryClock.overdue) {
        return { ...formatted, tone: 'danger', breached: true };
      }
      if (slaSummary.approachingDeadlineWarning || primaryClock.approachingWarning) {
        return { ...formatted, tone: 'warning' };
      }
      return formatted;
    }
  }
  return formatDeadlineCountdown(slaDueAt, status, nowMs);
}

export function getPriorityMeta(priorityScore = 1, upvoteCount = 0, corroborationCount = 0) {
  if (priorityScore >= 16 || corroborationCount >= 3) {
    return { label: 'Prioritas Mendesak', level: 'urgent' };
  }
  if (priorityScore >= 8 || upvoteCount >= 10 || corroborationCount >= 1) {
    return { label: 'Prioritas Tinggi', level: 'high' };
  }
  return { label: 'Prioritas Normal', level: 'normal' };
}

export function buildTrackingSteps(item) {
  const sla = item.slaSummary;
  const raw =
    item.rawStatus ||
    (item.status === 'Diteruskan'
      ? 'forwarded'
      : item.status === 'Menunggu Tinjauan'
        ? 'awaitingOperator'
        : item.status === 'Selesai'
          ? 'resolved'
          : 'pending');
  const isForwarded = raw === 'forwarded' || raw === 'resolved';
  const isAwaiting = raw === 'awaitingOperator';
  const isResolved = sla?.resolutionState === 'substantively_resolved' || raw === 'resolved';
  const isAdminClosed = sla?.resolutionState === 'administratively_closed';

  return [
    {
      key: 'submitted',
      label: 'Laporan Diterima',
      desc: 'Foto bukti & laporan tersimpan',
      state: 'done',
    },
    {
      key: 'triage',
      label: isAwaiting ? 'Tinjauan Operator' : 'Verifikasi & Respon',
      desc: sla?.responseDeadline
        ? `${sla.responseDeadline.legalBasis} (${sla.responseDeadline.articleReference})`
        : isAwaiting
          ? item.reviewReason || 'Menunggu verifikasi petugas'
          : isForwarded
            ? `Kategori: ${item.category || item.suggestedCategory || 'Terklasifikasi'}`
            : 'Verifikasi laporan oleh petugas',
      state: isForwarded ? 'done' : 'active',
    },
    {
      key: 'forwarded',
      label: 'Diteruskan ke OPD',
      desc:
        sla?.responsibleAgency ||
        item.agency ||
        (isForwarded ? item.district || 'Dinas Terkait' : 'Menunggu penerusan ke OPD'),
      state: isResolved || isAdminClosed ? 'done' : isForwarded ? 'active' : 'pending',
    },
    {
      key: 'resolved',
      label: isAdminClosed ? 'Ditutup Administratif' : 'Penyelesaian',
      desc: isResolved
        ? 'Selesai secara substantif'
        : isAdminClosed
          ? 'Ditutup administratif sesuai regulasi'
          : sla?.resolutionDeadline
            ? `${sla.resolutionDeadline.legalBasis} (${sla.resolutionDeadline.articleReference})`
            : 'Dalam batas waktu penanganan',
      state: isResolved || isAdminClosed ? 'done' : 'pending',
    },
  ];
}
