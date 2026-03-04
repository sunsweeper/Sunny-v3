import Image from "next/image";

type ChatImageBubbleProps = {
  images: string[];
  onImageClick: (imagePath: string) => void;
};

export function ChatImageBubble({ images, onImageClick }: ChatImageBubbleProps) {
  return (
    <div className="chat-image-bubble" role="group" aria-label="Solar cleaning photos">
      {images.map((imagePath) => (
        <button
          key={imagePath}
          type="button"
          className="chat-image-thumb-btn"
          onClick={() => onImageClick(imagePath)}
          aria-label="Open solar cleaning photo"
        >
          <Image
            src={imagePath}
            alt="Solar panel cleaning work photo"
            width={220}
            height={150}
            className="chat-image-thumb"
          />
        </button>
      ))}
    </div>
  );
}
