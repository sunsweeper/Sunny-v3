import Image from "next/image";

type ReviewScreenshotsModalProps = {
  isOpen: boolean;
  imagePaths: string[];
  onClose: () => void;
  onImageClick: (path: string) => void;
};

const formatClientName = (path: string): string => {
  const filename = path.split("/").pop() ?? "review";
  const rawName = filename.replace(/\.[^.]+$/, "");
  const normalized = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  return `${normalized} review screenshot`;
};

export function ReviewScreenshotsModal({ isOpen, imagePaths, onClose, onImageClick }: ReviewScreenshotsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="reviews-overlay" role="dialog" aria-modal="true" aria-label="Review screenshots gallery">
      <div className="reviews-modal">
        <div className="reviews-modal-header">
          <h2>Review Screenshots</h2>
          <button type="button" className="reviews-close-btn" onClick={onClose} aria-label="Close review screenshots">
            ×
          </button>
        </div>

        <p className="reviews-modal-copy">Tap any review to view it larger.</p>

        <div className="reviews-gallery-grid">
          {imagePaths.map((path) => (
            <button
              key={path}
              type="button"
              className="review-thumb-card"
              onClick={() => onImageClick(path)}
              aria-label={`Open ${formatClientName(path)}`}
            >
              <Image src={path} alt={formatClientName(path)} width={640} height={640} className="review-thumb-image" />
              <span className="review-thumb-label">{formatClientName(path).replace(" review screenshot", "")}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
