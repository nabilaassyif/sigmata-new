import { useMemo, useState } from 'react';
import { Dropdown } from '../components/common/Dropdown';
import { FeedCard } from '../components/cards/FeedCard';
import { FAB } from '../components/common/FAB';
import { SigmataLogo } from '../components/icons/Icons';
import { ThemeToggleButton } from '../components/common/ThemeToggleButton';
import {
  CloseIcon,
  SearchIcon,
  TrendingUpIcon,
  LocationPinIconSolid,
  FilterFunnelIcon,
} from '../components/icons/Icons';

const DEFAULT_TOPICS = [
  'Infrastruktur Jalan',
  'Kebersihan Lingkungan',
  'Penerangan Jalan',
  'Drainase & Banjir',
];

const DEFAULT_LOCATIONS = [
  'Cipondoh, Kota Tangerang',
  'Ciledug, Kota Tangerang',
  'Karawaci, Kota Tangerang',
  'Gondokusuman, Kota Yogyakarta',
];

export function PencarianPage({
  onBack,
  onOpenCreateReport,
  onLogoClick,
  reports = [],
  userLocation = 'Kota Tangerang',
  initialKeyword = '',
  onClearExternalKeyword,
}) {
  const [query, setQuery] = useState(initialKeyword);
  const [activeKeyword, setActiveKeyword] = useState(initialKeyword);
  const [sort, setSort] = useState('terbaru');
  const [period, setPeriod] = useState('bulanan');
  const [showFilterModal, setShowFilterModal] = useState(false);

  const trendingTopics = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const item of reports) {
      const label = (item?.category || '').trim();
      if (!label) continue;
      const key = label.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        list.push({ id: `cat-${list.length}`, label });
      }
      if (list.length >= 4) break;
    }
    for (const fallback of DEFAULT_TOPICS) {
      if (list.length >= 4) break;
      const key = fallback.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        list.push({ id: `def-${list.length}`, label: fallback });
      }
    }
    return list;
  }, [reports]);

  const relatedLocations = useMemo(() => {
    const candidates = [userLocation, ...DEFAULT_LOCATIONS];
    const seen = new Set();
    const list = [];
    for (const loc of candidates) {
      const cleaned = (loc || '').trim();
      if (!cleaned) continue;
      const key = cleaned.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        list.push({ id: `loc-${list.length}`, label: cleaned });
      }
      if (list.length >= 4) break;
    }
    return list;
  }, [userLocation]);

  const searchResults = useMemo(() => {
    if (!activeKeyword) return [];
    const needle = activeKeyword.trim().toLowerCase();
    const filtered = reports.filter((item) => {
      const haystack = [item.description, item.category, item.location, item.username]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });

    filtered.sort((a, b) => {
      const timeA = a.timestamp || 0;
      const timeB = b.timestamp || 0;
      return sort === 'terlama' ? timeA - timeB : timeB - timeA;
    });

    return filtered;
  }, [activeKeyword, reports, sort]);

  const handleSearchSubmit = (e) => {
    e?.preventDefault();
    if (query.trim()) {
      setActiveKeyword(query.trim());
    }
  };

  const handleSelectKeyword = (kw) => {
    setQuery(kw);
    setActiveKeyword(kw);
  };

  const clearKeyword = () => {
    setActiveKeyword('');
    setQuery('');
    onClearExternalKeyword?.();
  };

  return (
    <div className="sig-page sig-page--search">
      {!activeKeyword ? (
        <header className="sig-search-entry-header">
          <button
            type="button"
            className="sig-navbar__btn"
            onClick={onBack}
            aria-label="Kembali"
          >
            <CloseIcon size={20} color="var(--text-secondary)" />
          </button>

          <form className="sig-search-entry-form" onSubmit={handleSearchSubmit}>
            <input
              type="text"
              className="sig-search-entry-input"
              placeholder="Cari laporan publik yang relevan"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            {query ? (
              <button
                type="button"
                className="sig-search-entry-btn"
                onClick={() => setQuery('')}
                aria-label="Hapus kata pencarian"
              >
                <CloseIcon size={16} color="var(--text-muted)" />
              </button>
            ) : (
              <button
                type="submit"
                className="sig-search-entry-btn"
                aria-label="Cari"
              >
                <SearchIcon size={18} color="var(--text-muted)" />
              </button>
            )}
          </form>
          <ThemeToggleButton variant="icon" />
        </header>
      ) : (
        <header className="sig-search-header-image1">
          <button
            type="button"
            className="sig-navbar__btn"
            onClick={clearKeyword}
            aria-label="Kembali ke saran pencarian"
          >
            <CloseIcon size={20} color="var(--text-secondary)" />
          </button>

          <button
            type="button"
            className="sig-navbar__logo-btn"
            onClick={onLogoClick || onBack}
            aria-label="Kembali ke Beranda"
          >
            <SigmataLogo size={32} />
          </button>

          <div className="sig-navbar__actions">
            <ThemeToggleButton variant="icon" />
            <button
              type="button"
              className="sig-navbar__btn"
              onClick={clearKeyword}
              aria-label="Pencarian baru"
            >
              <SearchIcon size={20} color="var(--text-secondary)" />
            </button>
          </div>
        </header>
      )}

      <main className="sig-page__content">
        {!activeKeyword ? (
          <div className="sig-search-suggestions">
            <section className="sig-search-section">
              <h3 className="sig-search-section__title">Ramai Dibicarakan</h3>
              <ul className="sig-search-section__list">
                {trendingTopics.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="sig-search-topic-item"
                      onClick={() => handleSelectKeyword(item.label)}
                    >
                      <span className="sig-search-topic-item__icon">
                        <TrendingUpIcon size={16} color="var(--teal-normal)" />
                      </span>
                      <span className="sig-search-topic-item__text">
                        {item.label}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="sig-search-section">
              <h3 className="sig-search-section__title">
                Lokasi Terkait dengan Anda
              </h3>
              <ul className="sig-search-section__list">
                {relatedLocations.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="sig-search-location-item"
                      onClick={() => handleSelectKeyword(item.label)}
                    >
                      <span className="sig-search-location-item__icon">
                        <LocationPinIconSolid size={18} color="var(--teal-normal)" />
                      </span>
                      <span className="sig-search-location-item__text">
                        {item.label}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        ) : (
          <div className="sig-search-results">
            <div className="sig-search-results__bar">
              <div className="sig-keyword-chip">
                <span className="sig-keyword-chip__text">
                  Kata kunci: &quot;{activeKeyword}&quot;
                </span>

                <button
                  type="button"
                  className="sig-keyword-chip__remove"
                  onClick={clearKeyword}
                  aria-label="Hapus kata kunci"
                >
                  <CloseIcon size={14} color="#ffffff" />
                </button>
              </div>

              <div className="sig-search-results__filters">
                <Dropdown
                  options={[
                    { value: 'terbaru', label: 'Terbaru' },
                    { value: 'terlama', label: 'Terlama' },
                  ]}
                  value={sort}
                  onChange={setSort}
                  variant="pill"
                />
                <Dropdown
                  options={[
                    { value: 'harian', label: 'Harian' },
                    { value: 'mingguan', label: 'Mingguan' },
                    { value: 'bulanan', label: 'Bulanan' },
                  ]}
                  value={period}
                  onChange={setPeriod}
                  variant="pill"
                  align="right"
                />
                <button
                  type="button"
                  className="sig-search-results__funnel-btn"
                  onClick={() => setShowFilterModal(true)}
                  aria-label="Filter lanjutan"
                >
                  <FilterFunnelIcon size={18} color="var(--text-secondary)" />
                </button>
              </div>
            </div>

            <div className="sig-cards-list">
              {searchResults.length === 0 ? (
                <div
                  className="sig-empty-state"
                  style={{
                    textAlign: 'center',
                    padding: '36px 20px',
                    borderRadius: '16px',
                  }}
                >
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    Tidak ada laporan publik yang cocok dengan kata kunci &quot;{activeKeyword}&quot;.
                  </p>
                  <button
                    type="button"
                    className="sig-button sig-button--secondary sig-button--sm"
                    onClick={clearKeyword}
                  >
                    Cari Kata Kunci Lain
                  </button>
                </div>
              ) : (
                searchResults.map((item) => (
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
                  />
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {activeKeyword && (
        <FAB onClick={onOpenCreateReport} />
      )}

      {showFilterModal && (
        <div className="sig-modal-backdrop" onClick={() => setShowFilterModal(false)}>
          <div className="sig-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="sig-modal__title">Filter Pencarian</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '14px 0' }}>
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
