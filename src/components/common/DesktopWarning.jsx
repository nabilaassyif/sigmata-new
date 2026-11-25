import { useEffect, useState } from 'react';
import { SigmataLogo } from '../icons/Icons';

export function DesktopWarning() {
  const [isMobileSize, setIsMobileSize] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth <= 640;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobileSize(window.innerWidth <= 640);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Jika ukuran sudah mobile (<= 640px), jangan tampilkan apa pun
  if (isMobileSize) {
    return null;
  }

  return (
    <div className="sig-desktop-warning" role="alert" aria-live="assertive">
      <div className="sig-desktop-warning__card">
        <div className="sig-desktop-warning__logo-wrap">
          <SigmataLogo size={48} />
        </div>

        <div className="sig-desktop-warning__pill">
          KHUSUS TAMPILAN MOBILE
        </div>

        <h1 className="sig-desktop-warning__title">
          Aplikasi Ini Hanya Dapat Dibuka di Perangkat Mobile
        </h1>

        <p className="sig-desktop-warning__desc">
          Website Sigmata dioptimalkan khusus untuk layar ponsel (smartphone) demi
          memberikan pengalaman pelaporan warga yang cepat dan interaktif.
        </p>

        <div className="sig-desktop-warning__steps">
          <div className="sig-desktop-warning__step">
            <span className="sig-desktop-warning__step-num">1</span>
            <div className="sig-desktop-warning__step-text">
              <strong>Buka melalui Smartphone</strong>
              <p>Akses tautan website ini langsung dari browser di ponsel Anda.</p>
            </div>
          </div>

          <div className="sig-desktop-warning__step">
            <span className="sig-desktop-warning__step-num">2</span>
            <div className="sig-desktop-warning__step-text">
              <strong>Atau Kecilkan Layar Browser (Mode Mobile)</strong>
              <p>
                Tekan <code>F12</code> lalu pilih ikon <code>Device Mode</code> (atau tekan{' '}
                <code>Ctrl + Shift + M</code> / Mac: <code>Cmd + Option + M</code>), atau kecilkan
                lebar jendela browser Anda hingga ukuran ponsel.
              </p>
            </div>
          </div>
        </div>

        <div className="sig-desktop-warning__footer-hint">
          <span>📱 Website akan terbuka otomatis begitu ukuran layar mendeteksi perangkat mobile.</span>
        </div>
      </div>
    </div>
  );
}
