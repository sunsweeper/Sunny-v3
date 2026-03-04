import { REVIEW_VAULT, type Review } from "../data/reviews";

const shuffle = <T,>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export const pickReviews = ({
  n,
  preferredTags,
}: {
  n: number;
  preferredTags?: string[];
}): Review[] => {
  const normalizedTags = preferredTags?.map((tag) => tag.toLowerCase()) ?? [];
  const hasPreferredTags = normalizedTags.length > 0;

  const matching = hasPreferredTags
    ? REVIEW_VAULT.filter((review) =>
        review.tags?.some((tag) => normalizedTags.includes(tag.toLowerCase())),
      )
    : [];

  const selected: Review[] = [];
  const selectedKeys = new Set<string>();

  const pushUnique = (review: Review) => {
    const key = `${review.source}:${review.author}:${review.text}`;
    if (selectedKeys.has(key) || selected.length >= n) return;
    selected.push(review);
    selectedKeys.add(key);
  };

  const ensureSourceCoverage = (source: Review["source"], pool: Review[]) => {
    const alreadyHasSource = selected.some((review) => review.source === source);
    if (alreadyHasSource) return;
    const candidate = shuffle(pool.filter((review) => review.source === source)).at(0);
    if (candidate) pushUnique(candidate);
  };

  if (hasPreferredTags) {
    shuffle(matching).forEach(pushUnique);
  }

  ensureSourceCoverage("Google", hasPreferredTags ? matching : REVIEW_VAULT);
  ensureSourceCoverage("Yelp", hasPreferredTags ? matching : REVIEW_VAULT);
  ensureSourceCoverage("Google", REVIEW_VAULT);
  ensureSourceCoverage("Yelp", REVIEW_VAULT);

  shuffle(REVIEW_VAULT).forEach(pushUnique);

  return selected.slice(0, n);
};
