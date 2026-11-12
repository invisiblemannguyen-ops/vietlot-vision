import { useState } from "react";
import { Sidebar, type RegionId } from "@/components/Sidebar";
import { useAppData } from "@/hooks/useAppData";
import { FullPageLoader } from "@/components/Feedback";
import type { LotteryStation } from "@/lib/supabase";
import { REGION_LABELS } from "@/lib/constants";
import {
  ArrowLeft,
  ChevronRight,
  Eye,
  Home,
  Award,
  Sparkles,
  Calendar,
} from "lucide-react";

// 5 danh mục dự đoán bị che mờ
const PREDICTION_TYPES = [
  { id: "bao_2", title: "Bao Lô 2 Số", mockNums: "48 - 92 - 15" },
  { id: "bao_3", title: "Bao Lô 3 Số", mockNums: "348 - 792 - 115" },
  { id: "xien_truot", title: "Xiên Trượt", mockNums: "04, 18, 32, 79" },
  { id: "dau_duoi", title: "Đầu Đuôi", mockNums: "Đầu 4 - Đuôi 8" },
  { id: "doc_dac", title: "Giải Đặc Biệt (Độc Đắc)", mockNums: "58294" },
];

function App() {
  const [selectedRegion, setSelectedRegion] = useState<RegionId>("MT");
  const [selectedStation, setSelectedStation] = useState<LotteryStation | null>(null);
  
  // Tab chính ở dưới: "home" (Trang Chủ) hoặc "results" (Kết Quả)
  const [activeTab, setActiveTab] = useState<"home" | "results">("home");

  // Trạng thái mở khóa khi bấm chữ "Xem"
  const [unlockedItems, setUnlockedItems] = useState<Record<string, boolean>>({});

  const app = useAppData();

  const handleSelectRegion = (reg: RegionId) => {
    setSelectedRegion(reg);
    setSelectedStation(null); // Trở về danh sách đài khi đổi miền
  };

  const handleUnlock = (typeId: string) => {
    setUnlockedItems((prev) => ({ ...prev, [typeId]: true }));
  };

  if (app.loading) return <FullPageLoader label="Đang kết nối cơ sở dữ liệu..." />;

  // Lọc đài thuộc miền đang chọn
  const stationsInRegion = app.stations.filter((s) => s.region === selectedRegion);

  return (
    <div className="flex flex-col md:flex-row h-screen w-screen overflow-hidden bg-ink-950 text-slate-100">
      {/* Sidebar 3 Miền */}
      <Sidebar
        selectedRegion={selectedRegion}
        onSelectRegion={handleSelectRegion}
      />

      {/* Khung nội dung chính */}
      <main className="flex flex-1 flex-col overflow-hidden relative">
        {/* Vùng cuộn nội dung */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24">
          <div className="mx-auto w-full max-w-3xl space-y-5">

            {/* TAB 1: TRANG CHỦ */}
            {activeTab === "home" && (
              <>
                {/* BƯỚC 1: Danh sách các đài hôm nay (Hàng dọc) */}
                {!selectedStation ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-white/5 pb-3">
                      <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
                        ĐÀI MỞ THƯỞNG HÔM NAY - {REGION_LABELS[selectedRegion]}
                      </h2>
                      <span className="text-xs text-slate-400">Chọn đài để xem dự đoán</span>
                    </div>

                    <div className="flex flex-col gap-3">
                      {stationsInRegion.map((st) => (
                        <button
                          key={st.id}
                          onClick={() => setSelectedStation(st)}
                          className="group flex items-center justify-between rounded-2xl border border-white/10 bg-gradient-to-r from-slate-900/80 to-slate-900/40 p-4 text-left transition-all hover:border-sky-400/50 hover:bg-sky-500/10 hover:shadow-lg shadow-sm"
                        >
                          <div className="flex items-center gap-4">
                            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300 font-bold text-sm border border-sky-400/20">
                              {st.region}
                            </div>
                            <div>
                              <h3 className="text-base font-bold text-white group-hover:text-sky-300">
                                {st.name}
                              </h3>
                              <p className="text-xs text-slate-400 mt-0.5">
                                Giờ quay: 17:15 · Mở thưởng hôm nay
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 text-xs text-sky-400 font-medium bg-sky-500/10 px-3 py-1.5 rounded-xl border border-sky-400/20">
                            <span>Xem dự đoán</span>
                            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* BƯỚC 2: Màn hình dự đoán đài bị che mờ với nút "Xem" */
                  <div className="space-y-5">
                    <div className="flex items-center justify-between border-b border-white/5 pb-3">
                      <button
                        onClick={() => setSelectedStation(null)}
                        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white transition"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        <span>Chọn đài khác</span>
                      </button>

                      <div className="text-right">
                        <h2 className="text-base font-bold text-white">{selectedStation.name}</h2>
                        <p className="text-xs text-sky-400">{REGION_LABELS[selectedStation.region]}</p>
                      </div>
                    </div>

                    {/* Danh sách 5 mục dự đoán */}
                    <div className="space-y-3.5">
                      {PREDICTION_TYPES.map((item) => {
                        const isUnlocked = unlockedItems[item.id];

                        return (
                          <div
                            key={item.id}
                            className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 p-4.5 backdrop-blur-md"
                          >
                            <div className="flex items-center justify-between mb-2.5">
                              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-sky-400" />
                                {item.title}
                              </h3>
                              {isUnlocked && (
                                <span className="text-xs text-emerald-400 font-medium">
                                  ✓ Đã hiển thị
                                </span>
                              )}
                            </div>

                            {/* Vùng che mờ + Nút "Xem" */}
                            <div className="relative flex items-center justify-center rounded-xl bg-ink-950/90 py-5 px-4 border border-white/5">
                              <div
                                className={`text-lg sm:text-xl font-mono font-bold tracking-wider transition-all duration-300 ${
                                  isUnlocked
                                    ? "text-sky-300 blur-none select-text"
                                    : "text-slate-600 blur-md select-none pointer-events-none"
                                }`}
                              >
                                {item.mockNums}
                              </div>

                              {!isUnlocked && (
                                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40 backdrop-blur-[3px] rounded-xl">
                                  <button
                                    onClick={() => handleUnlock(item.id)}
                                    className="flex items-center gap-2 rounded-xl bg-sky-500 hover:bg-sky-400 px-5 py-2 text-xs font-bold text-slate-950 shadow-md shadow-sky-500/30 active:scale-95 transition"
                                  >
                                    <Eye className="h-4 w-4" />
                                    <span>Xem</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* TAB 2: KẾT QUẢ XỔ SỐ HÔM NAY */}
            {activeTab === "results" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-sky-400" />
                    KẾT QUẢ XỔ SỐ HÔM NAY - {REGION_LABELS[selectedRegion]}
                  </h2>
                  <span className="text-xs text-emerald-400 font-medium">Đã cập nhật</span>
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5 space-y-4">
                  <div className="text-center pb-3 border-b border-white/5">
                    <h3 className="text-lg font-bold text-sky-300">
                      {selectedStation ? selectedStation.name : stationsInRegion[0]?.name || "Đài Mở Thưởng"}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">Kết quả mở thưởng hôm nay</p>
                  </div>

                  {/* Bảng Kết quả mẫu */}
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <span className="font-bold text-amber-300">Đặc Biệt</span>
                      <span className="font-mono font-bold text-lg text-amber-200">58294</span>
                    </div>
                    <div className="flex justify-between items-center p-2.5 rounded-lg bg-white/5">
                      <span className="text-slate-400">Giải Nhất</span>
                      <span className="font-mono font-semibold text-white">49102</span>
                    </div>
                    <div className="flex justify-between items-center p-2.5 rounded-lg bg-white/5">
                      <span className="text-slate-400">Giải Nhì</span>
                      <span className="font-mono font-semibold text-white">73819 - 84920</span>
                    </div>
                    <div className="flex justify-between items-center p-2.5 rounded-lg bg-white/5">
                      <span className="text-slate-400">Giải Ba</span>
                      <span className="font-mono font-semibold text-white">10293 - 48291 - 39102</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Thanh 2 Tab chuyển đổi nằm dưới cùng (Bottom Navigation) */}
        <div className="absolute bottom-0 inset-x-0 bg-ink-900/95 border-t border-white/10 backdrop-blur-xl px-6 py-2.5 flex justify-around items-center z-20">
          <button
            onClick={() => setActiveTab("home")}
            className={`flex flex-col items-center gap-1 text-xs font-bold transition ${
              activeTab === "home" ? "text-sky-400" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Home className="h-5 w-5" />
            <span>Trang Chủ</span>
          </button>

          <button
            onClick={() => setActiveTab("results")}
            className={`flex flex-col items-center gap-1 text-xs font-bold transition ${
              activeTab === "results" ? "text-sky-400" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Award className="h-5 w-5" />
            <span>Kết Quả</span>
          </button>
        </div>
      </main>
    </div>
  );
}

export default App;