import Verdict from "@/components/Verdict";
import { LANE, laneBadgeClass, type Lane } from "@/lib/lane";
import { ackClock } from "@shared/clock";
import { trpc } from "@/lib/trpc";
import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";

/**
 * Screen 2 - the decision packet.
 *
 * One customer question and everything needed to act on it, with no second tab.
 * Two equal columns: the left answers which lane and why, the right answers
 * what do I do. Nothing important sits below the fold on a laptop.
 */

type EvidenceEntry = { label: string; value: string; source: string; citable: boolean; advisory?: boolean; refusalCode?: string };

/**
 * Three flag states that must never be confusable.
 *
 * A FINDING is a refusal or an advisory, and it is styled as a result with the
 * same care as a successful answer - never greyed out, never an error, never an
 * empty state. Refusing to answer is something the system did, not something
 * that went wrong.
 */
function flagFor(entry: EvidenceEntry) {
  if (entry.citable) return { label: "citable", badge: "lane-auto", rule: "var(--lane-auto-line)" };
  if (entry.refusalCode || entry.advisory) return { label: "finding", badge: "lane-assisted", rule: "var(--lane-assisted-line)" };
  return { label: "not citable", badge: "lane-escalate", rule: "var(--lane-escalate-line)" };
}

const ACTIONS: Record<Lane, { primary: string; action: "send" | "override" }> = {
  auto: { primary: "Send", action: "send" },
  assisted: { primary: "Review and send", action: "send" },
  escalate: { primary: "Override + reason", action: "override" },
};

const GLYPH: Record<string, string> = { pass: "✓", stop: "✕", not_reached: "–" };

