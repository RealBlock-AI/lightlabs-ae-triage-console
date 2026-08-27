import { accountsPerAE, capacityCurve, hardCeiling, type CapacityInputs } from "@/lib/capacity";
import { useMemo, useState } from "react";

/**
 * Screen 4 - capacity.
 *
 * How many accounts one AE could carry, and where the ceiling is. The asymptote
 * is the whole point: the curve approaches the ceiling and never touches it,
 * because every account carries a fixed cost automation cannot remove.
 */

const CONTROLS: Array<{
  key: keyof CapacityInputs;
  label: string;
  min: number; max: number; step: number;
  format: (value: number) => string;
}> = [
  { key: "questionsPerAccount", label: "Questions / account / day", min: 0.2, max: 12, step: 0.1, format: v => v.toFixed(1) },
  { key: "autoShare", label: "Auto share", min: 0, max: 0.98, step: 0.01, format: v => `${Math.round(v * 100)}%` },
  { key: "secondsPerAssisted", label: "Sec / assisted item", min: 5, max: 300, step: 5, format: v => String(Math.round(v)) },
  { key: "secondsPerEscalation", label: "Sec / escalation", min: 30, max: 900, step: 10, format: v => String(Math.round(v)) },
];

const W = 640, H = 300, PAD_L = 30, PAD_B = 34, PAD_T = 22, PAD_R = 116;

export default function Capacity() {
  const [inputs, setInputs] = useState<CapacityInputs>({
    questionsPerAccount: 3.4,
    autoShare: 0.62,
    secondsPerAssisted: 45,
    secondsPerEscalation: 210,
  });

  const ceiling = hardCeiling();
  const curve = useMemo(() => capacityCurve(inputs, 80), [inputs]);
  const current = accountsPerAE(inputs);

  // y is scaled a little past the ceiling so the dashed line is never the very
  // top edge - the curve has to be seen approaching something.
  const yMax = ceiling * 1.12;
  const x = (share: number) => PAD_L + share * (W - PAD_L - PAD_R);
  const y = (accounts: number) => PAD_T + (1 - accounts / yMax) * (H - PAD_T - PAD_B);

  const path = curve.map((point, index) => `${index ? "L" : "M"}${x(point.autoShare).toFixed(1)},${y(point.accounts).toFixed(1)}`).join(" ");

  return (
    <section className="mx-auto max-w-6xl px-5 py-7 md:px-8">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Capacity</h1>
        <p className="data text-[11px] text-ink-muted">automation raises the ceiling · it never removes it</p>
      </header>

      <div className="mt-5 flex flex-col gap-5 md:flex-row">
        {/* Inputs rail */}
        <div className="w-full shrink-0 md:w-[150px]">
          <div className="flex flex-col gap-3.5">
            {CONTROLS.map(control => (
              <div key={control.key}>
                <div className="flex items-baseline justify-between gap-2">
                  <label className="text-[11px] leading-[1.3] text-ink" htmlFor={control.key}>{control.label}</label>
                  <span className="data text-[11px] text-ink-strong">{control.format(inputs[control.key])}</span>
                </div>
                <input
                  id={control.key}
                  type="range"
                  className="mt-1.5 w-full accent-ok"
                  min={control.min} max={control.max} step={control.step}
                  value={inputs[control.key]}
                  onChange={event => setInputs(prev => ({ ...prev, [control.key]: Number(event.target.value) }))}
                />
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-dashed border-line-strong pt-3">
            <p className="data text-[10px] uppercase tracking-[.13em] text-ink-faint">Ceiling</p>
            <p className="font-serif text-[34px] font-semibold leading-none tracking-tight text-ink-strong">{Math.round(ceiling)}</p>
            <p className="data mt-1 text-[11px] text-ink-muted">accounts</p>
            <p className="data mt-3 text-[11px] text-ink-muted">now {Math.round(current)}</p>
          </div>
        </div>

        {/* Chart */}
        <div className="min-w-0 flex-1">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Accounts per AE against auto share, approaching a hard ceiling of ${Math.round(ceiling)}`}>
            {/* Axes as rules, no grid. */}
            <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="var(--inverse-line)" strokeWidth="1.2" />
            <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="var(--inverse-line)" strokeWidth="1.2" />

            {/* The ceiling. Dashed, in the escalate ink, labelled at its right end. */}
            <line
              x1={PAD_L} y1={y(ceiling)} x2={W - PAD_R} y2={y(ceiling)}
              stroke="var(--lane-escalate-ink)" strokeWidth="1.2" strokeDasharray="5 4"
            />
            <text x={W - PAD_R + 6} y={y(ceiling) + 3} fontSize="10" fontFamily="var(--font-mono)" fill="var(--lane-escalate-ink)">
              hard ceiling {Math.round(ceiling)}
            </text>

            <path d={path} fill="none" stroke="var(--ok)" strokeWidth="2" />

            {/* Where the current settings sit. */}
            <circle cx={x(inputs.autoShare)} cy={y(current)} r="3.5" fill="var(--ok)" />
            {/* Flip the point label to the inside near the right edge, where it
                would otherwise collide with the ceiling label. */}
            <text
              x={x(inputs.autoShare) + (inputs.autoShare > 0.72 ? -7 : 7)}
              y={y(current) - 7}
              fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-strong)"
              textAnchor={inputs.autoShare > 0.72 ? "end" : "start"}
            >
              {Math.round(current)}
            </text>

            {[0, 0.25, 0.5, 0.75, 1].map(tick => (
              <text key={tick} x={x(tick)} y={H - PAD_B + 14} fontSize="9" fontFamily="var(--font-mono)" fill="var(--ink-faint)" textAnchor={tick === 1 ? "end" : tick === 0 ? "start" : "middle"}>
                {Math.round(tick * 100)}%
              </text>
            ))}
            <text x={PAD_L} y={H - 4} fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-muted)">auto share →</text>
            <text x={PAD_L} y={PAD_T - 8} fontSize="9" fontFamily="var(--font-mono)" fill="var(--ink-faint)">accounts per AE</text>
          </svg>
        </div>
      </div>
    </section>
  );
}
