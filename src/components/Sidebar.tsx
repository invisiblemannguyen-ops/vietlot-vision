import { useState } from "react";
import { MapPin, Heart, X } from "lucide-react";

export type RegionId = "MB" | "MT" | "MN";

interface SidebarProps {
  selectedRegion: RegionId;
  onSelectRegion: (region: RegionId) => void;
}

export function Sidebar({ selectedRegion, onSelectRegion }: SidebarProps) {
  const [showQrModal, setShowQrModal] = useState(false);

  const regions: { id: RegionId; label: string }[] = [
    { id: "MB", label: "XỔ SỐ MIỀN BẮC" },
    { id: "MT", label: "XỔ SỐ MIỀN TRUNG" },
    { id: "MN", label: "XỔ SỐ MIỀN NAM" },
  ];

  return (
    <>
      <aside className="w-24 sm:w-28 md:w-32 shrink-0 h-full border-r border-white/10 bg-slate-900/95 backdrop-blur-xl flex flex-col justify-between p-2 sm:p-3 overflow-y-auto">
        <div>
          {/* Top Header Logo - Đã bỏ hình vé cược, giữ nguyên Badge AI chuẩn */}
          <div className="flex flex-col items-center justify-center gap-1 py-2 mb-3 border-b border-white/5 text-center">
            <span className="text-amber-300 text-xs sm:text-sm font-black bg-gradient-to-r from-rose-600 to-amber-500 px-2.5 py-0.5 rounded-md border border-amber-400/50 shadow-md">
              AI
            </span>
            <span className="text-[10px] font-bold text-slate-100 leading-tight">
              Soi Cầu 3 Miền
            </span>
          </div>

          {/* Cột nút 3 Miền dạng thẻ dọc */}
          <div className="flex flex-col gap-2.5">
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
                    className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                      isActive
                        ? "bg-sky-400 text-slate-950 font-bold"
                        : "bg-white/10 text-slate-300"
                    }`}
                  >
                    <MapPin className="h-4 w-4" />
                  </div>
                  <span className="text-[10px] sm:text-[11px] font-bold leading-tight">
                    {reg.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Nút Ủng Hộ Cà Phê ở cuối Sidebar */}
        <div className="pt-2 border-t border-white/5 mt-2">
          <button
            onClick={() => setShowQrModal(true)}
            className="w-full flex flex-col items-center justify-center gap-1 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 p-2 text-amber-300 transition active:scale-95 shadow-sm"
          >
            <Heart className="h-4 w-4 text-rose-400 fill-rose-400/40 animate-pulse" />
            <span className="text-[10px] font-extrabold text-amber-300 leading-tight">
              Ủng hộ ☕
            </span>
          </button>
        </div>
      </aside>

      {/* Pop-up Modal hiển thị mã QR Ủng hộ */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-xs rounded-2xl border border-white/15 bg-slate-900 p-5 shadow-2xl text-center space-y-3">
            {/* Nút đóng */}
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-3 right-3 p-1 text-slate-400 hover:text-white rounded-lg bg-white/5 hover:bg-white/10 transition"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Tiêu đề & Lời nhắn */}
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white flex items-center justify-center gap-1.5">
                <Heart className="h-4 w-4 text-rose-500 fill-rose-500" />
                Ủng Hộ Đội Ngũ Phát Triển
              </h3>
              <p className="text-[11px] text-slate-300 leading-relaxed px-1">
                Nếu <span className="text-amber-300 font-bold">AI Soi Cầu 3 Miền</span> mang lại may mắn và hữu ích cho bạn, hãy mời đội ngũ 1 ly cà phê ☕ để duy trì máy chủ nhé!
              </p>
            </div>

            {/* Mã QR (Thay link ảnh QR ngân hàng / MoMo của bạn vào đây) */}
            <div className="flex justify-center py-1">
              <div className="p-2 bg-white rounded-xl shadow-md border border-slate-700">
                <img
                  src="[suspicious link removed]"
                  alt="Mã QR Ủng hộ"
                  className="w-40 h-40 object-contain rounded-lg"
                />
              </div>
            </div>

            <p className="text-[10px] text-slate-400">
              Cảm ơn sự đồng hành và ủng hộ của bạn! ❤️
            </p>
          </div>
        </div>
      )}
    </>
  );
}
