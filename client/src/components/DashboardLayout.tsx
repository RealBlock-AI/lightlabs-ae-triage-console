import { Activity, BarChart3, BookOpenText, PlugZap, ShieldCheck, UsersRound, Waypoints } from "lucide-react";
import { useLocation } from "wouter";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const items = [{ icon: Activity, label: "AE Queue", path: "/" }, { icon: PlugZap, label: "HubSpot", path: "/integrations/hubspot" }, { icon: UsersRound, label: "Contact Mapping", path: "/integrations/mapping" }, { icon: Waypoints, label: "Slack Connections", path: "/connections/slack" }, { icon: BookOpenText, label: "Knowledge", path: "/knowledge" }, { icon: BarChart3, label: "Capacity", path: "/capacity" }];
  return <div className="min-h-screen bg-[#f6f7f1] text-[#13261f] md:grid md:grid-cols-[236px_1fr]">
    <aside className="border-b border-[#d6ded7] bg-[#103326] px-4 py-5 text-[#eff8f1] md:min-h-screen md:border-b-0 md:border-r">
      <button onClick={() => setLocation("/")} className="flex items-center gap-3 text-left"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#9ee3bd] text-[#103326]"><ShieldCheck size={20}/></span><span><span className="block text-[11px] font-black tracking-[0.18em] text-[#9ee3bd]">LIGHT LABS</span><span className="block text-sm font-semibold">AE TRIAGE CONSOLE</span></span></button>
      <nav className="mt-8 flex gap-2 overflow-x-auto md:block md:space-y-1">{items.map(item => { const active = location === item.path; return <button key={item.path} onClick={() => setLocation(item.path)} className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${active ? "bg-[#e6f7eb] font-semibold text-[#0d412e]" : "text-[#c4d9ca] hover:bg-white/10 hover:text-white"}`}><item.icon size={17}/>{item.label}</button> })}</nav>
      <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-3 text-xs leading-5 text-[#b5cfbd] md:mt-auto"><b className="block text-[#e6f7eb]">Safety invariant</b>Confidence can only demote a lane. It never promotes a response to sendable.</div>
    </aside>
    <main className="min-w-0">{children}</main>
  </div>;
}
