import type { Review } from "../data/reviews";

export type ChatMessage =
  | { id: string; role: "user" | "assistant"; type: "text"; content: string; imagePaths?: string[] }
  | { id: string; role: "assistant"; type: "reviews"; reviews: Review[] };
