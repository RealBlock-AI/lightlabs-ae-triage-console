import { Activity, BarChart3, GitMerge, PlugZap, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const items = [{ icon: Activity, label: "Slack Support", path: "/" }, { icon: GitMerge, label: "Account Mapping", path: "/mappings" }, { icon: BarChart3, label: "Support Performance", path: "/performance" }, { icon: PlugZap, label: "Integrations", path: "/integrations" }];
  return <div className="min-h-screen bg-[#f6f7f1] text-[#13261f] md:grid md:grid-cols-[236px_1fr]">
    <aside className="border-b border-[#d6ded7] bg-[#103326] px-4 py-5 text-[#eff8f1] md:min-h-screen md:border-b-0 md:border-r">
      <button onClick={() => setLocation("/")} className="flex items-center gap-3 text-left"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#9ee3bd] text-[#103326]"><ShieldCheck size={20}/></span><span><span className="block text-[11px] font-black tracking-[0.18em] text-[#9ee3bd]">LIGHT LABS</span><span className="block text-sm font-semibold">SUPPORT OPERATIONS</span></span></button>
      <nav className="mt-6 grid grid-cols-2 gap-2 md:mt-8 md:block md:space-y-1">{items.map(item => { const active = location === item.path; return <button key={item.path} onClick={() => setLocation(item.path)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition md:gap-3 ${active ? "bg-[#e6f7eb] font-semibold text-[#0d412e]" : "text-[#c4d9ca] hover:bg-white/10 hover:text-white"}`}><item.icon className="shrink-0" size={17}/><span>{item.label}</span></button> })}</nav>
      <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-3 text-xs leading-5 text-[#b5cfbd] md:mt-auto"><b className="block text-[#e6f7eb]">Support boundary</b>Slack is the prototype input channel. Email is contextual only and never enters the automated queue.</div>
    </aside>
    <main className="min-w-0">{children}</main>
  </div>;
}
