import { useState } from 'react';
import './styles/components.css';

import { Drawer } from './components/navigation/Drawer';
import { DesktopWarning } from './components/common/DesktopWarning';
import { BerandaPage } from './pages/BerandaPage';
import { RiwayatPage } from './pages/RiwayatPage';
import { InputLaporanPage } from './pages/InputLaporanPage';
import { PencarianPage } from './pages/PencarianPage';

export default function App() {
  const [activePage, setActivePage] = useState('beranda');
  const [prevPage, setPrevPage] = useState('beranda');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [username, setUsername] = useState('username12543');
  const [userLocation, setUserLocation] = useState('[Kecamatan], [Kota]');
  const [feedReports, setFeedReports] = useState([]);
  const [myReports, setMyReports] = useState([]);
  const [toastMessage, setToastMessage] = useState('');

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
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

    setMyReports((prev) => [
      {
        id: newReport.id,
        category: newReport.category,
        date: 'Hari ini',
        description: newReport.description,
        status: 'Dalam Proses',
        timestamp: 'Baru saja',
        district: userLocation.split(',')[0]?.trim() || '[Kecamatan]',
        city: userLocation.split(',')[1]?.trim() || '[Kota]',
        upvotes: '1',
        image: newReport.images?.[0] || null,
      },
      ...prev,
    ]);
  };

  const renderCurrentPage = () => {
    switch (activePage) {
      case 'riwayat':
        return (
          <RiwayatPage
            onOpenMenu={() => setIsDrawerOpen(true)}
            onOpenSearch={() => navigateTo('search')}
            myReports={myReports}
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
            onBack={() => navigateTo('beranda')}
            onOpenCreateReport={() => navigateTo('input')}
            onLogoClick={() => navigateTo('beranda')}
          />
        );
      case 'beranda':
      default:
        return (
          <BerandaPage
            onOpenMenu={() => setIsDrawerOpen(true)}
            onOpenSearch={() => navigateTo('search')}
            onOpenCreateReport={() => navigateTo('input')}
            reports={feedReports}
            location={userLocation}
          />
        );
    }
  };

  return (
    <div className="sig-app-viewport">
      {/* Desktop warning overlay on screen >= 1024px */}
      <DesktopWarning />

      <div className="sig-mobile-container">
        {/* Navigation Drawer */}
        <Drawer
          isOpen={isDrawerOpen}
          activePage={activePage}
          onSelectPage={(page) => navigateTo(page)}
          onClose={() => setIsDrawerOpen(false)}
          username={username}
          onUpdateUsername={(newUname) => {
            setUsername(newUname);
            showToast(`Username berhasil diubah menjadi @${newUname}`);
          }}
        />

        {/* Current Active Page */}
        {renderCurrentPage()}

        {/* Toast Notification */}
        {toastMessage && (
          <div className="sig-toast">
            <span>{toastMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
}
