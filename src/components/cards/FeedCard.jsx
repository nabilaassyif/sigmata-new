import { useState } from 'react';
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

export function FeedCard({
  id,
  location = '[Location Name]',
  category = 'Category',
  description = 'Lorem ipsum dolor sit amet consectetur. Ideu iaculis ultricies eget imperdiet. Id nunc odio ornare dolor. Adipiscing felis adipiscing tempus nulla vulputate viverra. Tellus sed commodo et magna turpis.',
  images = null, 
  username = 'Anonymous',
  date = 'DD Month YYYY HH:MM',
  initialUpvotes = 1230,
  solidPin = true,
  onShare,
  onMore,
}) {
  const [upvoted, setUpvoted] = useState(false);
  const [upvoteCount, setUpvoteCount] = useState(initialUpvotes);
  const [showMenu, setShowMenu] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const handleUpvote = (e) => {
    e.stopPropagation();
    if (upvoted) {
      setUpvoteCount((prev) => prev - 1);
      setUpvoted(false);
    } else {
      setUpvoteCount((prev) => prev + 1);
      setUpvoted(true);
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

  // Normalize images array
  const imageList = Array.isArray(images)
    ? images
    : images === true || typeof images === 'string'
    ? [images]
    : [];

  return (
    <article className="sig-feed-card">
      {/* Location & Category Header */}
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

      {/* Description - Rata Kiri */}
      <p className="sig-feed-card__desc">{description}</p>

      {/* Media Thumbnails: Kalau 1 lebar, kalau 2 jadi 2 kotak kecil berdampingan */}
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
              {typeof img === 'string' && (img.startsWith('http') || img.startsWith('blob:') || img.startsWith('data:')) ? (
                <img src={img} alt="Lampiran laporan" />
              ) : (
                <div className="sig-feed-card__placeholder-img" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Fullscreen Image Viewer Modal */}
      <ImageViewerModal
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
        images={imageList}
        initialIndex={selectedImageIndex}
        title={`Dokumentasi: ${category}`}
        subtitle={location}
      />

      {/* Footer: Sender Profile Post (Image 4) & Upvote/Share (Image 3) */}
      <div className="sig-feed-card__footer">
        {/* sender-profile-post (Image 4) */}
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

        {/* Upvote & Share Buttons (Matching Image 3 Exactly!) */}
        <div className="sig-feed-card__actions">
          {/* Upvote Pill (Image 3: Outlined when idle, Solid Teal when active) */}
          <button
            type="button"
            className={`sig-upvote-button ${upvoted ? 'is-active' : ''}`}
            onClick={handleUpvote}
            aria-label="Dukung laporan"
          >
            <UpvoteIcon
              size={18}
              filled={upvoted}
              color={upvoted ? 'var(--teal-normal)' : '#1E293B'}
            />
            <span className="sig-upvote-button__count">{formattedCount}</span>
          </button>

          {/* Share Circle Button (Image 3) */}
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
    </article>
  );
}
