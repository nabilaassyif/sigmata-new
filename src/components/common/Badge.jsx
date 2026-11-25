export function StatusBadge({ status = 'Dalam Proses', variant = 'teal', className = '' }) {
  return (
    <span className={`sig-badge sig-badge--${variant} ${className}`}>
      <span className="sig-badge__dot" />
      <span className="sig-badge__label">{status}</span>
    </span>
  );
}

export function CategoryBadge({ children, className = '' }) {
  return (
    <span className={`sig-category-label ${className}`}>
      {children}
    </span>
  );
}