export default function PrototypeInteraction() {
  const [, params] = useRoute("/interactions/:id");
  const [, navigate] = useLocation();
  const id = params?.id ?? "";
  const utils = trpc.useUtils();
  const itemQuery = trpc.prototype.item.useQuery({ id }, { enabled: Boolean(id) });
  const item = itemQuery.data;

  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  // Two actions need words before they can happen. One panel serves both.
  const [composing, setComposing] = useState<null | "override" | "ask_customer">(null);
  const [words, setWords] = useState("");
  // The acknowledgement clock is live, so it ticks.
  const [now, setNow] = useState(() => new Date());
  const loadedFor = useRef<string>("");

  const saveDraft = trpc.prototype.saveDraft.useMutation({
    onSuccess: () => { setDirty(false); utils.prototype.item.invalidate({ id }); },
    onError: error => toast.error(error.message),
  });
  const decide = trpc.prototype.decide.useMutation({
    onSuccess: () => { utils.prototype.item.invalidate({ id }); utils.prototype.queue.invalidate(); navigate("/"); },
    onError: error => toast.error(error.message),
  });

  // Load the stored draft once per interaction, so a refetch never overwrites
  // what the AE is in the middle of typing.
  useEffect(() => {
    if (item && loadedFor.current !== item.id) { loadedFor.current = item.id; setDraft(item.draft ?? ""); setDirty(false); }
  }, [item]);

  // Escape returns to the queue.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !composing) navigate("/"); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, composing]);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  if (itemQuery.isLoading) return <div className="p-8 text-[13px] text-[#60766c]">Loading the packet…</div>;
  if (!item) return (
    <section className="p-8">
      <button onClick={() => navigate("/")} className="data text-[12px] text-[#176344]">Back to the queue</button>
      <h1 className="mt-4 font-serif text-2xl font-semibold">That interaction was not found.</h1>
    </section>
  );

  const lane = item.lane as Lane;
  const evidence = (item.evidence ?? []) as EvidenceEntry[];
  const received = new Date(item.receivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const config = ACTIONS[lane];
  const paused = Boolean(item.pendingQuestion);
  const clock = ackClock(new Date(item.receivedAt), now);

  const run = (action: "send" | "ask_customer" | "resolve" | "override") => {
    // Both of these need words first, and neither can be submitted empty.
    if ((action === "override" || action === "ask_customer") && !words.trim()) { setComposing(action); return; }
    decide.mutate({
      id: item.id,
      action,
      sentText: draft,
      overrideReason: action === "override" ? words.trim() : undefined,
      question: action === "ask_customer" ? words.trim() : undefined,
    });
  };

  return (
    <section className="mx-auto max-w-6xl px-5 pb-10 md:px-8">
      {/* Header, sticky - the account, the lane and the clock stay with you. */}
      <header className="sticky top-0 z-20 -mx-5 mb-3 border-b border-[#2b3531] bg-[#e9ede8] px-5 pb-2 pt-3 md:-mx-8 md:px-8">
        <button onClick={() => navigate("/")} className="data mb-1.5 inline-flex items-center gap-1.5 text-[11px] text-[#3d4841] hover:text-[#176344]">
          <ArrowLeft size={13} /> queue <span className="text-[#8a968f]">· esc</span>
        </button>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-serif text-[22px] font-semibold leading-tight tracking-tight">{item.account}</h1>
          <span className={laneBadgeClass(lane)}>{LANE[lane].label}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center justify-between gap-2">
          <p className="data text-[11px] text-[#67746e]">
            {item.contact} · tier {item.tier} · {item.category} · received {received}
          </p>
          {/* The clock the AE watches, not the resolution target. It pauses
              outright while the customer has the question. */}
          {paused ? (
            <p className="data text-[11px] text-[#67746e]">sla paused · waiting on customer</p>
          ) : (
            <p className={`data text-[11px] ${clock.urgent ? "lane-ink-escalate" : "text-[#67746e]"}`}>sla {clock.label}</p>
          )}
        </div>
      </header>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Left column - which lane, and why. */}
        <div className="flex flex-col gap-3">
          {/* The only left-rail accent in the design: these are the customer's
              words, not ours. */}
          <article className="border border-dashed border-[#a3aea8] border-l-[3px] border-l-[#2b3531] bg-[#f4f6f2] px-3.5 py-3">
            <p className="data text-[10px] uppercase tracking-[.13em] text-[#8a968f]">Customer, verbatim</p>
            <p className="mt-1.5 text-[13px] italic leading-[1.55] text-[#28372f]">“{item.rawText}”</p>
          </article>

          {item.dualVerdict && <Verdict {...item.dualVerdict} />}

          <article className="border border-[#2b3531]">
            <p className="data border-b border-[#2b3531] bg-[#e9ede8] px-3.5 py-2 text-[10px] uppercase tracking-[.13em] text-[#3d4841]">
              Gate trace · read top to bottom
            </p>
            {item.gateTrace?.length ? (
              <ol>
                {item.gateTrace.map(row => (
                  <li
                    key={row.check}
                    className={`flex items-baseline gap-2.5 border-b border-dashed border-[#cfd8d2] px-3.5 py-1.5 last:border-b-0 ${
                      row.status === "stop" ? "lane-escalate" : row.status === "not_reached" ? "text-[#98a29d]" : "text-[#28372f]"
                    }`}
                  >
                    <span className="data w-[14px] shrink-0 text-[12px]">{GLYPH[row.status]}</span>
                    <span className="data flex-1 text-[12px]">{row.check}</span>
                    <span className="data text-[11px] opacity-70">{row.read}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="px-3.5 py-2.5 text-[12px] text-[#67746e]">
                This interaction predates the gate trace, so its checks were not recorded.
              </p>
            )}
          </article>
        </div>

        {/* Right column - what do I do. */}
        <div className="flex flex-col gap-3">
          <article className="border border-[#2b3531]">
            <p className="data border-b border-[#2b3531] bg-[#e9ede8] px-3.5 py-2 text-[10px] uppercase tracking-[.13em] text-[#3d4841]">Evidence</p>
            <div className="flex flex-col gap-2.5 px-3.5 py-3">
              {evidence.length ? evidence.map((entry, index) => {
                const flag = flagFor(entry);
                return (
                  <div key={index} className="border-l-2 pl-2.5" style={{ borderColor: flag.rule }}>
                    <p className="text-[12px] leading-[1.5] text-[#28372f]"><b className="font-semibold">{entry.label}.</b> {entry.value}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="data text-[10px] text-[#8a968f]">{entry.source}</span>
                      <span className={`lane-badge ${flag.badge}`}>{flag.label}</span>
                    </div>
                  </div>
                );
              }) : <p className="text-[12px] text-[#67746e]">No evidence was assembled for this interaction.</p>}
            </div>
          </article>

          <article className="border border-[#2b3531] px-3.5 py-3">
            <p className="data text-[10px] uppercase tracking-[.13em] text-[#8a968f]">Account posture</p>
            {/* gap-4, so the cells never butt together and read as one number. */}
            <div className="mt-2 flex flex-wrap gap-4">
              <Stat value={item.posture.openOrders} label="open orders" />
              <Stat value={item.posture.overdueOrders} label="overdue" />
              <Stat value={item.posture.openQuestions} label="open qs" />
              <Stat value={item.posture.hasLogin ? "yes" : "no"} label="has login" />
            </div>
          </article>

          <article className="border border-[#2b3531]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2b3531] bg-[#e9ede8] px-3.5 py-2">
              <p className="data text-[10px] uppercase tracking-[.13em] text-[#3d4841]">
                Draft — editable in place {dirty && <span className="lane-ink-escalate">· unsaved</span>}
              </p>
              {/* Kept adjacent to the number, always. This sentence is the
                  mechanism that stops confidence being read as the decision. */}
              <p className="data text-[10px] text-[#8a968f]">
                conf {item.confidence === null ? "--" : Number(item.confidence).toFixed(2)} · did not set this lane
              </p>
            </div>
            <textarea
              className="block min-h-[104px] w-full resize-y bg-transparent px-3.5 py-2.5 text-[13px] leading-[1.55] text-[#28372f] outline-none"
              value={draft}
              onChange={event => { setDraft(event.target.value); setDirty(true); }}
              onBlur={() => { if (dirty) saveDraft.mutate({ id: item.id, draft }); }}
              aria-label="Draft response"
            />
          </article>

          <div className="flex flex-wrap gap-2">
            <button className="action-primary !rounded-[5px] !py-2 !text-[12px]" disabled={decide.isPending} onClick={() => run(config.action)}>
              {config.primary}
            </button>
            <button className="action-secondary !rounded-[5px] !py-2 !text-[12px]" disabled={decide.isPending} onClick={() => run("ask_customer")}>
              Ask customer
            </button>
            <button className="action-secondary !rounded-[5px] !py-2 !text-[12px]" disabled={decide.isPending} onClick={() => run("resolve")}>
              Resolve
            </button>
          </div>

          {composing && (
            <article className={`${composing === "override" ? "lane-escalate" : "lane-assisted"} border px-3.5 py-3`}>
              <label className="data block text-[10px] uppercase tracking-[.13em]" htmlFor="compose">
                {composing === "override" ? "Override reason — required" : "Question for the customer — required"}
              </label>
              {composing === "ask_customer" && (
                <p className="mt-1 text-[11px] leading-[1.4] opacity-80">
                  This moves the question to a waiting state and pauses the acknowledgement clock.
                </p>
              )}
              <textarea
                id="compose"
                autoFocus
                className="mt-1.5 block min-h-[64px] w-full resize-y border border-current bg-white px-2.5 py-2 text-[12px] leading-[1.5] text-[#28372f] outline-none"
                value={words}
                onChange={event => setWords(event.target.value)}
                placeholder={composing === "override"
                  ? "Why are you overriding the lane the system chose?"
                  : "What do you need the customer to confirm?"}
              />
              <div className="mt-2 flex gap-2">
                <button
                  className="action-primary !rounded-[5px] !py-1.5 !text-[12px]"
                  disabled={!words.trim() || decide.isPending}
                  onClick={() => run(composing)}
                >
                  {composing === "override" ? "Record override" : "Send question"}
                </button>
                <button
                  className="action-secondary !rounded-[5px] !py-1.5 !text-[12px]"
                  onClick={() => { setComposing(null); setWords(""); }}
                >
                  Cancel
                </button>
              </div>
            </article>
          )}
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <p className="data text-[20px] leading-none text-[#13261f]">{value}</p>
      <p className="data mt-1 text-[10px] text-[#8a968f]">{label}</p>
    </div>
  );
}
