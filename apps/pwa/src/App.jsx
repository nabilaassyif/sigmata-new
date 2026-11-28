import { useCallback, useEffect, useState } from 'react';
import './styles/components.css';

import { Drawer } from './components/navigation/Drawer';
import { DesktopLeftRail, DesktopRightRail } from './components/navigation/DesktopSidebars';
import { PwaInstallBanner } from './components/common/PwaInstallBanner';
import { BerandaPage } from './pages/BerandaPage';
import { RiwayatPage } from './pages/RiwayatPage';
import { InputLaporanPage } from './pages/InputLaporanPage';
import { PencarianPage } from './pages/PencarianPage';
import { OnboardingProfilePage } from './pages/OnboardingProfilePage';
import { AuthTestPage } from './pages/AuthTestPage';
import { AuthGate } from './components/common/AuthGate';
import { ThemeProvider } from './theme/ThemeContext';
import { useMyComplaints } from './api/useMyComplaints';
import { api, statusLabel } from './api';

const MUNICIPALITY_NAMES = {
  '36.71': 'Kota Tangerang',
  '34.71': 'Kota Yogyakarta',
};

const feedDateFmt = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function toFeedItem(detail) {
  const createdMs = new Date(detail.createdAt).getTime();
  const locParts = [detail.district, detail.city].filter(Boolean);
  return {
    id: detail.complaintId,
    location: locParts.length > 0 ? locParts.join(', ') : detail.agency || 'Lokasi Warga',
    category: (detail.category || detail.suggestedCategory || 'LAPORAN WARGA').toUpperCase(),
    description: detail.description,
    username: detail.username || 'Warga',
    date: feedDateFmt.format(new Date(createdMs)),
    timestamp: createdMs,
    initialUpvotes: detail.upvoteCount ?? 1,
    corroborationCount: detail.corroborationCount ?? 0,
    priorityScore: detail.priorityScore ?? 1,
    slaDueAt: detail.slaDueAt || null,
    slaSummary: detail.slaSummary || null,
    viewerUpvoted: Boolean(detail.viewerUpvoted),
    viewerCorroborated: Boolean(detail.viewerCorroborated),
    corroborations: detail.corroborations || [],
    status: statusLabel(detail.status),
    images: detail.images ? detail.images : detail.hasPhoto ? [api.photoUrl(detail.complaintId)] : null,
    scope: detail.scope,
    period: detail.period,
  };
}

export default function App() {
  return (
    <ThemeProvider>
      {window.location.pathname === '/auth-test' ? (
        <AuthTestPage />
      ) : (
        <AuthGate>
          <AppShell />
        </AuthGate>
      )}
    </ThemeProvider>
  );
}

