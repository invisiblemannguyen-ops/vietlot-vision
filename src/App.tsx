import { useState, useEffect, useMemo } from "react";
import { useAppData, fetchDrawsFromSupabase } from "@/hooks/useAppData";
import { FullPageLoader } from "@/components/Feedback";
import { REGION_LABELS } from "@/lib/constants";
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
  MapPin,
  Lock,
} from "lucide-react";

export type RegionId = "MB" | "MT" | "MN";

const REGION_MAP: Record<RegionId, string[]> = {
  MB: ["MB", "BAC", "XSMB"],
  MT: ["MT", "TRUNG", "XSMT"],
  MN: ["MN", "NAM", "XSMN"],
};

const PREDICTION_TYPES = [
  { id: "bao_2", dbType: "bao_lo_2d", title: "Bao Lô 2 Số" },
  { id: "bao_3", dbType: "bao_lo_3d", title: "Bao Lô 3D (3 Càng)" },
  { id: "xien_2", dbType: "xien_2", title: "Xiên 2" },
  { id: "xien_3", dbType: "xien_3", title: "Xiên 3" },
  { id: "xien_truot", dbType: "xien_truot", title: "Xiên Trượt (4 số)" },
  { id: "dau_duoi", dbType: "dau_duoi", title: "Đầu Đuôi" },
  { id: "doc_dac", dbType: "doc_dac", title: "Giải Đặc Biệt (Đề ĐB)" },
];

