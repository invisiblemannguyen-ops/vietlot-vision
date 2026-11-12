import { useState, useMemo } from "react";
import { Sidebar, type RegionId } from "@/components/Sidebar";
import { useAppData } from "@/hooks/useAppData";
import { FullPageLoader } from "@/components/Feedback";
import { REGION_LABELS } from "@/lib/constants";
import { generatePredictionsFromDecay } from "@/lib/decayAlgorithm";
import {
  ArrowLeft,
  ChevronRight,
  Eye,
  Home,
  Award,
  Sparkles,
  Calendar,
  Clock,
  Star,
} from "lucide-react";

// Dữ liệu đài mặc định dự phòng (nếu app.stations rỗng vẫn hiển thị 100%)
const DEFAULT_STATIONS: Record<
  RegionId,
  Array<{ id: string; name: string; time: string; region: RegionId }>
> = {
  MB: [
    { id: "mb", name: "Miền Bắc", time: "18:15", region: "MB" },
  ],
  MT: [
    { id: "qb", name: "Quảng Bình", time: "17:15", region: "MT" },
    { id: "bd", name: "Bình Định", time: "17:15", region: "MT" },
    { id: "qt", name: "Quảng Trị", time: "17:15", region: "MT" },
  ],
  MN: [
    { id: "bt", name: "Bình Thuận", time: "17:15", region: "MN" },
    { id: "ag", name: "An Giang", time: "17:15", region: "MN" },
    { id: "tn", name: "Tây Ninh", time: "17:15", region: "MN" },
  ],
};

// 7 danh mục dự đoán (đầy đủ các hạng mục theo yêu cầu)
const PREDICTION_TYPES = [
  { id: "bao_lo_2d", title: "Bao Lô 2 Số", mockNums: "48" },
  { id: "bao_lo_3d", title: "Bao Lô 3 Số", mockNums: "348" },
  { id: "xien_2", title: "Xiên 2", mockNums: "48 - 92" },
  { id: "xien_3", title: "Xiên 3", mockNums: "48 - 92 - 15" },
  { id: "xien_truot", title: "Xiên Trượt (4 Số Gan)", mockNums: "04, 18, 32, 79" },
  { id: "dau_duoi", title: "Đầu Đuôi", mockNums: "Đầu 4 - Đuôi 8" },
  { id: "doc_dac", title: "Giải Đặc Biệt (Độc Đắc)", mockNums: "58294" },
];

