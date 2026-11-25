import { useState } from 'react';
import { ChevronUpIcon, ChevronDownIcon, FilterFunnelIcon } from '../icons/Icons';
import { Dropdown } from './Dropdown';

export function RiwayatFilterBar({
  sort = 'terbaru',
  onSortChange,
  status = 'semua',
  onStatusChange,
  onOpenFilterModal,
}) {
  const [collapsed, setCollapsed] = useState(false);

  const sortOptions = [
    { value: 'terbaru', label: 'Terbaru' },
    { value: 'terlama', label: 'Terlama' },
    { value: 'upvote', label: 'Total Upvote' },
  ];

  const statusOptions = [
    { value: 'semua', label: 'Semua status' },
    { value: 'proses', label: 'Dalam Proses' },
    { value: 'selesai', label: 'Selesai' },
    { value: 'ditolak', label: 'Ditolak' },
  ];

  return (
    <div className="sig-filter-bar">
      <div className="sig-filter-bar__top-row">
        <h2 className="sig-filter-bar__title">Riwayat Laporan</h2>
        <button
          type="button"
          className="sig-filter-bar__toggle-btn"
          onClick={() => setCollapsed(!collapsed)}
          aria-label="Toggle filter"
        >
          {collapsed ? <ChevronDownIcon size={18} /> : <ChevronUpIcon size={18} />}
        </button>
      </div>

      {!collapsed && (
        <div className="sig-filter-bar__pills-row">
          <Dropdown
            options={sortOptions}
            value={sort}
            onChange={onSortChange}
            variant="pill"
          />
          <Dropdown
            options={statusOptions}
            value={status}
            onChange={onStatusChange}
            variant="pill"
            align="right"
          />
          <button
            type="button"
            className="sig-filter-bar__funnel-btn"
            onClick={onOpenFilterModal}
            aria-label="Filter Lanjutan"
          >
            <FilterFunnelIcon size={17} color="var(--text-secondary)" />
          </button>
        </div>
      )}
    </div>
  );
}

export function BerandaLocationBar({
  location = '[Kecamatan], [Kota]',
  locationFilter = 'kota',
  onLocationFilterChange,
  sort = 'terbaru',
  onSortChange,
  period = 'harian',
  onPeriodChange,
  onOpenFilterModal,
}) {
  const [collapsed, setCollapsed] = useState(false);

  const locationOptions = [
    { value: 'kota', label: 'Kota' },
    { value: 'kecamatan', label: 'Kecamatan' },
    { value: 'semua', label: 'Semua Wilayah' },
  ];

  const sortOptions = [
    { value: 'terbaru', label: 'Terbaru' },
    { value: 'terpopuler', label: 'Terpopuler' },
    { value: 'terlama', label: 'Terlama' },
  ];

  const periodOptions = [
    { value: 'harian', label: 'Harian' },
    { value: 'mingguan', label: 'Mingguan' },
    { value: 'bulanan', label: 'Bulanan' },
  ];

  return (
    <div className="sig-location-bar">
      <div className="sig-location-bar__header">
        <div className="sig-location-bar__text-wrap">
          <span className="sig-location-bar__sub">LOKASIMU SAAT INI</span>
          <span className="sig-location-bar__value">{location}</span>
        </div>
        <button
          type="button"
          className="sig-location-bar__toggle-btn"
          onClick={() => setCollapsed(!collapsed)}
          aria-label="Toggle filter"
        >
          {collapsed ? <ChevronDownIcon size={18} /> : <ChevronUpIcon size={18} />}
        </button>
      </div>

      {!collapsed && (
        <div className="sig-location-bar__filters">
          {/* Solid Teal pill as seen in Image 2 */}
          <Dropdown
            prefix="Lokasi saya"
            options={locationOptions}
            value={locationFilter}
            onChange={onLocationFilterChange}
            variant="solid-teal"
          />
          <Dropdown
            options={sortOptions}
            value={sort}
            onChange={onSortChange}
            variant="pill"
          />
          <Dropdown
            options={periodOptions}
            value={period}
            onChange={onPeriodChange}
            variant="pill"
            align="right"
          />
          <button
            type="button"
            className="sig-location-bar__funnel-btn"
            onClick={onOpenFilterModal}
            aria-label="Filter"
          >
            <FilterFunnelIcon size={17} color="var(--text-secondary)" />
          </button>
        </div>
      )}
    </div>
  );
}