function AppShell() {
  const [activePage, setActivePage] = useState('beranda');
  const [prevPage, setPrevPage] = useState('beranda');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [profileState, setProfileState] = useState({ loading: true, error: false, data: null });
  const [userLocation, setUserLocation] = useState('Cipondoh, Kota Tangerang');
  const [feedReports, setFeedReports] = useState([]);
  const { items: myReports, loading: myLoading, refresh: refreshMyReports } = useMyComplaints();
  const [toastMessage, setToastMessage] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchLaunchId, setSearchLaunchId] = useState(0);

  const applyProfileMetadata = useCallback((data) => {
    const p = data?.profile;
    if (p) {
      const munName = MUNICIPALITY_NAMES[p.municipalityCode] || p.municipalityCode;
      const loc = [p.districtCode, munName].filter(Boolean).join(', ');
      if (loc) setUserLocation(loc);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const data = await api.getProfile();
      setProfileState({ loading: false, error: false, data });
      applyProfileMetadata(data);
    } catch {
      setProfileState({ loading: false, error: true, data: null });
    }
  }, [applyProfileMetadata]);

  const refreshFeed = useCallback(async () => {
    try {
      const list = await api.listPublicFeed();
      setFeedReports(list.map(toFeedItem));
    } catch {
      // Keep current list on transient error
    }
  }, []);

  useEffect(() => {
    void refreshProfile();
    void refreshFeed();
  }, [refreshProfile, refreshFeed]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage('');
    }, 3000);
  };

  const navigateTo = (page) => {
    setPrevPage(activePage);
    setActivePage(page);
    setIsDrawerOpen(false);
    if (page === 'riwayat') void refreshMyReports();
    if (page === 'beranda') void refreshFeed();
    if (page === 'profile') void refreshProfile();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleJumpToSearch = (kw = '') => {
    setSearchKeyword(kw);
    setSearchLaunchId((id) => id + 1);
    navigateTo('search');
  };

  const handleReportSubmitted = (newReport, isPublic) => {
    if (isPublic) {
      setFeedReports((prev) => [newReport, ...prev]);
      showToast('Laporan berhasil diposting ke publik!');
      navigateTo('beranda');
    } else {
      showToast('Laporan berhasil disimpan secara privat!');
      navigateTo('riwayat');
    }

    void refreshMyReports();
    void refreshFeed();
  };

  const handleProfileSaved = (updatedData) => {
    setProfileState({ loading: false, error: false, data: updatedData });
    applyProfileMetadata(updatedData);
    showToast('Profil warga berhasil disimpan!');
    setActivePage('beranda');
  };

  const needsOnboarding =
    !profileState.loading &&
    !profileState.error &&
    (!profileState.data?.onboarded || !profileState.data?.profile);
  const showDesktopShell = !needsOnboarding && !profileState.loading && !profileState.error;
  const displayName =
    profileState.data?.profile?.fullName ||
    profileState.data?.identity?.name ||
    profileState.data?.identity?.preferredUsername ||
    'Warga';
  const avatarUrl = profileState.data?.profile?.avatarUrl || null;
  const municipalityCode = profileState.data?.profile?.municipalityCode || '36.71';

  const renderCurrentPage = () => {
    if (profileState.loading) {
      return (
        <div className="sig-page" style={{ padding: 24, justifyContent: 'center', alignItems: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Memuat profil akun...</p>
        </div>
      );
    }

    if (profileState.error) {
      return (
        <div className="sig-page" style={{ padding: 24, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>
            Gagal memuat profil akun. Silakan coba lagi.
          </p>
          <button
            type="button"
            className="sig-button sig-button--primary sig-button--md"
            onClick={() => {
              setProfileState({ loading: true, error: false, data: null });
              void refreshProfile();
            }}
          >
            Muat Ulang Profil
          </button>
        </div>
      );
    }

    if (needsOnboarding) {
      return (
        <OnboardingProfilePage
          mode="onboarding"
          profileData={profileState.data}
          onSaved={handleProfileSaved}
        />
      );
    }

    switch (activePage) {
      case 'profile':
        return (
          <OnboardingProfilePage
            mode="edit"
            profileData={profileState.data}
            onSaved={handleProfileSaved}
            onBack={() => navigateTo(prevPage || 'beranda')}
          />
        );
      case 'riwayat':
        return (
          <RiwayatPage
            onOpenMenu={() => setIsDrawerOpen(true)}
            onOpenSearch={() => handleJumpToSearch('')}
            myReports={myReports}
            loading={myLoading}
            onRefresh={() => void refreshMyReports()}
          />
        );
      case 'input':
        return (
          <InputLaporanPage
            onClose={() => navigateTo(prevPage || 'beranda')}
            onSubmitSuccess={handleReportSubmitted}
            currentLocation={userLocation}
            onChangeLocation={(newLoc) => setUserLocation(newLoc)}
          />
        );
      case 'search':
        return (
          <PencarianPage
            key={`${searchLaunchId}:${searchKeyword}`}
            initialKeyword={searchKeyword}
            onClearExternalKeyword={() => setSearchKeyword('')}
            onBack={() => navigateTo('beranda')}
            onOpenCreateReport={() => navigateTo('input')}
            onLogoClick={() => navigateTo('beranda')}
            reports={feedReports}
            userLocation={userLocation}
          />
        );
      case 'beranda':
      default:
        return (
          <BerandaPage
            onOpenMenu={() => setIsDrawerOpen(true)}
            onOpenSearch={() => handleJumpToSearch('')}
            onOpenCreateReport={() => navigateTo('input')}
            reports={feedReports}
            location={userLocation}
            onRefreshFeed={() => void refreshFeed()}
            username={displayName}
            avatarUrl={avatarUrl}
          />
        );
    }
  };

  return (
    <div className={`sig-app-viewport ${showDesktopShell ? 'sig-app-viewport--shell' : ''}`}>
      {showDesktopShell && (
        <DesktopLeftRail
          activePage={activePage}
          onSelectPage={(page) => (page === 'search' ? handleJumpToSearch('') : navigateTo(page))}
          onOpenCreateReport={() => navigateTo('input')}
          username={displayName}
          municipalityLabel={userLocation}
          avatarUrl={avatarUrl}
          myReportsCount={myReports.length}
        />
      )}

      <div className="sig-mobile-container">
        {!needsOnboarding && (
          <Drawer
            isOpen={isDrawerOpen}
            activePage={activePage}
            onSelectPage={(page) => navigateTo(page)}
            onClose={() => setIsDrawerOpen(false)}
            username={displayName}
            municipalityLabel={userLocation}
            avatarUrl={avatarUrl}
          />
        )}

        {renderCurrentPage()}

        {showDesktopShell && <PwaInstallBanner />}

        {toastMessage && (
          <div className="sig-toast">
            <span>{toastMessage}</span>
          </div>
        )}
      </div>

      {showDesktopShell && (
        <DesktopRightRail
          reports={feedReports}
          myReportsCount={myReports.length}
          userLocation={userLocation}
          municipalityCode={municipalityCode}
          onSearchKeyword={(kw) => handleJumpToSearch(kw)}
          onOpenCreateReport={() => navigateTo('input')}
        />
      )}
    </div>
  );
}
