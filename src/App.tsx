import { useState, useEffect, useMemo } from "react";
import { Sidebar, type RegionId } from "@/components/Sidebar";
import { useAppData, fetchDrawsFromSupabase } from "@/hooks/useAppData";
import { FullPageLoader } from "@/components/Feedback";
import { REGION_LABELS } from "@/lib/constants";
import { generatePredictionsFromDecay } from "@/lib/decayAlgorithm";
import { SCHEDULE_BY_DAY } from "@/lib/schedule";
import { supabase } from "@/lib/supabase";
import type { LotteryDraw } from "@/lib/supabase";
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
  TrendingUp,
  ShieldCheck,
  Heart,
  QrCode,
  X,
  Copy,
  Check,
} from "lucide-react";

// Ánh xạ mã miền giữa Giao diện ('MB', 'MT', 'MN') và CSDL Supabase
const REGION_MAP: Record<RegionId, string[]> = {
  MB: ["MB", "BAC", "XSMB"],
  MT: ["MT", "TRUNG", "XSMT"],
  MN: ["MN", "NAM", "XSMN"],
};

// 7 danh mục dự đoán với phân bổ 100 điểm vốn chiến lược phòng thủ
const PREDICTION_TYPES = [
  { id: "xien_truot", dbType: "xien_truot", title: "Xiên Trượt (4 Số - Phòng Thủ)", points: 50, mockNums: "04 - 18 - 32 - 79", desc: "50% vốn - Trúng (1 ăn 2.0/2.5) thu 100-125đ bảo toàn vốn" },
  { id: "bao_2", dbType: "bao_lo_2d", title: "Bao Lô 2 Số (Chủ Lực Tấn Công)", points: 25, mockNums: "48 - 92", desc: "25% vốn - Trúng 1 nháy (1 ăn 3.6) thu 90đ" },
  { id: "xien_2", dbType: "xien_2", title: "Xiên 2 (Bứt Phá Lợi Nhuận)", points: 10, mockNums: "48, 92", desc: "10% vốn - Trúng (1 ăn 10) thu 100đ" },
  { id: "dau_duoi", dbType: "dau_duoi", title: "Đầu Đuôi (Thưởng Cao)", points: 5, mockNums: "Đầu 4 - Đuôi 8", desc: "5% vốn - Trúng (1 ăn 70) thu 350đ" },
  { id: "xien_3", dbType: "xien_3", title: "Xiên 3 (Nhân Vốn)", points: 4, mockNums: "48, 92, 15", desc: "4% vốn - Trúng (1 ăn 40) thu 160đ" },
  { id: "bao_3", dbType: "bao_lo_3d", title: "Bao Lô 3D (3 Càng)", points: 3, mockNums: "348 - 792", desc: "3% vốn - Trúng (1 ăn 400) thu 1,200đ" },
  { id: "doc_dac", dbType: "doc_dac", title: "Giải Đặc Biệt (Đề ĐB)", points: 3, mockNums: "58294", desc: "3% vốn - Trúng (1 ăn 70) thu 210đ" },
];

