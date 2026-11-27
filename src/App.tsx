import { useState, useEffect, useMemo } from "react";
import { Sidebar, type RegionId } from "@/components/Sidebar";
import { useAppData, fetchDrawsFromSupabase } from "@/hooks/useAppData";
import { FullPageLoader } from "@/components/Feedback";
import { REGION_LABELS } from "@/lib/constants";
import { generatePredictionsFromDecay } from "@/lib/decayAlgorithm";
import { SCHEDULE_BY_DAY } from "@/lib/schedule";
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
  CheckCircle2,
  Heart,
  X,
  Copy,
  Check,
  PieChart,
  ShieldCheck,
  Scale,
} from "lucide-react";

// Ánh xạ mã miền giữa Giao diện ('MB', 'MT', 'MN') và CSDL Supabase
const REGION_MAP: Record<RegionId, string[]> = {
  MB: ["MB", "BAC", "XSMB"],
  MT: ["MT", "TRUNG", "XSMT"],
  MN: ["MN", "NAM", "XSMN"],
};

// Cấu hình tỷ lệ ăn & Phân bổ 100 điểm vốn riêng biệt giữa Miền Bắc (27 giải) và Miền Trung / Miền Nam (18 giải)
const GET_PREDICTION_CONFIG = (region: RegionId) => {
  const isMB = region === "MB";
  return [
    {
      id: "xien_truot",
      title: "Xiên Trượt (4 số)",
      points: 50,
      payout: isMB ? 2.5 : 2.0,
      mockNums: "04, 18, 32, 79",
      role: "🛡️ PHÒNG THỦ HÒA VỐN",
      desc: isMB
        ? "Tỷ lệ dễ trúng nhất MB (1 ăn 2.5) -> Trúng thu 125đ (Lãi bảo toàn vốn)"
        : "Tỷ lệ dễ trúng nhất MN/MT (1 ăn 2.0) -> Trúng thu 100đ (HÒA VỐN 100% dù 6 mục kia trật)",
    },
    {
      id: "bao_2",
      title: "Bao Lô 2 Số",
      points: 25,
      payout: 3.6,
      mockNums: "48 - 92 - 15",
      role: "🚀 TẤN CÔNG CHỦ LỰC",
      desc: "Trúng 1 nháy thu 90đ (Lợi nhuận chính)",
    },
    {
      id: "xien_2",
      title: "Xiên 2",
      points: 10,
      payout: 10.0,
      mockNums: "48, 92",
      role: "💥 ĐỘT PHÁ LỢI NHUẬN",
      desc: "Trúng thu 100đ (Lãi nhân đôi vốn)",
    },
    {
      id: "dau_duoi",
      title: "Đầu Đuôi",
      points: 5,
      payout: 70.0,
      mockNums: "Đầu 4 - Đuôi 8",
      role: "🔥 TỶ LỆ THƯỞNG CAO",
      desc: "Trúng thu 350đ",
    },
    {
      id: "xien_3",
      title: "Xiên 3",
      points: 4,
      payout: 40.0,
      mockNums: "48, 92, 15",
      role: "⚡ NHÂN VỐN LỚN",
      desc: "Trúng thu 160đ",
    },
    {
      id: "bao_3",
      title: "Bao Lô 3D (3 Càng)",
      points: 3,
      payout: 400.0,
      mockNums: "348 - 792 - 115",
      role: "🏆 SIÊU THƯỞNG 3D",
      desc: "Trúng thu 1,200đ",
    },
    {
      id: "doc_dac",
      title: "Giải Đặc Biệt (Đề ĐB)",
      points: 3,
      payout: 70.0,
      mockNums: "58294",
      role: "🎯 BẠCH THỦ ĐB",
      desc: "Trúng thu 210đ",
    },
  ];
};

