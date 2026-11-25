import { useState } from 'react';
import { HomeIcon, ClockHistoryIcon, UserIcon, ArrowRightIcon } from '../icons/Icons';
import { Button } from '../common/Button';

export function Drawer({
  isOpen,
  activePage = 'beranda', // 'beranda' | 'riwayat'
  onSelectPage,
  onClose,
  username = 'username12543',
  onUpdateUsername,
}) {
  const [showEditModal, setShowEditModal] = useState(false);
  const [newUsername, setNewUsername] = useState(username);

  const handleSaveProfile = () => {
    if (newUsername.trim()) {
      onUpdateUsername?.(newUsername.trim().replace(/^@/, ''));
    }
    setShowEditModal(false);
  };

  const handleLogout = () => {
    const confirmLogout = window.confirm('Apakah Anda yakin ingin keluar dari akun?');
    if (confirmLogout) {
      alert('Anda telah berhasil logout.');
      onClose?.();
    }
  };

  return (
    <>
      {/* Overlay Backdrop */}
      <div
        className={`sig-drawer-backdrop ${isOpen ? 'is-open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Container */}
      <aside className={`sig-drawer ${isOpen ? 'is-open' : ''}`}>
        <div className="sig-drawer__header">
          <div className="sig-drawer__avatar">
            <UserIcon size={26} color="#ffffff" />
          </div>
          <div className="sig-drawer__user-info">
            <div className="sig-drawer__username">@{username}</div>
            <button
              type="button"
              className="sig-drawer__edit-link"
              onClick={() => {
                setNewUsername(username);
                setShowEditModal(true);
              }}
            >
              Edit profile
            </button>
          </div>
        </div>

        <div className="sig-drawer__content">
          <div className="sig-drawer__section-title">HALAMAN</div>

          <nav className="sig-drawer__nav">
            <button
              type="button"
              className={`sig-drawer__nav-item ${
                activePage === 'beranda' ? 'is-active' : ''
              }`}
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
              className={`sig-drawer__nav-item ${
                activePage === 'riwayat' ? 'is-active' : ''
              }`}
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
          </nav>
        </div>

        <div className="sig-drawer__footer">
          <button
            type="button"
            className="sig-drawer__logout-btn"
            onClick={handleLogout}
          >
            <span>Logout</span>
            <ArrowRightIcon size={16} />
          </button>
        </div>
      </aside>

      {/* Edit Profile Modal */}
      {showEditModal && (
        <div className="sig-modal-backdrop" onClick={() => setShowEditModal(false)}>
          <div className="sig-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="sig-modal__title">Edit Profil Pengguna</h3>
            <div style={{ margin: '14px 0' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Nama Pengguna (Username)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f5', borderRadius: '8px', padding: '0 12px', marginTop: '6px' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>@</span>
                <input
                  type="text"
                  className="sig-search-header__input"
                  style={{ padding: '8px 6px', width: '100%' }}
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="username"
                  autoFocus
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                variant="secondary"
                size="md"
                fullWidth
                onClick={() => setShowEditModal(false)}
              >
                Batal
              </Button>
              <Button
                variant="primary"
                size="md"
                fullWidth
                onClick={handleSaveProfile}
              >
                Simpan
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
