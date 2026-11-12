import { Ticket, MapPin } from "lucide-react";

export type RegionId = "MB" | "MT" | "MN";

interface SidebarProps {
  selectedRegion: RegionId;
  onSelectRegion: (region: RegionId) => void;
}

export function Sidebar({ selectedRegion, onSelectRegion }: SidebarProps) {
  const regions: { id: RegionId; label: string }[] = [
    { id: "MB", label: "XỔ SỐ MIỀN BẮC" },
    { id: "MT", label: "XỔ SỐ MIỀN TRUNG" },
    { id: "MN", label: "XỔ SỐ MIỀN NAM" },
  ];

  return (
    <aside className="w-24 sm:w-28 md:w-32 shrink-0 h-full border-r border-white/10 bg-ink-900/95 backdrop-blur-xl flex flex-col p-2 sm:p-3 overflow-y-auto">
      {/* Top Header Logo */}
      <div className="flex flex-col items-center gap-1 py-2 mb-3 border-b border-white/5 text-center">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-400 text-slate-950 shadow-md shadow-sky-500/20">
          <Ticket className="h-5 w-5" />
        </div>
        <div className="flex flex-col items-center gap-1 mt-1">
  <span className="text-amber-300 text-xs font-black bg-gradient-to-r from-rose-600 to-amber-500 px-2 py-0.5 rounded-md border border-amber-400/50 shadow-md">
    AI
  </span>
  <span className="text-[10px] font-bold text-slate-100 leading-tight">
    Soi Cầu 3 Miền
  </span>
</div>
      </div>

      {/* Cột nút 3 Miền dạng thẻ dọc chuẩn v3 */}
      <div className="flex flex-col gap-2.5 flex-1">
        {regions.map((reg) => {
          const isActive = selectedRegion === reg.id;
          return (
            <button
              key={reg.id}
              onClick={() => onSelectRegion(reg.id)}
              className={`flex flex-col items-center justify-center gap-2 rounded-2xl p-2.5 transition-all text-center border ${
                isActive
                  ? "bg-gradient-to-b from-sky-500/30 to-cyan-500/15 border-sky-400 text-sky-300 shadow-md shadow-sky-500/20"
                  : "bg-white/5 border-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
              }`}
            >
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                  isActive
                    ? "bg-sky-400 text-slate-950 font-bold"
                    : "bg-white/10 text-slate-300"
                }`}
              >
                <MapPin className="h-4.5 w-4.5" />
              </div>
              <span className="text-[10px] sm:text-[11px] font-bold leading-tight">
                {reg.label}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}