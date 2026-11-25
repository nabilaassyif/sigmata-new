import { useState, useEffect, useCallback } from 'react';
import { CloseIcon, ArrowLeftIcon, ArrowRightIcon } from '../icons/Icons';

export function ImageViewerModal({
  isOpen = false,
  onClose,
  images = [],
  initialIndex = 0,
  title = 'Dokumentasi Pengaduan',
  subtitle = '',
}) {
  const [prevConfig, setPrevConfig] = useState({ initialIndex, isOpen });
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [touchStartX, setTouchStartX] = useState(null);

  // Normalize images array
  const imageList = Array.isArray(images)
    ? images
    : images
    ? [images]
    : [];

  // Adjust state directly during render when initialIndex or isOpen changes
  if (prevConfig.initialIndex !== initialIndex || prevConfig.isOpen !== isOpen) {
    setPrevConfig({ initialIndex, isOpen });
    setCurrentIndex(initialIndex);
  }

  // Lock background scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handlePrev = useCallback(
    (e) => {
      e?.stopPropagation();
      setCurrentIndex((prev) => (prev > 0 ? prev - 1 : imageList.length - 1));
    },
    [imageList.length]
  );

  const handleNext = useCallback(
    (e) => {
      e?.stopPropagation();
      setCurrentIndex((prev) => (prev < imageList.length - 1 ? prev + 1 : 0));
    },
    [imageList.length]
  );

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose?.();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handlePrev, handleNext]);

  // Touch Swipe for mobile
  const handleTouchStart = (e) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    if (diff > 50) {
      // Swiped left -> Next
      handleNext();
    } else if (diff < -50) {
      // Swiped right -> Prev
      handlePrev();
    }
    setTouchStartX(null);
  };

  if (!isOpen || imageList.length === 0) return null;

  const currentImage = imageList[currentIndex];
  const isRealImage =
    typeof currentImage === 'string' &&
    (currentImage.startsWith('http') ||
      currentImage.startsWith('blob:') ||
      currentImage.startsWith('data:'));

  return (
    <div
      className="sig-image-viewer-backdrop"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="dialog"
      aria-modal="true"
      aria-label="Tampilan Layar Penuh Gambar"
    >
      {/* Top Header Bar */}
      <div
        className="sig-image-viewer-header"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sig-image-viewer-info">
          <span className="sig-image-viewer-title">{title}</span>
          {subtitle && (
            <span className="sig-image-viewer-subtitle">{subtitle}</span>
          )}
        </div>

        <div className="sig-image-viewer-actions">
          {imageList.length > 1 && (
            <span className="sig-image-viewer-counter">
              {currentIndex + 1} / {imageList.length}
            </span>
          )}
          <button
            type="button"
            className="sig-image-viewer-close-btn"
            onClick={onClose}
            aria-label="Tutup tampilan penuh"
          >
            <CloseIcon size={22} color="#ffffff" />
          </button>
        </div>
      </div>

      {/* Main Image Viewport */}
      <div
        className="sig-image-viewer-body"
        onClick={(e) => e.stopPropagation()}
      >
        {isRealImage ? (
          <img
            src={currentImage}
            alt={`Lampiran dokumentasi ${currentIndex + 1}`}
            className="sig-image-viewer-img"
          />
        ) : (
          <div className="sig-image-viewer-placeholder">
            <div className="sig-image-viewer-placeholder__grid" />
            <div className="sig-image-viewer-placeholder__label">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span>Dokumentasi Foto Pengaduan #{currentIndex + 1}</span>
              <small>Pratinjau Layar Penuh Lampiran</small>
            </div>
          </div>
        )}

        {/* Previous Button (if multiple images) */}
        {imageList.length > 1 && (
          <button
            type="button"
            className="sig-image-viewer-nav-btn is-prev"
            onClick={handlePrev}
            aria-label="Gambar sebelumnya"
          >
            <ArrowLeftIcon size={22} color="#ffffff" />
          </button>
        )}

        {/* Next Button (if multiple images) */}
        {imageList.length > 1 && (
          <button
            type="button"
            className="sig-image-viewer-nav-btn is-next"
            onClick={handleNext}
            aria-label="Gambar berikutnya"
          >
            <ArrowRightIcon size={22} color="#ffffff" />
          </button>
        )}
      </div>

      {/* Bottom hint */}
      <div className="sig-image-viewer-hint">
        Ketuk di luar gambar atau tekan tombol X untuk menutup
      </div>
    </div>
  );
}
