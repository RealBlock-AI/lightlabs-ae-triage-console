import { formatNumber, type Verdict } from "./domain";

/**
 * The dual-answer verdict.
 *
 * When the lab platform can defend two different answers to the same question,
 * the console must show both with equal weight and name the variable that
 * decides between them. This module projects an evaluator Verdict into that
 * shape; the component that renders it takes everything as props and holds no
 * state, so the two branches cannot drift apart.
 *
 * The two branches are deliberately symmetrical in the data as well as in the
 * layout: there is no "primary" field, no default, and no ordering that implies
 * one answer is the real one. The deciding variable is the payload.
 */

export type VerdictBranch = {
  /** Which basis this answer rests on. Never a rank - "A" and "B" are positions. */
  basisLabel: string;
  /** The verdict word, shown at display size. Comes from the stored result. */
  verdict: string;
  /** Distance from the applied bound, e.g. "by 11.6%". */
  delta: string;
  /** Computed context under the verdict word, e.g. "111.6% of limit". */
  context: string;
};

export type DualVerdict = {
  /** Right of the header band, e.g. "2 defensible answers". */
  headerNote: string;
  /** Exactly two. The tuple type is the guard against a third creeping in. */
  branches: readonly [VerdictBranch, VerdictBranch];
  /** The variable the AE actually has to settle, e.g. "serving size". */
  decidingVariable: string;
  /** Its two competing values, e.g. "40 vs 45 g". */
  decidingValues: string;
  /** Why the system declined to pick. A refusal is a result, not an error. */
  reason: string;
};

export type VerdictContext = {
  /** Analyte name, for the refusal sentence. */
  analyte?: string;
  /** Result identifier, for the refusal sentence. */
  resultRef?: string;
  /**
   * How a non-detect reads if it is read as half the limit of detection.
   * Supplied by the caller because a non-detect Verdict has no computed value.
   */
  halfLod?: { value: number; unit: string; percentOfBound: number };
  /**
   * A second limit that also applies, when the deciding variable is which limit
   * governs rather than which serving basis does.
   */
  alternateLimit?: {
    label: string;
    passes: boolean;
    percentOfBound: number;
    /** Why this limit is contested, e.g. an unverified placeholder. */
    note: string;
  };
  /** The limit the stored verdict was computed against, paired with alternateLimit. */
  appliedLimitLabel?: string;
};

/** "by 0.8%" - how far this reading sits from the bound it was measured against. */
function deltaFrom(percentOfBound: number): string {
  return `by ${formatNumber(Math.abs(round1(100 - percentOfBound)))}%`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function percentOf(percentOfBound: number): string {
  return `${formatNumber(round1(percentOfBound))}% of limit`;
}

const servingLabel: Record<"declared" | "lab_reported", string> = {
  declared: "declared serving",
  lab_reported: "lab-reported serving",
};

/**
 * Project a Verdict into the dual-answer shape, or undefined when the system
 * has exactly one defensible answer and the ordinary readout should be shown.
 *
 * Situations are checked in the order the console cares about them.
 */
export function toDualVerdict(verdict: Verdict, context: VerdictContext = {}): DualVerdict | undefined {
  const analyte = context.analyte ?? "this analyte";

  // 1. Two serving bases, two answers. The evaluator already found both.
  if (verdict.branches?.length === 2 && verdict.appliedBound) {
    const [a, b] = verdict.branches;
    return {
      headerNote: "2 defensible answers",
      branches: [
        {
          basisLabel: servingLabel[a.servingSource],
          verdict: a.passes ? "in spec" : "out of spec",
          delta: deltaFrom(a.percentOfBound),
          context: percentOf(a.percentOfBound),
        },
        {
          basisLabel: servingLabel[b.servingSource],
          verdict: b.passes ? "in spec" : "out of spec",
          delta: deltaFrom(b.percentOfBound),
          context: percentOf(b.percentOfBound),
        },
      ],
      decidingVariable: "serving size",
      decidingValues: `${formatNumber(a.grams)} vs ${formatNumber(b.grams)} g`,
      reason: `Refused to pick: ${formatNumber(a.grams)} g declared by customer, ${formatNumber(b.grams)} g measured by lab, and the applied limit requires a serving size.`,
    };
  }

  // 2. One measurement, two limits that both claim to govern it.
  if (context.alternateLimit) {
    const applied = verdict.computed;
    const alt = context.alternateLimit;
    if (!applied) return undefined;
    return {
      headerNote: "2 defensible answers",
      branches: [
        {
          basisLabel: context.appliedLimitLabel ?? verdict.appliedLimit.source,
          verdict: applied.percentOfBound <= 100 ? "pass" : "fail",
          delta: deltaFrom(applied.percentOfBound),
          context: percentOf(applied.percentOfBound),
        },
        {
          basisLabel: alt.label,
          verdict: alt.passes ? "pass" : "fail",
          delta: deltaFrom(alt.percentOfBound),
          context: percentOf(alt.percentOfBound),
        },
      ],
      decidingVariable: "which limit",
      decidingValues: `${context.appliedLimitLabel ?? verdict.appliedLimit.source} vs ${alt.label}`,
      reason: alt.note,
    };
  }

  // 3. A non-detect. It is not zero, and it is not a number either.
  if (verdict.refusal?.code === "NON_DETECT" && context.halfLod) {
    const half = context.halfLod;
    return {
      headerNote: "2 defensible answers",
      branches: [
        {
          basisLabel: "non-detect as no result",
          verdict: "no result",
          delta: "not comparable",
          context: "a non-detect is not zero",
        },
        {
          basisLabel: "non-detect at ½ LOD",
          verdict: `at ½ LOD`,
          delta: deltaFrom(half.percentOfBound),
          context: percentOf(half.percentOfBound),
        },
      ],
      decidingVariable: "how ND is read",
      decidingValues: `no value vs ${formatNumber(half.value)} ${half.unit}`,
      reason: `No numeric value is stored for ${analyte}${context.resultRef ? ` on result ${context.resultRef}` : ""}. A non-detect is not zero and cannot be compared to a limit.`,
    };
  }

  return undefined;
}
