import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ThemeContext } from './useTheme';

const THEME_STORAGE_KEY = 'sigmata_theme';

function readInitialTheme() {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // Ignore storage access errors
  }
  return 'light';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readInitialTheme);
  const transitionTimerRef = useRef(null);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage access errors
    }
  }, [theme]);

  const toggleTheme = useCallback(
    (event) => {
      const nextTheme = theme === 'dark' ? 'light' : 'dark';
      const root = document.documentElement;

      let x = window.innerWidth / 2;
      let y = window.innerHeight / 2;
      if (event?.currentTarget?.getBoundingClientRect) {
        const rect = event.currentTarget.getBoundingClientRect();
        x = rect.left + rect.width / 2;
        y = rect.top + rect.height / 2;
      } else if (typeof event?.clientX === 'number' && typeof event?.clientY === 'number') {
        x = event.clientX;
        y = event.clientY;
      }

      const maxRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      );

      root.style.setProperty('--theme-ripple-x', `${Math.round(x)}px`);
      root.style.setProperty('--theme-ripple-y', `${Math.round(y)}px`);
      root.style.setProperty('--theme-ripple-radius', `${Math.ceil(maxRadius)}px`);

      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
      root.classList.remove('is-theme-transitioning', 'is-view-transitioning');

      const reduceMotion =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const applyNextTheme = () => {
        root.setAttribute('data-theme', nextTheme);
        root.style.colorScheme = nextTheme;
        flushSync(() => {
          setTheme(nextTheme);
        });
      };

      if (typeof document.startViewTransition === 'function' && !reduceMotion) {
        try {
          // Freeze per-element CSS transitions so the GPU snapshot captures the crisp final state immediately.
          root.classList.add('is-view-transitioning');
          const vt = document.startViewTransition(applyNextTheme);
          const cleanup = () => {
            root.classList.remove('is-view-transitioning');
          };
          vt.finished.then(cleanup, cleanup);
          transitionTimerRef.current = setTimeout(cleanup, 650);
          return;
        } catch {
          root.classList.remove('is-view-transitioning');
        }
      }

      if (!reduceMotion) {
        root.classList.add('is-theme-transitioning');
        transitionTimerRef.current = setTimeout(() => {
          root.classList.remove('is-theme-transitioning');
        }, 320);
      }

      applyNextTheme();
    },
    [theme]
  );

  return (
    <ThemeContext.Provider value={{ theme, isDark: theme === 'dark', toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
