import {
  MenuIcon,
  SearchIcon,
  SigmataLogo,
  CloseIcon,
  QuestionBareIcon,
  ArrowLeftIcon,
} from '../icons/Icons';
import { ThemeToggleButton } from './ThemeToggleButton';

export function Navbar({
  type = 'default', // 'default' | 'form' | 'search' | 'detail'
  title = '',
  onMenuClick,
  onSearchClick,
  onCloseClick,
  onBackClick,
  onHelpClick,
  onLogoClick,
  rightAction,
}) {
  if (type === 'form') {
    return (
      <header className="sig-navbar sig-navbar--form">
        <button
          type="button"
          onClick={onCloseClick}
          className="sig-navbar__btn"
          aria-label="Tutup"
        >
          <CloseIcon size={20} color="var(--text-secondary)" />
        </button>
        <h3 className="sig-navbar__title">{title || 'Input Laporan'}</h3>
        <div className="sig-navbar__actions">
          <ThemeToggleButton variant="icon" />
          {onHelpClick && (
            <button
              type="button"
              onClick={onHelpClick}
              className="sig-navbar__btn"
              aria-label="Bantuan"
            >
              <QuestionBareIcon size={20} color="var(--text-muted)" />
            </button>
          )}
        </div>
      </header>
    );
  }

  if (type === 'detail') {
    return (
      <header className="sig-navbar sig-navbar--detail">
        <button
          type="button"
          onClick={onBackClick}
          className="sig-navbar__btn"
          aria-label="Kembali"
        >
          <ArrowLeftIcon size={20} color="var(--text-primary)" />
        </button>
        <h1 className="sig-navbar__title">{title}</h1>
        <div className="sig-navbar__right sig-navbar__actions">
          {rightAction}
          <ThemeToggleButton variant="icon" />
        </div>
      </header>
    );
  }

  return (
    <header className="sig-navbar">
      <button
        type="button"
        onClick={onMenuClick}
        className="sig-navbar__btn"
        aria-label="Buka Menu"
      >
        <MenuIcon size={22} color="var(--text-secondary)" />
      </button>

      <button
        type="button"
        onClick={onLogoClick}
        className="sig-navbar__logo-btn"
        aria-label="Beranda"
      >
        <SigmataLogo size={32} />
      </button>

      <div className="sig-navbar__actions">
        <ThemeToggleButton variant="icon" />
        <button
          type="button"
          onClick={onSearchClick}
          className="sig-navbar__btn"
          aria-label="Cari Laporan"
        >
          <SearchIcon size={20} color="var(--text-secondary)" />
        </button>
      </div>
    </header>
  );
}
