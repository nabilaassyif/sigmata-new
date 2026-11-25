import { ArrowRightIcon } from '../icons/Icons';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  pill = false,
  fullWidth = false,
  withArrow = false,
  icon = null,
  disabled = false,
  onClick,
  type = 'button',
  className = '',
  style = {},
}) {
  const classes = [
    'sig-button',
    `sig-button--${variant}`,
    `sig-button--${size}`,
    pill ? 'sig-button--pill' : '',
    fullWidth ? 'sig-button--full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={classes}
      style={style}
    >
      {icon && <span className="sig-button__icon">{icon}</span>}
      <span className="sig-button__text">{children}</span>
      {withArrow && (
        <span className="sig-button__arrow">
          <ArrowRightIcon size={size === 'sm' ? 14 : size === 'lg' ? 18 : 16} />
        </span>
      )}
    </button>
  );
}
