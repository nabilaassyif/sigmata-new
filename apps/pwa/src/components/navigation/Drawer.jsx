import { useState } from 'react';
import { HomeIcon, ClockHistoryIcon, UserIcon, ArrowRightIcon } from '../icons/Icons';
import { Button } from '../common/Button';
import { ThemeToggleButton } from '../common/ThemeToggleButton';
import { api } from '../../api';

export function Drawer({
  isOpen,
  activePage = 'beranda',
  onSelectPage,
  onClose,
  username = 'Warga',
  municipalityLabel = '',
  avatarUrl = null,
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
      <div
        className={`sig-drawer-backdrop ${isOpen ? 'is-open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className={`sig-drawer ${isOpen ? 'is-open' : ''}`}>
        <div className="sig-drawer__header">
          <div className="sig-drawer__avatar" style={{ overflow: 'hidden' }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt={username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <UserIcon size={26} color="#ffffff" />
            )}
          </div>
          <div className="sig-drawer__user-info">
            <div className="sig-drawer__username">{username}</div>
            {municipalityLabel && (
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                {municipalityLabel}
              </div>
            )}
            <button
              type="button"
              className="sig-drawer__edit-link"
              onClick={() => {
                onSelectPage('profile');
                onClose?.();
              }}
            >
              Edit profile & preferensi
            </button>
          </div>
        </div>

        <div className="sig-drawer__content">
          <div className="sig-drawer__section-title">HALAMAN</div>

          <nav className="sig-drawer__nav">
            <button
              type="button"
              className={`sig-drawer__nav-item ${activePage === 'beranda' ? 'is-active' : ''}`}
              onClick={() => {
                onSelectPage('beranda');
                onClose?.();
              }}
            >
              <span className="sig-drawer__nav-icon">
                <HomeIcon size={20} />
              </span>
              <span className="sig-drawer__nav-label">Beranda</span>
            </button>

            <button
              type="button"
              className={`sig-drawer__nav-item ${activePage === 'riwayat' ? 'is-active' : ''}`}
              onClick={() => {
                onSelectPage('riwayat');
                onClose?.();
              }}
            >
              <span className="sig-drawer__nav-icon">
                <ClockHistoryIcon size={20} />
              </span>
              <span className="sig-drawer__nav-label">Riwayat</span>
            </button>

            <button
              type="button"
              className={`sig-drawer__nav-item ${activePage === 'profile' ? 'is-active' : ''}`}
              onClick={() => {
                onSelectPage('profile');
                onClose?.();
              }}
            >
              <span className="sig-drawer__nav-icon">
                <UserIcon size={20} />
              </span>
              <span className="sig-drawer__nav-label">Profil Warga</span>
            </button>
          </nav>
        </div>

        <div className="sig-drawer__footer" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <ThemeToggleButton variant="pill" />
          <button
            type="button"
            className="sig-drawer__logout-btn"
            onClick={() => setShowLogoutModal(true)}
          >
            <span>Logout</span>
            <ArrowRightIcon size={16} />
          </button>
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
              Kamu masuk sebagai <strong>{username}</strong>. Kamu bisa masuk kembali kapan saja untuk memantau status & SLA laporanmu.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
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
