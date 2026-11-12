import { TABS, type TabId } from "./nav";
import { Activity, Ticket } from "lucide-react";
import type { LotteryStation } from "@/lib/supabase";
import { REGION_LABELS, REGION_COLORS } from "@/lib/constants";

export function Sidebar({
  active,
  onTab,
  stations,
  selectedStation,
  onSelectStation,
}: {
  active: TabId;
  onTab: (id: TabId) => void;
  stations: LotteryStation[];
  selectedStation: LotteryStation | null;
  onSelectStation: (id: string) => void;
}) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-white/5 bg-ink-900/60 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-400 text-slate-950 shadow-lg shadow-sky-500/30">
          <Ticket className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold text-white">Vietlot Vision</p>
          <p className="text-[11px] text-slate-400">Lottery Analytics</p>
        </div>
      </div>

      <nav className="flex flex-col gap-1 px-3 py-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onTab(t.id)}
              className={`group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? "bg-gradient-to-r from-sky-500/15 to-transparent text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
              }`}
            >
              <Icon
                className={`h-4.5 w-4.5 transition-colors ${
                  isActive ? "text-sky-400" : "text-slate-500 group-hover:text-slate-300"
                }`}
              />
              {t.label}
              {isActive && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sky-400 pulse-ring" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto px-3 py-4">
        <p className="label mb-2 px-2">Station</p>
        <div className="flex flex-col gap-1">
          {stations.map((s) => {
            const isActive = selectedStation?.id === s.id;
            return (
              <button
                key={s.id}
                onClick={() => onSelectStation(s.id)}
                className={`flex items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                  isActive
                    ? "border border-sky-400/30 bg-sky-500/10 text-white"
                    : "border border-transparent text-slate-300 hover:bg-white/5"
                }`}
              >
                <span className="truncate">{s.name}</span>
                <span
                  className={`chip bg-white/5 text-[10px] ${REGION_COLORS[s.region]}`}
                >
                  {REGION_LABELS[s.region]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-3 py-2.5">
          <Activity className="h-4 w-4 text-emerald-400" />
          <p className="text-[11px] text-slate-400">
            Rolling 50-draw model · auto-tuned
          </p>
        </div>
      </div>
    </aside>
  );
}
