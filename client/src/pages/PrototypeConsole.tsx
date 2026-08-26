import { LANE, LANES_BY_URGENCY, laneBadgeClass, type Lane } from "@/lib/lane";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";

/**
 * Screen 1 - the queue.
 *
 * One row per open customer question, sorted by urgency, then account value,
 * then age. Lane is a column, not a grouping, and sort is the only hierarchy,
 * so rows never re-order under the AE's cursor.
 *
 * Every row is a pair: the record, and an indented reason line underneath. The
 * reason line is the reason you never have to open a packet to find out why
 * something routed.
 */

/** Widths as a proportion of the design's ~720px content area. */
const COLUMNS = [
  { key: "lane", label: "Lane", width: "10.3%" },
  { key: "account", label: "Account", width: "18.3%" },
  { key: "contact", label: "Contact", width: "13.3%" },
  { key: "tier", label: "Tier", width: "4.7%" },
  { key: "category", label: "Category", width: "16.4%" },
  { key: "age", label: "Age", width: "5.6%" },
  { key: "sla", label: "SLA", width: "7.2%" },
  { key: "confidence", label: "Confidence", width: "auto" },
] as const;

function parseLanes(search: string): Lane[] {
  const raw = new URLSearchParams(search).get("lane");
  if (!raw) return [];
  return raw.split(",").filter((value): value is Lane => LANES_BY_URGENCY.includes(value as Lane));
}

