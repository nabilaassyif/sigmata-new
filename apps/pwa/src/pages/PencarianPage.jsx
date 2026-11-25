import { useState } from 'react';
import { Dropdown } from '../components/common/Dropdown';
import { FeedCard } from '../components/cards/FeedCard';
import { FAB } from '../components/common/FAB';
import { SigmataLogo } from '../components/icons/Icons';
import {
  CloseIcon,
  SearchIcon,
  TrendingUpIcon,
  LocationPinIconSolid,
  FilterFunnelIcon,
} from '../components/icons/Icons';

export function PencarianPage({
  onBack,
  onOpenCreateReport,
  onLogoClick,
}) {
  const [query, setQuery] = useState('');
  const [activeKeyword, setActiveKeyword] = useState('');
  const [sort, setSort] = useState('terbaru');
  const [period, setPeriod] = useState('harian');
  const [showFilterModal, setShowFilterModal] = useState(false);

  // Trending Topics exactly matching Image 1: [Topik 1], [Topik 2], etc.
  const trendingTopics = [
    { id: 1, label: '[Topik 1]' },
    { id: 2, label: '[Topik 2]' },
    { id: 3, label: '[Topik 3]' },
    { id: 4, label: '[Topik 4]' },
  ];

  // Related Locations matching Image 1: Kecamatan, Kota 1, etc.
  const relatedLocations = [
    { id: 1, label: 'Kecamatan, Kota 1' },
    { id: 2, label: 'Kecamatan, Kota 2' },
    { id: 3, label: 'Kecamatan, Kota 3' },
  ];

  const searchResults = [
    {
      id: 101,
      location: 'Location Name',
      category: 'Category',
      description:
        'Lorem ipsum dolor sit amet consectetur. Ideu iaculis ultricies eget imperdiet. Id nunc odio ornare dolor. Adipiscing felis adipiscing tempus nulla vulputate viverra. Tellus sed commodo et magna turpis.',
      username: 'Anonymous',
      date: 'DD Month YYYY HH:MM',
      initialUpvotes: 1230,
      images: null,
    },
    {
      id: 102,
      location: 'Location Name',
      category: 'Category',
      description:
        'Lorem ipsum dolor sit amet consectetur. Ideu iaculis ultricies eget imperdiet. Id nunc odio ornare dolor. Adipiscing felis adipiscing tempus nulla vulputate viverra. Tellus sed commodo et magna turpis.',
      username: 'Anonymous',
      date: 'DD Month YYYY HH:MM',
      initialUpvotes: 1230,
      images: null,
    },
  ];

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
  };

  return (
    <div className="sig-page sig-page--search">
      {/* Top Header Bar */}
      {!activeKeyword ? (
        /* Screen 6 of Image 1: Close X button on left + Search Input with Search Icon on right */
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
        </header>
      ) : (
        /* Screen 7 of Image 1: Close X on left, Sigmata Logo in center, Search icon on right */
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

          <button
            type="button"
            className="sig-navbar__btn"
            onClick={clearKeyword}
            aria-label="Pencarian baru"
          >
            <SearchIcon size={20} color="var(--text-secondary)" />
          </button>
        </header>
      )}

      {/* Main Content Area */}
      <main className="sig-page__content">
        {!activeKeyword ? (
          /* Initial State: Ramai Dibicarakan & Lokasi Terkait dengan Anda (Screen 6) */
          <div className="sig-search-suggestions">
            {/* Section: Ramai Dibicarakan */}
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

            {/* Section: Lokasi Terkait dengan Anda */}
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
          /* Search Results (Screen 7) */
          <div className="sig-search-results">
            {/* Filter Pills Bar: Solid Teal Keyword Chip + Dropdowns + Funnel */}
            <div className="sig-search-results__bar">
              <div className="sig-keyword-chip">
                <span className="sig-keyword-chip__text">
                  Kata kunci: "{activeKeyword}"
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

            {/* Result Feed Cards */}
            <div className="sig-cards-list">
              {searchResults.map((item) => (
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
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Floating Action Button */}
      {activeKeyword && (
        <FAB onClick={onOpenCreateReport} />
      )}

      {/* Filter Modal */}
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
