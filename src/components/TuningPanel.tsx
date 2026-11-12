import {
  Wrench,
  Cpu,
  History,
  TrendingUp,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import type { LotteryStation, LotteryTuningLog } from "@/lib/supabase";
import { TUNING_INTERVAL } from "@/lib/supabase";
import { Spinner } from "./Feedback";

export function TuningPanel({
  station,
  logs,
  evaluatedCount,
  tuning,
  onTune,
}: {
  station: LotteryStation;
  logs: LotteryTuningLog[];
  evaluatedCount: number;
  tuning: boolean;
  onTune: () => void;
}) {
  const nextTuneAt = Math.ceil((evaluatedCount + 1) / TUNING_INTERVAL) * TUNING_INTERVAL;
  const progress = (evaluatedCount % TUNING_INTERVAL) / TUNING_INTERVAL * 100;

  return (
    <div className="space-y-6">
      <div className="card overflow-hidden">
        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="label">Stage 3 · Self-Learning</p>
            <h2 className="mt-1 text-xl font-bold text-white">Auto-Tuning Module</h2>
            <p className="mt-1 max-w-xl text-sm text-slate-400">
              Every {TUNING_INTERVAL} evaluated predictions, the model backtests candidate
              decay-weight combinations and adopts the configuration with the highest
              historical win rate.
            </p>
          </div>
          <button className="btn-primary" onClick={onTune} disabled={tuning}>
            {tuning ? <Spinner className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
            {tuning ? "Optimizing..." : "Run Auto-Tune Now"}
          </button>
        </div>

        <div className="grid gap-4 border-t border-white/5 p-6 sm:grid-cols-3">
          <div>
            <p className="label">Current Weights</p>
            <p className="mt-1 font-mono text-lg font-bold text-sky-300">
              {station.w1} : {station.w2} : {station.w3}
            </p>
            <p className="text-[11px] text-slate-500">W1 : W2 : W3</p>
          </div>
          <div>
            <p className="label">Evaluated Predictions</p>
            <p className="mt-1 text-lg font-bold text-white">{evaluatedCount}</p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Next auto-tune at {nextTuneAt}
            </p>
          </div>
          <div>
            <p className="label">Last Tuned</p>
            <p className="mt-1 text-sm font-medium text-slate-200">
              {station.tuned_at
                ? new Date(station.tuned_at).toLocaleDateString()
                : "Never"}
            </p>
            <p className="text-[11px] text-slate-500">
              {logs.length} tuning {logs.length === 1 ? "run" : "runs"} recorded
            </p>
          </div>
        </div>
      </div>

      <div className="card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Cpu className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-white">How It Works</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              n: 1,
              t: "Backtest grid search",
              d: "Searches candidate W1:W2:W3 weight combinations against the rolling 50-draw history.",
            },
            {
              n: 2,
              t: "Win-rate optimization",
              d: "Each candidate is scored by average hit rate across a 20-draw backtest window.",
            },
            {
              n: 3,
              t: "Adopt best config",
              d: "The weights with the highest win rate are saved and used for the next predictions.",
            },
          ].map((s) => (
            <div key={s.n} className="rounded-xl bg-white/5 p-4">
              <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/20 text-xs font-bold text-sky-300">
                {s.n}
              </div>
              <p className="text-sm font-semibold text-slate-100">{s.t}</p>
              <p className="mt-1 text-xs text-slate-400">{s.d}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-6">
        <div className="mb-4 flex items-center gap-2">
          <History className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-white">Parameter Tuning Logs</h3>
        </div>

        {logs.length === 0 ? (
          <div className="rounded-xl bg-white/5 p-6 text-center">
            <p className="text-sm text-slate-400">
              No tuning runs yet. Run auto-tune to optimize the model.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => {
              const oldW = log.old_weights;
              const newW = log.new_weights;
              return (
                <div
                  key={log.id}
                  className="flex flex-col gap-3 rounded-xl bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <TrendingUp className="h-4 w-4 text-emerald-400" />
                    <div>
                      <p className="text-sm font-medium text-slate-200">
                        Tuning #{log.evaluated_count} evaluated
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {new Date(log.created_at).toLocaleString()} · {log.candidates_tried} candidates · {log.backtest_window}-draw window
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="rounded bg-white/5 px-2 py-1 text-slate-400">
                      {oldW.w1}:{oldW.w2}:{oldW.w3}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
                    <span className="rounded bg-sky-500/15 px-2 py-1 text-sky-300">
                      {newW.w1}:{newW.w2}:{newW.w3}
                    </span>
                    <span className="chip bg-emerald-500/15 text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" />
                      {log.best_win_rate.toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