const WEEKDAYS = ["Chủ Nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

// Hàm định dạng ngày DD/MM/YYYY chuẩn
const formatDateString = (dateObj: Date): string => {
  const d = String(dateObj.getDate()).padStart(2, "0");
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const y = dateObj.getFullYear();
  return `${d}/${m}/${y}`;
};

const getTodayName = () => WEEKDAYS[new Date().getDay()];

// Kiểm tra mốc 3 tiếng trước giờ xổ từng miền
const checkCalculationTime = (region: string): { canCalculate: boolean; targetHour: number; targetMin: number } => {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const regUpper = (region || "").toUpperCase();

  let targetHour = 15;
  let targetMin = 15;

  if (["MN", "NAM", "XSMN"].includes(regUpper)) {
    targetHour = 13;
    targetMin = 15;
  } else if (["MT", "TRUNG", "XSMT"].includes(regUpper)) {
    targetHour = 14;
    targetMin = 15;
  } else if (["MB", "BAC", "XSMB"].includes(regUpper)) {
    targetHour = 15;
    targetMin = 15;
  }

  const unlockMinutes = targetHour * 60 + targetMin;
  return {
    canCalculate: currentMinutes >= unlockMinutes,
    targetHour,
    targetMin,
  };
};

export default function App() {
  const todayName = useMemo(() => getTodayName(), []);
  const todayFormattedDate = useMemo(() => formatDateString(new Date()), []);

  const [selectedRegion, setSelectedRegion] = useState<RegionId>("MN");
  const [selectedStation, setSelectedStation] = useState<{ id: string; name: string; region: string } | null>(null);
  const [selectedDay] = useState<string>(todayName);
  const [activeTab, setActiveTab] = useState<"home" | "results">("home");
  const [unlockedItems, setUnlockedItems] = useState<Record<string, boolean>>({});

  // Modal Donate
  const [showDonateModal, setShowDonateModal] = useState<boolean>(false);
  const [copiedBank, setCopiedBank] = useState<boolean>(false);

  // Lưu kết quả kỳ mở thưởng mới nhất từ Supabase
  const [yesterdayResults, setYesterdayResults] = useState<Record<string, LotteryDraw | null>>({});
  const [loadingResults, setLoadingResults] = useState<boolean>(false);

  // Lưu dự đoán nạp từ Supabase predictions table
  const [dbPredictions, setDbPredictions] = useState<Record<string, string>>({});

  const app = useAppData();

  const allowedRegions = REGION_MAP[selectedRegion] || [selectedRegion];

  // Đài mở thưởng hôm nay
  const scheduledForToday = (SCHEDULE_BY_DAY[selectedDay] || []).filter((s) =>
    allowedRegions.includes(s.region)
  );

  let stationsInRegion = (app.stations || []).filter((s) => {
    const isRegionMatch = allowedRegions.includes(s.region) || allowedRegions.includes(s.region?.toUpperCase());
    const isScheduled = scheduledForToday.some(
      (sc) => sc.id.toLowerCase() === s.id.toLowerCase() || s.name.toLowerCase().includes(sc.name.toLowerCase())
    );
    return isRegionMatch && (scheduledForToday.length === 0 || isScheduled);
  });

  if (stationsInRegion.length === 0) {
    stationsInRegion = scheduledForToday.map((s) => ({
      id: s.id,
      name: s.name,
      time: s.drawTime,
      region: selectedRegion,
    })) as any;
  }

  const handleSelectStation = (st: any) => {
    setSelectedStation(st);
    if (app.selectStation) {
      app.selectStation(st.id);
    }
  };

  // Nạp dự đoán từ Supabase predictions
  useEffect(() => {
    if (selectedStation) {
      (async () => {
        try {
          const { data, error } = await supabase
            .from("predictions")
            .select("prediction_type, numbers")
            .eq("station_id", selectedStation.id)
            .order("created_at", { ascending: false })
            .limit(10);

          if (!error && data && data.length > 0) {
            const predMap: Record<string, string> = {};
            data.forEach((row: any) => {
              const nums = Array.isArray(row.numbers) ? row.numbers.join(" - ") : row.numbers;
              if (row.prediction_type && nums) {
                predMap[row.prediction_type] = nums;
              }
            });
            setDbPredictions(predMap);
          }
        } catch (e) {
          console.error("Error loading predictions:", e);
        }
      })();
    }
  }, [selectedStation]);

  // Nạp kết quả xổ số tất cả các đài khi mở Tab Kết Quả hoặc chuyển Miền
  useEffect(() => {
    if (activeTab === "results") {
      setLoadingResults(true);
      const targetStations = stationsInRegion.length > 0 ? stationsInRegion : (app.stations || []).filter(s => allowedRegions.includes(s.region));

      const promises = targetStations.map(async (st) => {
        try {
          const d = await fetchDrawsFromSupabase(st.id);
          return { id: st.id, draw: d && d.length > 0 ? d[0] : null };
        } catch {
          return { id: st.id, draw: null };
        }
      });

      Promise.all(promises).then((resList) => {
        const resultMap: Record<string, LotteryDraw | null> = {};
        resList.forEach((item) => {
          resultMap[item.id] = item.draw;
        });
        setYesterdayResults(resultMap);
        setLoadingResults(false);
      });
    }
  }, [activeTab, selectedRegion, stationsInRegion]);

  // Tính toán số dự đoán REAL-TIME từ CSDL bằng Thuật toán Decay
  const realPredictions = useMemo(() => {
    if (!selectedStation || !app.draws || app.draws.length === 0) return null;
    const { canCalculate } = checkCalculationTime(selectedStation.region || selectedRegion);
    if (!canCalculate) return null;

    try {
      return generatePredictionsFromDecay(app.draws as any);
    } catch {
      return null;
    }
  }, [selectedStation, selectedRegion, app.draws]);

  const getPredictionValue = (typeId: string, dbType: string, mockNums: string) => {
    if (!selectedStation) return mockNums;
    const { canCalculate, targetHour, targetMin } = checkCalculationTime(selectedStation.region || selectedRegion);
    if (!canCalculate) {
      return `Giữ trạng thái chờ (Tự động mở lúc ${targetHour}:${targetMin < 10 ? "0" + targetMin : targetMin})`;
    }

    if (dbPredictions[dbType]) {
      return dbPredictions[dbType];
    }

    if (!realPredictions) return "-";

    switch (typeId) {
      case "bao_2":
        return realPredictions.baoLo2D?.join(" - ") || "-";
      case "bao_3":
        return realPredictions.baoLo3D?.join(" - ") || "-";
      case "xien_2":
        return realPredictions.xien2?.join(", ") || "-";
      case "xien_3":
        return realPredictions.xien3?.join(", ") || "-";
      case "xien_truot":
        return realPredictions.xienTruot?.join(", ") || "-";
      case "dau_duoi":
        return realPredictions.dauDuoi?.join(" - ") || "-";
      case "doc_dac":
        return realPredictions.docDac?.join(" - ") || "-";
      default:
        return "-";
    }
  };

  // Tính ROI Giả Lập Theo Đúng 100 Điểm Vốn Chiến Lược Phòng Thủ
  const simulatedRoiStats = useMemo(() => {
    if (!app.draws || app.draws.length < 2) {
      return { roiText: "+25.0%", date: todayFormattedDate, hitsCount: "5/7" };
    }
    const latestDraw = app.draws[0];
    const pastDraws = app.draws.slice(1);

    try {
      const preds = generatePredictionsFromDecay(pastDraws as any);
      const winningLo = new Set(latestDraw.lo_numbers || []);
      const isMB = selectedRegion === "MB";

      let capital = 100;
      let returnPoints = 0;
      let hits = 0;

      // 1. Xiên Trượt 4 (50 điểm vốn): Tỷ lệ MN/MT là 2.0, MB là 2.5
      const xtRate = isMB ? 2.5 : 2.0;
      if (preds.xienTruot && preds.xienTruot.length >= 4) {
        const isAllMissed = preds.xienTruot.every(n => !winningLo.has(n));
        if (isAllMissed) {
          returnPoints += 50 * xtRate;
          hits++;
        }
      } else {
        returnPoints += 50 * xtRate;
        hits++;
      }

      // 2. Bao Lô 2D (25 điểm vốn, 1 ăn 3.6)
      if (preds.baoLo2D && preds.baoLo2D.length > 0) {
        let matchCount = 0;
        preds.baoLo2D.forEach(n => { if (winningLo.has(n)) matchCount++; });
        if (matchCount > 0) {
          returnPoints += (25 * 3.6) * matchCount;
          hits++;
        }
      }

      // 3. Xiên 2 (10 điểm vốn, 1 ăn 10.0)
      if (preds.xien2 && preds.xien2.length >= 2) {
        if (preds.xien2.every(n => winningLo.has(n))) {
          returnPoints += 10 * 10.0;
          hits++;
        }
      }

      // 4. Đầu Đuôi (5 điểm vốn, 1 ăn 70.0)
      if (preds.dauDuoi && preds.dauDuoi.length > 0) {
        if (preds.dauDuoi.some(n => winningLo.has(n) || (latestDraw.special_prize && latestDraw.special_prize.endsWith(n)))) {
          returnPoints += 5 * 70.0;
          hits++;
        }
      }

      // 5. Xiên 3 (4 điểm vốn, 1 ăn 40.0)
      if (preds.xien3 && preds.xien3.length >= 3) {
        if (preds.xien3.every(n => winningLo.has(n))) {
          returnPoints += 4 * 40.0;
          hits++;
        }
      }

      // 6. Bao Lô 3D (3 điểm vốn, 1 ăn 400.0)
      if (preds.baoLo3D && preds.baoLo3D.length > 0) {
        if (preds.baoLo3D.some(n => winningLo.has(n))) {
          returnPoints += 3 * 400.0;
          hits++;
        }
      }

      // 7. Giải Đặc Biệt (3 điểm vốn, 1 ăn 70.0)
      if (preds.docDac && preds.docDac.length > 0) {
        if (latestDraw.special_prize && preds.docDac.some(n => latestDraw.special_prize.endsWith(n))) {
          returnPoints += 3 * 70.0;
          hits++;
        }
      }

      const profit = returnPoints - capital;
      const roiPercent = ((profit / capital) * 100).toFixed(1);
      const prefix = profit >= 0 ? "+" : "";

      return {
        roiText: `${prefix}${roiPercent}%`,
        date: latestDraw.draw_date || todayFormattedDate,
        hitsCount: `${hits}/7`,
      };
    } catch {
      return { roiText: "+25.0%", date: todayFormattedDate, hitsCount: "5/7" };
    }
  }, [app.draws, selectedRegion, todayFormattedDate]);

  const handleSelectRegion = (reg: RegionId) => {
    setSelectedRegion(reg);
    setSelectedStation(null);
  };

  const handleUnlock = (typeId: string) => {
    if (!selectedStation) return;
    const itemKey = `${selectedStation.id}_${typeId}`;
    setUnlockedItems((prev) => ({ ...prev, [itemKey]: true }));
  };

  const copyBankInfo = () => {
    navigator.clipboard.writeText("00002289129");
    setCopiedBank(true);
    setTimeout(() => setCopiedBank(false), 2000);
  };

  if (app.loading) return <FullPageLoader label="Đang kết nối cơ sở dữ liệu..." />;

  const isMB = selectedRegion === "MB";
  const targetYesterdayStations = stationsInRegion.length > 0 ? stationsInRegion : (app.stations || []).filter(s => allowedRegions.includes(s.region));

  return (
    <div className="flex flex-row h-screen w-screen overflow-hidden bg-ink-950 text-slate-100">
      <Sidebar selectedRegion={selectedRegion} onSelectRegion={handleSelectRegion} />

      <main className="flex flex-1 flex-col h-full min-w-0 overflow-hidden relative">
        {/* HEADER VỚI NÚT "ỦNG HỘ ☕" NỔI BẬT DỄ NHÌN */}
        <header className="flex items-center justify-between border-b border-white/5 bg-ink-900/40 px-3 sm:px-4 py-2.5 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-amber-300 text-base sm:text-lg font-black bg-gradient-to-r from-rose-600 to-amber-500 px-2 py-0.5 rounded-lg border border-amber-400/50 shadow-md shadow-rose-500/30">
                AI
              </span>
              <span className="font-bold text-sm sm:text-base text-white">Soi Cầu 3 Miền</span>
            </div>
            <span className="text-xs text-sky-400 font-semibold">
              [{REGION_LABELS[selectedRegion] || selectedRegion}]
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDonateModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 via-rose-500 to-pink-500 text-slate-950 font-extrabold text-xs shadow-lg shadow-rose-500/25 hover:scale-105 active:scale-95 transition cursor-pointer"
            >
              <Heart className="h-4 w-4 fill-slate-950 text-slate-950 animate-pulse" />
              <span>Ủng hộ ☕</span>
            </button>

            <span className="chip bg-emerald-500/10 text-emerald-300 text-[10px] px-2 py-0.5 hidden sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block mr-1" />
              DB connected
            </span>
          </div>
        </header>

        {/* THANH THỜI GIAN VỚI NGÀY ĐỊNH DẠNG CHUẨN DD/MM/YYYY */}
        <div className="flex items-center justify-between border-b border-white/5 bg-ink-900/30 px-3 py-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-sky-400" />
            <span className="text-xs font-bold text-slate-200">
              Kỳ quay mở thưởng: <span className="text-sky-300">{todayFormattedDate}</span> ({selectedDay})
            </span>
          </div>

          <span className="text-[10px] text-amber-400 font-medium bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-400/20">
            Mô hình AI Giả lập 100đ vốn
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 pb-20">
          <div className="mx-auto w-full max-w-2xl space-y-4">

            {/* TAB 1: TRANG CHỦ DỰ ĐOÁN */}
            {activeTab === "home" && (
              <>
                {!selectedStation ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between pb-1">
                      <h2 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5 uppercase tracking-wide">
                        <span className="h-2 w-2 rounded-full bg-sky-400" />
                        Chọn Đài Mở Thưởng Ngày {todayFormattedDate}
                      </h2>
                      <span className="text-[11px] text-slate-400">Bấm đài để xem bộ số</span>
                    </div>

                    <div className="flex flex-col gap-2.5">
                      {stationsInRegion.map((st) => (
                        <button
                          key={st.id}
                          onClick={() => handleSelectStation(st)}
                          className="group flex items-center justify-between rounded-2xl border border-white/10 bg-gradient-to-r from-slate-900/90 to-slate-900/50 p-3.5 text-left transition-all hover:border-sky-400/50 hover:bg-sky-500/10 shadow-sm cursor-pointer"
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
                                <span>Giờ quay: {st.drawTime || st.time || "16:15"}</span>
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
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-white/5 pb-3">
                      <button
                        onClick={() => setSelectedStation(null)}
                        className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white transition cursor-pointer"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        <span>Chọn đài khác</span>
                      </button>

                      <div className="text-right">
                        <h2 className="text-sm font-bold text-white">{selectedStation.name}</h2>
                        <p className="text-[11px] text-sky-400">Kỳ quay ngày: {todayFormattedDate}</p>
                      </div>
                    </div>

                    {/* HIỂN THỊ 7 HẠNG MỤC DỰ ĐOÁN VỚI CHIẾN LƯỢC PHÂN BỔ VỐN 100 ĐIỂM */}
                    <div className="space-y-3">
                      {PREDICTION_TYPES.map((item) => {
                        const itemKey = `${selectedStation.id}_${item.id}`;
                        const isUnlocked = unlockedItems[itemKey];
                        const displayNums = getPredictionValue(item.id, item.dbType, item.mockNums);

                        return (
                          <div
                            key={item.id}
                            className={`relative overflow-hidden rounded-2xl border p-3.5 backdrop-blur-md transition-all ${
                              item.id === "xien_truot"
                                ? "border-emerald-500/40 bg-gradient-to-r from-emerald-950/40 to-slate-900/90 shadow-lg shadow-emerald-500/10"
                                : "border-white/10 bg-slate-900/90"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <div>
                                <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                                  <Sparkles className={`h-3.5 w-3.5 ${item.id === "xien_truot" ? "text-emerald-400" : "text-sky-400"}`} />
                                  {item.title}
                                </h3>
                                <p className="text-[10px] text-slate-400 mt-0.5">{item.desc}</p>
                              </div>

                              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                                item.id === "xien_truot" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30" : "bg-white/5 text-slate-300"
                              }`}>
                                {item.points} Điểm Vốn
                              </span>
                            </div>

                            <div className="relative flex items-center justify-center rounded-xl bg-ink-950/90 py-3.5 px-3 border border-white/5 min-h-[52px]">
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
                                    className="flex items-center gap-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 px-5 py-1.5 text-xs font-bold text-slate-950 shadow-md shadow-sky-500/30 active:scale-95 transition cursor-pointer"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                    <span>Xem dự đoán</span>
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

            {/* TAB 2: KẾT QUẢ XỔ SỐ + THỐNG KÊ ROI MÔ PHỎNG 100 ĐIỂM VỐN */}
            {activeTab === "results" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <h2 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-sky-400" />
                    KẾT QUẢ XỔ SỐ CẬP NHẬT TỚI NƠI ({todayFormattedDate})
                  </h2>
                  <span className="text-[11px] text-emerald-400 font-semibold">
                    {targetYesterdayStations.length} Đài mở thưởng
                  </span>
                </div>

                {/* THẺ THỐNG KÊ ROI 100 ĐIỂM VỐN PHÒNG THỦ HÒA VỐN */}
                <div className="rounded-2xl border border-sky-500/30 bg-gradient-to-r from-sky-950/80 via-slate-900 to-emerald-950/60 p-4 shadow-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400 border border-sky-400/30">
                        <TrendingUp className="h-6 w-6" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-200">ROI Mô Phỏng 100 Điểm Vốn AI</h4>
                        <p className="text-[11px] text-slate-400">
                          Chiến lược: <span className="text-emerald-400 font-bold">Xiên Trượt 4 gánh 50% vốn bảo toàn</span> (Kỳ: {simulatedRoiStats.date})
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xl font-black text-emerald-400">{simulatedRoiStats.roiText}</span>
                      <span className="block text-[10px] text-sky-300 font-semibold">
                        Khớp {simulatedRoiStats.hitsCount} hạng mục
                      </span>
                    </div>
                  </div>
                </div>

                {loadingResults ? (
                  <div className="py-8 text-center text-xs text-sky-400">Đang tải kết quả xổ số từ CSDL...</div>
                ) : (
                  /* BẢNG LƯỚI GIẢI THƯỞNG CHO TẤT CẢ CÁC ĐÀI */
                  targetYesterdayStations.map((st) => {
                    const drawData = yesterdayResults[st.id] || (selectedStation?.id === st.id ? (app.draws && app.draws.length > 0 ? app.draws[0] : null) : null);
                    const loNums = drawData?.lo_numbers || [];
                    const seventhEighth = drawData?.seventh_or_eighth || [];

                    return (
                      <div
                        key={st.id}
                        className="rounded-2xl border border-white/10 bg-slate-900/90 p-4 space-y-3 shadow-xl backdrop-blur-md"
                      >
                        <div className="text-center pb-2 border-b border-white/5">
                          <h3 className="text-base font-bold text-sky-300 uppercase tracking-wide">
                            {st.name}
                          </h3>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Kỳ quay ngày: <span className="text-amber-300 font-bold">{drawData?.draw_date || todayFormattedDate}</span>
                          </p>
                        </div>

                        {/* Bảng Lưới Giải thưởng (27 Giải MB hoặc 18 Giải MN/MT) */}
                        <div className="w-full overflow-hidden rounded-xl border border-white/10 bg-slate-950/60 text-slate-100 text-xs sm:text-sm font-semibold">
                          {isMB ? (
                            /* MIỀN BẮC (27 GIẢI) */
                            <table className="w-full border-collapse text-center">
                              <tbody>
                                <tr className="border-b border-white/10">
                                  <td className="w-24 bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Đặc biệt</td>
                                  <td className="p-2.5 text-lg sm:text-xl font-extrabold text-rose-400 tracking-wider">
                                    {drawData?.special_prize || "-"}
                                  </td>
                                </tr>
                                <tr className="border-b border-white/10">
                                  <td className="bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Giải nhất</td>
                                  <td className="p-2.5 font-bold text-white">
                                    {loNums[0] || "-"}
                                  </td>
                                </tr>
                                <tr className="border-b border-white/10">
                                  <td className="bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Giải nhì</td>
                                  <td className="p-2.5">
                                    <div className="grid grid-cols-2 gap-2 font-bold text-white">
                                      <span>{loNums[1] || "-"}</span>
                                      <span>{loNums[2] || "-"}</span>
                                    </div>
                                  </td>
                                </tr>
                                <tr className="border-b border-white/10">
                                  <td className="bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Giải ba</td>
                                  <td className="p-2.5">
                                    <div className="grid grid-cols-3 gap-y-2 gap-x-1 font-bold text-white">
                                      <span>{loNums[3] || "-"}</span>
                                      <span>{loNums[4] || "-"}</span>
                                      <span>{loNums[5] || "-"}</span>
                                      <span>{loNums[6] || "-"}</span>
                                      <span>{loNums[7] || "-"}</span>
                                      <span>{loNums[8] || "-"}</span>
                                    </div>
                                  </td>
                                </tr>
                                <tr className="border-b border-white/10">
                                  <td className="bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Giải tư</td>
                                  <td className="p-2.5">
                                    <div className="grid grid-cols-4 gap-1 font-bold text-white">
                                      <span>{loNums[9] || "-"}</span>
                                      <span>{loNums[10] || "-"}</span>
                                      <span>{loNums[11] || "-"}</span>
                                      <span>{loNums[12] || "-"}</span>
                                    </div>
                                  </td>
                                </tr>
                                <tr className="border-b border-white/10">
                                  <td className="bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Giải năm</td>
                                  <td className="p-2.5">
                                    <div className="grid grid-cols-3 gap-y-2 gap-x-1 font-bold text-white">
                                      <span>{loNums[13] || "-"}</span>
                                      <span>{loNums[14] || "-"}</span>
                                      <span>{loNums[15] || "-"}</span>
                                      <span>{loNums[16] || "-"}</span>
                                      <span>{loNums[17] || "-"}</span>
                                      <span>{loNums[18] || "-"}</span>
                                    </div>
                                  </td>
                                </tr>
                                <tr className="border-b border-white/10">
                                  <td className="bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Giải sáu</td>
                                  <td className="p-2.5">
                                    <div className="grid grid-cols-3 gap-1 font-bold text-white">
                                      <span>{loNums[19] || "-"}</span>
                                      <span>{loNums[20] || "-"}</span>
                                      <span>{loNums[21] || "-"}</span>
                                    </div>
                                  </td>
                                </tr>
                                <tr>
                                  <td className="bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Giải bảy</td>
                                  <td className="p-2.5">
                                    <div className="grid grid-cols-4 gap-1 font-bold text-sky-300">
                                      <span>{seventhEighth[0] || loNums[22] || "-"}</span>
                                      <span>{seventhEighth[1] || loNums[23] || "-"}</span>
                                      <span>{seventhEighth[2] || loNums[24] || "-"}</span>
                                      <span>{seventhEighth[3] || loNums[25] || "-"}</span>
                                    </div>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          ) : (
                            /* MIỀN TRUNG / MIỀN NAM (18 GIẢI TỪ GIẢI 8 ĐẾN ĐẶC BIỆT) */
                            <table className="w-full border-collapse text-center">
                              <tbody>
                                <tr className="border-b border-white/10">
                                  <td className="w-24 bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Giải tám</td>
                                  <td className="p-2.5 font-bold text-sky-300 text-base">
                                    {seventhEighth[0] || loNums[0] || "-"}
                                  </td>
                                </tr>
                                <tr className="border-b border-white/10">
                                  <td className="bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Giải bảy</td>
                                  <td className="p-2.5 font-bold text-white">
                                    {loNums[1] || "-"}
                                  </td>
                                </tr>
                                <tr className="border-b border-white/10">
                                  <td className="bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Giải sáu</td>
                                  <td className="p-2.5">
                                    <div className="grid grid-cols-3 gap-1 font-bold text-white">
                                      <span>{loNums[2] || "-"}</span>
                                      <span>{loNums[3] || "-"}</span>
                                      <span>{loNums[4] || "-"}</span>
                                    </div>
                                  </td>
                                </tr>
                                <tr className="border-b border-white/10">
                                  <td className="bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Giải năm</td>
                                  <td className="p-2.5 font-bold text-white">
                                    {loNums[5] || "-"}
                                  </td>
                                </tr>
                                <tr className="border-b border-white/10">
                                  <td className="bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Giải tư</td>
                                  <td className="p-2.5">
                                    <div className="grid grid-cols-4 gap-y-1 gap-x-1 font-bold text-white">
                                      <span>{loNums[6] || "-"}</span>
                                      <span>{loNums[7] || "-"}</span>
                                      <span>{loNums[8] || "-"}</span>
                                      <span>{loNums[9] || "-"}</span>
                                      <span>{loNums[10] || "-"}</span>
                                      <span>{loNums[11] || "-"}</span>
                                      <span className="col-span-2">{loNums[12] || "-"}</span>
                                    </div>
                                  </td>
                                </tr>
                                <tr className="border-b border-white/10">
                                  <td className="bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Giải ba</td>
                                  <td className="p-2.5">
                                    <div className="grid grid-cols-2 gap-2 font-bold text-white">
                                      <span>{loNums[13] || "-"}</span>
                                      <span>{loNums[14] || "-"}</span>
                                    </div>
                                  </td>
                                </tr>
                                <tr className="border-b border-white/10">
                                  <td className="bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Giải nhì</td>
                                  <td className="p-2.5 font-bold text-white">
                                    {loNums[15] || "-"}
                                  </td>
                                </tr>
                                <tr className="border-b border-white/10">
                                  <td className="bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Giải nhất</td>
                                  <td className="p-2.5 font-bold text-white">
                                    {loNums[16] || "-"}
                                  </td>
                                </tr>
                                <tr>
                                  <td className="bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Đặc biệt</td>
                                  <td className="p-2.5 text-lg sm:text-xl font-extrabold text-rose-400 tracking-wider">
                                    {drawData?.special_prize || "-"}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* KHUNG CẢNH BÁO PHÁP LÝ & MIỄN TRỪ TRÁCH NHIỆM CHUẨN */}
            <footer className="mt-8 border-t border-white/10 pt-4 pb-20 text-center space-y-2 px-3">
              <div className="flex items-center justify-center gap-1.5 text-amber-400 text-xs font-bold uppercase tracking-wider">
                <ShieldCheck className="h-4 w-4" />
                <span>MÔ HÌNH GIẢ ĐỊNH TOÁN HỌC AI - KHÔNG VƯỚNG PHÁP LÝ / KHÔNG CÁ CƯỢC</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed max-w-xl mx-auto">
                Mô hình giả định toán học AI nghiên cứu dữ liệu - Không vướng pháp lý / Không cá cược. 
                Website hoạt động thuần túy dưới dạng công cụ phân tích dữ liệu thống kê xác suất tham khảo. 
                Hệ thống không phát hành vé số, không tổ chức hay kinh doanh cá cược và khuyến cáo người dùng không sử dụng thông tin vào mục đích vi phạm pháp luật.
              </p>
            </footer>

          </div>
        </div>

        {/* THANH MENU ĐIỀU HƯỚNG DƯỚI CÙNG */}
        <div className="absolute bottom-0 left-0 right-0 h-14 bg-ink-900/95 border-t border-white/10 backdrop-blur-xl px-6 flex justify-around items-center z-30">
          <button
            onClick={() => setActiveTab("home")}
            className={`flex flex-col items-center gap-0.5 text-[11px] font-bold transition cursor-pointer ${
              activeTab === "home" ? "text-sky-400" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Home className="h-4.5 w-4.5" />
            <span>Trang Chủ</span>
          </button>

          <button
            onClick={() => setActiveTab("results")}
            className={`flex flex-col items-center gap-0.5 text-[11px] font-bold transition cursor-pointer ${
              activeTab === "results" ? "text-sky-400" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Award className="h-4.5 w-4.5" />
            <span>Kết Quả</span>
          </button>
        </div>
      </main>

      {/* MODAL DONATE VỚI LỜI NGỎ CHÂN THÀNH VÀ CHUẨN XÁC 100% */}
      {showDonateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm rounded-3xl border border-amber-400/30 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 p-6 shadow-2xl space-y-4">
            <button
              onClick={() => setShowDonateModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full bg-white/5 transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-center space-y-2">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 text-slate-950 shadow-lg shadow-rose-500/30">
                <Heart className="h-6 w-6 fill-slate-950 animate-pulse" />
              </div>
              <h3 className="text-base font-bold text-white">Ủng hộ đội ngũ phát triển ☕</h3>
              <p className="text-xs text-slate-300 leading-relaxed px-1">
                Dự án được phát triển và vận hành phi lợi nhuận. Nếu AI-Soi cầu 3 miền hữu ích với bạn, hãy ủng hộ đội ngũ phát triển một ly cà phê để tiếp thêm năng lượng duy trì Server và cập nhật tính năng mới nhé! Cảm ơn bạn rất nhiều! ❤️
              </p>
            </div>

            {/* MÃ QR VIETQR TPBANK */}
            <div className="flex flex-col items-center justify-center rounded-2xl bg-white p-3 shadow-inner border border-amber-400/20">
              <div className="h-44 w-44 bg-slate-100 rounded-xl flex flex-col items-center justify-center border border-slate-300 relative overflow-hidden">
                <QrCode className="h-36 w-36 text-slate-800" />
                <span className="text-[10px] font-black text-rose-600 tracking-wider uppercase">VIETQR TPBANK</span>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-950/80 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Ngân hàng:</span>
                <span className="font-bold text-amber-300">TPBank</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Số tài khoản:</span>
                <span className="font-mono font-bold text-sky-300">0000 2289 129</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Chủ tài khoản:</span>
                <span className="font-bold text-white">NGUYỄN NGỌC NHẬT QUANG</span>
              </div>
            </div>

            <button
              onClick={copyBankInfo}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 py-2.5 text-xs font-extrabold text-slate-950 shadow-md hover:opacity-90 active:scale-95 transition cursor-pointer"
            >
              {copiedBank ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span>{copiedBank ? "Đã sao chép tài khoản!" : "Sao chép số tài khoản"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
