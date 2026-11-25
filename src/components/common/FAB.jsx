import { PlusIcon } from '../icons/Icons';

export function FAB({ onClick, ariaLabel = 'Buat Laporan Baru' }) {
  return (
    <button
      type="button"
      className="sig-fab"
      onClick={onClick}
      aria-label={ariaLabel}
    >
      <PlusIcon size={24} color="#ffffff" />
    </button>
  );
}
