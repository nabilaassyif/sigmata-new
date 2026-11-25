import { useState, useEffect } from 'react';
import { SigmataLogo, CloseIcon } from '../icons/Icons';

export function PwaInstallBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [isIOS] = useState(() => {
    if (typeof window !== 'undefined' && window.navigator) {
      return /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
    }
    return false;
  });

  useEffect(() => {
    // Cek apakah sudah running dalam mode PWA Standalone (Homescreen)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    if (isStandalone) {
      return;
    }

    // Tangkap event install prompt native jika ada (Android / Chromium)
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Trigger saat pengguna melakukan scroll
    const handleScroll = () => {
      const isDismissed = sessionStorage.getItem('sig_pwa_dismissed');
      if (isDismissed) return;

      if (window.scrollY > 40) {
        setIsVisible(true);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    sessionStorage.setItem('sig_pwa_dismissed', 'true');
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsVisible(false);
        sessionStorage.setItem('sig_pwa_dismissed', 'true');
      }
      setDeferredPrompt(null);
    } else {
      // Tampilkan petunjuk pemasangan (terutama untuk iPhone / Safari)
      setShowGuideModal(true);
    }
  };

  if (!isVisible) {
    return null;
  }

  return (
    <>
      {/* PWA Floating Bottom Banner (Exact match to requested image) */}
      <div className="sig-pwa-banner-wrap" role="region" aria-label="Install Aplikasi Sigmata">
        <div className="sig-pwa-banner">
          {/* Top Section: App Icon, Title, Badge, and Close Button */}
          <div className="sig-pwa-banner__header">
            <div className="sig-pwa-banner__icon-glow">
              <SigmataLogo size={36} />
            </div>

            <div className="sig-pwa-banner__title-wrap">
              <div className="sig-pwa-banner__title-row">
                <span className="sig-pwa-banner__title">Install Aplikasi</span>
                <span className="sig-pwa-banner__badge">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6.4-4.8-6.4 4.8 2.4-7.2-6-4.8h7.6z" />
                  </svg>
                  PWA
                </span>
              </div>
            </div>

            <button
              type="button"
              className="sig-pwa-banner__close"
              onClick={handleDismiss}
              aria-label="Tutup banner install"
            >
              <CloseIcon size={16} color="#9ca3af" />
            </button>
          </div>

          {/* Description */}
          <p className="sig-pwa-banner__desc">
            Pasang di homescreen untuk akses cepat tanpa browser bar & mendukung mode offline.
          </p>

          {/* Actions */}
          <div className="sig-pwa-banner__actions">
            <button
              type="button"
              className="sig-pwa-banner__btn-install"
              onClick={handleInstallClick}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>{isIOS ? 'Cara Pasang di iPhone' : 'Install Aplikasi'}</span>
            </button>

            <button
              type="button"
              className="sig-pwa-banner__btn-later"
              onClick={handleDismiss}
            >
              Nanti Saja
            </button>
          </div>
        </div>
      </div>

      {/* Modal Panduan Pasang PWA di iPhone/Android */}
      {showGuideModal && (
        <div className="sig-modal-backdrop" onClick={() => setShowGuideModal(false)}>
          <div className="sig-modal sig-pwa-guide-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="sig-modal__title" style={{ textAlign: 'center', marginBottom: '8px' }}>
              {isIOS ? 'Cara Pasang di iPhone (Safari)' : 'Cara Pasang di Layar Utama'}
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b', textAlign: 'center', marginBottom: '16px' }}>
              Ikuti langkah mudah ini untuk menambahkan Sigmata ke layar utama ponsel Anda:
            </p>

            <div className="sig-pwa-guide-steps">
              <div className="sig-pwa-guide-step">
                <span className="sig-pwa-guide-step__num">1</span>
                <p>
                  {isIOS ? (
                    <>Ketuk tombol <strong>Bagikan (Share)</strong> ikon kotak berpanah ke atas di bilah bawah Safari.</>
                  ) : (
                    <>Ketuk ikon <strong>Titik Tiga (Menu)</strong> di sudut kanan atas peramban Chrome.</>
                  )}
                </p>
              </div>

              <div className="sig-pwa-guide-step">
                <span className="sig-pwa-guide-step__num">2</span>
                <p>
                  Gulir ke bawah dan pilih <strong>"Tambah ke Layar Utama" (Add to Home Screen)</strong>.
                </p>
              </div>

              <div className="sig-pwa-guide-step">
                <span className="sig-pwa-guide-step__num">3</span>
                <p>
                  Ketuk tombol <strong>"Tambah"</strong> di pojok kanan atas. Ikon Sigmata akan muncul di layar ponsel Anda!
                </p>
              </div>
            </div>

            <button
              type="button"
              className="sig-button sig-button--primary sig-button--full"
              style={{ marginTop: '16px' }}
              onClick={() => {
                setShowGuideModal(false);
                setIsVisible(false);
                sessionStorage.setItem('sig_pwa_dismissed', 'true');
              }}
            >
              Mengerti
            </button>
          </div>
        </div>
      )}
    </>
  );
}
