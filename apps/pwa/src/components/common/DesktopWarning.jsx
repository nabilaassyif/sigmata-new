
import { useEffect, useState } from 'react';

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

  if (isMobileSize) return null;

  return (
    <div
      className="sig-desktop-warning"
      role="alert"
      aria-live="assertive"
    >
      <div className="sig-desktop-warning__content">
        <div className="sig-desktop-warning__visual">
          <img
            src="/public/mascot-sad.webp"
            alt="Maskot Sigmata"
            className="sig-desktop-warning__mascot"
          />
        </div>

        <div className="sig-desktop-warning__text">

          <h1 className="sig-desktop-warning__title">
            Aplikasi ini hanya
            <br />
            <span>Dapat Dibuka di Perangkat Mobile</span>
          </h1>

          <p className="sig-desktop-warning__desc">
            Silakan buka halaman ini menggunakan smartphone
            untuk mendapatkan pengalaman pelaporan warga yang optimal.
          </p>
        </div>
      </div>
    </div>
  );
}
