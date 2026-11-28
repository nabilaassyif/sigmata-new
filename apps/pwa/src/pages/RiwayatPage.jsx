import { useState, useMemo } from 'react';
import { Navbar } from '../components/common/Navbar';
import { RiwayatFilterBar } from '../components/common/FilterBar';
import { IS_MOCK } from '../api';
import { RiwayatCard } from '../components/cards/RiwayatCard';

export function RiwayatPage({
  onOpenMenu,
  onOpenSearch,
  myReports = [],
  onRefresh,
  loading = false,
}) {
  const [sort, setSort] = useState('terbaru');
  const [status, setStatus] = useState('semua');
  const [showFilterModal, setShowFilterModal] = useState(false);

  const [mockAnchorMs] = useState(() => Date.now());
  const defaultRiwayatList = useMemo(() => {
    const now = mockAnchorMs;
    return [
      {
        id: 'mock-r-1',
        category: 'INFRASTRUKTUR JALAN',
        date: '20 Nov 2026',
        description:
          'Jalan berlubang cukup dalam di persimpangan jalan utama sangat membahayakan pengendara motor saat malam hari.',
        status: 'Dalam Proses',
        rawStatus: 'pending',
        timestamp: '20 11 26 14:30',
        numericTimestamp: now - 3 * 3600 * 1000,
        district: 'Coblong',
        city: 'Bandung',
        upvotes: '12',
        numericUpvotes: 12,
        corroborationCount: 2,
        priorityScore: 13.1,
        slaDueAt: new Date(now + 44 * 3600 * 1000).toISOString(),
        events: [
          { eventType: 'submitted', actor: 'citizen', createdAt: new Date(now - 3 * 3600 * 1000).toISOString() },
        ],
        corroborations: [
          { note: 'Warga RT 04 membenarkan jalan amblas sejak minggu lalu.', distanceMeters: 180, createdAt: new Date(now - 3600 * 1000).toISOString() },
        ],
      },
      {
        id: 'mock-r-2',
        category: 'KEBERSIHAN LINGKUNGAN',
        date: '18 Nov 2026',
        description:
          'Penumpukan sampah liar di bantaran sungai belum diangkut selama lebih dari 4 hari. Mohon dinas terkait segera menindaklanjuti.',
        status: 'Diteruskan',
        rawStatus: 'forwarded',
        agency: 'Dinas Lingkungan Hidup',
        timestamp: '18 11 26 09:15',
        numericTimestamp: now - 26 * 3600 * 1000,
        district: 'Sukasari',
        city: 'Bandung',
        upvotes: '24',
        numericUpvotes: 24,
        corroborationCount: 4,
        priorityScore: 21.4,
        slaDueAt: new Date(now + 18 * 3600 * 1000).toISOString(),
        events: [
          { eventType: 'submitted', actor: 'citizen', createdAt: new Date(now - 26 * 3600 * 1000).toISOString() },
          { eventType: 'forwarded', actor: 'worker', createdAt: new Date(now - 25 * 3600 * 1000).toISOString() },
        ],
        corroborations: [
          { note: 'Bau menyengat sampai ke pemukiman warga sekitar.', distanceMeters: 95, createdAt: new Date(now - 10 * 3600 * 1000).toISOString() },
        ],
      },
    ];
  }, [mockAnchorMs]);

  const filteredList = useMemo(() => {
    const fullList = [...myReports, ...(IS_MOCK ? defaultRiwayatList : [])];

    let list = fullList.filter((item) => {
      if (status === 'semua') return true;
      if (status === 'proses') return ['Dalam Proses', 'Menunggu Tinjauan', '[Status]'].includes(item.status);
      if (status === 'selesai') return item.status === 'Selesai' || item.status === 'Diteruskan';
      if (status === 'ditolak') return item.status === 'Ditolak';
      return true;
    });

    list.sort((a, b) => {
      if (sort === 'upvote') {
        const uA = a.numericUpvotes || parseInt((a.upvotes || '0').replace('.', ''), 10) || 0;
        const uB = b.numericUpvotes || parseInt((b.upvotes || '0').replace('.', ''), 10) || 0;
        return uB - uA;
      }
      if (sort === 'terlama') {
        const tA = a.numericTimestamp || 0;
        const tB = b.numericTimestamp || 0;
        return tA - tB;
      }
      const tA = a.numericTimestamp || 0;
      const tB = b.numericTimestamp || 0;
      return tB - tA;
    });

    return list;
  }, [myReports, defaultRiwayatList, status, sort]);

  return (
    <div className="sig-page sig-page--riwayat">
      <Navbar
        onMenuClick={onOpenMenu}
        onSearchClick={onOpenSearch}
      />

      <RiwayatFilterBar
        sort={sort}
        onSortChange={setSort}
        status={status}
        onStatusChange={setStatus}
        onOpenFilterModal={() => setShowFilterModal(true)}
      />

      <main className="sig-page__content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
            Ketuk kartu untuk melihat pelacakan status & SLA lengkap
          </span>
          {onRefresh && (
            <button
              type="button"
              className="sig-button sig-button--secondary sig-button--sm"
              onClick={onRefresh}
              disabled={loading}
            >
              {loading ? 'Memuat...' : 'Perbarui'}
            </button>
          )}
        </div>

        <div className="sig-cards-list">
          {filteredList.length === 0 ? (
            <div className="sig-empty-state" style={{ textAlign: 'center', padding: '32px 16px', borderRadius: '16px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Belum ada laporan pada status ini.
              </p>
            </div>
          ) : (
            filteredList.map((item) => (
              <RiwayatCard
                key={item.id}
                id={item.id}
                category={item.category}
                date={item.date}
                description={item.description}
                status={item.status}
                rawStatus={item.rawStatus}
                agency={item.agency}
                suggestedCategory={item.suggestedCategory}
                suggestedAgency={item.suggestedAgency}
                reviewReason={item.reviewReason}
                timestamp={item.timestamp}
                district={item.district}
                city={item.city}
                upvotes={item.upvotes}
                numericUpvotes={item.numericUpvotes}
                corroborationCount={item.corroborationCount}
                priorityScore={item.priorityScore}
                slaDueAt={item.slaDueAt}
                slaSummary={item.slaSummary}
                events={item.events}
                corroborations={item.corroborations}
                image={item.image}
              />
            ))
          )}
        </div>
      </main>

      {showFilterModal && (
        <div className="sig-modal-backdrop" onClick={() => setShowFilterModal(false)}>
          <div className="sig-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="sig-modal__title">Filter Riwayat</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: '14px 0' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>Status Laporan</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                  {[
                    { val: 'semua', label: 'Semua Status' },
                    { val: 'proses', label: 'Dalam Proses' },
                    { val: 'selesai', label: 'Diteruskan / Selesai' },
                  ].map((st) => (
                    <button
                      key={st.val}
                      type="button"
                      className={`sig-mode-btn ${status === st.val ? 'is-active' : ''}`}
                      onClick={() => setStatus(st.val)}
                      style={{ padding: '6px 12px' }}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="sig-button sig-button--primary sig-button--full"
              onClick={() => setShowFilterModal(false)}
            >
              Terapkan Filter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