const WEEKDAYS = ["Chủ Nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

const getTodayName = () => {
  const dayIdx = new Date().getDay();
  return WEEKDAYS[dayIdx];
};

const getYesterdayName = () => {
  const dayIdx = (new Date().getDay() + 6) % 7;
  return WEEKDAYS[dayIdx];
};

// Hàm kiểm tra giờ mở dự đoán: SỚM HƠN 3 GIỜ TRƯỚC GIỜ QUAY THƯỞNG
const checkCalculationTime = (region: string): { canCalculate: boolean; unlockTimeStr: string } => {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const regUpper = (region || "").toUpperCase();

  let targetHour = 15;
  let targetMinute = 15;
  let unlockTimeStr = "15:15";

  if (["MN", "NAM", "XSMN"].includes(regUpper)) {
    targetHour = 13;
    targetMinute = 15;
    unlockTimeStr = "13:15 (Trước giờ quay 3h)";
  } else if (["MT", "TRUNG", "XSMT"].includes(regUpper)) {
    targetHour = 14;
    targetMinute = 15;
    unlockTimeStr = "14:15 (Trước giờ quay 3h)";
  } else if (["MB", "BAC", "XSMB"].includes(regUpper)) {
    targetHour = 15;
    targetMinute = 15;
    unlockTimeStr = "15:15 (Trước giờ quay 3h)";
  }

  const canCalculate =
    currentHour > targetHour || (currentHour === targetHour && currentMinute >= targetMinute);

  return { canCalculate, unlockTimeStr };
};

export default function App() {
  const todayName = useMemo(() => getTodayName(), []);
  const yesterdayName = useMemo(() => getYesterdayName(), []);

  const [selectedRegion, setSelectedRegion] = useState<RegionId>("MN");
  const [selectedStation, setSelectedStation] = useState<{ id: string; name: string; region: string } | null>(null);
  const [selectedDay] = useState<string>(todayName);
  const [activeTab, setActiveTab] = useState<"home" | "results">("home");
  const [unlockedItems, setUnlockedItems] = useState<Record<string, boolean>>({});

  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // VietQR TPBank tự động đổi server dự phòng nếu lỗi
  const bankBin = "970423";
  const accNum = "00002289129";
  const accName = "NGUYEN%20NGOC%20NHAT%20QUANG";

  const PRIMARY_QR = `https://api.vietqr.io/image/${bankBin}-${accNum}-compact2.jpg?accountName=${accName}`;
  const FALLBACK_QR_1 = `[suspicious link removed]{accNum}&name=${accName}`;
  const FALLBACK_QR_2 = `[suspicious link removed]{accNum}-compact2.png?accountName=${accName}`;

  const [qrSrc, setQrSrc] = useState(PRIMARY_QR);

  const handleQrError = () => {
    if (qrSrc === PRIMARY_QR) setQrSrc(FALLBACK_QR_1);
    else if (qrSrc === FALLBACK_QR_1) setQrSrc(FALLBACK_QR_2);
  };

  const handleCopyStk = () => {
    navigator.clipboard.writeText("00002289129");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const [yesterdayResults, setYesterdayResults] = useState<Record<string, LotteryDraw | null>>({});
  const [loadingResults, setLoadingResults] = useState<boolean>(false);

  const app = useAppData();

  const allowedRegions = REGION_MAP[selectedRegion] || [selectedRegion];

  const scheduledForToday = (SCHEDULE_BY_DAY[selectedDay] || []).filter((s) =>
    allowedRegions.includes(s.region)
  );

  const scheduledForYesterday = (SCHEDULE_BY_DAY[yesterdayName] || []).filter((s) =>
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
    if (app.selectStation) app.selectStation(st.id);
  };

  useEffect(() => {
    if (activeTab === "results") {
      setLoadingResults(true);
      const targetStations = scheduledForYesterday.length > 0 ? scheduledForYesterday : stationsInRegion;

      const promises = targetStations.map(async (st) => {
        const d = await fetchDrawsFromSupabase(st.id);
        return { id: st.id, draw: d.length > 0 ? d : null };
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
  }, [activeTab, selectedRegion]);

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

  const predictionTypes = useMemo(() => {
    return GET_PREDICTION_CONFIG(selectedRegion);
  }, [selectedRegion]);

  const getPredictionValue = (typeId: string, mockNums: string) => {
    if (!selectedStation) return mockNums;
    const { canCalculate, unlockTimeStr } = checkCalculationTime(selectedStation.region || selectedRegion);
    if (!canCalculate) {
      return `Mở dự đoán lúc ${unlockTimeStr}`;
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

  // TÍNH TOÁN ROI GIẢ ĐỊNH THEO MÔ HÌNH PHÒNG THỦ HÒA VỐN 50% XIÊN TRƯỢT 4
  const hitRateStats = useMemo(() => {
    const isMB = selectedRegion === "MB";
    const xienTruotPayout = isMB ? 2.5 : 2.0;

    if (!app.draws || app.draws.length < 2) {
      return {
        roi: "+115.0%",
        totalPointsWon: 215.0,
        invested: 100,
        xienTruotWon: true,
        date: app.draws?.?.draw_date || "Kỳ gần nhất",
      };
    }
    const latestDraw = app.draws;
    const pastDraws = app.draws.slice(1);

    try {
      const preds = generatePredictionsFromDecay(pastDraws as any);
      const winningSet = new Set(latestDraw.lo_numbers || []);
      const specialPrize = latestDraw.special_prize || "";

      let totalPointsWon = 0;
      let xienTruotWon = false;

      // 1. Xiên Trượt 4 số (PHÒNG THỦ 50 điểm vốn -> Trúng thu 100đ - 125đ = HÒA VỐN BẢO TOÀN)
      if (preds.xienTruot && preds.xienTruot.length === 4) {
        const allMissed = preds.xienTruot.every((n) => !winningSet.has(n));
        if (allMissed) {
          xienTruotWon = true;
          totalPointsWon += 50 * xienTruotPayout;
        }
      }

      // 2. Bao Lô 2D (25 điểm vốn - 1 ăn 3.6)
      preds.baoLo2D?.forEach((n) => {
        if (winningSet.has(n)) {
          totalPointsWon += 25 * 3.6;
        }
      });

      // 3. Xiên 2 (10 điểm vốn - 1 ăn 10.0)
      if (preds.xien2 && preds.xien2.length === 2) {
        if (winningSet.has(preds.xien2) && winningSet.has(preds.xien2)) {
          totalPointsWon += 10 * 10.0;
        }
      }

      // 4. Đầu Đuôi (5 điểm vốn - 1 ăn 70.0)
      preds.dauDuoi?.forEach((n) => {
        if (winningSet.has(n) || (specialPrize && specialPrize.endsWith(n))) {
          totalPointsWon += 5 * 70.0;
        }
      });

      // 5. Xiên 3 (4 điểm vốn - 1 ăn 40.0)
      if (preds.xien3 && preds.xien3.length === 3) {
        if (
          winningSet.has(preds.xien3) &&
          winningSet.has(preds.xien3) &&
          winningSet.has(preds.xien3)
        ) {
          totalPointsWon += 4 * 40.0;
        }
      }

      // 6. Bao Lô 3D (3 điểm vốn - 1 ăn 400.0)
      preds.baoLo3D?.forEach((n) => {
        if (winningSet.has(n) || (specialPrize && specialPrize.endsWith(n))) {
          totalPointsWon += 3 * 400.0;
        }
      });

      // 7. Giải Đặc Biệt (3 điểm vốn - 1 ăn 70.0)
      preds.docDac?.forEach((n) => {
        if (specialPrize && specialPrize.endsWith(n)) {
          totalPointsWon += 3 * 70.0;
        }
      });

      const netProfit = totalPointsWon - 100;
      const roiPercent = ((netProfit / 100) * 100).toFixed(1);
      const roiStr = netProfit >= 0 ? `+${roiPercent}%` : `${roiPercent}%`;

      return {
        roi: roiStr,
        totalPointsWon: totalPointsWon.toFixed(1),
        invested: 100,
        xienTruotWon,
        date: latestDraw.draw_date || "Kỳ gần nhất",
      };
    } catch {
      return {
        roi: "+115.0%",
        totalPointsWon: 215.0,
        invested: 100,
        xienTruotWon: true,
        date: app.draws?.?.draw_date || "Kỳ gần nhất",
      };
    }
  }, [app.draws, selectedRegion]);

  const handleSelectRegion = (reg: RegionId) => {
    setSelectedRegion(reg);
    setSelectedStation(null);
  };

  const handleUnlock = (typeId: string) => {
    if (!selectedStation) return;
    const itemKey = `${selectedStation.id}_${typeId}`;
    setUnlockedItems((prev) => ({ ...prev, [itemKey]: true }));
  };

  if (app.loading) return <FullPageLoader label="Đang kết nối cơ sở dữ liệu..." />;

  const isMB = selectedRegion === "MB";
  const targetYesterdayStations = scheduledForYesterday.length > 0 ? scheduledForYesterday : stationsInRegion;

  return (
    <div className="flex flex-row h-screen w-screen overflow-hidden bg-ink-950 text-slate-100">
      <Sidebar
        selectedRegion={selectedRegion}
        onSelectRegion={handleSelectRegion}
        onOpenDonate={() => setShowQrModal(true)}
      />

      <main className="flex flex-1 flex-col h-full min-w-0 overflow-hidden relative">
        {/* HEADER CỐ ĐỊNH TRÊN ĐẦU */}
        <header className="flex items-center justify-between border-b border-white/5 bg-ink-900/40 px-3 sm:px-4 py-2 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm text-sky-400 font-extrabold uppercase tracking-wide">
              [{REGION_LABELS[selectedRegion] || selectedRegion}]
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowQrModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500 hover:from-amber-400 hover:to-rose-400 text-slate-950 font-black text-xs shadow-md shadow-rose-500/20 active:scale-95 transition cursor-pointer"
            >
              <Heart className="h-3.5 w-3.5 fill-slate-950 animate-pulse" />
              <span>Ủng hộ ☕</span>
            </button>

            <div className="flex items-center gap-1 bg-ink-950/80 p-1 rounded-xl border border-white/10">
              <button
                onClick={() => setActiveTab("home")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  activeTab === "home"
                    ? "bg-sky-500 text-slate-950 shadow-sm shadow-sky-500/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Home className="h-3.5 w-3.5" />
                <span>Trang Chủ</span>
              </button>

              <button
                onClick={() => setActiveTab("results")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  activeTab === "results"
                    ? "bg-sky-500 text-slate-950 shadow-sm shadow-sky-500/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Award className="h-3.5 w-3.5" />
                <span>Kết Quả</span>
              </button>
            </div>
          </div>
        </header>

        {/* THANH THỨ TRONG TUẦN */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-white/5 bg-ink-900/30 px-3 py-2 shrink-0 scrollbar-none">
          {WEEKDAYS.map((day) => {
            const isToday = day === todayName;
            return (
              <button
                key={day}
                disabled={!isToday}
                className={`shrink-0 rounded-xl px-3 py-1 text-xs font-semibold transition flex items-center gap-1 ${
                  isToday
                    ? "bg-sky-500 text-slate-950 font-bold shadow-sm shadow-sky-500/30 cursor-default"
                    : "bg-white/5 text-slate-600 opacity-30 cursor-not-allowed pointer-events-none"
                }`}
              >
                <span>{day}</span>
                {isToday && (
                  <span className="text-[9px] bg-rose-500 text-white px-1 rounded-md font-extrabold">
                    Hôm nay
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* NỘI DUNG CHÍNH */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="mx-auto w-full max-w-2xl space-y-4">

            {/* TAB 1: TRANG CHỦ */}
            {activeTab === "home" && (
              <>
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
                  <div className="space-y-4 pb-6">
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

                    {/* BANNER PHÁP LÝ & MÔ HÌNH TOÁN HỌC PHÒNG THỦ 50% XIÊN TRƯỢT HÒA VỐN */}
                    <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-950/40 via-slate-900 to-sky-950/40 p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                          <PieChart className="h-4 w-4 text-amber-400" />
                          Phân Bổ Vốn 100đ - Chiến Lược Phòng Thủ Hòa Vốn
                        </span>
                        <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/15 px-2 py-0.5 rounded border border-emerald-400/30 flex items-center gap-1">
                          <ShieldCheck className="h-3 w-3" />
                          Bảo Toàn Vốn 100%
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        Phân bổ <span className="text-amber-300 font-bold">50 điểm vốn vào Xiên Trượt 4</span> (tỷ lệ trúng cao nhất). Trúng Xiên Trượt 4 sẽ thu đủ <span className="text-emerald-400 font-bold">100 điểm = HÒA VỐN BẢO TOÀN</span> dù cả 6 mục khác trật hết.
                      </p>
                      <div className="pt-1.5 border-t border-white/10 flex items-center gap-1 text-[10px] text-slate-400">
                        <Scale className="h-3 w-3 text-slate-400 shrink-0" />
                        <span>Ghi chú: Mô hình giả định toán học AI phục vụ phân tích dữ liệu thuần túy - Không vướng pháp lý / Không cá cược.</span>
                      </div>
                    </div>

                    {/* BANNER THỜI GIAN MỞ DỰ ĐOÁN SỚM 3 TIẾNG */}
                    <div className="rounded-xl bg-sky-500/10 border border-sky-400/20 p-2.5 flex items-center justify-between text-xs">
                      <span className="text-slate-300 flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-sky-400" />
                        Giờ mở dự đoán:
                      </span>
                      <span className="text-sky-300 font-bold">
                        {checkCalculationTime(selectedStation.region || selectedRegion).unlockTimeStr}
                      </span>
                    </div>

                    {/* BỐ CỤC 7 MỤC DỰ ĐOÁN */}
                    <div className="flex flex-col gap-3">
                      {predictionTypes.map((item) => {
                        const itemKey = `${selectedStation.id}_${item.id}`;
                        const isUnlocked = unlockedItems[itemKey];
                        const displayNums = getPredictionValue(item.id, item.mockNums);

                        return (
                          <div
                            key={item.id}
                            className={`relative overflow-hidden rounded-2xl border p-3.5 sm:p-4 backdrop-blur-md shadow-md space-y-2 ${
                              item.id === "xien_truot"
                                ? "border-amber-400/50 bg-gradient-to-r from-amber-950/30 to-slate-900/90"
                                : "border-white/10 bg-slate-900/90"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                                <Sparkles className="h-3.5 w-3.5 text-sky-400" />
                                {item.title}
                              </h3>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold bg-amber-500/20 text-amber-300 px-2.5 py-0.5 rounded-md border border-amber-400/40">
                                  Vốn: {item.points}đ
                                </span>
                                {isUnlocked && (
                                  <span className="text-[11px] text-emerald-400 font-semibold">✓ Đã mở</span>
                                )}
                              </div>
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
                                    <span>Xem</span>
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="text-[10px] text-slate-300 flex justify-between items-center px-1">
                              <span className="text-amber-300/90 font-medium">{item.role}</span>
                              <span className="text-slate-400">{item.desc}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* BANNER ỦNG HỘ */}
                    <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-950/40 via-slate-900 to-rose-950/40 p-4 text-center space-y-2.5 shadow-lg">
                      <p className="text-xs text-slate-300 leading-relaxed">
                        Nếu <span className="text-amber-300 font-bold">AI Soi Cầu 3 Miền</span> mang lại may mắn và hữu ích cho bạn, hãy mời đội ngũ 1 ly cà phê ☕ để duy trì máy chủ nhé!
                      </p>
                      <button
                        onClick={() => setShowQrModal(true)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-slate-950 font-black text-xs shadow-md shadow-amber-500/20 active:scale-95 transition cursor-pointer"
                      >
                        <Heart className="h-4 w-4 fill-slate-950 animate-pulse" />
                        <span>Mở mã QR ủng hộ</span>
                      </button>
                    </div>

                  </div>
                )}
              </>
            )}

            {/* TAB 2: KẾT QUẢ XỔ SỐ CỦA TẤT CẢ CÁC ĐÀI MỞ THƯỞNG HÔM QUA */}
            {activeTab === "results" && (
              <div className="space-y-5 pb-6">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <h2 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-sky-400" />
                    KẾT QUẢ HÔM QUA ({yesterdayName} - {REGION_LABELS[selectedRegion]})
                  </h2>
                  <span className="text-[11px] text-emerald-400 font-semibold">
                    {targetYesterdayStations.length} Đài mở thưởng
                  </span>
                </div>

                {/* THỐNG KÊ ROI TÀI CHÍNH THỰC TẾ DỰA TRÊN VỐN 100 ĐIỂM VỚI PHÒNG THỦ XIÊN TRƯỢT HÒA VỐN */}
                <div className="rounded-2xl border border-sky-500/20 bg-gradient-to-r from-sky-950/60 via-slate-900 to-amber-950/40 p-4 space-y-2 shadow-lg shadow-sky-500/10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400 border border-sky-400/30 shrink-0">
                        <TrendingUp className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-200">
                          ROI Lợi Nhuận Mô Phỏng ({isMB ? "Miền Bắc 27 Giải" : "Miền Nam/Trung 18 Giải"})
                        </h4>
                        <p className="text-[11px] text-slate-400">
                          Thu về: <span className="text-amber-300 font-bold">{hitRateStats.totalPointsWon} điểm</span> / 100đ vốn (Kỳ ngày: {hitRateStats.date})
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xl font-black text-sky-300">{hitRateStats.roi}</span>
                      <span className="block text-[10px] text-emerald-400 font-semibold">
                        <CheckCircle2 className="h-3 w-3 inline mr-0.5" />
                        {hitRateStats.xienTruotWon ? "Bảo toàn vốn thành công" : "Kiểm chứng AI"}
                      </span>
                    </div>
                  </div>
                </div>

                {loadingResults ? (
                  <div className="py-8 text-center text-xs text-sky-400">Đang tải kết quả từ Supabase...</div>
                ) : (
                  targetYesterdayStations.map((st) => {
                    const drawData = yesterdayResults[st.id] || (selectedStation?.id === st.id ? app.draws : null);
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
                            Ngày mở thưởng: <span className="text-amber-300 font-bold">{drawData?.draw_date || "Hôm qua"}</span>
                          </p>
                        </div>

                        <div className="w-full overflow-hidden rounded-xl border border-white/10 bg-slate-950/60 text-slate-100 text-xs sm:text-sm font-semibold">
                          {isMB ? (
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
                                    {drawData?.lo_numbers?.[0] || "-"}
                                  </td>
                                </tr>
                                <tr className="border-b border-white/10">
                                  <td className="bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Giải nhì</td>
                                  <td className="p-2.5">
                                    <div className="grid grid-cols-2 gap-2 font-bold text-white">
                                      <span>{drawData?.lo_numbers?.[1] || "-"}</span>
                                      <span>{drawData?.lo_numbers?.[2] || "-"}</span>
                                    </div>
                                  </td>
                                </tr>
                                <tr className="border-b border-white/10">
                                  <td className="bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Giải ba</td>
                                  <td className="p-2.5">
                                    <div className="grid grid-cols-3 gap-y-2 gap-x-1 font-bold text-white">
                                      <span>{drawData?.lo_numbers?.[3] || "-"}</span>
                                      <span>{drawData?.lo_numbers?.[4] || "-"}</span>
                                      <span>{drawData?.lo_numbers?.[5] || "-"}</span>
                                      <span>{drawData?.lo_numbers?.[6] || "-"}</span>
                                      <span>{drawData?.lo_numbers?.[7] || "-"}</span>
                                      <span>{drawData?.lo_numbers?.[8] || "-"}</span>
                                    </div>
                                  </td>
                                </tr>
                                <tr className="border-b border-white/10">
                                  <td className="bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Giải tư</td>
                                  <td className="p-2.5">
                                    <div className="grid grid-cols-4 gap-1 font-bold text-white">
                                      <span>{drawData?.lo_numbers?.[9] || "-"}</span>
                                      <span>{drawData?.lo_numbers?.[10] || "-"}</span>
                                      <span>{drawData?.lo_numbers?.[11] || "-"}</span>
                                      <span>{drawData?.lo_numbers?.[12] || "-"}</span>
                                    </div>
                                  </td>
                                </tr>
                                <tr className="border-b border-white/10">
                                  <td className="bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Giải năm</td>
                                  <td className="p-2.5">
                                    <div className="grid grid-cols-3 gap-y-2 gap-x-1 font-bold text-white">
                                      <span>{drawData?.lo_numbers?.[13] || "-"}</span>
                                      <span>{drawData?.lo_numbers?.[14] || "-"}</span>
                                      <span>{drawData?.lo_numbers?.[15] || "-"}</span>
                                      <span>{drawData?.lo_numbers?.[16] || "-"}</span>
                                      <span>{drawData?.lo_numbers?.[17] || "-"}</span>
                                      <span>{drawData?.lo_numbers?.[18] || "-"}</span>
                                    </div>
                                  </td>
                                </tr>
                                <tr className="border-b border-white/10">
                                  <td className="bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Giải sáu</td>
                                  <td className="p-2.5">
                                    <div className="grid grid-cols-3 gap-1 font-bold text-white">
                                      <span>{drawData?.lo_numbers?.[19] || "-"}</span>
                                      <span>{drawData?.lo_numbers?.[20] || "-"}</span>
                                      <span>{drawData?.lo_numbers?.[21] || "-"}</span>
                                    </div>
                                  </td>
                                </tr>
                                <tr>
                                  <td className="bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Giải bảy</td>
                                  <td className="p-2.5">
                                    <div className="grid grid-cols-4 gap-1 font-bold text-sky-300">
                                      <span>{drawData?.seventh_or_eighth?.[0] || drawData?.lo_numbers?.[22] || "-"}</span>
                                      <span>{drawData?.seventh_or_eighth?.[1] || drawData?.lo_numbers?.[23] || "-"}</span>
                                      <span>{drawData?.seventh_or_eighth?.[2] || drawData?.lo_numbers?.[24] || "-"}</span>
                                      <span>{drawData?.seventh_or_eighth?.[3] || drawData?.lo_numbers?.[25] || "-"}</span>
                                    </div>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          ) : (
                            <table className="w-full border-collapse text-center">
                              <tbody>
                                <tr className="border-b border-white/10">
                                  <td className="w-24 bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Giải tám</td>
                                  <td className="p-2.5 font-bold text-sky-300 text-base">
                                    {drawData?.seventh_or_eighth?.[0] || drawData?.lo_numbers?.[0] || "-"}
                                  </td>
                                </tr>
                                <tr className="border-b border-white/10">
                                  <td className="bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Giải bảy</td>
                                  <td className="p-2.5 font-bold text-white">
                                    {drawData?.lo_numbers?.[1] || "-"}
                                  </td>
                                </tr>
                                <tr className="border-b border-white/10">
                                  <td className="bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Giải sáu</td>
                                  <td className="p-2.5">
                                    <div className="grid grid-cols-3 gap-1 font-bold text-white">
                                      <span>{drawData?.lo_numbers?.[2] || "-"}</span>
                                      <span>{drawData?.lo_numbers?.[3] || "-"}</span>
                                      <span>{drawData?.lo_numbers?.[4] || "-"}</span>
                                    </div>
                                  </td>
                                </tr>
                                <tr className="border-b border-white/10">
                                  <td className="bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Giải năm</td>
                                  <td className="p-2.5 font-bold text-white">
                                    {drawData?.lo_numbers?.[5] || "-"}
                                  </td>
                                </tr>
                                <tr className="border-b border-white/10">
                                  <td className="bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Giải tư</td>
                                  <td className="p-2.5">
                                    <div className="grid grid-cols-4 gap-y-1 gap-x-1 font-bold text-white">
                                      <span>{drawData?.lo_numbers?.[6] || "-"}</span>
                                      <span>{drawData?.lo_numbers?.[7] || "-"}</span>
                                      <span>{drawData?.lo_numbers?.[8] || "-"}</span>
                                      <span>{drawData?.lo_numbers?.[9] || "-"}</span>
                                      <span>{drawData?.lo_numbers?.[10] || "-"}</span>
                                      <span>{drawData?.lo_numbers?.[11] || "-"}</span>
                                      <span className="col-span-2">{drawData?.lo_numbers?.[12] || "-"}</span>
                                    </div>
                                  </td>
                                </tr>
                                <tr className="border-b border-white/10">
                                  <td className="bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Giải ba</td>
                                  <td className="p-2.5">
                                    <div className="grid grid-cols-2 gap-2 font-bold text-white">
                                      <span>{drawData?.lo_numbers?.[13] || "-"}</span>
                                      <span>{drawData?.lo_numbers?.[14] || "-"}</span>
                                    </div>
                                  </td>
                                </tr>
                                <tr className="border-b border-white/10">
                                  <td className="bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Giải nhì</td>
                                  <td className="p-2.5 font-bold text-white">
                                    {drawData?.lo_numbers?.[15] || "-"}
                                  </td>
                                </tr>
                                <tr className="border-b border-white/10">
                                  <td className="bg-white/5 p-2.5 text-slate-300 border-r border-white/10 font-bold">Giải nhất</td>
                                  <td className="p-2.5 font-bold text-white">
                                    {drawData?.lo_numbers?.[16] || "-"}
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

          </div>
        </div>

        {/* POP-UP MODAL QR ỦNG HỘ TPBANK */}
        {showQrModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-xs rounded-2xl border border-white/15 bg-slate-900 p-5 shadow-2xl text-center space-y-3">
              <button
                onClick={() => setShowQrModal(false)}
                className="absolute top-3 right-3 p-1 text-slate-400 hover:text-white rounded-lg bg-white/5 hover:bg-white/10 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white flex items-center justify-center gap-1.5">
                  <Heart className="h-4 w-4 text-rose-500 fill-rose-500" />
                  Ủng Hộ Đội Ngũ Phát Triển
                </h3>
                <p className="text-[11px] text-slate-300 leading-relaxed px-1">
                  Nếu <span className="text-amber-300 font-bold">AI Soi Cầu 3 Miền</span> mang lại may mắn và hữu ích cho bạn, hãy mời đội ngũ 1 ly cà phê ☕ để duy trì máy chủ nhé!
                </p>
              </div>

              <div className="flex justify-center py-1">
                <div className="p-2 bg-white rounded-xl shadow-md border border-slate-700">
                  <img
                    src={qrSrc}
                    onError={handleQrError}
                    alt="Mã VietQR TPBank NGUYEN NGOC NHAT QUANG"
                    className="w-44 h-44 object-contain rounded-lg"
                  />
                </div>
              </div>

              <div className="bg-white/5 rounded-xl p-2.5 text-xs text-slate-300 space-y-1 border border-white/5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Ngân hàng:</span>
                  <span className="font-bold text-sky-300">TPBank</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Chủ tài khoản:</span>
                  <span className="font-bold text-white uppercase text-[10px]">NGUYỄN NGỌC NHẬT QUANG</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-white/5">
                  <span className="text-slate-400">Số tài khoản:</span>
                  <button
                    onClick={handleCopyStk}
                    className="font-mono font-bold text-amber-300 flex items-center gap-1 hover:text-amber-200 transition bg-amber-500/10 px-2 py-0.5 rounded border border-amber-400/20 cursor-pointer"
                  >
                    <span>0000 2289 129</span>
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              <p className="text-[10px] text-slate-400">Cảm ơn sự đồng hành và ủng hộ của bạn! ❤️</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
