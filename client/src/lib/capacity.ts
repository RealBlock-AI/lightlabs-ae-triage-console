/**
 * How many accounts one AE could carry, and where the ceiling is.
 *
 * The shape of this model is the argument: automation removes the *variable*
 * cost of answering questions, but every account carries a fixed cost that no
 * amount of automation touches. So the curve rises steeply and then flattens
 * against a hard ceiling it never reaches.
 *
 * Automation raises the ceiling. It never removes it.
 */

export type CapacityInputs = {
  /** Questions per account per day. */
  questionsPerAccount: number;
  /** Share of those the system can answer end to end, 0..1. */
  autoShare: number;
  /** Seconds an AE spends on one assisted item. */
  secondsPerAssisted: number;
  /** Seconds an AE spends on one escalation. */
  secondsPerEscalation: number;
};

/** Productive seconds in an AE's day - six hours, not eight. */
export const WORKING_SECONDS_PER_DAY = 21_600;

/**
 * Fixed seconds per account per day that automation cannot remove: knowing the
 * account, its history, and its people. This is what creates the ceiling.
 */
export const ACCOUNT_OVERHEAD_SECONDS = 146;

/** Of the questions the system will not answer, the share needing a decision. */
export const ESCALATION_SHARE_OF_NON_AUTO = 0.4;

/** The blended cost of one question the system did not answer. */
export function blendedSeconds(inputs: CapacityInputs): number {
  return ESCALATION_SHARE_OF_NON_AUTO * inputs.secondsPerEscalation
    + (1 - ESCALATION_SHARE_OF_NON_AUTO) * inputs.secondsPerAssisted;
}

/** Accounts one AE could carry at this auto share. */
export function accountsPerAE(inputs: CapacityInputs, autoShare = inputs.autoShare): number {
  const share = Math.min(Math.max(autoShare, 0), 1);
  const variable = Math.max(0, inputs.questionsPerAccount) * (1 - share) * blendedSeconds(inputs);
  return WORKING_SECONDS_PER_DAY / (ACCOUNT_OVERHEAD_SECONDS + variable);
}

/**
 * The hard ceiling: what an AE could carry if every question answered itself.
 * Independent of question volume and of how long an answer takes.
 */
export function hardCeiling(): number {
  return WORKING_SECONDS_PER_DAY / ACCOUNT_OVERHEAD_SECONDS;
}

/** Points across the full range of auto share, for the curve. */
export function capacityCurve(inputs: CapacityInputs, steps = 60): Array<{ autoShare: number; accounts: number }> {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const autoShare = index / steps;
    return { autoShare, accounts: accountsPerAE(inputs, autoShare) };
  });
}
