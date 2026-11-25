export function StatusBar() {
  return (
    <div className="sig-status-bar">
      <span className="sig-status-bar__time">9:41</span>
      
      {/* Dynamic Island */}
      <div className="sig-status-bar__island" />

      <div className="sig-status-bar__icons">
        {/* Cellular Signal */}
        <svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx="0.8" />
          <rect x="4.5" y="5.5" width="3" height="6.5" rx="0.8" />
          <rect x="9" y="3" width="3" height="9" rx="0.8" />
          <rect x="13.5" y="0.5" width="3" height="11.5" rx="0.8" />
        </svg>

        {/* Wifi */}
        <svg width="15" height="12" viewBox="0 0 15 12" fill="currentColor">
          <path d="M7.5 9.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm-4-3a5.7 5.7 0 0 1 8 0 .8.8 0 0 1-.5 1.4.8.8 0 0 1-.6-.2 4.1 4.1 0 0 0-5.8 0 .8.8 0 0 1-1.1-1.2zm-3-3a10 10 0 0 1 14 0 .8.8 0 0 1-.5 1.4.8.8 0 0 1-.6-.2 8.4 8.4 0 0 0-11.8 0 .8.8 0 0 1-1.1-1.2z" />
        </svg>

        {/* Battery */}
        <svg width="22" height="11" viewBox="0 0 22 11" fill="none">
          <rect x="0.75" y="0.75" width="18" height="9.5" rx="2.5" stroke="currentColor" strokeWidth="1.2" />
          <rect x="2.5" y="2.5" width="13" height="6" rx="1.5" fill="currentColor" />
          <path d="M20 3.5v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
