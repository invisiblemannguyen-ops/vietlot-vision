import { Ticket } from "lucide-react";
import { REGION_LABELS } from "@/lib/constants";

export type RegionId = "MB" | "MT" | "MN";

interface SidebarProps {
  selectedRegion: RegionId;
  onSelectRegion: (region: RegionId) => void;
}

export function Sidebar({ selectedRegion, onSelectRegion }: SidebarProps) {
  const regions: RegionId[] = ["MB", "MT", "MN"];

  return (
    <aside className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-white/5 bg-ink-900/90 backdrop-blur-xl">
      {/* Header tối giản */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-400 text-slate-950 shadow-md shadow-sky-500/20">
          <Ticket className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold text-white">Vietlot Vision</p>
          <p className="text-[11px] text-slate-400">Dự Đoán Xổ Số 3 Miền</p>
        </div>
      </div>

      {/* Menu dọc 3 Miền */}
      <div className="p-3">
        <p className="px-2 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          Danh Mục Miền
        </p>
        <div className="flex md:flex-col gap-1.5 mt-1 overflow-x-auto">
          {regions.map((reg) => {
            const isActive = selectedRegion === reg;
            return (
              <button
                key={reg}
                onClick={() => onSelectRegion(reg)}
                className={`flex-1 md:flex-initial flex items-center justify-between rounded-xl px-4 py-3 text-sm font-bold transition-all ${
                  isActive
                    ? "bg-gradient-to-r from-sky-500/25 to-cyan-500/15 text-sky-300 border-l-4 border-sky-400 shadow-md"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200 border-l-4 border-transparent"
                }`}
              >
                <span>XỔ SỐ {REGION_LABELS[reg] || reg}</span>
                {isActive && (
                  <span className="hidden md:inline-block h-2 w-2 rounded-full bg-sky-400 pulse-ring" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}