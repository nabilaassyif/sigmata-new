import { useEffect, useState } from 'react';
import {
  LocationPinIcon,
  LocationPinIconSolid,
  ChevronRightIcon,
  MoreHorizontalIcon,
  UpvoteIcon,
  ShareIcon,
  UserIcon,
} from '../icons/Icons';
import { ImageViewerModal } from '../common/ImageViewerModal';
import { api, formatSlaCountdown, getPriorityMeta, statusLabel } from '../../api';

export function FeedCard({
  id,
  location = '[Location Name]',
  category = 'Category',
  description = '',
  images = null,
  username = 'Anonymous',
  date = '',
  initialUpvotes = 1,
  initialCorroborations = 0,
  initialPriorityScore = 1,
  initialSlaDueAt = null,
  slaSummary = null,
  initialViewerUpvoted = false,
  initialViewerCorroborated = false,
  initialCorroborationNotes = [],
  status = 'Dalam Proses',
  solidPin = true,
  onShare,
  onMore,
  onMetricsUpdated,
}) {
  const [upvoted, setUpvoted] = useState(initialViewerUpvoted);
  const [upvoteCount, setUpvoteCount] = useState(initialUpvotes);
  const [corroborated, setCorroborated] = useState(initialViewerCorroborated);
  const [corroborationCount, setCorroborationCount] = useState(initialCorroborations);
  const [priorityScore, setPriorityScore] = useState(initialPriorityScore);
  const [slaDueAt, setSlaDueAt] = useState(initialSlaDueAt);
  const [corroborationNotes, setCorroborationNotes] = useState(initialCorroborationNotes);

  const [showMenu, setShowMenu] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const [showCorrobModal, setShowCorrobModal] = useState(false);
  const [corrobNote, setCorrobNote] = useState('');
  const [corrobCoords, setCorrobCoords] = useState(null);
  const [corrobBusy, setCorrobBusy] = useState(false);
  const [corrobError, setCorrobError] = useState('');
  const [upvoteBusy, setUpvoteBusy] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const slaInfo = formatSlaCountdown(slaDueAt, statusLabel(status), nowMs, slaSummary);
  const priorityInfo = getPriorityMeta(priorityScore, upvoteCount, corroborationCount);

  const handleUpvote = async (e) => {
    e.stopPropagation();
    if (upvoteBusy) return;
    setUpvoteBusy(true);
    try {
      const res = await api.toggleUpvote(id);
      setUpvoted(Boolean(res.upvoted));
      setUpvoteCount(res.upvoteCount ?? upvoteCount);
      setCorroborationCount(res.corroborationCount ?? corroborationCount);
      setPriorityScore(res.priorityScore ?? priorityScore);
      setSlaDueAt(res.slaDueAt ?? slaDueAt);
      onMetricsUpdated?.(id, res);
    } catch {
      // Fallback local toggle when offline or unbacked seed
      const next = !upvoted;
      setUpvoted(next);
      setUpvoteCount((prev) => Math.max(0, prev + (next ? 1 : -1)));
    } finally {
      setUpvoteBusy(false);
    }
  };

  const handleGetGpsForCorrob = () => {
    if (!navigator.geolocation) {
      setCorrobError('Browser tidak mendukung geolocation.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCorrobError('');
        setCorrobCoords({
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
        });
      },
      () => {
        setCorrobError('Gagal mengambil lokasi GPS.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSubmitCorroboration = async (e) => {
    e.preventDefault();
    if (corrobBusy) return;
    setCorrobBusy(true);
    setCorrobError('');
    try {
      const res = await api.corroborateComplaint(id, {
        note: corrobNote.trim(),
        latitude: corrobCoords?.latitude ?? null,
        longitude: corrobCoords?.longitude ?? null,
      });
      setCorroborated(true);
      setCorroborationCount(res.corroborationCount ?? corroborationCount + 1);
      setUpvoteCount(res.upvoteCount ?? upvoteCount);
      setPriorityScore(res.priorityScore ?? priorityScore);
      setSlaDueAt(res.slaDueAt ?? slaDueAt);
      setCorroborationNotes((prev) => [
        {
          note: corrobNote.trim() || 'Warga sekitar mengonfirmasi kejadian ini.',
          distanceMeters: res.distanceMeters ?? null,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      onMetricsUpdated?.(id, res);
      setCorrobNote('');
      setShowCorrobModal(false);
    } catch (err) {
      setCorrobError(err?.message || 'Gagal mengirim konfirmasi warga sekitar.');
    } finally {
      setCorrobBusy(false);
    }
  };

  const handleShareClick = (e) => {
    e.stopPropagation();
    if (onShare) {
      onShare({ id, location, category, description });
      return;
    }
    if (navigator.share) {
      navigator.share({
        title: `Laporan: ${category} di ${location}`,
        text: description,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(window.location.href);
      alert('Tautan laporan berhasil disalin ke clipboard!');
    }
  };

  const handleMoreClick = () => {
    setShowMenu(!showMenu);
    onMore?.();
  };

  const formattedCount =
    upvoteCount >= 1000
      ? `${(upvoteCount / 1000).toFixed(2).replace('.', ',')}K`
      : upvoteCount;

  const imageList = Array.isArray(images)
    ? images
    : images === true || typeof images === 'string'
    ? [images]
    : [];

  return (
    <article className="sig-feed-card">
      <div className="sig-feed-card__header">
        <div className="sig-feed-card__location-tag">
          {solidPin ? (
            <LocationPinIconSolid size={16} color="var(--teal-normal)" />
          ) : (
            <LocationPinIcon size={16} color="var(--teal-normal)" />
          )}
          <span className="sig-feed-card__location-name">[{location}]</span>
          <ChevronRightIcon size={12} color="var(--text-muted)" />
          <span className="sig-feed-card__category">{category}</span>
        </div>

        <div className="sig-feed-card__more-wrap">
          <button
            type="button"
            className="sig-feed-card__more-btn"
            onClick={handleMoreClick}
            aria-label="Opsi lainnya"
          >
            <MoreHorizontalIcon size={18} color="var(--text-muted)" />
          </button>

          {showMenu && (
            <div className="sig-feed-card__menu-dropdown">
              <button
                type="button"
                className="sig-feed-card__menu-item"
                onClick={() => {
                  navigator.clipboard?.writeText(window.location.href);
                  alert('Tautan disalin!');
                  setShowMenu(false);
                }}
              >
                Salin tautan
              </button>
              <button
                type="button"
                className="sig-feed-card__menu-item"
                onClick={() => {
                  alert('Laporan berhasil disimpan');
                  setShowMenu(false);
                }}
              >
                Simpan laporan
              </button>
              <button
                type="button"
                className="sig-feed-card__menu-item sig-feed-card__menu-item--danger"
                onClick={() => {
                  alert('Laporan telah dikirim ke admin.');
                  setShowMenu(false);
                }}
              >
                Laporkan konten
              </button>
            </div>
          )}
        </div>
      </div>

      {/* SLA Countdown, Priority & Neighborhood Corroboration Strip */}
      <div className="sig-card-signals">
        <span className={`sig-sla-pill sig-sla-pill--${slaInfo.tone}`} title="Batas Waktu Regulasi (SLA)">
          {slaSummary?.resolutionDeadline ? 'SLA Penyelesaian' : 'SLA Respon'}: {slaInfo.text}
        </span>
        {slaSummary?.approachingDeadlineWarning && !slaSummary?.overdue && (
          <span className="sig-sla-pill sig-sla-pill--warning">Mendekati Batas</span>
        )}
        <span className={`sig-priority-pill sig-priority-pill--${priorityInfo.level}`}>
          {priorityInfo.label} ({Number(priorityScore).toFixed(1)})
        </span>
        {corroborationCount > 0 && (
          <span className="sig-corrob-pill">
            {corroborationCount} Warga Sekitar Mengonfirmasi
          </span>
        )}
      </div>

      <p className="sig-feed-card__desc">{description}</p>

      {imageList.length > 0 && (
        <div
          className={`sig-feed-card__media-container ${
            imageList.length === 1 ? 'is-single' : 'is-dual'
          }`}
        >
          {imageList.map((img, idx) => (
            <div
              key={idx}
              className="sig-feed-card__media-tile"
              onClick={() => {
                setSelectedImageIndex(idx);
                setIsViewerOpen(true);
              }}
              role="button"
              tabIndex={0}
              title="Ketuk untuk melihat ukuran penuh"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setSelectedImageIndex(idx);
                  setIsViewerOpen(true);
                }
              }}
            >
              {typeof img === 'string' && (img.startsWith('http') || img.startsWith('blob:') || img.startsWith('data:') || img.startsWith('/api/')) ? (
                <img src={img} alt="Lampiran laporan" />
              ) : (
                <div className="sig-feed-card__placeholder-img" />
              )}
            </div>
          ))}
        </div>
      )}

      <ImageViewerModal
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
        images={imageList}
        initialIndex={selectedImageIndex}
        title={`Dokumentasi: ${category}`}
        subtitle={location}
      />

      <div className="sig-feed-card__footer">
        <div className="sig-sender-profile-post">
          <div className="sig-sender-avatar">
            <UserIcon size={20} color="#ffffff" />
          </div>
          <div className="sig-sender-meta">
            <span className="sig-sender-name">
              {username.startsWith('@') ? username : username === 'Anonymous' ? 'Anonymous' : `@${username}`}
            </span>
            <span className="sig-sender-date">{date}</span>
          </div>
        </div>

        <div className="sig-feed-card__actions">
          <button
            type="button"
            className={`sig-corrob-button ${corroborated ? 'is-active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setShowCorrobModal(true);
            }}
            aria-label="Konfirmasi warga sekitar"
          >
            <span>{corroborated ? 'Terkonfirmasi' : 'Konfirmasi Warga'}</span>
            {corroborationCount > 0 && <span className="sig-corrob-button__count">{corroborationCount}</span>}
          </button>

          <button
            type="button"
            className={`sig-upvote-button ${upvoted ? 'is-active' : ''}`}
            onClick={handleUpvote}
            disabled={upvoteBusy}
            aria-label="Dukung laporan"
          >
            <UpvoteIcon
              size={18}
              filled={upvoted}
              color={upvoted ? 'var(--teal-normal)' : 'currentColor'}
            />
            <span className="sig-upvote-button__count">{formattedCount}</span>
          </button>

          <button
            type="button"
            className="sig-share-button"
            onClick={handleShareClick}
            aria-label="Bagikan laporan"
          >
            <ShareIcon size={18} color="currentColor" />
          </button>
        </div>
      </div>

      {showCorrobModal && (
        <div className="sig-modal-backdrop" onClick={() => setShowCorrobModal(false)}>
          <div className="sig-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="sig-modal__title">Konfirmasi Warga Sekitar</h3>
            <p className="sig-modal__body" style={{ marginBottom: '10px' }}>
              Konfirmasi dari warga sekitar memperkuat validitas laporan, menaikkan skor prioritas penanganan, dan mempercepat target SLA dinas terkait.
            </p>

            {corroborationNotes.length > 0 && (
              <div className="sig-corrob-history">
                <span className="sig-corrob-history__title">
                  Konfirmasi Terbaru ({corroborationCount})
                </span>
                {corroborationNotes.slice(0, 3).map((item, idx) => (
                  <div key={idx} className="sig-corrob-history__item">
                    <p>{item.note || 'Warga sekitar mengonfirmasi laporan ini.'}</p>
                    {item.distanceMeters != null && (
                      <small>Jarak: {Math.round(item.distanceMeters)} m dari titik laporan</small>
                    )}
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleSubmitCorroboration} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
              <textarea
                className="sig-form__textarea"
                style={{ border: '1px solid var(--border-default)', borderRadius: '8px', padding: '8px 10px' }}
                rows={3}
                maxLength={500}
                placeholder="Tambahkan keterangan singkat kondisi di lapangan (opsional)..."
                value={corrobNote}
                onChange={(e) => setCorrobNote(e.target.value)}
              />

              <button
                type="button"
                className="sig-button sig-button--secondary sig-button--sm"
                onClick={handleGetGpsForCorrob}
              >
                {corrobCoords
                  ? `GPS Terverifikasi (${corrobCoords.latitude}, ${corrobCoords.longitude})`
                  : 'Sematkan Lokasi GPS Saya (Radius maks 5 km)'}
              </button>

              {corrobError && (
                <p style={{ fontSize: '12px', color: '#dc2626' }}>{corrobError}</p>
              )}

              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button
                  type="button"
                  className="sig-button sig-button--secondary sig-button--md"
                  style={{ flex: 1 }}
                  onClick={() => setShowCorrobModal(false)}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="sig-button sig-button--primary sig-button--md"
                  style={{ flex: 2 }}
                  disabled={corrobBusy}
                >
                  {corrobBusy ? 'Mengirim...' : 'Konfirmasi Valid'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </article>
  );
}
