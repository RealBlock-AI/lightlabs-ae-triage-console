import { type Lane, toLane } from "./lane";

export const supportPerformance = {
  firstResponseMinutes: 4.2,
  resolutionMinutes: 31,
  automatedRate: 62,
  humanReviewRate: 38,
  totalInquiries: 126,
  trend: [
    { label: "Mar", automated: 35, human: 65 },
    { label: "Apr", automated: 42, human: 58 },
    { label: "May", automated: 48, human: 52 },
    { label: "Jun", automated: 53, human: 47 },
    { label: "Jul", automated: 58, human: 42 },
    { label: "Aug", automated: 62, human: 38 },
  ],
};

export function isVerifiedSlackMessage(interaction: { source?: unknown; companyId?: unknown; accountId?: unknown }) {
  const source = typeof interaction.source === "string" ? interaction.source.toLowerCase() : "";
  return Boolean(interaction.companyId ?? interaction.accountId) && !source.includes("email");
}

/**
 * Read the routing lane off an interaction record.
 *
 * The lane is authoritative and stored; this only guards the shape. Anything
 * unrecognised resolves to escalate rather than quietly rendering as auto -
 * see toLane in ./lane.
 */
export function laneFromInteraction(interaction: { lane?: unknown }): Lane {
  return toLane(interaction.lane);
}
