export const universalFollowUps = [
  "What are we dealing with?",
  "Tell me a little about what’s going on.",
  "What’s the situation?",
  "What issue brought you to SunSweeper?",
] as const;

export const ucsContent = {
  solar_panel_cleaning: [
    "Solar panel cleaning. One of the things we’re best known for. It’s amazing how something so simple can restore something so powerful.",
    "Solar panel cleaning. Most people don’t realize how much performance can quietly slip away over time.",
    "Solar panel cleaning isn’t just about appearance — it’s about getting your system back to where it was designed to be.",
    "Solar panel cleaning. There’s a big difference between 'looks clean' and 'is clean.'",
  ],
  bird_proofing: [
    "Bird proofing. Solar panels can look like luxury condos to the wrong tenants.",
    "Bird proofing isn’t glamorous — but it protects your roof, wiring, and sanity.",
    "Bird proofing. Once birds move in, they rarely move out on their own.",
    "Bird proofing under solar panels is more common than most homeowners expect.",
  ],
  roof_cleaning: [
    "Roof cleaning. Roofs take more abuse than almost anything else on a home.",
    "Roof cleaning isn’t just cosmetic — it changes how the entire property feels.",
    "Roof cleaning. Those dark streaks usually aren’t just dirt.",
    "Roof cleaning. It’s amazing how much life a proper cleaning can bring back.",
  ],
  gutter_cleaning: [
    "Gutter cleaning. Not glamorous — but critical.",
    "Gutter cleaning. It’s amazing how something so simple can protect something so expensive.",
    "Gutter cleaning keeps water where it belongs — and away from where it doesn’t.",
    "Gutter cleaning. Most people don’t think about gutters… until they have to.",
  ],
  gutter_repair_install: [
    "Gutter repair and installation. When they’re solid, you never think about them.",
    "Gutter repair. Small issues can turn into expensive ones if ignored.",
    "Gutter installation done right is one of those 'do it once, do it right' decisions.",
    "Gutter systems protect the home quietly — until they don’t.",
  ],
  exterior_cleaning: [
    "Exterior cleaning. First impressions matter.",
    "Exterior cleaning can completely reset how a property feels.",
    "Exterior cleaning isn’t just surface level when it’s done right.",
    "Exterior cleaning. Amazing what a proper wash can bring back to life.",
  ],
} as const;

export type UcsServiceKey = keyof typeof ucsContent;
