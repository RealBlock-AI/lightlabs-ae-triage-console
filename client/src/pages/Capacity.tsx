import { trpc } from "@/lib/trpc";
import { Activity, Gauge, Sigma } from "lucide-react";
import HubSpotConnectionCard from "@/components/HubSpotConnectionCard";

const pct = (value: number) => `${Math.round(value * 100)}%`;

export default function Capacity() {
  const { data, isLoading } = trpc.triage.capacity.useQuery();
  if (isLoading || !data) return <div className="p-10 text-sm text-[#557066]">Loading capacity instrumentation…</div>;
  return <section className="mx-auto max-w-7xl p-5 md:p-10">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold tracking-[.16em] text-[#517263]">INSTRUMENTED OPERATIONS</p><h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight">Capacity, without the theatre</h1><p className="mt-3 max-w-2xl text-[#60766c]">The triage engine makes operational work observable. It does not turn uncertain scientific or regulatory judgment into a metric.</p></div><span className="rounded-full bg-[#fff2cf] px-3 py-1 text-xs font-bold text-[#785500]">{data.assumptionLabel}</span></header>
    <div className="mt-8 grid gap-4 sm:grid-cols-3"><Metric icon={<Activity size={18}/>} label="Auto-lane share" value={pct(data.mix.auto)}/><Metric icon={<Gauge size={18}/>} label="Assisted-lane share" value={pct(data.mix.assisted)}/><Metric icon={<Sigma size={18}/>} label="Triage-only multiple" value={`${data.triageMultiple.toFixed(1)}×`}/></div>
    <div className="mt-5"><HubSpotConnectionCard /></div>
    <section className="panel mt-5"><h2>Assumption-based handling model</h2><p className="mt-1 text-sm text-[#60766c]">Replace these figures with observed shadow-mode handling time before planning capacity or staffing changes.</p><table className="mt-5 w-full text-sm"><tbody><tr><th>Interactions recorded</th><td>{data.total}</td></tr><tr><th>Research minutes before triage</th><td>{data.before.toFixed(1)}</td></tr><tr><th>Minutes after triage</th><td>{data.after.toFixed(1)}</td></tr><tr><th>Target weighted account units</th><td>300 <span className="ml-2 text-xs text-[#60766c]">assumption-based</span></td></tr></tbody></table></section>
    <section className="panel mt-5"><h2>Learning loop</h2>{data.feedback.length ? <table className="mt-5 w-full text-sm"><thead><tr><th>Category</th><th>Mean edit ratio</th><th>Reviewed sends</th></tr></thead><tbody>{data.feedback.map(item => <tr key={item.category}><td>{item.category}</td><td>{pct(item.ratio)}</td><td>{item.count}</td></tr>)}</tbody></table> : <p className="mt-4 text-sm text-[#60766c]">No reviewed sends yet. This will become evidence for a human policy review; it never promotes a category automatically.</p>}</section>
  </section>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="rounded-2xl border border-[#d6ded7] bg-white p-5 shadow-[0_1px_0_rgba(0,0,0,.02)]"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#e7f6eb] text-[#176344]">{icon}</span><p className="mt-5 text-xs font-bold uppercase tracking-[.12em] text-[#60766c]">{label}</p><p className="mt-1 font-serif text-4xl font-semibold">{value}</p></div>; }
