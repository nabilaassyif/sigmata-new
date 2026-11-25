import { useState, useMemo } from 'react';
import { Navbar } from '../components/common/Navbar';
import { RiwayatFilterBar } from '../components/common/FilterBar';
import { IS_MOCK } from '../api';
import { RiwayatCard } from '../components/cards/RiwayatCard';

export function RiwayatPage({
  onOpenMenu,
  onOpenSearch,
  myReports = [],
}) {
  const [sort, setSort] = useState('terbaru');
  const [status, setStatus] = useState('semua');
  const [showFilterModal, setShowFilterModal] = useState(false);

  const defaultRiwayatList = useMemo(
    () => [
      {
        id: 1,
        category: '[CATEGORY BY SYSTEM]',
        date: '22 Nov 2026',
        description:
          'Lorem ipsum dolor sit amet consectetur. Ipsum amet enim auctor molestie at. Nisi nec posuere dia hendrerit nunc turpis....',
        status: '[Status]',
        timestamp: '[DD MM YY HH:MM]',
        numericTimestamp: 1777710000000,
        district: '[Kecamatan]',
        city: '[Kota]',
        upvotes: '1.234',
        numericUpvotes: 1234,
      },
      {
        id: 2,
        category: '[CATEGORY BY SYSTEM]',
        date: '22 Nov 2026',
        description:
          'Lorem ipsum dolor sit amet consectetur. Ipsum amet enim auctor molestie at. Nisi nec posuere dia hendrerit nunc turpis....',
        status: '[Status]',
        timestamp: '[DD MM YY HH:MM]',
        numericTimestamp: 1777700000000,
        district: '[Kecamatan]',
        city: '[Kota]',
        upvotes: '1.234',
        numericUpvotes: 1234,
      },
      {
        id: 3,
        category: 'INFRASTRUKTUR JALAN',
        date: '20 Nov 2026',
        description:
          'Jalan berlubang cukup dalam di persimpangan jalan utama sangat membahayakan pengendara motor saat malam hari.',
        status: 'Dalam Proses',
        timestamp: '20 11 26 14:30',
        numericTimestamp: 1777500000000,
        district: 'Coblong',
        city: 'Bandung',
        upvotes: '852',
        numericUpvotes: 852,
      },
      {
        id: 4,
        category: 'KEBERSIHAN LINGKUNGAN',
        date: '18 Nov 2026',
        description:
          'Penumpukan sampah liar di bantaran sungai belum diangkut selama lebih dari 4 hari. Mohon dinas terkait segera menindaklanjuti.',
        status: 'Selesai',
        timestamp: '18 11 26 09:15',
        numericTimestamp: 1777300000000,
        district: 'Sukasari',
        city: 'Bandung',
        upvotes: '2.140',
        numericUpvotes: 2140,
      },
      {
        id: 5,
        category: 'FASILITAS PUBLIK',
        date: '15 Nov 2026',
        description:
          'Halte bus rusak parah dan atap bocor, penumpang basah saat hujan deras menunggu armada bus transmargi.',
        status: 'Dalam Proses',
        timestamp: '15 11 26 11:20',
        numericTimestamp: 1777000000000,
        district: 'Batununggal',
        city: 'Bandung',
        upvotes: '1.430',
        numericUpvotes: 1430,
      },
    ],
    []
  );

  const filteredList = useMemo(() => {
    const fullList = [...myReports, ...(IS_MOCK ? defaultRiwayatList : [])];

    let list = fullList.filter((item) => {
      if (status === 'semua') return true;
      if (status === 'proses') return ['Dalam Proses','Menunggu Tinjauan','[Status]'].includes(item.status);
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
        const tA = a.numericTimestamp || a.id || 0;
        const tB = b.numericTimestamp || b.id || 0;
        return tA - tB;
      }
      // 'terbaru'
      const tA = a.numericTimestamp || a.id || 0;
      const tB = b.numericTimestamp || b.id || 0;
      return tB - tA;
    });

    return list;
  }, [myReports, defaultRiwayatList, status, sort]);

  return (
    <div className="sig-page sig-page--riwayat">
      {/* Sticky Top Navbar */}
      <Navbar
        onMenuClick={onOpenMenu}
        onSearchClick={onOpenSearch}
      />

      {/* Sticky Filter Bar */}
      <RiwayatFilterBar
        sort={sort}
        onSortChange={setSort}
        status={status}
        onStatusChange={setStatus}
        onOpenFilterModal={() => setShowFilterModal(true)}
      />

      {/* Reports Feed */}
      <main className="sig-page__content">
        <div className="sig-cards-list">
          {filteredList.map((item) => (
            <RiwayatCard
              key={item.id}
              category={item.category}
              date={item.date}
              description={item.description}
              status={item.status}
              timestamp={item.timestamp}
              district={item.district}
              city={item.city}
              upvotes={item.upvotes}
              image={item.image}
            />
          ))}
        </div>
      </main>

      {/* Filter Modal */}
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
                    { val: 'selesai', label: 'Selesai' },
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
