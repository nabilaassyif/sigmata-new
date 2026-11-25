import { useState, useMemo } from 'react';
import { Navbar } from '../components/common/Navbar';
import { IS_MOCK } from '../api';
import { BerandaLocationBar } from '../components/common/FilterBar';
import { FeedCard } from '../components/cards/FeedCard';
import { FAB } from '../components/common/FAB';

export function BerandaPage({
  onOpenMenu,
  onOpenSearch,
  onOpenCreateReport,
  reports = [],
  location = '[Kecamatan], [Kota]',
}) {
  const [locationFilter, setLocationFilter] = useState('kota');
  const [sort, setSort] = useState('terbaru');
  const [period, setPeriod] = useState('harian');
  const [showFilterModal, setShowFilterModal] = useState(false);

  // Default feeds matching Image 1 & 2
  const defaultFeedList = useMemo(
    () => [
      {
        id: 1,
        location: 'Location Name',
        category: 'Category',
        description:
          'Lorem ipsum dolor sit amet consectetur. Ideu iaculis ultricies eget imperdiet. Id nunc odio ornare dolor. Adipiscing felis adipiscing tempus nulla vulputate viverra. Tellus sed commodo et magna turpis.',
        username: '@username',
        date: '2 Mei 2026 11:00',
        initialUpvotes: 1230,
        scope: 'kota',
        period: 'harian',
        timestamp: 1777719600000,
        images: ['placeholder-1', 'placeholder-2'], // Dual side-by-side squares!
      },
      {
        id: 2,
        location: 'Location Name',
        category: 'Category',
        description:
          'Lorem ipsum dolor sit amet consectetur. Ideu iaculis ultricies eget imperdiet. Id nunc odio ornare dolor. Adipiscing felis adipiscing tempus nulla vulputate viverra. Tellus sed commodo et magna turpis.',
        username: 'Anonymous',
        date: '22 Sept 2026 10:30',
        initialUpvotes: 980,
        scope: 'kecamatan',
        period: 'mingguan',
        timestamp: 1776510000000,
        images: null, // No photo
      },
      {
        id: 3,
        location: 'Kec. Cicendo',
        category: 'Penerangan Jalan',
        description:
          'Lampu penerangan jalan umum (PJU) padam sepanjang 500 meter di Jl. Pajajaran arah Pasteur sejak 3 hari lalu, sangat gelap dan rawan kejahatan.',
        username: '@warga_peduli',
        date: '24 Nov 2026 19:40',
        initialUpvotes: 4120,
        scope: 'kecamatan',
        period: 'harian',
        timestamp: 1777890000000,
        images: ['placeholder-1'], // Single full-width photo!
      },
      {
        id: 4,
        location: 'Location Name',
        category: 'Category',
        description:
          'Perbaikan jalan berlubang di seputaran jalur arteri kota telah selesai dikerjakan namun marka jalan belum dicat ulang.',
        username: 'Anonymous',
        date: '4 Jan 2026 13:00',
        initialUpvotes: 620,
        scope: 'kota',
        period: 'bulanan',
        timestamp: 1775000000000,
        images: null,
      },
    ],
    []
  );

  // Active filter & sorting logic
  const displayList = useMemo(() => {
    let list = [...reports, ...(IS_MOCK ? defaultFeedList : [])];

    // 1. Filter by Location ('kota' | 'kecamatan' | 'semua')
    if (locationFilter === 'kota') {
      list = list.filter((item) => {
        if (item.scope) return item.scope === 'kota';
        const loc = (item.location || '').toLowerCase();
        return loc.includes('kota') || !loc.includes('kec');
      });
    } else if (locationFilter === 'kecamatan') {
      list = list.filter((item) => {
        if (item.scope) return item.scope === 'kecamatan';
        const loc = (item.location || '').toLowerCase();
        return loc.includes('kec') || loc.includes('kecamatan');
      });
    }

    // 2. Filter by Period ('harian' | 'mingguan' | 'bulanan')
    if (period === 'harian') {
      list = list.filter((item) => {
        if (item.period) return item.period === 'harian';
        if (item.date === 'Baru saja' || item.date === 'Hari ini') return true;
        return true;
      });
    } else if (period === 'mingguan') {
      list = list.filter((item) => {
        if (item.period) return item.period === 'harian' || item.period === 'mingguan';
        return true;
      });
    } else if (period === 'bulanan') {
      list = list.filter((item) => {
        if (item.period) return ['harian', 'mingguan', 'bulanan'].includes(item.period);
        return true;
      });
    }

    // 3. Sort ('terbaru' | 'terpopuler' | 'terlama')
    list.sort((a, b) => {
      if (sort === 'terpopuler') {
        const upvotesA = typeof a.initialUpvotes === 'number' ? a.initialUpvotes : parseInt(a.initialUpvotes || 0, 10);
        const upvotesB = typeof b.initialUpvotes === 'number' ? b.initialUpvotes : parseInt(b.initialUpvotes || 0, 10);
        return upvotesB - upvotesA;
      }
      if (sort === 'terlama') {
        const timeA = a.timestamp || a.id || 0;
        const timeB = b.timestamp || b.id || 0;
        return timeA - timeB;
      }
      // 'terbaru'
      const timeA = a.timestamp || a.id || 0;
      const timeB = b.timestamp || b.id || 0;
      return timeB - timeA;
    });

    return list;
  }, [reports, defaultFeedList, locationFilter, period, sort]);

  return (
    <div className="sig-page sig-page--beranda">
      {/* Sticky Top Navbar */}
      <Navbar
        onMenuClick={onOpenMenu}
        onSearchClick={onOpenSearch}
        onLogoClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      />

      {/* Sticky Location & Filter Bar */}
      <BerandaLocationBar
        location={location}
        locationFilter={locationFilter}
        onLocationFilterChange={setLocationFilter}
        sort={sort}
        onSortChange={setSort}
        period={period}
        onPeriodChange={setPeriod}
        onOpenFilterModal={() => setShowFilterModal(true)}
      />

      {/* Main Feed Content - Rata Kiri */}
      <main className="sig-page__content">
        <div className="sig-cards-list">
          {displayList.length === 0 ? (
            <div
              className="sig-card"
              style={{
                textAlign: 'center',
                padding: '40px 20px',
                background: '#ffffff',
                borderRadius: '16px',
                border: '1px solid #eef2f6',
              }}
            >
              <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '14px' }}>
                Tidak ada laporan yang sesuai dengan filter yang dipilih.
              </p>
              <button
                type="button"
                className="sig-button sig-button--outline"
                style={{ margin: '0 auto', fontSize: '12px', padding: '6px 16px' }}
                onClick={() => {
                  setLocationFilter('semua');
                  setSort('terbaru');
                  setPeriod('bulanan');
                }}
              >
                Reset Filter
              </button>
            </div>
          ) : (
            displayList.map((item) => (
              <FeedCard
                key={item.id}
                id={item.id}
                location={item.location}
                category={item.category}
                description={item.description}
                username={item.username}
                date={item.date}
                initialUpvotes={item.initialUpvotes}
                images={item.images}
              />
            ))
          )}
        </div>
      </main>

      {/* Floating Action Button */}
      <FAB onClick={onOpenCreateReport} />

      {/* Filter Modal */}
      {showFilterModal && (
        <div className="sig-modal-backdrop" onClick={() => setShowFilterModal(false)}>
          <div className="sig-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="sig-modal__title">Filter Beranda</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: '14px 0' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>Cakupan Lokasi</label>
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  {[
                    { value: 'kota', label: 'Kota' },
                    { value: 'kecamatan', label: 'Kecamatan' },
                    { value: 'semua', label: 'Semua' },
                  ].map((loc) => (
                    <button
                      key={loc.value}
                      type="button"
                      className={`sig-mode-btn ${locationFilter === loc.value ? 'is-active' : ''}`}
                      onClick={() => setLocationFilter(loc.value)}
                      style={{ padding: '6px 12px' }}
                    >
                      {loc.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>Urutkan Menurut</label>
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  {['terbaru', 'terpopuler', 'terlama'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`sig-mode-btn ${sort === s ? 'is-active' : ''}`}
                      onClick={() => setSort(s)}
                      style={{ textTransform: 'capitalize', padding: '6px 12px' }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>Rentang Waktu</label>
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  {['harian', 'mingguan', 'bulanan'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`sig-mode-btn ${period === p ? 'is-active' : ''}`}
                      onClick={() => setPeriod(p)}
                      style={{ textTransform: 'capitalize', padding: '6px 12px' }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button
                type="button"
                className="sig-button sig-button--outline"
                style={{ flex: 1 }}
                onClick={() => {
                  setLocationFilter('kota');
                  setSort('terbaru');
                  setPeriod('harian');
                  setShowFilterModal(false);
                }}
              >
                Reset
              </button>
              <button
                type="button"
                className="sig-button sig-button--primary"
                style={{ flex: 2 }}
                onClick={() => setShowFilterModal(false)}
              >
                Terapkan Filter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
