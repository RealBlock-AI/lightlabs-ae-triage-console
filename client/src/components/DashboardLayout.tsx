import { Activity, BarChart3, ClipboardCheck, GitMerge, Moon, PlugZap, ShieldCheck, SlidersHorizontal, Sun, TrendingUp } from "lucide-react";
import { useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const items = [{ icon: Activity, label: "Queue", path: "/" }, { icon: SlidersHorizontal, label: "Policy", path: "/policy" }, { icon: TrendingUp, label: "Capacity", path: "/capacity" }, { icon: GitMerge, label: "Account Mapping", path: "/mappings" }, { icon: ClipboardCheck, label: "Binding Review", path: "/bindings" }, { icon: BarChart3, label: "Support Performance", path: "/performance" }, { icon: PlugZap, label: "Integrations", path: "/integrations" }];
  return <div className="min-h-screen bg-page text-ink-strong md:grid md:grid-cols-[236px_1fr]">
    <aside className="border-b border-line bg-nav px-4 py-5 text-nav-ink-strong md:min-h-screen md:border-b-0 md:border-r">
      <button onClick={() => setLocation("/")} className="flex items-center gap-3 text-left"><span className="grid h-9 w-9 place-items-center rounded-xl bg-nav-accent text-nav"><ShieldCheck size={20}/></span><span><span className="block text-[11px] font-black tracking-[0.18em] text-nav-accent">LIGHT LABS</span><span className="block text-sm font-semibold">SUPPORT OPERATIONS</span></span></button>
      <nav className="mt-6 grid grid-cols-2 gap-2 md:mt-8 md:block md:space-y-1">{items.map(item => { const active = location === item.path; return <button key={item.path} onClick={() => setLocation(item.path)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition md:gap-3 ${active ? "bg-nav-active font-semibold text-nav-active-ink" : "text-nav-ink hover:bg-white/10 hover:text-white"}`}><item.icon className="shrink-0" size={17}/><span>{item.label}</span></button> })}</nav>
      <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-3 text-xs leading-5 text-nav-quiet md:mt-auto"><b className="block text-nav-ink-strong">Support boundary</b>Slack is the prototype input channel. Email is contextual only and never enters the automated queue.</div>
      {toggleTheme ? <button onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-nav-ink transition hover:bg-white/10 hover:text-white md:gap-3">{theme === "dark" ? <Sun className="shrink-0" size={17}/> : <Moon className="shrink-0" size={17}/>}<span>{theme === "dark" ? "Light theme" : "Dark theme"}</span></button> : null}
    </aside>
    <main className="min-w-0">{children}</main>
  </div>;
}
