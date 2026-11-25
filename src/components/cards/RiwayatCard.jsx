import { useState } from 'react';
import { StatusBadge } from '../common/Badge';
import { ImageViewerModal } from '../common/ImageViewerModal';

export function RiwayatCard({
  category = '[CATEGORY BY SYSTEM]',
  date = '22 Nov 2026',
  description = 'Lorem ipsum dolor sit amet consectetur. Ipsum amet enim auctor molestie at. Nisi nec posuere dia hendrerit nunc turpis....',
  image = null,
  status = '[Status]',
  timestamp = '[DD MM YY HH:MM]',
  district = '[Kecamatan]',
  city = '[Kota]',
  upvotes = '1.234',
  onClick,
}) {
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  const handleThumbnailClick = (e) => {
    e.stopPropagation();
    setIsViewerOpen(true);
  };

  return (
    <>
      <article className="sig-riwayat-card" onClick={onClick}>
        <div className="sig-riwayat-card__header">
          <span className="sig-riwayat-card__category">{category}</span>
          <span className="sig-riwayat-card__date">{date}</span>
        </div>

        <div className="sig-riwayat-card__body">
          <p className="sig-riwayat-card__desc">{description}</p>
          <div
            className="sig-riwayat-card__thumbnail"
            onClick={handleThumbnailClick}
            role="button"
            tabIndex={0}
            title="Ketuk untuk melihat ukuran penuh"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                handleThumbnailClick(e);
              }
            }}
          >
            {image ? (
              <img src={image} alt="Dokumentasi laporan" />
            ) : (
              <div className="sig-riwayat-card__placeholder-img" />
            )}
          </div>
        </div>

        <div className="sig-riwayat-card__divider" />

        <div className="sig-riwayat-card__footer">
          <div className="sig-riwayat-card__status-col">
            <StatusBadge status={status} />
            <span className="sig-riwayat-card__time">{timestamp}</span>
          </div>

          <div className="sig-riwayat-card__location-col">
            <span className="sig-riwayat-card__district">{district},</span>
            <span className="sig-riwayat-card__city">{city}</span>
          </div>

          <div className="sig-riwayat-card__upvote-col">
            <span className="sig-riwayat-card__upvote-count">{upvotes}</span>
            <span className="sig-riwayat-card__upvote-label">Total Upvote</span>
          </div>
        </div>
      </article>

      <ImageViewerModal
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
        images={image ? [image] : ['placeholder']}
        initialIndex={0}
        title={`Dokumentasi: ${category}`}
        subtitle={`${district}, ${city}`}
      />
    </>
  );
}
