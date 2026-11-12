import { useMemo } from "react";
import {
  Sparkles,
  Clock,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Hash,
} from "lucide-react";
import type { LotteryStation, LotteryPrediction } from "@/lib/supabase";
import { PREDICTION_TYPE_LABELS } from "@/lib/supabase";
import { scoreDigits } from "@/lib/prediction";
import type { Weights } from "@/lib/prediction";
import type { LotteryDraw } from "@/lib/supabase";
import { Spinner } from "./Feedback";

function PredictionCard({ p }: { p: LotteryPrediction }) {
  const evaluated = p.status === "EVALUATED";
  const positiveRoi = p.roi >= 0;
  return (
    <div className="card card-hover animate-fade-up p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Hash className="h-4 w-4 text-sky-400" />
          <p className="font-bold text-white">{PREDICTION_TYPE_LABELS[p.prediction_type]}</p>
        </div>
        {evaluated ? (
          <span className="chip bg-emerald-500/15 text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" /> Evaluated
          </span>
        ) : (
          <span className="chip bg-amber-500/15 text-amber-300">
            <Clock className="h-3.5 w-3.5" /> Pending
          </span>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {p.numbers.map((n, i) => (
          <span
            key={`${n}-${i}`}
            className="rounded-lg bg-white/5 px-2.5 py-1.5 font-mono text-sm font-semibold text-slate-100"
          >
            {n}
          </span>
        ))}
      </div>

      {evaluated && (
        <div className="grid grid-cols-3 gap-3 border-t border-white/5 pt-4">
          <div>
            <p className="label">Hit Rate</p>
            <p className="stat-value text-lg">{p.hit_rate.toFixed(1)}%</p>
            <p className="text-[11px] text-slate-400">{p.hit_count}/{p.total_predicted}</p>
          </div>
          <div>
            <p className="label">Payout</p>
            <p className="stat-value text-lg">{p.payout.toFixed(0)}</p>
            <p className="text-[11px] text-slate-400">cost {p.cost.toFixed(0)}</p>
          </div>
          <div>
            <p className="label">ROI</p>
            <p
              className={`stat-value text-lg ${
                positiveRoi ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {positiveRoi ? "+" : ""}
              {p.roi.toFixed(1)}%
            </p>
            <p className="text-[11px] text-slate-400">
              {positiveRoi ? "profit" : "loss"}
            </p>
          </div>
        </div>
      )}

      {evaluated && p.hits.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-xs text-slate-400">Hits:</span>
          {p.hits.map((h, i) => (
            <span key={i} className="chip bg-emerald-500/15 font-mono text-emerald-300">
              {h}
            </span>
          ))}
        </div>
      )}
      {evaluated && p.hits.length === 0 && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-rose-300/80">
          <XCircle className="h-3.5 w-3.5" /> No hits this round
        </div>
      )}
    </div>
  );
}

export function PredictionPanel({
  station,
  draws,
  recent,
  generating,
  onGenerate,
}: {
  station: LotteryStation;
  draws: LotteryDraw[];
  recent: LotteryPrediction[];
  generating: boolean;
  onGenerate: () => void;
}) {
  const scoreData = useMemo(() => {
    if (draws.length === 0) return null;
    const ordered = [...draws].sort(
      (a, b) => new Date(a.draw_date).getTime() - new Date(b.draw_date).getTime()
    );
    const weights: Weights = { w1: station.w1, w2: station.w2, w3: station.w3 };
    return scoreDigits(ordered, weights);
  }, [draws, station]);

  const pending = recent.filter((p) => p.status === "PENDING");
  const evaluated = recent.filter((p) => p.status === "EVALUATED");

  return (
    <div className="space-y-6">
      <div className="card overflow-hidden">
        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="label">Stage 1 · Prediction Engine</p>
            <h2 className="mt-1 text-xl font-bold text-white">
              Generate predictions for {station.name}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Weighted time-decay model · W1:W2:W3 = {station.w1}:{station.w2}:{station.w3}{" "}
              · across 50 recent draws
            </p>
          </div>
          <button
            className="btn-primary"
            onClick={onGenerate}
            disabled={generating || draws.length === 0}
          >
            {generating ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            {generating ? "Generating..." : "Generate Prediction"}
          </button>
        </div>

        {draws.length === 0 && (
          <div className="border-t border-white/5 bg-amber-500/5 px-6 py-3 text-sm text-amber-300">
            No draw history yet. Seed demo data from the Draws &amp; Data tab first.
          </div>
        )}
      </div>

      {pending.length > 0 && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
              Pending Predictions · {pending.length}
            </h3>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pending.map((p) => (
              <PredictionCard key={p.id} p={p} />
            ))}
          </div>
        </div>
      )}

      {evaluated.length > 0 && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
              Evaluated Predictions · {evaluated.length}
            </h3>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {evaluated.map((p) => (
              <PredictionCard key={p.id} p={p} />
            ))}
          </div>
        </div>
      )}

      {recent.length === 0 && !generating && (
        <div className="card p-10 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-slate-500" />
          <p className="mt-3 text-base font-semibold text-slate-200">No predictions yet</p>
          <p className="mt-1 text-sm text-slate-400">
            Click "Generate Prediction" to run the model and create your first set.
          </p>
        </div>
      )}

      {scoreData && (
        <details className="card p-5">
          <summary className="cursor-pointer text-sm font-semibold text-slate-300">
            Raw digit scores (Hundreds / Tens / Ones)
          </summary>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {(["hundreds", "tens", "ones"] as const).map((pos) => (
              <div key={pos}>
                <p className="label mb-2 capitalize">{pos}</p>
                <div className="flex flex-wrap gap-1.5 font-mono text-xs">
                  {scoreData[pos].map((s, d) => (
                    <span key={d} className="rounded bg-white/5 px-2 py-1 text-slate-300">
                      {d}:{s.toFixed(2)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
