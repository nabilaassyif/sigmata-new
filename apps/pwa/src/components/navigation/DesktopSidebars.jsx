import { useMemo, useState } from 'react';
import {
  ArrowRightIcon,
  ClockHistoryIcon,
  HomeIcon,
  LocationPinIconSolid,
  PlusIcon,
  SearchIcon,
  SigmataLogo,
  TrendingUpIcon,
  UserIcon,
} from '../icons/Icons';
import { Button } from '../common/Button';
import { ThemeToggleButton } from '../common/ThemeToggleButton';
import { api } from '../../api';

const FALLBACK_TOPICS = [
  'INFRASTRUKTUR JALAN',
  'KEBERSIHAN LINGKUNGAN',
  'DRAINASE & BANJIR',
  'LAMPU PENERANGAN JALAN',
];

const MUNICIPALITY_POLICY_INFO = {
  '36.71': {
    name: 'Kota Tangerang',
    regulation: 'Perwali No. 40 Tahun 2025',
    badge: 'TNG-PERWALI-40-2025',
  },
  '34.71': {
    name: 'Kota Yogyakarta',
    regulation: 'Perwali No. 79 Tahun 2023',
    badge: 'JOG-PERWALI-79-2023',
  },
};

export function DesktopLeftRail({
  activePage = 'beranda',
  onSelectPage,
  onOpenCreateReport,
  username = 'Warga',
  municipalityLabel = '',
  avatarUrl = null,
  myReportsCount = 0,
}) {
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleConfirmLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await api.logout();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <>
      <aside className="sig-left-rail" aria-label="Navigasi Desktop SIGMATA">
        <div className="sig-left-rail__top">
          <button
            type="button"
            className="sig-left-rail__brand"
            onClick={() => onSelectPage('beranda')}
          >
            <SigmataLogo size={38} />
            <div className="sig-left-rail__brand-text">
              <strong>SIGMATA</strong>
              <span>Layanan Aspirasi Warga</span>
            </div>
          </button>

          <nav className="sig-left-rail__nav" aria-label="Menu utama">
            <button
              type="button"
              className={`sig-left-rail__nav-item ${activePage === 'beranda' ? 'is-active' : ''}`}
              onClick={() => onSelectPage('beranda')}
            >
              <span className="sig-left-rail__nav-icon">
                <HomeIcon size={21} />
              </span>
              <span className="sig-left-rail__nav-label">Beranda</span>
            </button>

            <button
              type="button"
              className={`sig-left-rail__nav-item ${activePage === 'search' ? 'is-active' : ''}`}
              onClick={() => onSelectPage('search')}
            >
              <span className="sig-left-rail__nav-icon">
                <SearchIcon size={21} />
              </span>
              <span className="sig-left-rail__nav-label">Jelajahi</span>
            </button>

            <button
              type="button"
              className={`sig-left-rail__nav-item ${activePage === 'riwayat' ? 'is-active' : ''}`}
              onClick={() => onSelectPage('riwayat')}
            >
              <span className="sig-left-rail__nav-icon">
                <ClockHistoryIcon size={21} />
              </span>
              <span className="sig-left-rail__nav-label">Riwayat &amp; SLA</span>
              {myReportsCount > 0 && (
                <span className="sig-left-rail__count-pill">{myReportsCount}</span>
              )}
            </button>

            <button
              type="button"
              className={`sig-left-rail__nav-item ${activePage === 'profile' ? 'is-active' : ''}`}
              onClick={() => onSelectPage('profile')}
            >
              <span className="sig-left-rail__nav-icon">
                <UserIcon size={21} />
              </span>
              <span className="sig-left-rail__nav-label">Profil Warga</span>
            </button>
          </nav>

          <button
            type="button"
            className="sig-left-rail__compose-btn"
            onClick={onOpenCreateReport}
          >
            <PlusIcon size={18} color="#ffffff" />
            <span>Buat Laporan</span>
          </button>
        </div>

        <div className="sig-left-rail__bottom">
          <ThemeToggleButton variant="pill" />

          <div className="sig-left-rail__account">
          <button
            type="button"
            className="sig-left-rail__profile-card"
            onClick={() => onSelectPage('profile')}
            title="Edit profil & preferensi"
          >
            <div className="sig-left-rail__avatar">
              {avatarUrl ? (
                <img src={avatarUrl} alt={username} />
              ) : (
                <UserIcon size={20} color="#ffffff" />
              )}
            </div>
            <div className="sig-left-rail__user-meta">
              <strong>{username}</strong>
              <span>{municipalityLabel || 'Warga Terdaftar'}</span>
            </div>
          </button>

          <button
            type="button"
            className="sig-left-rail__logout-btn"
            onClick={() => setShowLogoutModal(true)}
            aria-label="Keluar dari akun"
            title="Keluar"
          >
            <ArrowRightIcon size={17} />
          </button>
          </div>
        </div>
      </aside>

      {showLogoutModal && (
        <div className="sig-modal-backdrop" onClick={() => !loggingOut && setShowLogoutModal(false)}>
          <div className="sig-modal sig-logout-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sig-logout-modal__avatar">
              {avatarUrl ? (
                <img src={avatarUrl} alt={username} />
              ) : (
                <UserIcon size={26} color="#ffffff" />
              )}
            </div>
            <h3 className="sig-modal__title" style={{ textAlign: 'center', marginBottom: '6px' }}>
              Keluar dari SIGMATA?
            </h3>
            <p className="sig-modal__body" style={{ textAlign: 'center', marginBottom: '16px' }}>
              Kamu masuk sebagai <strong>{username}</strong>. Kamu bisa masuk kembali kapan saja untuk memantau status &amp; SLA laporanmu.
            </p>
            <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
              <Button
                type="button"
                variant="secondary"
                size="md"
                fullWidth
                disabled={loggingOut}
                onClick={() => setShowLogoutModal(false)}
              >
                Batal
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                fullWidth
                disabled={loggingOut}
                onClick={handleConfirmLogout}
                style={{ backgroundColor: '#dc2626', borderColor: '#dc2626' }}
              >
                {loggingOut ? 'Mengeluarkan...' : 'Ya, Keluar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function DesktopRightRail({
  reports = [],
  myReportsCount = 0,
  userLocation = 'Kota Tangerang',
  municipalityCode = '36.71',
  onSearchKeyword,
  onOpenCreateReport,
}) {
  const [quickQuery, setQuickQuery] = useState('');

  const policyInfo = MUNICIPALITY_POLICY_INFO[municipalityCode] || MUNICIPALITY_POLICY_INFO['36.71'];

  const trendingTopics = useMemo(() => {
    const counts = new Map();
    for (const item of reports) {
      const label = (item?.category || '').trim().toUpperCase();
      if (!label) continue;
      counts.set(label, (counts.get(label) || 0) + 1);
    }

    const fromReports = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count }));

    const merged = [...fromReports];
    for (const fallback of FALLBACK_TOPICS) {
      if (merged.length >= 4) break;
      if (!merged.some((entry) => entry.label === fallback)) {
        merged.push({ label: fallback, count: 0 });
      }
    }
    return merged.slice(0, 4);
  }, [reports]);

  const handleQuickSearch = (e) => {
    e.preventDefault();
    onSearchKeyword?.(quickQuery.trim());
  };

  return (
    <aside className="sig-right-rail" aria-label="Ringkasan Daerah dan Topik Ramai">
      <form className="sig-right-rail__search" onSubmit={handleQuickSearch}>
        <SearchIcon size={17} color="var(--text-muted)" />
        <input
          type="text"
          className="sig-right-rail__search-input"
          placeholder="Cari laporan, kategori, atau lokasi..."
          value={quickQuery}
          onChange={(e) => setQuickQuery(e.target.value)}
        />
      </form>

      <section className="sig-widget-card">
        <div className="sig-widget-card__head">
          <h3 className="sig-widget-card__title">Statistik &amp; SLA Daerahmu</h3>
          <span className="sig-widget-card__badge">{policyInfo.badge}</span>
        </div>

        <div className="sig-widget-card__loc">
          <LocationPinIconSolid size={15} color="var(--teal-normal)" />
          <span>{userLocation || policyInfo.name}</span>
        </div>
        <p className="sig-widget-card__reg">{policyInfo.regulation}</p>

        <div className="sig-widget-stats">
          <div className="sig-widget-stat">
            <strong>{reports.length}</strong>
            <span>Laporan Publik</span>
          </div>
          <div className="sig-widget-stat">
            <strong>{myReportsCount}</strong>
            <span>Laporanmu</span>
          </div>
        </div>
      </section>

      <section className="sig-widget-card">
        <div className="sig-widget-card__head">
          <h3 className="sig-widget-card__title">Ramai Dibicarakan</h3>
        </div>
        <div className="sig-trending-list">
          {trendingTopics.map((topic) => (
            <button
              key={topic.label}
              type="button"
              className="sig-trending-item"
              onClick={() => onSearchKeyword?.(topic.label)}
            >
              <span className="sig-trending-item__icon">
                <TrendingUpIcon size={15} color="var(--teal-normal)" />
              </span>
              <span className="sig-trending-item__meta">
                <strong>{topic.label}</strong>
                <small>
                  {topic.count > 0 ? `${topic.count} laporan publik` : 'Pantauan kategori aktif'}
                </small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="sig-widget-card sig-widget-card--soft">
        <h3 className="sig-widget-card__title">Prioritas Warga &amp; SLA</h3>
        <p className="sig-widget-card__desc">
          Dukungan suara warga dan konfirmasi tetangga dalam radius 5 km menaikkan skor prioritas antrean, sementara tenggat SLA resmi tetap dihitung terpisah berdasarkan peraturan daerah.
        </p>
        <button
          type="button"
          className="sig-button sig-button--secondary sig-button--sm sig-button--full"
          onClick={onOpenCreateReport}
        >
          Kirim Laporan Berfoto
        </button>
      </section>
    </aside>
  );
}
