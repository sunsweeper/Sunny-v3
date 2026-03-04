"use client";

import Image from "next/image";
import { useEffect } from "react";

type LightboxProps = {
  imagePath: string | null;
  onClose: () => void;
};

export function Lightbox({ imagePath, onClose }: LightboxProps) {
  useEffect(() => {
    if (!imagePath) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [imagePath, onClose]);

  if (!imagePath) return null;

  return (
    <div className="chat-lightbox" role="dialog" aria-modal="true" aria-label="Photo viewer" onClick={onClose}>
      <button type="button" className="chat-lightbox-close" onClick={onClose} aria-label="Close photo viewer">
        ×
      </button>
      <div className="chat-lightbox-content" onClick={(event) => event.stopPropagation()}>
        <Image
          src={imagePath}
          alt="Solar panel cleaning photo enlarged"
          width={1200}
          height={900}
          className="chat-lightbox-image"
          priority
        />
      </div>
    </div>
  );
}
