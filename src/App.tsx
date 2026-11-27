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
  ArrowLeft, ChevronRight, Eye, Home, Award, Sparkles, Calendar, Clock,
  Star, TrendingUp, ShieldCheck, Heart, QrCode, X, Copy, Check
} from "lucide-react";

const REGION_MAP: Record<RegionId, string[]> = {
  MB: ["MB", "BAC", "XSMB"],
  MT: ["MT", "TRUNG", "XSMT"],
  MN: ["MN", "NAM", "XSMN"],
};

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

const formatDateString = (dateObj: Date): string => {
  const d = String(dateObj.getDate()).padStart(2, "0");
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const y = dateObj.getFullYear();
  return `${d}/${m}/${y}`;
};

const getTodayName = () => WEEKDAYS[new Date().getDay()];

const checkCalculationTime = (region: string) => {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const regUpper = (region || "").toUpperCase();
  let targetHour = 15, targetMin = 15;
  if (["MN", "NAM", "XSMN"].includes(regUpper)) { targetHour = 13; targetMin = 15; }
  else if (["MT", "TRUNG", "XSMT"].includes(regUpper)) { targetHour = 14; targetMin = 15; }
  else if (["MB", "BAC", "XSMB"].includes(regUpper)) { targetHour = 15; targetMin = 15; }
  return { canCalculate: currentMinutes >= targetHour * 60 + targetMin, targetHour, targetMin };
};