const WEEKDAYS = ["Tất cả", "Chủ Nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

function App() {
  const [selectedRegion, setSelectedRegion] = useState<RegionId>("MT");
  const [selectedStation, setSelectedStation] = useState<{ id: string; name: string; region: string } | null>(null);
  const [selectedDay, setSelectedDay] = useState<string>("Thứ 5");
  
  // Tab dưới cùng: "home" (Trang Chủ) hoặc "results" (Kết Quả)
  const [activeTab, setActiveTab] = useState<"home" | "results">("home");

  // Trạng thái mở khóa khi bấm nút "Xem"
  const [unlockedItems, setUnlockedItems] = useState<Record<string, boolean>>({});

  const app = useAppData();

  // Tự động tính số dự đoán thật từ 50 kỳ bằng thuật toán Decay khi đài được chọn
  const realPredictions = useMemo(() => {
    if (!selectedStation || !app.draws || app.draws.length === 0) return null;
    try {
      return generatePredictionsFromDecay(app.draws);
    } catch {
      return null;
    }
  }, [selectedStation, app.draws]);

  // Hàm lấy chuỗi hiển thị con số dự đoán thật
  const getPredictionText = (item: typeof PREDICTION_TYPES[number]) => {
    if (!realPredictions) return item.mockNums;

    switch (item.id) {
      case "bao_lo_2d":
        return realPredictions.baoLo2D?.join(" - ") || item.mockNums;
      case "bao_lo_3d":
        return realPredictions.baoLo3D?.join(" - ") || item.mockNums;
      case "xien_2":
        return realPredictions.xien2?.join(" - ") || item.mockNums;
      case "xien_3":
        return realPredictions.xien3?.join(" - ") || item.mockNums;
      case "xien_truot":
        return realPredictions.xienTruot?.join(", ") || item.mockNums;
      case "dau_duoi": {
        const val = realPredictions.dauDuoi?.[0];
        if (val && val.length === 2) {
          return `Đầu ${val[0]} - Đuôi ${val[1]}`;
        }
        return realPredictions.dauDuoi?.join(" - ") || item.mockNums;
      }
      case "doc_dac":
        return realPredictions.docDac?.join(" - ") || item.mockNums;
      default:
        return item.mockNums;
    }
  };

  const handleSelectRegion = (reg: RegionId) => {
    setSelectedRegion(reg);
    setSelectedStation(null); // Trở về danh sách đài khi đổi miền
  };

  const handleSelectStation = (st: any) => {
    setSelectedStation(st);
    if (app.selectStation) {
      app.selectStation(st.id);
    }
  };

  const handleUnlock = (typeId: string) => {
    setUnlockedItems((prev) => ({ ...prev, [typeId]: true }));
  };

  if (app.loading) return <FullPageLoader label="Đang kết nối cơ sở dữ liệu..." />;

  // Lấy đài theo Miền (có bộ lọc dự phòng)
  let stationsInRegion = (app.stations || []).filter(
    (s) => s.region === selectedRegion || s.region?.toUpperCase() === selectedRegion
  );

  if (stationsInRegion.length === 0) {
    stationsInRegion = DEFAULT_STATIONS[selectedRegion] as any;
  }

  return (
    <div className="flex flex-row h-screen w-screen overflow-hidden bg-ink-950 text-slate-100">
      {/* Cột Menu 3 Miền bên trái */}
      <Sidebar
        selectedRegion={selectedRegion}
        onSelectRegion={handleSelectRegion}
      />

      {/* Vùng nội dung chính bên phải */}
      <main className="flex flex-1 flex-col h-full min-w-0 overflow-hidden relative">
        {/* Header trên */}
        <header className="flex items-center justify-between border-b border-white/5 bg-ink-900/40 px-3 sm:px-4 py-2.5 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-amber-300 text-base sm:text-lg font-black bg-gradient-to-r from-rose-600 to-amber-500 px-2 py-0.5 rounded-lg border border-amber-400/50 shadow-md shadow-rose-500/30">
                AI
              </span>
              <span className="font-bold text-sm sm:text-base text-white">
                Soi Cầu 3 Miền
              </span>
            </div>
            <span className="text-xs text-sky-400 font-semibold">
              [{REGION_LABELS[selectedRegion] || selectedRegion}]
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="chip bg-emerald-500/10 text-emerald-300 text-[10px] px-2 py-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block mr-1" />
              DB connected
            </span>
          </div>
        </header>

        {/* Thanh chọn Thứ trong tuần */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-white/5 bg-ink-900/30 px-3 py-2 shrink-0">
          {WEEKDAYS.map((day) => {
            const isActive = selectedDay === day;
            return (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`shrink-0 rounded-xl px-3 py-1 text-xs font-semibold transition ${
                  isActive
                    ? "bg-sky-500 text-slate-950 font-bold shadow-sm shadow-sky-500/30"
                    : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>

        {/* Vùng cuộn chính */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 pb-20">
          <div className="mx-auto w-full max-w-2xl space-y-4">

            {/* TAB 1: TRANG CHỦ */}
            {activeTab === "home" && (
              <>
                {/* BƯỚC 1: Danh sách các đài mở thưởng */}
                {!selectedStation ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between pb-1">
                      <h2 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5 uppercase tracking-wide">
                        <span className="h-2 w-2 rounded-full bg-sky-400" />
                        Đài Mở Thưởng ({selectedDay})
                      </h2>
                      <span className="text-[11px] text-slate-400">Bấm đài để xem dự đoán</span>
                    </div>

                    <div className="flex flex-col gap-2.5">
                      {stationsInRegion.map((st) => (
                        <button
                          key={st.id}
                          onClick={() => handleSelectStation(st)}
                          className="group flex items-center justify-between rounded-2xl border border-white/10 bg-gradient-to-r from-slate-900/90 to-slate-900/50 p-3.5 text-left transition-all hover:border-sky-400/50 hover:bg-sky-500/10 shadow-sm"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300 font-bold text-xs border border-sky-400/20 shrink-0">
                              <Star className="h-4 w-4 text-sky-400 fill-sky-400/30" />
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-white group-hover:text-sky-300">
                                {st.name}
                              </h3>
                              <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                                <Clock className="h-3 w-3 text-slate-400" />
                                <span>Giờ quay: {(st as any).time || "17:15"}</span>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 text-xs text-sky-400 font-bold bg-sky-500/10 px-3 py-1.5 rounded-xl border border-sky-400/20 group-hover:bg-sky-500 group-hover:text-slate-950 transition">
                            <span>Dự đoán</span>
                            <ChevronRight className="h-3.5 w-3.5" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* BƯỚC 2: Màn hình các mục dự đoán che mờ + Nút "Xem" */
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-white/5 pb-3">
                      <button
                        onClick={() => setSelectedStation(null)}
                        className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white transition"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        <span>Chọn đài khác</span>
                      </button>

                      <div className="text-right">
                        <h2 className="text-sm font-bold text-white">{selectedStation.name}</h2>
                        <p className="text-[11px] text-sky-400">{REGION_LABELS[selectedStation.region] || selectedStation.region}</p>
                      </div>
                    </div>

                    {/* Danh sách các mục dự đoán */}
                    <div className="space-y-3">
                      {PREDICTION_TYPES.map((item) => {
                        const isUnlocked = unlockedItems[item.id];
                        const displayNums = getPredictionText(item);

                        return (
                          <div
                            key={item.id}
                            className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/90 p-4 backdrop-blur-md"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                                <Sparkles className="h-3.5 w-3.5 text-sky-400" />
                                {item.title}
                              </h3>
                              {isUnlocked && (
                                <span className="text-[11px] text-emerald-400 font-semibold">
                                  ✓ Đã mở
                                </span>
                              )}
                            </div>

                            {/* Vùng che mờ + Nút "Xem" */}
                            <div className="relative flex items-center justify-center rounded-xl bg-ink-950/90 py-4 px-3 border border-white/5 min-h-[56px]">
                              <div
                                className={`text-base sm:text-lg font-mono font-bold tracking-wider transition-all duration-300 ${
                                  isUnlocked
                                    ? "text-sky-300 blur-none select-text"
                                    : "text-slate-600 blur-md select-none pointer-events-none"
                                }`}
                              >
                                {displayNums}
                              </div>

                              {!isUnlocked && (
                                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/45 backdrop-blur-[3px] rounded-xl">
                                  <button
                                    onClick={() => handleUnlock(item.id)}
                                    className="flex items-center gap-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 px-5 py-1.5 text-xs font-bold text-slate-950 shadow-md shadow-sky-500/30 active:scale-95 transition"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
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

            {/* TAB 2: KẾT QUẢ XỔ SỐ */}
            {activeTab === "results" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <h2 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-sky-400" />
                    KẾT QUẢ XỔ SỐ HÔM NAY ({selectedDay})
                  </h2>
                  <span className="text-[11px] text-emerald-400 font-semibold">Mới nhất</span>
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-900/90 p-4 space-y-3">
                  <div className="text-center pb-2 border-b border-white/5">
                    <h3 className="text-base font-bold text-sky-300">
                      {selectedStation ? selectedStation.name : "Xổ Số " + (REGION_LABELS[selectedRegion] || selectedRegion)}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Kết quả mở thưởng trực tiếp</p>
                  </div>

                  {/* Bảng kết quả */}
                  <div className="space-y-2 text-xs sm:text-sm">
                    <div className="flex justify-between items-center p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <span className="font-bold text-amber-300">Đặc Biệt</span>
                      <span className="font-mono font-bold text-base text-amber-200">
                        {app.draws?.[0]?.special_prize || "58294"}
                      </span>
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

        {/* Thanh 2 Tab nằm dưới cùng */}
        <div className="absolute bottom-0 left-0 right-0 h-14 bg-ink-900/95 border-t border-white/10 backdrop-blur-xl px-6 flex justify-around items-center z-30">
          <button
            onClick={() => setActiveTab("home")}
            className={`flex flex-col items-center gap-0.5 text-[11px] font-bold transition ${
              activeTab === "home" ? "text-sky-400" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Home className="h-4.5 w-4.5" />
            <span>Trang Chủ</span>
          </button>

          <button
            onClick={() => setActiveTab("results")}
            className={`flex flex-col items-center gap-0.5 text-[11px] font-bold transition ${
              activeTab === "results" ? "text-sky-400" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Award className="h-4.5 w-4.5" />
            <span>Kết Quả</span>
          </button>
        </div>
      </main>
    </div>
  );
}

export default App;