export default function PrototypeConsole() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const utils = trpc.useUtils();
  const bootstrap = trpc.prototype.bootstrap.useMutation({ onSuccess: () => utils.prototype.queue.invalidate() });
  const queue = trpc.prototype.queue.useQuery();
  useEffect(() => { bootstrap.mutate(); }, []);

  const active = parseLanes(search);
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState(0);
  const tableRef = useRef<HTMLDivElement>(null);

  const rows = queue.data ?? [];

  const counts = useMemo(() => {
    const tally: Record<Lane, number> = { auto: 0, assisted: 0, escalate: 0 };
    for (const row of rows) tally[row.lane] += 1;
    return tally;
  }, [rows]);

  const visible = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return rows.filter(row => {
      if (active.length && !active.includes(row.lane)) return false;
      if (!needle) return true;
      return [row.account, row.contact, row.category, row.reason].some(field => field.toLowerCase().includes(needle));
    });
  }, [rows, active, term]);

  // A filtered queue is linkable, so the filter lives in the URL.
  const toggleLane = (lane: Lane) => {
    const next = active.includes(lane) ? active.filter(value => value !== lane) : [...active, lane];
    navigate(next.length ? `/?lane=${next.join(",")}` : "/", { replace: true });
    setSelected(0);
  };

  const open = (index: number) => {
    const row = visible[index];
    if (row) navigate(`/interactions/${row.id}`);
  };

  useEffect(() => { if (selected >= visible.length) setSelected(Math.max(0, visible.length - 1)); }, [visible.length, selected]);

  // Keep the selection on screen. Without this, arrowing past the fold moves a
  // selection the AE cannot see.
  useEffect(() => {
    tableRef.current?.querySelector(`[data-row="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setSelected(index => Math.min(index + 1, visible.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setSelected(index => Math.max(index - 1, 0)); }
    else if (event.key === "Enter") { event.preventDefault(); open(selected); }
  };

  return (
    <section className="mx-auto max-w-6xl px-5 py-7 md:px-8">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Queue</h1>
        <div className="flex items-center gap-3">
          <input
            className="field data w-56 !py-1.5 text-[13px]"
            placeholder="Search account, contact, reason"
            value={term}
            onChange={event => { setTerm(event.target.value); setSelected(0); }}
            aria-label="Search the queue"
          />
          <p className="data text-[13px] text-[#60766c]">
            <b className="text-[#13261f]">{visible.length}</b> open
          </p>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter by lane">
        {LANES_BY_URGENCY.map(lane => (
          <button
            key={lane}
            onClick={() => toggleLane(lane)}
            aria-pressed={active.includes(lane)}
            className={`lane-badge ${active.includes(lane) ? LANE[lane].surface : "border-[#cfdbd2] bg-transparent text-[#60766c]"} px-2.5 py-1`}
          >
            {LANE[lane].label} <span className="tnum ml-1 opacity-70">{counts[lane]}</span>
          </button>
        ))}
        <button
          onClick={() => { navigate("/", { replace: true }); setSelected(0); }}
          aria-pressed={active.length === 0}
          className={`lane-badge px-2.5 py-1 ${active.length === 0 ? "border-[#176344] bg-[#e7f6eb] text-[#176344]" : "border-[#cfdbd2] bg-transparent text-[#60766c]"}`}
        >
          all <span className="tnum ml-1 opacity-70">{rows.length}</span>
        </button>
      </div>

      <div
        ref={tableRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="mt-4 overflow-x-auto rounded-[5px] border border-[#2b3531] outline-none focus-visible:ring-2 focus-visible:ring-[#176344]/35 lg:overflow-x-visible"
      >
        <table className="qtable w-full border-collapse text-left text-[13px]">
          <colgroup>{COLUMNS.map(column => <col key={column.key} style={{ width: column.width }} />)}</colgroup>
          <thead className="sticky top-0 z-10 bg-[#e9ede8]">
            <tr>
              {COLUMNS.map(column => (
                <th key={column.key} className="whitespace-nowrap border-b border-[#2b3531] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[.11em] text-[#60766c]">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>

          {queue.isLoading && <tbody><tr><td colSpan={COLUMNS.length} className="px-2.5 py-6 text-center text-[#60766c]">Loading the queue…</td></tr></tbody>}

          {!queue.isLoading && !visible.length && (
            <tbody><tr><td colSpan={COLUMNS.length} className="px-2.5 py-6 text-center text-[#60766c]">
              No questions match this filter.
            </td></tr></tbody>
          )}

          {visible.map((row, index) => (
            // One tbody per item so hover and selection tint the whole pair.
            <tbody
              key={row.id}
              data-row={index}
              onClick={() => { setSelected(index); navigate(`/interactions/${row.id}`); }}
              onMouseEnter={() => setSelected(index)}
              className={`cursor-pointer transition-colors ${index === selected ? "bg-[#eef5f0]" : "hover:bg-[#f3faf5]"}`}
            >
              <tr>
                <td className="px-2.5 pb-0 pt-1.5"><span className={laneBadgeClass(row.lane)}>{LANE[row.lane].label}</span></td>
                <td className="data truncate px-2.5 pb-0 pt-1.5 text-[#13261f]">{row.account}</td>
                <td className="truncate px-2.5 pb-0 pt-1.5 text-[#385249]">{row.contact}</td>
                <td className="data px-2.5 pb-0 pt-1.5 text-[#385249]">{row.tier}</td>
                <td className="truncate px-2.5 pb-0 pt-1.5 text-[#385249]">{row.category}</td>
                <td className="data px-2.5 pb-0 pt-1.5 text-[#385249]">{row.ageLabel}</td>
                {/* Under a minute takes the escalate colour. Nothing else in the row changes. */}
                <td className={`data px-2.5 pb-0 pt-1.5 ${row.slaUrgent ? "lane-ink-escalate" : "text-[#385249]"}`}>{row.slaLabel}</td>
                {/* Confidence is last, small and muted. It can only make routing
                    stricter, never looser, so it never leads the row. */}
                <td className="data px-2.5 pb-0 pt-1.5 text-[11px] text-[#8a968f]">{row.confidence === null ? "--" : row.confidence.toFixed(2)}</td>
              </tr>
              <tr>
                <td colSpan={COLUMNS.length} className="truncate pb-1.5 pr-2.5 pt-0.5 text-[11px] leading-[1.3] text-[#67746e]" style={{ paddingLeft: "11.5%" }}>
                  {row.reason}
                </td>
              </tr>
            </tbody>
          ))}
        </table>
      </div>

      <p className="mt-3 text-[11px] text-[#8a968f]">
        Arrow keys move the selection, Enter opens the packet.
      </p>
    </section>
  );
}