const WEEKDAYS = ["Chủ Nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

const getTodayName = () => WEEKDAYS[new Date().getDay()];

// Kiểm tra mốc 3 tiếng trước giờ xổ từng miền:
// Miền Nam xổ 16h15 -> Mở 13h15
// Miền Trung xổ 17h15 -> Mở 14h15
// Miền Bắc xổ 18h15 -> Mở 15h15
const checkCalculationTime = (region: string): boolean => {
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
  return currentMinutes >= unlockMinutes;
};

export default function App() {
  const todayName = useMemo(() => getTodayName(), []);

  const [selectedRegion, setSelectedRegion] = useState<RegionId>("MN");
  const [selectedStation, setSelectedStation] = useState<{ id: string; name: string; region: string } | null>(null);
  const [selectedDay] = useState<string>(todayName);

  const [activeTab, setActiveTab] = useState<"home" | "results">("home");
  const [unlockedItems, setUnlockedItems] = useState<Record<string, boolean>>({});

  // Lưu dự đoán nạp trực tiếp từ bảng predictions trên Supabase
  const [dbPredictions, setDbPredictions] = useState<Record<string, string>>({});
  const [loadingPredictions, setLoadingPredictions] = useState<boolean>(false);

  const [yesterdayResults, setYesterdayResults] = useState<Record<string, LotteryDraw | null>>({});
  const [loadingResults, setLoadingResults] = useState<boolean>(false);

  const app = useAppData();

  const allowedRegions = REGION_MAP[selectedRegion] || [selectedRegion];
  const scheduledForToday = (SCHEDULE_BY_DAY[selectedDay] || []).filter((s) => allowedRegions.includes(s.region));

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

  // NẠP BỘ SỐ DỰ ĐOÁN ĐÃ TÍNH SẴN TỪ BẢNG PREDICTIONS SUPABASE (CÁCH 2 - CHỐNG LỘ THUẬT TOÁN)
  useEffect(() => {
    if (selectedStation) {
      setLoadingPredictions(true);
      (async () => {
        try {
          const { data, error } = await supabase
            .from("predictions")
            .select("prediction_type, numbers")
            .eq("station_id", selectedStation.id)
            .order("created_at", { ascending: false })
            .limit(10);

          if (!error && data) {
            const predMap: Record<string, string> = {};
            data.forEach((row: any) => {
              const nums = Array.isArray(row.numbers) ? row.numbers.join(" - ") : row.numbers;
              if (row.prediction_type && nums) {
                predMap[row.prediction_type] = nums;
              }
            });
            setDbPredictions(predMap);
          }
        } catch {
          // Bỏ qua lỗi kết nối
        } finally {
          setLoadingPredictions(false);
        }
      })();
    }
  }, [selectedStation]);

  // NẠP KẾT QUẢ XỔ SỐ TỪ CSDL SUPABASE CHO TAB KẾT QUẢ
  useEffect(() => {
    if (activeTab === "results") {
      setLoadingResults(true);
      const promises = stationsInRegion.map(async (st) => {
        const d = await fetchDrawsFromSupabase(st.id);
        return { id: st.id, draw: d && d.length > 0 ? d[0] : null };
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

  const getPredictionValue = (dbType: string, stationRegion: string) => {
    const canCalculate = checkCalculationTime(stationRegion);

    if (!canCalculate || loadingPredictions) {
      return "Đang tính toán...";
    }

    return dbPredictions[dbType] || "Đang tính toán...";
  };

  const handleUnlock = (typeId: string, stationRegion: string) => {
    if (!selectedStation) return;
    const canCalculate = checkCalculationTime(stationRegion);
    if (!canCalculate) {
      alert("Hệ thống đang tính toán... Dự đoán sẽ hiển thị trước giờ xổ 3 tiếng.");
      return;
    }
    setUnlockedItems((prev) => ({ ...prev, [`${selectedStation.id}_${typeId}`]: true }));
  };

  if (app.loading) return <FullPageLoader label="Đang nạp CSDL..." />;

  const isMB = selectedRegion === "MB";

  return (
    <div className="flex justify-center items-center h-screen w-full bg-slate-950 font-sans overflow-hidden">
      <main className="w-full max-w-md h-screen flex flex-col bg-slate-900 border-x border-white/10 shadow-2xl relative overflow-hidden">
        
        {/* HEADER CHUẨN */}
        <header className="flex items-center justify-between border-b border-white/10 bg-slate-950 px-3 py-2 shrink-0">
          <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-white/10">
            <button
              onClick={() => setActiveTab("home")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                activeTab === "home"
                  ? "bg-sky-500 text-slate-950 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Home className="h-3.5 w-3.5" />
              <span>Trang chủ</span>
            </button>

            <button
              onClick={() => setActiveTab("results")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                activeTab === "results"
                  ? "bg-sky-500 text-slate-950 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Award className="h-3.5 w-3.5" />
              <span>Kết quả</span>
            </button>
          </div>

          <span className="text-xs font-bold text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-lg border border-sky-400/20">
            {REGION_LABELS[selectedRegion]}
          </span>
        </header>

        {/* THANH CHỌN MIỀN */}
        <div className="grid grid-cols-3 gap-1 px-2 py-1.5 bg-slate-950/80 border-b border-white/5 shrink-0">
          {(["MN", "MT", "MB"] as RegionId[]).map((reg) => (
            <button
              key={reg}
              onClick={() => { setSelectedRegion(reg); setSelectedStation(null); }}
              className={`py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 ${
                selectedRegion === reg
                  ? "bg-sky-500 text-slate-950 shadow-sm"
                  : "bg-white/5 text-slate-400 hover:text-white"
              }`}
            >
              <MapPin className="h-3 w-3" />
              <span>{REGION_LABELS[reg]}</span>
            </button>
          ))}
        </div>

        {/* NỘI DUNG CHÍNH */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2 scrollbar-none">

          {/* TAB 1: TRANG CHỦ */}
          {activeTab === "home" && (
            <>
              {!selectedStation ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1 py-0.5">
                    <h2 className="text-xs font-bold text-white flex items-center gap-1 uppercase tracking-wide">
                      <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                      Chọn Đài Mở Thưởng ({selectedDay})
                    </h2>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    {stationsInRegion.map((st) => (
                      <button
                        key={st.id}
                        onClick={() => handleSelectStation(st)}
                        className="group flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/90 p-2.5 text-left transition hover:border-sky-400/50 hover:bg-sky-500/10 cursor-pointer shadow-sm"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-300 font-bold border border-sky-400/20">
                            <Star className="h-4 w-4 text-sky-400 fill-sky-400/30" />
                          </div>
                          <div>
                            <h3 className="text-xs font-bold text-white group-hover:text-sky-300">{st.name}</h3>
                            <p className="text-[10px] text-slate-400 flex items-center gap-1">
                              <Clock className="h-3 w-3 text-slate-400" />
                              <span>Giờ quay: {st.drawTime || st.time || "16:15"}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-sky-400 font-bold bg-sky-500/10 px-2.5 py-1 rounded-lg border border-sky-400/20">
                          <span>Dự đoán</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2 pb-2">
                  <div className="flex items-center justify-between border-b border-white/5 pb-1 px-1">
                    <button
                      onClick={() => setSelectedStation(null)}
                      className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs font-medium text-slate-300 hover:bg-white/10 transition cursor-pointer"
                    >
                      <ArrowLeft className="h-3 w-3" />
                      <span>Đổi đài</span>
                    </button>
                    <div className="text-right">
                      <h2 className="text-xs font-bold text-white">{selectedStation.name}</h2>
                      <p className="text-[10px] text-sky-400">{REGION_LABELS[selectedStation.region] || selectedStation.region}</p>
                    </div>
                  </div>

                  {/* 7 HẠNG MỤC DỰ ĐOÁN NẠP TỪ SUPABASE */}
                  <div className="grid grid-cols-1 gap-1.5">
                    {PREDICTION_TYPES.map((item) => {
                      const itemKey = `${selectedStation.id}_${item.id}`;
                      const isUnlocked = unlockedItems[itemKey];
                      const currentReg = selectedStation.region || selectedRegion;
                      const canCalculate = checkCalculationTime(currentReg);
                      const displayNums = getPredictionValue(item.dbType, currentReg);

                      return (
                        <div
                          key={item.id}
                          className="relative overflow-hidden rounded-xl border border-white/10 p-2 bg-slate-900/90 shadow-sm space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                              <Sparkles className="h-3 w-3 text-sky-400" />
                              {item.title}
                            </h3>
                          </div>

                          <div className="relative flex items-center justify-center rounded-lg bg-slate-950 py-1.5 px-2 border border-white/5 min-h-[36px]">
                            <div
                              className={`text-xs font-mono font-bold tracking-wider transition-all ${
                                isUnlocked && canCalculate
                                  ? "text-sky-300 blur-none select-text"
                                  : "text-slate-400 select-none"
                              }`}
                            >
                              {displayNums}
                            </div>

                            {(!isUnlocked || !canCalculate) && (
                              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px] rounded-lg">
                                <button
                                  onClick={() => handleUnlock(item.id, currentReg)}
                                  className="flex items-center gap-1 rounded-md bg-sky-500 hover:bg-sky-400 px-3 py-1 text-xs font-bold text-slate-950 shadow active:scale-95 transition cursor-pointer"
                                >
                                  {!canCalculate ? <Lock className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                  <span>{!canCalculate ? "Đang tính toán..." : "Xem dự đoán"}</span>
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
            <div className="space-y-2 pb-2">
              <div className="flex items-center justify-between border-b border-white/5 pb-1 px-1">
                <h2 className="text-xs font-bold text-white flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-sky-400" />
                  KẾT QUẢ XỔ SỐ ({REGION_LABELS[selectedRegion]})
                </h2>
                <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-400/20">
                  {stationsInRegion.length} Đài mở thưởng
                </span>
              </div>

              {loadingResults ? (
                <div className="py-6 text-center text-xs text-sky-400">Đang tải kết quả từ CSDL...</div>
              ) : (
                stationsInRegion.map((st) => {
                  const drawData = yesterdayResults[st.id];
                  if (!drawData) {
                    return (
                      <div key={st.id} className="rounded-xl border border-white/10 bg-slate-900/90 p-3 text-center text-xs text-slate-400 shadow-sm">
                        <span className="font-bold text-sky-300 uppercase">{st.name}</span>: Chưa có dữ liệu kỳ mới nhất trong CSDL
                      </div>
                    );
                  }

                  return (
                    <div key={st.id} className="rounded-xl border border-white/10 bg-slate-900/90 p-2 space-y-1.5 shadow-sm">
                      <div className="text-center pb-1 border-b border-white/5">
                        <h3 className="text-xs font-bold text-sky-300 uppercase">{st.name}</h3>
                        <p className="text-[10px] text-slate-400">
                          Kỳ quay ngày: <span className="text-amber-300 font-bold">{drawData.draw_date}</span>
                        </p>
                      </div>

                      <div className="w-full overflow-hidden rounded-lg border border-white/10 bg-slate-950/60 text-slate-100 text-xs font-semibold">
                        {isMB ? (
                          <table className="w-full border-collapse text-center">
                            <tbody>
                              <tr className="border-b border-white/10">
                                <td className="w-20 bg-white/5 p-1 text-slate-300 border-r border-white/10 font-bold">Đặc biệt</td>
                                <td className="p-1 font-extrabold text-rose-400 tracking-wider text-sm">
                                  {drawData.special_prize || "-"}
                                </td>
                              </tr>
                              <tr className="border-b border-white/10">
                                <td className="bg-white/5 p-1 text-slate-300 border-r border-white/10 font-bold">Giải nhất</td>
                                <td className="p-1 font-bold text-white">{drawData.lo_numbers?.[0] || "-"}</td>
                              </tr>
                              <tr className="border-b border-white/10">
                                <td className="bg-white/5 p-1 text-slate-300 border-r border-white/10 font-bold">Giải nhì</td>
                                <td className="p-1 font-bold text-white">
                                  {(drawData.lo_numbers?.[1] || "-") + " - " + (drawData.lo_numbers?.[2] || "-")}
                                </td>
                              </tr>
                              <tr className="border-b border-white/10">
                                <td className="bg-white/5 p-1 text-slate-300 border-r border-white/10 font-bold">Giải ba</td>
                                <td className="p-1 font-bold text-white">
                                  {(drawData.lo_numbers?.[3] || "-") + " - " + (drawData.lo_numbers?.[4] || "-") + " - " + (drawData.lo_numbers?.[5] || "-")}
                                </td>
                              </tr>
                              <tr>
                                <td className="bg-white/5 p-1 text-slate-300 border-r border-white/10 font-bold">Giải bảy</td>
                                <td className="p-1 font-bold text-sky-300">
                                  {drawData.seventh_or_eighth?.join(" - ") || "-"}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        ) : (
                          <table className="w-full border-collapse text-center">
                            <tbody>
                              <tr className="border-b border-white/10">
                                <td className="w-20 bg-white/5 p-1 text-slate-300 border-r border-white/10 font-bold">Giải tám</td>
                                <td className="p-1 font-bold text-sky-300 text-sm">
                                  {drawData.seventh_or_eighth?.[0] || "-"}
                                </td>
                              </tr>
                              <tr className="border-b border-white/10">
                                <td className="bg-white/5 p-1 text-slate-300 border-r border-white/10 font-bold">Giải nhất</td>
                                <td className="p-1 font-bold text-white">{drawData.lo_numbers?.[0] || "-"}</td>
                              </tr>
                              <tr className="border-b border-white/10">
                                <td className="bg-white/5 p-1 text-slate-300 border-r border-white/10 font-bold">Giải nhì</td>
                                <td className="p-1 font-bold text-white">{drawData.lo_numbers?.[1] || "-"}</td>
                              </tr>
                              <tr>
                                <td className="bg-white/5 p-1 text-slate-300 border-r border-white/10 font-bold">Đặc biệt</td>
                                <td className="p-1 font-extrabold text-rose-400 tracking-wider text-sm">
                                  {drawData.special_prize || "-"}
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

      </main>
    </div>
  );
}
