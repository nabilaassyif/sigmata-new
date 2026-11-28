import { useCallback, useEffect, useState } from 'react';
import { api, statusLabel } from './index';

const dateFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const stampFmt = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
});

function toCard(detail) {
  const created = new Date(detail.createdAt);
  return {
    id: detail.complaintId,
    category: (detail.category || detail.suggestedCategory || 'MENUNGGU KATEGORI').toUpperCase(),
    date: dateFmt.format(created),
    description: detail.description,
    status: statusLabel(detail.status),
    rawStatus: detail.status,
    agency: detail.agency || null,
    suggestedCategory: detail.suggestedCategory || null,
    suggestedAgency: detail.suggestedAgency || null,
    reviewReason: detail.reviewReason || null,
    timestamp: stampFmt.format(created).replace(/[/.]/g, ' ').replace(',', ''),
    numericTimestamp: created.getTime(),
    district: detail.district || detail.agency || 'Belum diteruskan',
    city: detail.city || '',
    upvotes: String(detail.upvoteCount ?? 1),
    numericUpvotes: detail.upvoteCount ?? 1,
    corroborationCount: detail.corroborationCount ?? 0,
    priorityScore: detail.priorityScore ?? 1,
    slaDueAt: detail.slaDueAt || null,
    slaSummary: detail.slaSummary || null,
    viewerUpvoted: Boolean(detail.viewerUpvoted),
    viewerCorroborated: Boolean(detail.viewerCorroborated),
    events: detail.events || [],
    corroborations: detail.corroborations || [],
    createdAt: detail.createdAt,
    forwardedAt: detail.forwardedAt || null,
    operatorStartedAt: detail.operatorStartedAt || null,
    image: detail.hasPhoto ? api.photoUrl(detail.complaintId) : null,
  };
}

// Loads the signed-in citizen's own complaints.
export function useMyComplaints(enabled = true) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listComplaints();
      setItems(list.map(toCard));
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  return { items, loading, refresh };
}
