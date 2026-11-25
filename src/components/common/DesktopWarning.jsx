import { useState } from 'react';
import { SigmataLogo } from '../icons/Icons';

export function DesktopWarning() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) {
    return (
      <div className="sig-desktop-warning-badge" onClick={() => setDismissed(false)}>
        <span>⚠️ Mode Khusus Mobile Aktif</span>
        <button type="button" className="sig-desktop-warning-badge__btn">
          Lihat Info
        </button>
      </div>
    );
  }

  return (
    <aside className="sig-desktop-warning" aria-label="Peringatan perangkat desktop">
      <div className="sig-desktop-warning__card">
        <div className="sig-desktop-warning__logo-wrap">
          <SigmataLogo size={44} />
        </div>

        <div className="sig-desktop-warning__pill">
          KHUSUS TAMPILAN MOBILE
        </div>

        <h1 className="sig-desktop-warning__title">
          Halaman Ini Hanya Dapat Dibuka di Perangkat Mobile
        </h1>

        <p className="sig-desktop-warning__desc">
          Sigmata dirancang dan dioptimalkan secara khusus untuk pengalaman terbaik
          melalui layar ponsel (smartphone).
        </p>

        <div className="sig-desktop-warning__steps">
          <div className="sig-desktop-warning__step">
            <span className="sig-desktop-warning__step-num">1</span>
            <div className="sig-desktop-warning__step-text">
              <strong>Buka melalui Smartphone</strong>
              <p>Akses tautan ini langsung dari peramban ponsel pintar Anda.</p>
            </div>
          </div>

          <div className="sig-desktop-warning__step">
            <span className="sig-desktop-warning__step-num">2</span>
            <div className="sig-desktop-warning__step-text">
              <strong>Mode Simulasi Ponsel (DevTools)</strong>
              <p>
                Tekan <code>F12</code> atau <code>Ctrl + Shift + M</code> (Mac: <code>Cmd + Option + M</code>)
                lalu pilih ukuran perangkat mobile.
              </p>
            </div>
          </div>
        </div>

        <div className="sig-desktop-warning__actions">
          <button
            type="button"
            className="sig-desktop-warning__btn-preview"
            onClick={() => setDismissed(true)}
          >
            Tetap Lanjutkan (Pratinjau Mobile)
          </button>
        </div>
      </div>
    </aside>
  );
}
