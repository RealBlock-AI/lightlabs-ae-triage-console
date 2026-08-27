import { LANE, LANES_BY_URGENCY, type Lane } from "@/lib/lane";
import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";

/**
 * Screen 3 - the policy simulator.
 *
 * A place to argue about the lane boundary. Nothing here writes: lane changes
 * are local state, the server call is a query, and the screen says so.
 *
 * The second number is the whole screen. "214 would route differently" is an
 * argument for automating a category; "31 of those must not send" is the reason
 * you do not. It is the only display-size figure carrying the escalate colour.
 */

const CATEGORIES: Array<{ intent: string; label: string; live: Lane }> = [
  { intent: "ORDER_STATUS", label: "Order status", live: "auto" },
  { intent: "OPS_SHIPPING", label: "Shipping", live: "auto" },
  { intent: "OPS_DATA_EXPORT", label: "Data export", live: "auto" },
  { intent: "STABILITY_SCHEDULE", label: "Stability schedule", live: "auto" },
  { intent: "SPEC_INTAKE", label: "Spec intake", live: "assisted" },
  { intent: "TEST_RECOMMENDATION", label: "Test recommendation", live: "assisted" },
  { intent: "ASSAY_SCOPE_QUESTION", label: "Assay scope question", live: "assisted" },
  { intent: "PRICING_QUOTE", label: "Pricing quote", live: "assisted" },
  { intent: "OOS_RESULT", label: "Out of spec result", live: "assisted" },
  { intent: "LABEL_CLAIM_VARIANCE", label: "Label claim variance", live: "assisted" },
  { intent: "REGULATORY_LIMIT_QUESTION", label: "Regulatory limit question", live: "escalate" },
  { intent: "HUMAN_ESCALATION_REQUEST", label: "Escalation request", live: "escalate" },
];

export default function Policy() {
  const [, navigate] = useLocation();
  const [proposals, setProposals] = useState<Record<string, Lane>>({});
  const [sampling, setSampling] = useState(false);

  const moved = useMemo(
    () => CATEGORIES.filter(row => proposals[row.intent] && proposals[row.intent] !== row.live),
    [proposals],
  );

  const simulation = trpc.prototype.simulate.useQuery({ proposals }, { enabled: moved.length > 0 });
  const result = simulation.data;

  const headline = moved.length === 1
    ? `if "${moved[0].label.toLowerCase()}" → ${proposals[moved[0].intent].toUpperCase()}`
    : moved.length ? `${moved.length} categories moved` : "";

  return (
    <section className="mx-auto max-w-6xl px-5 py-7 md:px-8">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Policy simulator</h1>
        {/* Said on screen, not in a footnote. */}
        <p className="data lane-ink-escalate text-[11px]">what-if only · live routing unchanged</p>
      </header>

      <div className="mt-5 grid gap-3 lg:grid-cols-[1.3fr_1fr]">
        {/* Left - the category table. */}
        <article className="border border-inverse-line">
          <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-inverse-line bg-sunken-strong px-3.5 py-2">
            <p className="data text-[10px] uppercase tracking-[.13em] text-ink">Category</p>
            <p className="data text-[10px] uppercase tracking-[.13em] text-ink">Assigned lane</p>
          </div>
          {CATEGORIES.map(row => {
            const current = proposals[row.intent] ?? row.live;
            const changed = current !== row.live;
            return (
              <div
                key={row.intent}
                className={`grid grid-cols-[1fr_auto] items-center gap-3 border-b border-line px-3.5 py-1.5 last:border-b-0 ${changed ? "bg-warn-soft" : ""}`}
              >
                <p className="text-[12px] text-ink">
                  {row.label}
                  {/* Nothing is saved, and a moved row keeps saying so. */}
                  {changed && <span className="data lane-ink-escalate ml-2 text-[10px]">moved · not saved</span>}
                </p>
                <div className="flex gap-1" role="group" aria-label={`Lane for ${row.label}`}>
                  {LANES_BY_URGENCY.map(lane => {
                    const selected = current === lane;
                    return (
                      <button
                        key={lane}
                        aria-pressed={selected}
                        onClick={() => setProposals(prev => ({ ...prev, [row.intent]: lane }))}
                        className={`lane-badge ${LANE[lane].surface} ${selected ? "" : "opacity-35"}`}
                      >
                        {LANE[lane].label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </article>

        {/* Right - the docked diff. */}
        <aside className="h-fit border border-inverse-line bg-sunken">
          {!moved.length ? (
            <div className="px-4 py-5">
              <p className="data text-[10px] uppercase tracking-[.13em] text-ink-faint">No change proposed</p>
              <p className="mt-2 text-[12px] leading-[1.5] text-ink-muted">
                Move a category to a different lane to see what it would have done to the questions
                that have already come in.
              </p>
            </div>
          ) : (
            <div className="px-4 py-4">
              <p className="data text-[10px] uppercase tracking-[.13em] text-ink">{headline}</p>

              <p className="mt-3 font-serif text-[34px] font-semibold leading-none tracking-tight text-ink-strong">
                {simulation.isLoading ? "…" : (result?.changedItems ?? 0)}
              </p>
              <p className="mt-1 text-[12px] leading-[1.45] text-ink-muted">
                of {result?.consideredItems ?? 0} past items would have routed differently
              </p>

              <div className="my-3.5 border-t border-dashed border-line-strong" />

              {/* The number that matters. The only display-size figure on the
                  screen carrying the escalate colour. */}
              <p className="lane-ink-escalate font-serif text-[34px] font-semibold leading-none tracking-tight">
                {simulation.isLoading ? "…" : (result?.unsafeItems ?? 0)}
              </p>
              <p className="mt-1 text-[12px] leading-[1.45] text-ink-muted">
                of those contained something that must not send automatically
              </p>

              {result?.breakdown.length ? (
                <ul className="mt-3 flex flex-col gap-1">
                  {result.breakdown.map(entry => (
                    <li key={entry.code} className="flex items-baseline justify-between gap-3">
                      <span className="data text-[11px] text-ink-muted">{entry.label}</span>
                      <span className="data text-[11px] text-ink">{entry.count}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {result?.unsafeSample.length ? (
                  <button
                    className="lane-badge lane-escalate px-2.5 py-1"
                    aria-expanded={sampling}
                    onClick={() => setSampling(open => !open)}
                  >
                    {sampling ? "hide the sample" : `sample the ${result.unsafeItems}`}
                  </button>
                ) : null}
                <button
                  className="lane-badge border-line-strong bg-transparent px-2.5 py-1 text-ink-muted"
                  onClick={() => { setProposals({}); setSampling(false); }}
                >
                  reset to live
                </button>
              </div>

              {/* The count is only worth anything if it can be opened. */}
              {sampling && result?.unsafeSample.length ? (
                <ul className="mt-3 border-t border-dashed border-line-strong pt-2">
                  {result.unsafeSample.map(entry => (
                    <li key={entry.id} className="border-b border-line last:border-b-0">
                      <button
                        className="w-full py-1.5 text-left hover:bg-sunken-strong"
                        onClick={() => navigate(`/interactions/${entry.id}`)}
                      >
                        <span className="block text-[12px] text-ink">{entry.category}</span>
                        <span className="data block text-[10px] text-ink-faint">{entry.risks.join(" · ")}</span>
                      </button>
                    </li>
                  ))}
                  {result.unsafeItems > result.unsafeSample.length && (
                    <li className="data py-1.5 text-[10px] text-ink-faint">
                      showing {result.unsafeSample.length} of {result.unsafeItems}
                    </li>
                  )}
                </ul>
              ) : null}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
