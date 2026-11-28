import { useState } from 'react';
import { Navbar } from '../components/common/Navbar';
import { Button } from '../components/common/Button';
import { UploadBox } from '../components/common/UploadBox';
import { Dropdown } from '../components/common/Dropdown';
import { api } from '../api';
import {
  InfoCircleIcon,
  PencilEditIcon,
  MaximizeCornersIcon,
  MinimizeCornersIcon,
} from '../components/icons/Icons';

export function InputLaporanPage({
  onClose,
  onSubmitSuccess,
  currentLocation = '[Kecamatan], [Kota]',
  onChangeLocation,
}) {
  const [reportType, setReportType] = useState('whistleblower');
  const [location, setLocation] = useState(currentLocation);
  const [description, setDescription] = useState('');
  const [images, setImages] = useState([]);
  const [isFullscreenTextarea, setIsFullscreenTextarea] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editDistrict, setEditDistrict] = useState('Coblong');
  const [editCity, setEditCity] = useState('Bandung');
  const [coords, setCoords] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  const reportTypes = [
    { value: 'whistleblower', label: 'Whistleblower' },
    { value: 'terbuka', label: 'Terbuka (Publik)' },
    { value: 'anonim', label: 'Anonim' },
  ];

  const maxChars = 5000;

  const handleAddImages = (newImages) => {
    setImages((prev) => [...prev, ...newImages]);
  };

  const handleRemoveImage = (index) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCaptureGps = () => {
    if (!navigator.geolocation) {
      alert('Browser tidak mendukung geolocation.');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
        });
        setGpsLoading(false);
      },
      () => {
        setGpsLoading(false);
        alert('Gagal mengambil koordinat GPS. Pastikan izin lokasi diaktifkan.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSubmit = async (type) => {
    if (isSubmitting) return;
    if (!description.trim()) {
      alert('Mohon isi deskripsi laporan terlebih dahulu.');
      return;
    }
    if (images.length === 0 || !images[0]?.file) {
      alert('Mohon unggah minimal 1 foto dokumentasi sebagai bukti laporan.');
      return;
    }

    let created;
    setIsSubmitting(true);
    try {
      // The API accepts a single mandatory JPEG/PNG photo per complaint.
      created = await api.createComplaint({
        description: description.trim(),
        photo: images[0].file,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        isPublic: type === 'post',
        district: editDistrict,
        city: editCity,
        complaintType: reportType === 'whistleblower' ? 'oversight' : 'non_oversight',
      });
    } catch (error) {
      setIsSubmitting(false);
      alert(error?.message || 'Gagal mengirim laporan. Coba lagi.');
      return;
    }
    setIsSubmitting(false);

    const nowIso = new Date().toISOString();
    const newReport = {
      id: created.complaintId,
      category: 'LAPORAN WARGA',
      location: location,
      district: editDistrict,
      city: editCity,
      description: description.trim(),
      username: reportType === 'whistleblower' ? 'Whistleblower' : reportType === 'anonim' ? 'Anonymous' : '@username12543',
      date: 'Baru saja',
      timestamp: Date.now(),
      initialUpvotes: created.upvoteCount ?? 1,
      upvoteCount: created.upvoteCount ?? 1,
      corroborationCount: created.corroborationCount ?? 0,
      priorityScore: created.priorityScore ?? 2.38,
      slaDueAt: created.slaDueAt || null,
      slaSummary: created.slaSummary || null,
      viewerUpvoted: true,
      viewerCorroborated: false,
      images: images.map((img) => img.url),
      status: 'Dalam Proses',
      rawStatus: 'pending',
      isPublic: type === 'post',
      events: [{ eventType: 'submitted', actor: 'citizen', details: {}, createdAt: nowIso }],
      corroborations: [],
    };

    onSubmitSuccess?.(newReport, type === 'post');
  };

  const handleSaveLocation = () => {
    if (editDistrict && editCity) {
      const formatted = `${editDistrict}, ${editCity}`;
      setLocation(formatted);
      onChangeLocation?.(formatted);
    }
    setShowLocationModal(false);
  };

  return (
    <div className={`sig-page sig-page--form ${isFullscreenTextarea ? 'is-fullscreen-editor' : ''}`}>
      <Navbar
        type="form"
        title="Input Laporan"
        onCloseClick={isFullscreenTextarea ? () => setIsFullscreenTextarea(false) : onClose}
        onHelpClick={() => setShowHelpModal(true)}
      />

      <main className="sig-page__content sig-form-content">
        {isFullscreenTextarea ? (
          <div className="sig-fullscreen-desc-wrap">
            <label className="sig-form__label">
              Deskripsi <span className="sig-form__req">*)</span>
            </label>
            <div className="sig-fullscreen-textarea-container">
              <textarea
                className="sig-fullscreen-textarea"
                placeholder="Ceritakan hal yang ingin kamu laporkan di sini..."
                value={description}
                maxLength={maxChars}
                onChange={(e) => setDescription(e.target.value)}
                autoFocus
              />
              <div className="sig-form__textarea-footer">
                <span className="sig-form__char-count">
                  {description.length.toLocaleString('id-ID')}/{maxChars.toLocaleString('id-ID')} karakter
                </span>
                <button
                  type="button"
                  className="sig-form__expand-btn"
                  onClick={() => setIsFullscreenTextarea(false)}
                  aria-label="Kecilkan kolom deskripsi"
                >
                  <MinimizeCornersIcon size={18} color="var(--text-muted)" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="sig-form__meta-split">
              <div className="sig-form__meta-col">
                <span className="sig-form__meta-label">Lapor sebagai</span>
                <div className="sig-form__select-with-info">
                  <Dropdown
                    options={reportTypes}
                    value={reportType}
                    onChange={setReportType}
                    variant="pill"
                    size="sm"
                  />
                  <button
                    type="button"
                    className="sig-form__info-btn"
                    onClick={() => setShowInfoModal(true)}
                    aria-label="Info whistleblower"
                  >
                    <InfoCircleIcon size={16} color="var(--text-muted)" />
                  </button>
                </div>
              </div>

              <div className="sig-form__meta-divider" />

              <div className="sig-form__meta-col">
                <span className="sig-form__meta-label">Lokasimu</span>
                <button
                  type="button"
                  className="sig-form__location-link"
                  onClick={() => setShowLocationModal(true)}
                >
                  <span className="sig-form__location-text">{location}</span>
                  <PencilEditIcon size={16} color="var(--teal-normal)" />
                </button>
                {coords && (
                  <span style={{ fontSize: '10px', color: 'var(--teal-dark)' }}>
                    GPS: {coords.latitude}, {coords.longitude}
                  </span>
                )}
              </div>
            </div>

            <div className="sig-form__field">
              <label className="sig-form__label" htmlFor="deskripsi-input">
                Deskripsi <span className="sig-form__req">*)</span>
              </label>
              <div className="sig-form__textarea-wrap">
                <textarea
                  id="deskripsi-input"
                  className="sig-form__textarea"
                  placeholder="Ceritakan hal yang ingin kamu laporkan di sini..."
                  value={description}
                  maxLength={maxChars}
                  rows={9}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <div className="sig-form__textarea-footer">
                  <span className="sig-form__char-count">
                    {description.length.toLocaleString('id-ID')}/{maxChars.toLocaleString('id-ID')} karakter
                  </span>
                  <button
                    type="button"
                    className="sig-form__expand-btn"
                    onClick={() => setIsFullscreenTextarea(true)}
                    aria-label="Perbesar kolom deskripsi ke layar penuh"
                  >
                    <MaximizeCornersIcon size={18} color="var(--text-muted)" />
                  </button>
                </div>
              </div>
            </div>

            <div className="sig-form__field">
              <label className="sig-form__label">
                Upload Dokumentasi (Bukti Foto Wajib) <span className="sig-form__req">*)</span>
              </label>
              <UploadBox
                images={images}
                onAddImages={handleAddImages}
                onRemoveImage={handleRemoveImage}
              />
              {images.length === 0 && (
                <p style={{ fontSize: '11.5px', color: '#dc2626', marginTop: '6px', fontWeight: 500 }}>
                  * Dokumentasi foto wajib dilampirkan agar laporan dapat diproses dan diteruskan.
                </p>
              )}
            </div>

            <div className="sig-form__actions">
              <Button
                variant="primary"
                size="lg"
                fullWidth
                disabled={isSubmitting || images.length === 0}
                onClick={() => handleSubmit('post')}
              >
                {isSubmitting ? 'Mengirim...' : 'Laporkan dan posting'}
              </Button>

              <Button
                variant="secondary"
                size="lg"
                fullWidth
                disabled={isSubmitting || images.length === 0}
                onClick={() => handleSubmit('private')}
              >
                Laporkan saja
              </Button>
            </div>
          </>
        )}
      </main>

      {showInfoModal && (
        <div className="sig-modal-backdrop" onClick={() => setShowInfoModal(false)}>
          <div className="sig-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="sig-modal__title">Mode Whistleblower</h3>
            <p className="sig-modal__body">
              Identitas pribadi Anda terlindungi sepenuhnya dan tidak akan ditampilkan ke publik.
              Laporan Anda tetap dapat ditindaklanjuti secara resmi oleh tim verifikator.
            </p>
            <Button
              variant="primary"
              size="md"
              fullWidth
              onClick={() => setShowInfoModal(false)}
            >
              Mengerti
            </Button>
          </div>
        </div>
      )}

      {showHelpModal && (
        <div className="sig-modal-backdrop" onClick={() => setShowHelpModal(false)}>
          <div className="sig-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="sig-modal__title">Panduan Input Laporan</h3>
            <p className="sig-modal__body">
              1. <strong>Lapor sebagai</strong>: Pilih mode identitas pelaporan.<br />
              2. <strong>Lokasimu</strong>: Pastikan lokasi dan GPS sesuai kejadian agar warga sekitar dapat mengonfirmasi.<br />
              3. <strong>Deskripsi</strong>: Tuliskan fakta kejadian secara runtut dan jelas.<br />
              4. <strong>Dokumentasi (Wajib)</strong>: Unggah minimal 1 foto bukti berformat JPG/PNG.
            </p>
            <Button
              variant="primary"
              size="md"
              fullWidth
              onClick={() => setShowHelpModal(false)}
            >
              Tutup
            </Button>
          </div>
        </div>
      )}

      {showLocationModal && (
        <div className="sig-modal-backdrop" onClick={() => setShowLocationModal(false)}>
          <div className="sig-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="sig-modal__title">Ubah Lokasi Laporan</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', margin: '14px 0' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Kecamatan</label>
                <input
                  type="text"
                  className="sig-search-header__input"
                  style={{ border: '1px solid var(--border-default)', padding: '8px 12px', borderRadius: '8px', width: '100%', marginTop: '4px' }}
                  value={editDistrict}
                  onChange={(e) => setEditDistrict(e.target.value)}
                  placeholder="Contoh: Coblong"
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Kota</label>
                <input
                  type="text"
                  className="sig-search-header__input"
                  style={{ border: '1px solid var(--border-default)', padding: '8px 12px', borderRadius: '8px', width: '100%', marginTop: '4px' }}
                  value={editCity}
                  onChange={(e) => setEditCity(e.target.value)}
                  placeholder="Contoh: Bandung"
                />
              </div>
              <button
                type="button"
                className="sig-button sig-button--secondary sig-button--sm"
                onClick={handleCaptureGps}
                disabled={gpsLoading}
              >
                {gpsLoading ? 'Mengambil GPS...' : coords ? `GPS Terpasang (${coords.latitude}, ${coords.longitude})` : 'Sematkan Koordinat GPS Saya'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                variant="secondary"
                size="md"
                fullWidth
                onClick={() => setShowLocationModal(false)}
              >
                Batal
              </Button>
              <Button
                variant="primary"
                size="md"
                fullWidth
                onClick={handleSaveLocation}
              >
                Simpan
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
