import { useState, useMemo } from 'react';
import { Navbar } from '../components/common/Navbar';
import { BerandaLocationBar } from '../components/common/FilterBar';
import { FeedCard } from '../components/cards/FeedCard';
import { FAB } from '../components/common/FAB';
import { PlusIcon, UserIcon } from '../components/icons/Icons';

export function BerandaPage({
  onOpenMenu,
  onOpenSearch,
  onOpenCreateReport,
  reports = [],
  location = '[Kecamatan], [Kota]',
  onRefreshFeed,
  username = 'Warga',
  avatarUrl = null,
}) {
  const [locationFilter, setLocationFilter] = useState('semua');
  const [sort, setSort] = useState('prioritas');
  const [period, setPeriod] = useState('bulanan');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filterNowMs] = useState(() => Date.now());

  const displayList = useMemo(() => {
    let list = [...reports];

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

    if (period === 'harian') {
      const cutoff = filterNowMs - 24 * 3600 * 1000;
      list = list.filter((item) => !item.timestamp || item.timestamp >= cutoff || item.period === 'harian');
    } else if (period === 'mingguan') {
      const cutoff = filterNowMs - 7 * 24 * 3600 * 1000;
      list = list.filter((item) => !item.timestamp || item.timestamp >= cutoff || ['harian', 'mingguan'].includes(item.period));
    }

    list.sort((a, b) => {
      if (sort === 'prioritas') {
        const pA = a.priorityScore ?? 1;
        const pB = b.priorityScore ?? 1;
        if (pB !== pA) return pB - pA;
      }
      if (sort === 'terpopuler') {
        const upvotesA = typeof a.initialUpvotes === 'number' ? a.initialUpvotes : parseInt(a.initialUpvotes || 0, 10);
        const upvotesB = typeof b.initialUpvotes === 'number' ? b.initialUpvotes : parseInt(b.initialUpvotes || 0, 10);
        return upvotesB - upvotesA;
      }
      if (sort === 'terlama') {
        const timeA = a.timestamp || 0;
        const timeB = b.timestamp || 0;
        return timeA - timeB;
      }
      const timeA = a.timestamp || 0;
      const timeB = b.timestamp || 0;
      return timeB - timeA;
    });

    return list;
  }, [reports, locationFilter, period, sort, filterNowMs]);

  return (
    <div className="sig-page sig-page--beranda">
      <Navbar
        onMenuClick={onOpenMenu}
        onSearchClick={onOpenSearch}
        onLogoClick={() => {
          onRefreshFeed?.();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

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

      <main className="sig-page__content">
        <div className="sig-compose-prompt">
          <div className="sig-compose-prompt__avatar">
            {avatarUrl ? (
              <img src={avatarUrl} alt={username} />
            ) : (
              <UserIcon size={20} color="#ffffff" />
            )}
          </div>
          <button
            type="button"
            className="sig-compose-prompt__input"
            onClick={onOpenCreateReport}
          >
            Ada masalah fasilitas publik di sekitar {location}? Laporkan sekarang...
          </button>
          <button
            type="button"
            className="sig-compose-prompt__cta"
            onClick={onOpenCreateReport}
          >
            <PlusIcon size={15} color="#ffffff" />
            <span>Laporkan</span>
          </button>
        </div>

        <div className="sig-cards-list">
          {displayList.length === 0 ? (
            <div
              className="sig-card sig-empty-state"
              style={{
                textAlign: 'center',
                padding: '40px 20px',
                borderRadius: '16px',
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
                initialCorroborations={item.corroborationCount ?? 0}
                initialPriorityScore={item.priorityScore ?? 1}
                initialSlaDueAt={item.slaDueAt ?? null}
                slaSummary={item.slaSummary ?? null}
                initialViewerUpvoted={Boolean(item.viewerUpvoted)}
                initialViewerCorroborated={Boolean(item.viewerCorroborated)}
                initialCorroborationNotes={item.corroborations ?? []}
                status={item.status}
                images={item.images}
                onMetricsUpdated={() => onRefreshFeed?.()}
              />
            ))
          )}
        </div>
      </main>

      <FAB onClick={onOpenCreateReport} />

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
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                  {[
                    { value: 'prioritas', label: 'Prioritas' },
                    { value: 'terbaru', label: 'Terbaru' },
                    { value: 'terpopuler', label: 'Terpopuler' },
                    { value: 'terlama', label: 'Terlama' },
                  ].map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      className={`sig-mode-btn ${sort === s.value ? 'is-active' : ''}`}
                      onClick={() => setSort(s.value)}
                      style={{ padding: '6px 12px' }}
                    >
                      {s.label}
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
                  setLocationFilter('semua');
                  setSort('prioritas');
                  setPeriod('bulanan');
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
