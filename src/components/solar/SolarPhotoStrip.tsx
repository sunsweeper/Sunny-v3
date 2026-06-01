"use client";

import Image from "next/image";
import { useState } from "react";
import { mobileSolarBeforeAfterGroups, solarPhotoGroups, type SolarPhoto, type SolarPhotoGroup } from "../../data/solarImagePaths";

type SolarPhotoStripProps = {
  variant: "desktop" | "mobile";
  onImageClick: (path: string) => void;
};

type SolarPhotoButtonProps = {
  photo: SolarPhoto;
  onImageClick: (path: string) => void;
  showBadge?: boolean;
};

function SolarPhotoButton({ photo, onImageClick, showBadge = true }: SolarPhotoButtonProps) {
  const fallbackSources = [photo.originalSrc, photo.legacyOriginalSrc];
  const [displaySrc, setDisplaySrc] = useState(photo.watermarkedSrc);
  const [fallbackIndex, setFallbackIndex] = useState(0);

  const handleImageError = () => {
    const nextFallback = fallbackSources[fallbackIndex];
    if (!nextFallback || nextFallback === displaySrc) return;

    setDisplaySrc(nextFallback);
    setFallbackIndex((currentIndex) => currentIndex + 1);
  };

  return (
    <button
      key={photo.filename}
      type="button"
      className="solar-strip-photo-btn"
      onClick={() => onImageClick(displaySrc)}
      aria-label={`Open ${photo.label ? `${photo.label.toLowerCase()} ` : ""}solar cleaning photo ${photo.filename}`}
    >
      <Image
        src={displaySrc}
        alt={photo.label ? `${photo.label} solar panel cleaning photo` : "Solar panel cleaning photo"}
        width={360}
        height={240}
        className="solar-strip-image"
        sizes="(max-width: 768px) 50vw, 220px"
        onError={handleImageError}
      />
      {showBadge && photo.label && <span className="solar-strip-badge">{photo.label}</span>}
    </button>
  );
}

const renderPhotoButton = (photo: SolarPhoto, onImageClick: (path: string) => void, showBadge = true) => (
  <SolarPhotoButton key={photo.filename} photo={photo} onImageClick={onImageClick} showBadge={showBadge} />
);

function SolarPhotoPair({ group, onImageClick }: { group: SolarPhotoGroup; onImageClick: (path: string) => void }) {
  if (group.before && group.after) {
    return (
      <article className="solar-strip-pair" aria-label={`${group.id} before and after photos`}>
        {renderPhotoButton(group.before, onImageClick)}
        {renderPhotoButton(group.after, onImageClick)}
      </article>
    );
  }

  const photo = group.before ?? group.after ?? group.solo;
  if (!photo) return null;

  return (
    <article className="solar-strip-pair solo" aria-label={`${group.id} solar cleaning photo`}>
      {renderPhotoButton(photo, onImageClick, false)}
    </article>
  );
}

export function SolarPhotoStrip({ variant, onImageClick }: SolarPhotoStripProps) {
  const groups = variant === "mobile" ? mobileSolarBeforeAfterGroups : solarPhotoGroups;

  if (groups.length === 0) return null;

  return (
    <section className={`solar-photo-strip solar-photo-strip-${variant}`} aria-label="Solar panel cleaning before and after photos">
      <div className="solar-strip-scroll">
        {groups.map((group) => (
          <SolarPhotoPair key={`${variant}-${group.id}`} group={group} onImageClick={onImageClick} />
        ))}
      </div>
    </section>
  );
}
