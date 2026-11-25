import { useState, useRef } from 'react';
import { UploadTrayIcon, PlusIcon, CloseIcon } from '../icons/Icons';
import { ImageViewerModal } from './ImageViewerModal';

export function UploadBox({
  images = [],
  onAddImages,
  onRemoveImage,
  maxFiles = 5,
}) {
  const fileInputRef = useRef(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const newPreviews = files.map((file) => ({
      id: Math.random().toString(36).substring(2, 9),
      name: file.name,
      file,
      url: URL.createObjectURL(file),
    }));

    onAddImages?.(newPreviews);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="sig-upload-box">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png, image/jpeg, image/jpg"
        multiple
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {images.length === 0 ? (
        <button
          type="button"
          className="sig-upload-box__dropzone"
          onClick={triggerUpload}
        >
          <div className="sig-upload-box__icon-square">
            <UploadTrayIcon size={24} color="var(--teal-dark)" />
          </div>
          <div className="sig-upload-box__prompt">Ketuk untuk mengunggah foto</div>
          <div className="sig-upload-box__hint">
            File PNG, JPG, atau JPEG | Maksimal XX mb
          </div>
        </button>
      ) : (
        <div className="sig-upload-box__previews">
          {images.map((img, index) => (
            <div key={img.id || index} className="sig-upload-box__thumb">
              <div
                className="sig-upload-box__thumb-clickable"
                onClick={() => {
                  setSelectedImageIndex(index);
                  setIsViewerOpen(true);
                }}
                role="button"
                tabIndex={0}
                title="Ketuk untuk melihat ukuran penuh"
                style={{ width: '100%', height: '100%', cursor: 'pointer' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setSelectedImageIndex(index);
                    setIsViewerOpen(true);
                  }
                }}
              >
                {img.url ? (
                  <img src={img.url} alt={`Upload ${index + 1}`} />
                ) : (
                  <div className="sig-upload-box__placeholder" />
                )}
              </div>
              <button
                type="button"
                className="sig-upload-box__remove-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveImage?.(index);
                }}
                aria-label="Hapus foto"
              >
                <CloseIcon size={12} color="#ffffff" />
              </button>
            </div>
          ))}

          {images.length < maxFiles && (
            <button
              type="button"
              className="sig-upload-box__add-tile"
              onClick={triggerUpload}
              aria-label="Tambah foto lagi"
            >
              <div className="sig-upload-box__add-circle">
                <PlusIcon size={18} color="var(--teal-normal)" />
              </div>
            </button>
          )}
        </div>
      )}

      {/* Fullscreen Image Preview */}
      <ImageViewerModal
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
        images={images.map((i) => i.url || i)}
        initialIndex={selectedImageIndex}
        title="Pratinjau Foto Lampiran"
      />
    </div>
  );
}