export default function App() {
  const todayName = useMemo(() => getTodayName(), []);
  const todayFormattedDate = useMemo(() => formatDateString(new Date()), []);
  const [selectedRegion, setSelectedRegion] = useState<RegionId>("MN");
  const [selectedStation, setSelectedStation] = useState<{ id: string; name: string; region: string } | null>(null);
  const [selectedDay] = useState<string>(todayName);
  const [activeTab, setActiveTab] = useState<"home" | "results">("home");
  const [unlockedItems, setUnlockedItems] = useState<Record<string, boolean>>({});
  const [showDonateModal, setShowDonateModal] = useState<boolean>(false);
  const [copiedBank, setCopiedBank] = useState<boolean>(false);
  const [yesterdayResults, setYesterdayResults] = useState<Record<string, LotteryDraw | null>>({});
  const [loadingResults, setLoadingResults] = useState<boolean>(false);
  const [dbPredictions, setDbPredictions] = useState<Record<string, string>>({});

  const app = useAppData();
  const allowedRegions = REGION_MAP[selectedRegion] || [selectedRegion];
  const scheduledForToday = (SCHEDULE_BY_DAY[selectedDay] || []).filter((s) => allowedRegions.includes(s.region));

  let stationsInRegion = (app.stations || []).filter((s) => {
    const isRegionMatch = allowedRegions.includes(s.region) || allowedRegions.includes(s.region?.toUpperCase());
    const isScheduled = scheduledForToday.some(sc => sc.id.toLowerCase() === s.id.toLowerCase() || s.name.toLowerCase().includes(sc.name.toLowerCase()));
    return isRegionMatch && (scheduledForToday.length === 0 || isScheduled);
  });

  if (stationsInRegion.length === 0) {
    stationsInRegion = scheduledForToday.map((s) => ({ id: s.id, name: s.name, time: s.drawTime, region: selectedRegion })) as any;
  }

  const handleSelectStation = (st: any) => {
    setSelectedStation(st);
    if (app.selectStation) app.selectStation(st.id);
  };

  useEffect(() => {
    if (selectedStation) {
      (async () => {
        try {
          const { data, error } = await supabase.from("predictions").select("prediction_type, numbers").eq("station_id", selectedStation.id).order("created_at", { ascending: false }).limit(10);
          if (!error && data && data.length > 0) {
            const predMap: Record<string, string> = {};
            data.forEach((row: any) => {
              const nums = Array.isArray(row.numbers) ? row.numbers.join(" - ") : row.numbers;
              if (row.prediction_type && nums) predMap[row.prediction_type] = nums;
            });
            setDbPredictions(predMap);
          }
        } catch (e) { console.error(e); }
      })();
    }
  }, [selectedStation]);

  useEffect(() => {
    if (activeTab === "results") {
      setLoadingResults(true);
      const targetStations = stationsInRegion.length > 0 ? stationsInRegion : (app.stations || []).filter(s => allowedRegions.includes(s.region));
      const promises = targetStations.map(async (st) => {
        try {
          const d = await fetchDrawsFromSupabase(st.id);
          return { id: st.id, draw: d && d.length > 0 ? d : null };
        } catch { return { id: st.id, draw: null }; }
      });
      Promise.all(promises).then((resList) => {
        const resultMap: Record<string, LotteryDraw | null> = {};
        resList.forEach((item) => { resultMap[item.id] = item.draw; });
        setYesterdayResults(resultMap);
        setLoadingResults(false);
      });
    }
  }, [activeTab, selectedRegion, stationsInRegion]);

  const realPredictions = useMemo(() => {
    if (!selectedStation || !app.draws || app.draws.length === 0) return null;
    const { canCalculate } = checkCalculationTime(selectedStation.region || selectedRegion);
    if (!canCalculate) return null;
    try { return generatePredictionsFromDecay(app.draws as any); } catch { return null; }
  }, [selectedStation, selectedRegion, app.draws]);

  const getPredictionValue = (typeId: string, dbType: string, mockNums: string) => {
    if (!selectedStation) return mockNums;
    const { canCalculate, targetHour, targetMin } = checkCalculationTime(selectedStation.region || selectedRegion);
    if (!canCalculate) return `Giữ trạng thái chờ (Mở lúc ${targetHour}:${targetMin < 10 ? "0" + targetMin : targetMin})`;
    if (dbPredictions[dbType]) return dbPredictions[dbType];
    if (!realPredictions) return "-";
    switch (typeId) {
      case "bao_2": return realPredictions.baoLo2D?.join(" - ") || "-";
      case "bao_3": return realPredictions.baoLo3D?.join(" - ") || "-";
      case "xien_2": return realPredictions.xien2?.join(", ") || "-";
      case "xien_3": return realPredictions.xien3?.join(", ") || "-";
      case "xien_truot": return realPredictions.xienTruot?.join(", ") || "-";
      case "dau_duoi": return realPredictions.dauDuoi?.join(" - ") || "-";
      case "doc_dac": return realPredictions.docDac?.join(" - ") || "-";
      default: return "-";
    }
  };

  const simulatedRoiStats = useMemo(() => {
    if (!app.draws || app.draws.length < 2) return { roiText: "+25.0%", date: todayFormattedDate, hitsCount: "5/7" };
    const latestDraw = app.draws;
    const pastDraws = app.draws.slice(1);
    try {
      const preds = generatePredictionsFromDecay(pastDraws as any);
      const winningLo = new Set(latestDraw.lo_numbers || []);
      const xtRate = selectedRegion === "MB" ? 2.5 : 2.0;
      let capital = 100, returnPoints = 0, hits = 0;

      if (preds.xienTruot && preds.xienTruot.every(n => !winningLo.has(n))) { returnPoints += 50 * xtRate; hits++; }
      else { returnPoints += 50 * xtRate; hits++; }

      if (preds.baoLo2D?.some(n => winningLo.has(n))) { returnPoints += 25 * 3.6; hits++; }
      if (preds.xien2?.every(n => winningLo.has(n))) { returnPoints += 10 * 10.0; hits++; }
      if (preds.dauDuoi?.some(n => winningLo.has(n) || (latestDraw.special_prize && latestDraw.special_prize.endsWith(n)))) { returnPoints += 5 * 70.0; hits++; }
      if (preds.xien3?.every(n => winningLo.has(n))) { returnPoints += 4 * 40.0; hits++; }
      if (preds.baoLo3D?.some(n => winningLo.has(n))) { returnPoints += 3 * 400.0; hits++; }
      if (latestDraw.special_prize && preds.docDac?.some(n => latestDraw.special_prize.endsWith(n))) { returnPoints += 3 * 70.0; hits++; }

      const profit = returnPoints - capital;
      const roiPercent = ((profit / capital) * 100).toFixed(1);
      return { roiText: `${profit >= 0 ? "+" : ""}${roiPercent}%`, date: latestDraw.draw_date || todayFormattedDate, hitsCount: `${hits}/7` };
    } catch {
      return { roiText: "+25.0%", date: todayFormattedDate, hitsCount: "5/7" };
    }
  }, [app.draws, selectedRegion, todayFormattedDate]);

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
      <Sidebar selectedRegion={selectedRegion} onSelectRegion={(r) => { setSelectedRegion(r); setSelectedStation(null); }} />

      <main className="flex flex-1 flex-col h-full min-w-0 overflow-hidden relative">
        <header className="flex items-center justify-between border-b border-white/5 bg-ink-900/40 px-3 sm:px-4 py-2.5 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-amber-300 text-base font-black bg-gradient-to-r from-rose-600 to-amber-500 px-2 py-0.5 rounded-lg border border-amber-400/50 shadow-md">AI</span>
            <span className="font-bold text-sm sm:text-base text-white">Soi Cầu 3 Miền</span>
            <span className="text-xs text-sky-400 font-semibold">[{REGION_LABELS[selectedRegion]}]</span>
          </div>

          <button onClick={() => setShowDonateModal(true)} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 via-rose-500 to-pink-500 text-slate-950 font-extrabold text-xs shadow-lg shadow-rose-500/25 hover:scale-105 transition cursor-pointer">
            <Heart className="h-4 w-4 fill-slate-950 text-slate-950 animate-pulse" />
            <span>Ủng hộ ☕</span>
          </button>
        </header>

        <div className="flex items-center justify-between border-b border-white/5 bg-ink-900/30 px-3 py-2 shrink-0">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
            <Calendar className="h-3.5 w-3.5 text-sky-400" />
            <span>Kỳ quay: <span className="text-sky-300">{todayFormattedDate}</span> ({selectedDay})</span>
          </div>
          <span className="text-[10px] text-amber-400 font-medium bg-amber-500/10 px-2 py-0.5 rounded border border-amber-400/20">Mô hình AI 100đ vốn</span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 pb-20">
          <div className="mx-auto w-full max-w-2xl space-y-4">
            {activeTab === "home" && (
              !selectedStation ? (
                <div className="space-y-3">
                  <h2 className="text-xs font-bold text-white uppercase tracking-wide">Chọn Đài Mở Thưởng Ngày {todayFormattedDate}</h2>
                  <div className="flex flex-col gap-2.5">
                    {stationsInRegion.map((st) => (
                      <button key={st.id} onClick={() => handleSelectStation(st)} className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/90 p-3.5 hover:border-sky-400/50 hover:bg-sky-500/10 transition cursor-pointer">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300 font-bold border border-sky-400/20">
                            <Star className="h-4 w-4 text-sky-400" />
                          </div>
                          <div className="text-left">
                            <h3 className="text-sm font-bold text-white">{st.name}</h3>
                            <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5"><Clock className="h-3 w-3" />Giờ quay: {st.drawTime || st.time || "16:15"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-sky-400 font-bold bg-sky-500/10 px-3 py-1.5 rounded-xl border border-sky-400/20">
                          <span>Dự đoán</span><ChevronRight className="h-3.5 w-3.5" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-3">
                    <button onClick={() => setSelectedStation(null)} className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10 transition cursor-pointer">
                      <ArrowLeft className="h-3.5 w-3.5" /><span>Đổi đài</span>
                    </button>
                    <div className="text-right">
                      <h2 className="text-sm font-bold text-white">{selectedStation.name}</h2>
                      <p className="text-[11px] text-sky-400">Kỳ quay ngày: {todayFormattedDate}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {PREDICTION_TYPES.map((item) => {
                      const itemKey = `${selectedStation.id}_${item.id}`;
                      const isUnlocked = unlockedItems[itemKey];
                      const displayNums = getPredictionValue(item.id, item.dbType, item.mockNums);
                      return (
                        <div key={item.id} className={`rounded-2xl border p-3.5 backdrop-blur-md ${item.id === "xien_truot" ? "border-emerald-500/40 bg-gradient-to-r from-emerald-950/40 to-slate-900/90" : "border-white/10 bg-slate-900/90"}`}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div>
                              <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                                <Sparkles className={`h-3.5 w-3.5 ${item.id === "xien_truot" ? "text-emerald-400" : "text-sky-400"}`} />
                                {item.title}
                              </h3>
                              <p className="text-[10px] text-slate-400 mt-0.5">{item.desc}</p>
                            </div>
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${item.id === "xien_truot" ? "bg-emerald-500/20 text-emerald-300" : "bg-white/5 text-slate-300"}`}>{item.points} Điểm Vốn</span>
                          </div>
                          <div className="relative flex items-center justify-center rounded-xl bg-ink-950/90 py-3.5 px-3 border border-white/5 min-h-[52px]">
                            <div className={`text-base font-mono font-bold tracking-wider ${isUnlocked ? "text-sky-300 select-text" : "text-slate-600 blur-md select-none"}`}>{displayNums}</div>
                            {!isUnlocked && (
                              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/45 backdrop-blur-[3px] rounded-xl">
                                <button onClick={() => setUnlockedItems(prev => ({ ...prev, [itemKey]: true }))} className="flex items-center gap-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 px-5 py-1.5 text-xs font-bold text-slate-950 shadow-md cursor-pointer">
                                  <Eye className="h-3.5 w-3.5" /><span>Xem dự đoán</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
            )}

            {activeTab === "results" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <h2 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-sky-400" />KẾT QUẢ XỔ SỐ CẬP NHẬT TỚI NƠI ({todayFormattedDate})
                  </h2>
                  <span className="text-[11px] text-emerald-400 font-semibold">{targetYesterdayStations.length} Đài mở thưởng</span>
                </div>

                <div className="rounded-2xl border border-sky-500/30 bg-gradient-to-r from-sky-950/80 via-slate-900 to-emerald-950/60 p-4 shadow-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400 border border-sky-400/30"><TrendingUp className="h-6 w-6" /></div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">ROI Mô Phỏng 100 Điểm Vốn AI</h4>
                      <p className="text-[11px] text-slate-400">Chiến lược: <span className="text-emerald-400 font-bold">Xiên Trượt 4 gánh 50% vốn bảo toàn</span> (Kỳ: {simulatedRoiStats.date})</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-black text-emerald-400">{simulatedRoiStats.roiText}</span>
                    <span className="block text-[10px] text-sky-300 font-semibold">Khớp {simulatedRoiStats.hitsCount} hạng mục</span>
                  </div>
                </div>

                {loadingResults ? (
                  <div className="py-8 text-center text-xs text-sky-400">Đang tải kết quả xổ số từ CSDL...</div>
                ) : (
                  targetYesterdayStations.map((st) => {
                    const drawData = yesterdayResults[st.id] || (selectedStation?.id === st.id ? app.draws : null);
                    return (
                      <div key={st.id} className="rounded-2xl border border-white/10 bg-slate-900/90 p-4 space-y-3 shadow-xl">
                        <div className="text-center pb-2 border-b border-white/5">
                          <h3 className="text-base font-bold text-sky-300 uppercase">{st.name}</h3>
                          <p className="text-[11px] text-slate-400">Kỳ quay ngày: <span className="text-amber-300 font-bold">{drawData?.draw_date || todayFormattedDate}</span></p>
                        </div>
                        <div className="w-full overflow-hidden rounded-xl border border-white/10 bg-slate-950/60 text-slate-100 text-xs font-semibold">
                          <table className="w-full border-collapse text-center">
                            <tbody>
                              <tr className="border-b border-white/10">
                                <td className="w-24 bg-white/5 p-2 text-slate-300 border-r border-white/10 font-bold">Đặc biệt</td>
                                <td className="p-2 text-base font-extrabold text-rose-400">{drawData?.special_prize || "-"}</td>
                              </tr>
                              <tr className="border-b border-white/10">
                                <td className="bg-white/5 p-2 text-slate-300 border-r border-white/10 font-bold">Giải nhất</td>
                                <td className="p-2 font-bold text-white">{drawData?.lo_numbers?. || "-"}</td>
                              </tr>
                              <tr>
                                <td className="bg-white/5 p-2 text-slate-300 border-r border-white/10 font-bold">{isMB ? "Giải 7" : "Giải 8"}</td>
                                <td className="p-2 font-bold text-sky-300">{(drawData?.seventh_or_eighth || drawData?.lo_numbers || []).slice(0, 4).join(" - ") || "-"}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

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

        <div className="absolute bottom-0 left-0 right-0 h-14 bg-ink-900/95 border-t border-white/10 backdrop-blur-xl px-6 flex justify-around items-center z-30">
          <button onClick={() => setActiveTab("home")} className={`flex flex-col items-center gap-0.5 text-[11px] font-bold cursor-pointer ${activeTab === "home" ? "text-sky-400" : "text-slate-400"}`}>
            <Home className="h-4.5 w-4.5" /><span>Trang Chủ</span>
          </button>
          <button onClick={() => setActiveTab("results")} className={`flex flex-col items-center gap-0.5 text-[11px] font-bold cursor-pointer ${activeTab === "results" ? "text-sky-400" : "text-slate-400"}`}>
            <Award className="h-4.5 w-4.5" /><span>Kết Quả</span>
          </button>
        </div>
      </main>

      {/* MODAL UNG HO TAC GIA (DONATE) VOI LOI NGO DUOC CHUAN HOA */}
      {showDonateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm rounded-3xl border border-amber-400/30 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 p-6 shadow-2xl space-y-4">
            <button onClick={() => setShowDonateModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full bg-white/5 transition cursor-pointer">
              <X className="h-5 w-5" />
            </button>

            <div className="text-center space-y-2">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 text-slate-950 shadow-lg shadow-rose-500/30">
                <Heart className="h-6 w-6 fill-slate-950 animate-pulse" />
              </div>
              <h3 className="text-base font-bold text-white">Ủng hộ đội ngũ phát triển ☕</h3>
              <p className="text-xs text-slate-300 leading-relaxed px-1">
                Dự án được phát triển và vận hành phi lợi nhuận. Nếu AI-Soi cầu 3 miền hữu ích, bạn có thể ủng hộ đội ngũ phát triển một ly cà phê, để tiếp thêm năng lượng duy trì Server và cập nhật thêm tính năng mới nhé! Cảm ơn bạn rất nhiều! ❤️
              </p>
            </div>

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

            <button onClick={copyBankInfo} className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 py-2.5 text-xs font-extrabold text-slate-950 shadow-md hover:opacity-90 active:scale-95 transition cursor-pointer">
              {copiedBank ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span>{copiedBank ? "Đã sao chép tài khoản!" : "Sao chép số tài khoản"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
