import { GOOGLE_REVIEW_URL, YELP_URL, type Review } from "../data/reviews";

type ReviewsBubbleProps = {
  reviews: Review[];
};

const toStars = (rating: Review["rating"]) => "★".repeat(rating) + "☆".repeat(5 - rating);

export function ReviewsBubble({ reviews }: ReviewsBubbleProps) {
  return (
    <div className="reviews-bubble" aria-label="Customer reviews">
      <div className="reviews-grid">
        {reviews.map((review) => (
          <article key={`${review.source}-${review.author}-${review.text.slice(0, 20)}`} className="review-card">
            <div className="review-card-top">
              <span className={`review-source-badge review-source-${review.source.toLowerCase()}`}>{review.source}</span>
              <span className="review-stars" aria-label={`${review.rating} out of 5 stars`}>
                {toStars(review.rating)}
              </span>
            </div>
            <p className="review-author">{review.author}</p>
            <p className="review-text">“{review.text}”</p>
          </article>
        ))}
      </div>

      <div className="review-links">
        <a href={GOOGLE_REVIEW_URL} target="_blank" rel="noreferrer" className="review-link-btn">
          Read more on Google
        </a>
        <a href={YELP_URL} target="_blank" rel="noreferrer" className="review-link-btn">
          Read more on Yelp
        </a>
      </div>
    </div>
  );
}
