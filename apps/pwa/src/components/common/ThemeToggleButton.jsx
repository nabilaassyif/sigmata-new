import { useTheme } from '../../theme/useTheme';

function CelestialIcon({ isDark }) {
  return (
    <span className={`sig-celestial ${isDark ? 'is-dark' : ''}`} aria-hidden="true">
      <svg
        className="sig-celestial__sun"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="4.5" fill="currentColor" fillOpacity="0.2" />
        <line x1="12" y1="2" x2="12" y2="4.5" />
        <line x1="12" y1="19.5" x2="12" y2="22" />
        <line x1="4.93" y1="4.93" x2="6.7" y2="6.7" />
        <line x1="17.3" y1="17.3" x2="19.07" y2="19.07" />
        <line x1="2" y1="12" x2="4.5" y2="12" />
        <line x1="19.5" y1="12" x2="22" y2="12" />
        <line x1="4.93" y1="19.07" x2="6.7" y2="17.3" />
        <line x1="17.3" y1="6.7" x2="19.07" y2="4.93" />
      </svg>

      <svg
        className="sig-celestial__moon"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          d="M20.354 15.354A9 9 0 0 1 8.646 3.646 9.003 9.003 0 0 0 12 21a9.003 9.003 0 0 0 8.354-5.646z"
          fill="currentColor"
          fillOpacity="0.24"
        />
      </svg>

      <span className="sig-celestial__star sig-celestial__star--1" />
      <span className="sig-celestial__star sig-celestial__star--2" />
    </span>
  );
}

export function ThemeToggleButton({ variant = 'icon', className = '' }) {
  const { isDark, toggleTheme } = useTheme();
  const label = isDark ? 'Mode Terang' : 'Mode Gelap';

  if (variant === 'pill') {
    return (
      <button
        type="button"
        className={`sig-theme-pill ${isDark ? 'is-dark' : ''} ${className}`}
        onClick={toggleTheme}
        aria-pressed={isDark}
        aria-label={`Ubah ke ${label}`}
      >
        <span className="sig-theme-pill__left">
          <span className="sig-theme-pill__badge">
            <CelestialIcon isDark={isDark} />
          </span>
          <span className="sig-theme-pill__text">
            <strong>{isDark ? 'Mode Gelap' : 'Mode Terang'}</strong>
            <small>{isDark ? 'Tampilan malam aktif' : 'Tampilan terang aktif'}</small>
          </span>
        </span>

        <span className={`sig-theme-track ${isDark ? 'is-dark' : ''}`} aria-hidden="true">
          <span className="sig-theme-track__stars">
            <i />
            <i />
            <i />
          </span>
          <span className="sig-theme-track__clouds">
            <i />
            <i />
          </span>
          <span className="sig-theme-track__thumb" />
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`sig-theme-btn ${isDark ? 'is-dark' : ''} ${className}`}
      onClick={toggleTheme}
      aria-pressed={isDark}
      aria-label={`Ubah ke ${label}`}
      title={`Ubah ke ${label}`}
    >
      <CelestialIcon isDark={isDark} />
    </button>
  );
}
