export type SupportQueueItem = {
  id: string;
  message: string;
  company: string;
  contact: string;
  receivedLabel: string;
  workflow: "AI resolved" | "Human review" | "In progress";
  topic: string;
};

export const companyNames: Record<string, string> = {
  co_northwind: "Northwind Nutrition",
  co_lumen: "Lumen Foods",
  co_pinecrest: "Pinecrest Manufacturing",
};

export const demoSlackQueue: SupportQueueItem[] = [
  { id: "slack-northwind-order", message: "Can you confirm where our vanilla protein order is right now?", company: "Northwind Nutrition", contact: "Priya Shah", receivedLabel: "4 min ago", workflow: "AI resolved", topic: "Order status" },
  { id: "slack-lumen-lot", message: "Lot 8812 came back at 12.4 ppb lead. Can you help us understand the result?", company: "Lumen Foods", contact: "Jordan Lee", receivedLabel: "18 min ago", workflow: "Human review", topic: "Result review" },
  { id: "slack-pinecrest-coa", message: "When will the certificate for the Lumen run be ready to share with our team?", company: "Pinecrest Manufacturing", contact: "Alex Morgan", receivedLabel: "37 min ago", workflow: "In progress", topic: "Certificate request" },
];

export const accountMappings = [
  { account: "Northwind Nutrition", platformAccount: "TP-ACCT-0142", hubspotCompany: "HS-CO-201", relationship: "Verified", contacts: ["Priya Shah · U_NORTH_OPS", "Maya Chen · U_NORTH_QA"], rule: "Exact email match + active company membership" },
  { account: "Lumen Foods", platformAccount: "TP-ACCT-0179", hubspotCompany: "HS-CO-302", relationship: "Verified", contacts: ["Jordan Lee · U_LUMEN_QA", "Taylor Brooks · U_LUMEN_VIEW"], rule: "Exact email match + results permission is evaluated per request" },
  { account: "Pinecrest Manufacturing", platformAccount: "TP-ACCT-0098", hubspotCompany: "HS-CO-411", relationship: "Partner mapped", contacts: ["Alex Morgan · U_PINE_QC", "Sam Rivera · U_PINE_OPS"], rule: "Company partnership determines cross-account visibility" },
];

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

export const emailContext = {
  company: "Northwind Nutrition",
  subject: "PO-NORTH-22 delivery timing",
  sender: "priya@northwind.demo",
  received: "Today, 9:14 AM",
  summary: "Priya asked whether the delivery window has changed before an internal launch review.",
  linkedSlackQuestion: "Can you confirm where our vanilla protein order is right now?",
};

export function isVerifiedSlackMessage(interaction: { source?: unknown; companyId?: unknown; accountId?: unknown }) {
  const source = typeof interaction.source === "string" ? interaction.source.toLowerCase() : "";
  return Boolean(interaction.companyId ?? interaction.accountId) && !source.includes("email");
}

export function supportWorkflowFromInteraction(interaction: { status?: unknown; lane?: unknown }): SupportQueueItem["workflow"] {
  if (interaction.status === "auto_resolved" || interaction.lane === "auto") return "AI resolved";
  if (interaction.lane === "escalate" || interaction.lane === "assisted") return "Human review";
  return "In progress";
}
