/**
 * The dual-answer verdict - a split slab.
 *
 * It exists for one situation: the lab platform can defend two different
 * answers to the same question, and the AE has to settle the variable that
 * decides between them.
 *
 * The two branches are identical in width, type size, weight and colour. There
 * is no default, no primary, no footnote. If one branch ever looks heavier than
 * the other, the component has failed - which is why both sides go through the
 * same renderer rather than being written out twice.
 *
 * The gutter is the visual centre of gravity, because the variable - not either
 * answer - is the thing the AE has to act on.
 */

export type VerdictBranch = {
  basisLabel: string;
  verdict: string;
  delta: string;
  context: string;
};

export type VerdictProps = {
  headerNote: string;
  branches: readonly [VerdictBranch, VerdictBranch];
  decidingVariable: string;
  decidingValues: string;
  reason: string;
};

/** One side. Called twice with nothing positional, so the two cannot drift. */
function Branch({ branch }: { branch: VerdictBranch }) {
  return (
    <div className="flex flex-1 flex-col gap-1 px-3.5 py-3">
      <p className="data text-[10px] uppercase tracking-[.13em] text-ink-faint">{branch.basisLabel}</p>
      <p className="font-serif text-[26px] font-semibold leading-[1.05] tracking-tight text-ink-strong">{branch.verdict}</p>
      <p className="data text-[11px] text-ink-muted">{branch.delta}</p>
      <p className="data text-[11px] text-ink-muted">{branch.context}</p>
    </div>
  );
}

export default function Verdict({ headerNote, branches, decidingVariable, decidingValues, reason }: VerdictProps) {
  return (
    <section className="border border-inverse-line" aria-label="Verdict">
      {/* Header band */}
      <div className="flex items-center justify-between gap-3 border-b border-inverse-line bg-sunken-strong px-3.5 py-2">
        <p className="data text-[10px] uppercase tracking-[.13em] text-ink">Verdict · not resolved</p>
        <p className="data lane-ink-escalate text-[11px]">{headerNote}</p>
      </div>

      {/* Body band. align-items: stretch, so the gutter is full height. */}
      <div className="flex items-stretch">
        <Branch branch={branches[0]} />

        {/* The deciding gutter. Fixed width, its own fill, ruled on both sides. */}
        <div className="flex w-[82px] shrink-0 flex-col items-center justify-center gap-1 border-x-[1.4px] border-inverse-line bg-sunken-strong px-1.5 py-3 text-center">
          <p className="data text-[9px] uppercase tracking-[.12em] text-ink-faint">Deciding</p>
          <p className="data text-[11px] leading-[1.2] text-ink-strong">{decidingVariable}</p>
          <p className="data lane-ink-escalate text-[11px] leading-[1.2]">{decidingValues}</p>
        </div>

        <Branch branch={branches[1]} />
      </div>

      {/* Footer band. A refusal is a result, so it is styled as a finding - not
          as an error, and never greyed out. */}
      <div className="lane-escalate border-t border-inverse-line px-3.5 py-2">
        <p className="text-[11px] leading-[1.4]">{reason}</p>
      </div>
    </section>
  );
}
