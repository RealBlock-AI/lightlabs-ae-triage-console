import Verdict, { type VerdictProps } from "@/components/Verdict";

/**
 * The three situations the design requires one component to absorb without a
 * structural change. If a situation needs a different shape, the component is
 * wrong, not the situation - so they are mounted side by side to be compared.
 *
 * The data here mirrors what server/verdict.ts projects; the projection itself
 * is pinned in server/verdict.test.ts.
 */
const FIXTURES: Array<{ title: string; note: string; props: VerdictProps }> = [
  {
    title: "Contested serving basis",
    note: "Two serving sizes, two answers. Both come straight out of the evaluator.",
    props: {
      headerNote: "2 defensible answers",
      branches: [
        { basisLabel: "declared serving", verdict: "in spec", delta: "by 0.8%", context: "99.2% of limit" },
        { basisLabel: "lab-reported serving", verdict: "out of spec", delta: "by 11.6%", context: "111.6% of limit" },
      ],
      decidingVariable: "serving size",
      decidingValues: "40 vs 45 g",
      reason: "Refused to pick: 40 g declared by customer, 45 g measured by lab, and the applied limit requires a serving size.",
    },
  },
  {
    title: "Non-detect",
    note: "A non-detect is not zero. The same slab, a different variable.",
    props: {
      headerNote: "2 defensible answers",
      branches: [
        { basisLabel: "non-detect as no result", verdict: "no result", delta: "not comparable", context: "a non-detect is not zero" },
        { basisLabel: "non-detect at ½ LOD", verdict: "at ½ LOD", delta: "by 60%", context: "40% of limit" },
      ],
      decidingVariable: "how ND is read",
      decidingValues: "no value vs 0.2 ug/serving",
      reason: "No numeric value is stored for lead on result res_8812. A non-detect is not zero and cannot be compared to a limit.",
    },
  },
  {
    title: "Which limit applies",
    note: "One measurement, two limits that both claim to govern it.",
    props: {
      headerNote: "2 defensible answers",
      branches: [
        { basisLabel: "supplier spec v4", verdict: "pass", delta: "by 0.8%", context: "99.2% of limit" },
        { basisLabel: "PROP65 CA", verdict: "fail", delta: "by 148%", context: "248% of limit" },
      ],
      decidingVariable: "which limit",
      decidingValues: "supplier spec v4 vs PROP65 CA",
      reason: "PROP65 CA limit is an unverified placeholder shown for routing only and may not be quoted.",
    },
  },
];

export default function VerdictFixtures() {
  return (
    <section className="mx-auto max-w-3xl px-5 py-7 md:px-8">
      <h1 className="font-serif text-2xl font-semibold tracking-tight">Verdict — three situations</h1>
      <p className="mt-2 max-w-[62ch] text-[13px] leading-6 text-[#60766c]">
        One component, taking everything as props. Same slab, same gutter, different variable.
        Neither branch may read as the real answer.
      </p>
      <div className="mt-6 grid gap-7">
        {FIXTURES.map(fixture => (
          <article key={fixture.title}>
            <h2 className="data text-[11px] uppercase tracking-[.13em] text-[#3d4841]">{fixture.title}</h2>
            <p className="mb-2 mt-1 text-[12px] text-[#67746e]">{fixture.note}</p>
            <Verdict {...fixture.props} />
          </article>
        ))}
      </div>
    </section>
  );
}
