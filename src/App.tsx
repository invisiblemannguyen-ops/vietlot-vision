import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import type { TabId } from "@/components/nav";
import { TABS } from "@/components/nav";
import { Dashboard } from "@/components/Dashboard";
import { PredictionPanel } from "@/components/PredictionPanel";
import { AnalyticsPanel } from "@/components/AnalyticsPanel";
import { TuningPanel } from "@/components/TuningPanel";
import { DrawsTab } from "@/components/DrawsTab";
import { FullPageLoader, ErrorState } from "@/components/Feedback";
import { useAppData } from "@/hooks/useAppData";
import { fetchRecentPredictions, fetchEvaluatedCount, fetchTuningLogs } from "@/lib/data";
import type { LotteryPrediction, LotteryTuningLog } from "@/lib/supabase";

function App() {
  const [tab, setTab] = useState<TabId>("dashboard");
  const [predictions, setPredictions] = useState<LotteryPrediction[]>([]);
  const [evaluatedCount, setEvaluatedCount] = useState(0);
  const [tuningLogs, setTuningLogs] = useState<LotteryTuningLog[]>([]);

  const app = useAppData();
  const { selectedStation, draws } = app;

  const refreshAux = useCallback(async () => {
    if (!selectedStation) return;
    try {
      const [p, c, l] = await Promise.all([
        fetchRecentPredictions(selectedStation.id, 60),
        fetchEvaluatedCount(selectedStation.id),
        fetchTuningLogs(selectedStation.id, 12),
      ]);
      setPredictions(p);
      setEvaluatedCount(c);
      setTuningLogs(l);
    } catch {
      /* surfaced in main error */
    }
  }, [selectedStation]);

  useEffect(() => {
    refreshAux();
  }, [refreshAux, draws.length, selectedStation?.w1, selectedStation?.w2, selectedStation?.w3]);

  // Whenever a tab becomes active, refresh aux data so analytics stays current.
  useEffect(() => {
    refreshAux();
  }, [tab, refreshAux]);

  if (app.loading) return <FullPageLoader label="Connecting to lottery database..." />;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-ink-950 text-slate-100">
      {/* Sidebar dành cho Desktop (Tự ẩn trên Mobile) */}
      <Sidebar
        active={tab}
        onTab={setTab}
        stations={app.stations}
        selectedStation={selectedStation}
        onSelectStation={app.selectStation}
      />

      <main className="flex flex-1 flex-col overflow-hidden w-full min-w-0">
        {/* Header chính */}
        <header className="flex flex-col border-b border-white/5 bg-ink-900/40 backdrop-blur-xl">
          <div className="flex items-center justify-between px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <span className="font-semibold text-slate-200">Vietlot Vision</span>
              <span className="text-slate-600">/</span>
              <span className="capitalize">{tab}</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
              {app.error && (
                <span className="chip bg-rose-500/10 text-rose-300 text-[11px] sm:text-xs">
                  {app.error}
                </span>
              )}
              {app.refreshing && (
                <span className="chip bg-white/5 text-slate-400 text-[11px] sm:text-xs">
                  <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 animate-pulse rounded-full bg-sky-400" />
                  syncing
                </span>
              )}
              <span className="chip bg-emerald-500/10 text-emerald-300 text-[11px] sm:text-xs">
                <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-emerald-400" />
                DB connected
              </span>
            </div>
          </div>

          {/* Thanh chọn Đài & Chuyển Tab trên Điện thoại (chỉ hiển thị trên mobile: md:hidden) */}
          <div className="flex flex-col gap-2 border-t border-white/5 px-4 py-2 md:hidden">
            {/* Chọn Đài */}
            <div className="flex items-center gap-2 overflow-x-auto py-1">
              <span className="text-xs font-semibold text-slate-400 shrink-0">Đài:</span>
              {app.stations.map((s) => {
                const isActive = selectedStation?.id === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => app.selectStation(s.id)}
                    className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                      isActive
                        ? "bg-sky-500/20 text-sky-300 border border-sky-400/30"
                        : "bg-white/5 text-slate-300 border border-transparent"
                    }`}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>

            {/* Chuyển Tab */}
            <div className="flex items-center gap-1 overflow-x-auto py-1 border-t border-white/5">
              {TABS.map((t) => {
                const Icon = t.icon;
                const isActive = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                      isActive
                        ? "bg-sky-500/20 text-sky-300"
                        : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        {/* Nội dung chính tràn 100% chiều ngang */}
        <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
          <div className="mx-auto max-w-7xl">
            {!selectedStation ? (
              <ErrorState message="No station selected." />
            ) : tab === "dashboard" ? (
              <Dashboard
                station={selectedStation}
                draws={draws}
                predictions={predictions}
              />
            ) : tab === "predictions" ? (
              <PredictionPanel
                station={selectedStation}
                draws={draws}
                recent={predictions}
                generating={app.generating}
                onGenerate={async () => {
                  await app.generatePredictions();
                  await refreshAux();
                }}
              />
            ) : tab === "analytics" ? (
              <AnalyticsPanel predictions={predictions} />
            ) : tab === "tuning" ? (
              <TuningPanel
                station={selectedStation}
                logs={tuningLogs}
                evaluatedCount={evaluatedCount}
                tuning={app.tuning}
                onTune={async () => {
                  await app.runTuning();
                  await refreshAux();
                }}
              />
            ) : tab === "data" ? (
              <DrawsTab
                station={selectedStation}
                draws={draws}
                evaluatedCount={evaluatedCount}
                onRefresh={async () => {
                  await app.refreshDraws();
                  await refreshAux();
                }}
                onSeed={app.seedDemo}
                seeding={app.refreshing}
              />
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
