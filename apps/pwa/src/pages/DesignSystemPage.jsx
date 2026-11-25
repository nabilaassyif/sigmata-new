import { useState } from 'react';
import { Button } from '../components/common/Button';
import { StatusBadge } from '../components/common/Badge';
import { Dropdown } from '../components/common/Dropdown';
import { UploadBox } from '../components/common/UploadBox';
import { RiwayatCard } from '../components/cards/RiwayatCard';
import { FeedCard } from '../components/cards/FeedCard';
import {
  MenuIcon,
  SearchIcon,
  LocationPinIcon,
  FilterFunnelIcon,
  UpvoteIcon,
  ShareIcon,
  MoreHorizontalIcon,
  PlusIcon,
  HomeIcon,
  ClockHistoryIcon,
  UserIcon,
} from '../components/icons/Icons';

export function DesignSystemPage() {
  const [activeTab, setActiveTab] = useState('palette');
  const [dropdownVal, setDropdownVal] = useState('option1');
  const [dummyImages, setDummyImages] = useState([
    { id: '1', url: 'https://images.unsplash.com/photo-1590674899484-d5640e854abe?w=200&auto=format&fit=crop&q=60' },
    { id: '2', url: 'https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=200&auto=format&fit=crop&q=60' },
  ]);

  const tealPalette = [
    { label: 'Light', hex: '#E6F7F7', rgb: 'rgb(230, 247, 247)', text: '#045959' },
    { label: 'Light :hover', hex: '#DAF2F2', rgb: 'rgb(218, 242, 242)', text: '#045959' },
    { label: 'Light :active', hex: '#B2DEDE', rgb: 'rgb(178, 222, 222)', text: '#034343' },
    { label: 'Normal', hex: '#069494', rgb: 'rgb(6, 148, 148)', text: '#ffffff' },
    { label: 'Normal :hover', hex: '#058585', rgb: 'rgb(5, 133, 133)', text: '#ffffff' },
    { label: 'Normal :active', hex: '#057676', rgb: 'rgb(5, 118, 118)', text: '#ffffff' },
    { label: 'Dark', hex: '#045959', rgb: 'rgb(4, 89, 89)', text: '#ffffff' },
    { label: 'Dark :hover', hex: '#034343', rgb: 'rgb(3, 67, 67)', text: '#ffffff' },
    { label: 'Dark :active', hex: '#023434', rgb: 'rgb(2, 52, 52)', text: '#ffffff' },
    { label: 'Darker', hex: '#022222', rgb: 'rgb(2, 34, 34)', text: '#ffffff' },
  ];

  const bluePalette = [
    { label: 'Light', hex: '#E8F8FB', rgb: 'rgb(232, 248, 251)', text: '#117080' },
    { label: 'Light :hover', hex: '#DDF5F9', rgb: 'rgb(221, 245, 249)', text: '#117080' },
    { label: 'Light :active', hex: '#B9EAF2', rgb: 'rgb(185, 234, 242)', text: '#0D5460' },
    { label: 'Normal', hex: '#1CBAD6', rgb: 'rgb(28, 186, 214)', text: '#ffffff' },
    { label: 'Normal :hover', hex: '#19A7C1', rgb: 'rgb(25, 167, 193)', text: '#ffffff' },
    { label: 'Normal :active', hex: '#1695AB', rgb: 'rgb(22, 149, 171)', text: '#ffffff' },
    { label: 'Dark', hex: '#117080', rgb: 'rgb(17, 112, 128)', text: '#ffffff' },
    { label: 'Dark :hover', hex: '#0D5460', rgb: 'rgb(13, 84, 96)', text: '#ffffff' },
    { label: 'Dark :active', hex: '#0A414B', rgb: 'rgb(10, 65, 75)', text: '#ffffff' },
    { label: 'Darker', hex: '#072C33', rgb: 'rgb(7, 44, 51)', text: '#ffffff' },
  ];

  const typographyScales = [
    { size: '32px', lh: '120%', tag: 'text-2xl', sample: 'The quick brown fox jumps over the lazy dog' },
    { size: '24px', lh: '120%', tag: 'text-xl', sample: 'The quick brown fox jumps over the lazy dog' },
    { size: '20px', lh: '120%', tag: 'text-lg', sample: 'The quick brown fox jumps over the lazy dog' },
    { size: '16px', lh: '140%', tag: 'text-base', sample: 'The quick brown fox jumps over the lazy dog' },
    { size: '14px', lh: '140%', tag: 'text-sm', sample: 'The quick brown fox jumps over the lazy dog' },
    { size: '12px', lh: 'Auto', tag: 'text-xs', sample: 'The quick brown fox jumps over the lazy dog' },
    { size: '10px', lh: 'Auto', tag: 'text-2xs', sample: 'The quick brown fox jumps over the lazy dog' },
  ];

  return (
    <div className="sig-design-system">
      <header className="sig-design-system__header">
        <div>
          <h1 className="sig-design-system__title">Sigmata Design System & Components</h1>
          <p className="sig-design-system__subtitle">
            Sesuai Color Palette, Skala Tipografi, dan Spesifikasi Komponen Desain.
          </p>
        </div>

        <nav className="sig-design-system__tabs">
          <button
            type="button"
            className={`sig-design-system__tab ${activeTab === 'palette' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('palette')}
          >
            Palet Warna & Tipografi
          </button>
          <button
            type="button"
            className={`sig-design-system__tab ${activeTab === 'components' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('components')}
          >
            Katalog Komponen
          </button>
        </nav>
      </header>

      {activeTab === 'palette' && (
        <div className="sig-ds-section">
          {/* Colors Section */}
          <section className="sig-ds-block">
            <h2 className="sig-ds-block__title">Color Palette Specification</h2>
            <div className="sig-palette-grid">
              {/* Teal Palette */}
              <div className="sig-palette-column">
                <h3 className="sig-palette-column__title">Teal (Primary Brand)</h3>
                <div className="sig-swatch-list">
                  {tealPalette.map((item) => (
                    <div
                      key={item.label}
                      className="sig-swatch-card"
                      style={{ backgroundColor: item.hex, color: item.text }}
                    >
                      <div className="sig-swatch-card__top">
                        <span className="sig-swatch-card__name">{item.label}</span>
                        <span className="sig-swatch-card__hex">{item.hex}</span>
                      </div>
                      <span className="sig-swatch-card__rgb">{item.rgb}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Blue Palette */}
              <div className="sig-palette-column">
                <h3 className="sig-palette-column__title">Blue (Secondary)</h3>
                <div className="sig-swatch-list">
                  {bluePalette.map((item) => (
                    <div
                      key={item.label}
                      className="sig-swatch-card"
                      style={{ backgroundColor: item.hex, color: item.text }}
                    >
                      <div className="sig-swatch-card__top">
                        <span className="sig-swatch-card__name">{item.label}</span>
                        <span className="sig-swatch-card__hex">{item.hex}</span>
                      </div>
                      <span className="sig-swatch-card__rgb">{item.rgb}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Typography Scale Section */}
          <section className="sig-ds-block">
            <h2 className="sig-ds-block__title">Typography Scale (Base Value: 16, Scale: 1.25)</h2>
            <div className="sig-typography-list">
              {typographyScales.map((item) => (
                <div key={item.tag} className="sig-typography-row">
                  <div className="sig-typography-meta">
                    <span className="sig-typography-size">{item.size}</span>
                    <span className="sig-typography-lh">{item.lh}</span>
                    <span className="sig-typography-tag">{item.tag}</span>
                  </div>
                  <div
                    className="sig-typography-sample"
                    style={{
                      fontSize: item.size,
                      lineHeight: item.lh === 'Auto' ? 'normal' : item.lh,
                    }}
                  >
                    {item.sample}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'components' && (
        <div className="sig-ds-section">
          {/* Buttons */}
          <section className="sig-ds-block">
            <h2 className="sig-ds-block__title">Button Variants (Image 4)</h2>
            <div className="sig-buttons-gallery">
              <Button variant="primary" withArrow>
                Button
              </Button>
              <Button variant="light" withArrow>
                Button
              </Button>
              <Button variant="secondary" withArrow>
                Button
              </Button>
              <Button variant="dark" withArrow>
                Button
              </Button>
              <Button variant="secondary" pill withArrow>
                Button
              </Button>
            </div>
          </section>

          {/* Badges & Tags */}
          <section className="sig-ds-block">
            <h2 className="sig-ds-block__title">Status Badges</h2>
            <div className="sig-badges-gallery">
              <StatusBadge status="[Status]" />
              <StatusBadge status="Dalam Proses" />
              <StatusBadge status="Selesai" />
              <StatusBadge status="Ditolak" variant="danger" />
            </div>
          </section>

          {/* Icons Bar */}
          <section className="sig-ds-block">
            <h2 className="sig-ds-block__title">Icons Library</h2>
            <div className="sig-icons-gallery">
              <div className="sig-icon-box"><MenuIcon size={20} color="var(--teal-normal)" /><span>Menu</span></div>
              <div className="sig-icon-box"><SearchIcon size={20} color="var(--teal-normal)" /><span>Search</span></div>
              <div className="sig-icon-box"><LocationPinIcon size={20} color="var(--teal-normal)" /><span>Location</span></div>
              <div className="sig-icon-box"><FilterFunnelIcon size={20} color="var(--teal-normal)" /><span>Filter</span></div>
              <div className="sig-icon-box"><UpvoteIcon size={20} color="var(--teal-normal)" /><span>Upvote</span></div>
              <div className="sig-icon-box"><ShareIcon size={20} color="var(--teal-normal)" /><span>Share</span></div>
              <div className="sig-icon-box"><MoreHorizontalIcon size={20} color="var(--teal-normal)" /><span>More</span></div>
              <div className="sig-icon-box"><PlusIcon size={20} color="var(--teal-normal)" /><span>Plus</span></div>
              <div className="sig-icon-box"><HomeIcon size={20} color="var(--teal-normal)" /><span>Home</span></div>
              <div className="sig-icon-box"><ClockHistoryIcon size={20} color="var(--teal-normal)" /><span>History</span></div>
              <div className="sig-icon-box"><UserIcon size={20} color="var(--teal-normal)" /><span>User</span></div>
            </div>
          </section>

          {/* Dropdown & Form Controls */}
          <section className="sig-ds-block">
            <h2 className="sig-ds-block__title">Dropdowns & Selectors</h2>
            <div className="sig-dropdowns-gallery">
              <Dropdown
                options={[
                  { value: 'option1', label: 'Option 1' },
                  { value: 'option2', label: 'Option 2' },
                  { value: 'option3', label: 'Option 3' },
                ]}
                value={dropdownVal}
                onChange={setDropdownVal}
                variant="pill"
              />
              <Dropdown
                options={[
                  { value: 'terbaru', label: 'Terbaru' },
                  { value: 'terlama', label: 'Terlama' },
                ]}
                value="terbaru"
                variant="outlined"
              />
            </div>
          </section>

          {/* Upload Component */}
          <section className="sig-ds-block">
            <h2 className="sig-ds-block__title">Upload Dokumentasi Box</h2>
            <div style={{ maxWidth: 420 }}>
              <UploadBox
                images={dummyImages}
                onAddImages={(newImg) => setDummyImages([...dummyImages, ...newImg])}
                onRemoveImage={(idx) => setDummyImages(dummyImages.filter((_, i) => i !== idx))}
              />
            </div>
          </section>

          {/* Cards Showcase */}
          <section className="sig-ds-block">
            <h2 className="sig-ds-block__title">Card Components</h2>
            <div className="sig-cards-showcase-grid">
              <div>
                <h3 className="sig-sub-title">Riwayat Card (Image 1 & 4)</h3>
                <RiwayatCard />
              </div>
              <div>
                <h3 className="sig-sub-title">Feed Card (Image 3 & 4)</h3>
                <FeedCard />
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
