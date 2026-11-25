import { useState, useRef, useEffect } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '../icons/Icons';

export function Dropdown({
  label,
  options = [],
  value,
  onChange,
  size = 'sm',
  variant = 'pill', // 'pill' | 'solid-teal' | 'outlined'
  prefix = '',
  align = 'left',
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const currentOption = options.find((opt) => opt.value === value) || options[0];
  const displayLabel = prefix
    ? `${prefix}: ${currentOption?.label || label}`
    : currentOption?.label || label;

  return (
    <div
      ref={containerRef}
      className={`sig-dropdown sig-dropdown--${variant} sig-dropdown--align-${align} ${isOpen ? 'is-open' : ''} ${className}`}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`sig-dropdown__trigger sig-dropdown__trigger--${size}`}
      >
        <span className="sig-dropdown__label">{displayLabel}</span>
        <span className="sig-dropdown__chevron">
          {isOpen ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
        </span>
      </button>

      {isOpen && (
        <ul className="sig-dropdown__menu">
          {options.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                className={`sig-dropdown__item ${opt.value === value ? 'is-selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange?.(opt.value);
                  setIsOpen(false);
                }}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
