export type Review = {
  source: "Google" | "Yelp";
  author: string;
  rating: 1 | 2 | 3 | 4 | 5;
  text: string;
  date?: string;
  tags?: string[];
};

export const GOOGLE_REVIEW_URL = "https://g.page/r/CQ52qP2TmAtxEAE/review";
export const YELP_URL = "https://www.yelp.com/biz/sun-sweeper-santa-maria";

export const REVIEW_VAULT: Review[] = [
  {
    source: "Google",
    author: "Alicia M.",
    rating: 5,
    text: "Our solar panels were dusty from wind and pollen, and production bounced back right after service. Team was on time and super professional.",
    date: "2025-02",
    tags: ["solar", "residential"],
  },
  {
    source: "Google",
    author: "Jason R.",
    rating: 5,
    text: "Booked for roof and gutters before listing our house. Everything looked clean and the walkthrough made it easy.",
    date: "2024-11",
    tags: ["roof", "gutter", "residential"],
  },
  {
    source: "Google",
    author: "Martha P.",
    rating: 5,
    text: "Great communication and careful work on a large commercial roof with solar arrays. They handled access and safety smoothly.",
    date: "2025-01",
    tags: ["solar", "roof", "commercial"],
  },
  {
    source: "Yelp",
    author: "Daniel T.",
    rating: 5,
    text: "Had pressure washing done on our driveway and side yard. Fast, friendly, and the place looked brand new.",
    date: "2024-09",
    tags: ["pressure", "residential"],
  },
  {
    source: "Yelp",
    author: "Kelsey W.",
    rating: 5,
    text: "Sunny helped us schedule solar panel cleaning and the crew knocked it out quickly. No mess, just clean panels and better output.",
    date: "2025-03",
    tags: ["solar", "residential"],
  },
  {
    source: "Yelp",
    author: "Ricardo G.",
    rating: 5,
    text: "We use SunSweeper for recurring gutter and roof maintenance on a small retail property. Consistent service every visit.",
    date: "2024-12",
    tags: ["gutter", "roof", "commercial"],
  },
];
