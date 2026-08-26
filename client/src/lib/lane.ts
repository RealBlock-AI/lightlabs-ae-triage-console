/**
 * Lane is the console's one routing vocabulary.
 *
 * Every lane colour, label and badge in the app resolves through this module,
 * so a lane can never be styled ad hoc in a page. The colours themselves live
 * as CSS variables in index.css; nothing here hardcodes a hex or a Tailwind
 * palette class.
 */

export const LANES = ["auto", "assisted", "escalate"] as const;

export type Lane = (typeof LANES)[number];

export type LaneMeta = {
  /** Badge text. Uppercase is applied in CSS, not baked into the string. */
  readonly label: string;
  /** What this lane means to the AE. One sentence, from the design handoff. */
  readonly meaning: string;
  /** Tinted fill + ink + border. Pair with `lane-badge` for a badge. */
  readonly surface: string;
  /** Ink only, for text that takes the lane colour without a fill. */
  readonly ink: string;
  /** Sort weight. Higher demands attention sooner. */
  readonly rank: number;
};

export const LANE: Readonly<Record<Lane, LaneMeta>> = Object.freeze({
  auto: Object.freeze({
    label: "auto",
    meaning: "The system prepared a complete answer and it can go.",
    surface: "lane-auto",
    ink: "lane-ink-auto",
    rank: 0,
  }),
  assisted: Object.freeze({
    label: "assisted",
    meaning: "Everything is researched; a human presses send.",
    surface: "lane-assisted",
    ink: "lane-ink-assisted",
    rank: 1,
  }),
  escalate: Object.freeze({
    label: "escalate",
    meaning: "A human has to decide something the system will not decide.",
    surface: "lane-escalate",
    ink: "lane-ink-escalate",
    rank: 2,
  }),
});

/** Most-urgent first. This is the queue's default sort, and the chip order. */
export const LANES_BY_URGENCY: readonly Lane[] = Object.freeze(
  [...LANES].sort((a, b) => LANE[b].rank - LANE[a].rank),
);

export function isLane(value: unknown): value is Lane {
  return typeof value === "string" && (LANES as readonly string[]).includes(value);
}

/**
 * Read a lane off an unknown value. Anything unrecognised resolves to escalate:
 * a row we cannot classify is a row a human should look at, never one that
 * quietly renders as auto.
 */
export function toLane(value: unknown): Lane {
  return isLane(value) ? value : "escalate";
}

export function laneMeta(value: unknown): LaneMeta {
  return LANE[toLane(value)];
}

/** Classes for a lane badge. */
export function laneBadgeClass(value: unknown): string {
  return `lane-badge ${laneMeta(value).surface}`;
}

/** Classes for text that takes the lane ink and no fill. */
export function laneInkClass(value: unknown): string {
  return laneMeta(value).ink;
}

export function laneRank(value: unknown): number {
  return laneMeta(value).rank;
}
