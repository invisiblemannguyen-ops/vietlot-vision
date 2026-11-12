import { useMemo } from "react";
import {
  Ticket,
  Database,
  Target,
  Wrench,
  TrendingUp,
  Layers,
} from "lucide-react";
import type { LotteryStation, LotteryDraw, LotteryPrediction } from "@/lib/supabase";
import { scoreDigits } from "@/lib/prediction";
import type { Weights } from "@/lib/prediction";
import { Heatmap } from "./Heatmap";
import { ROLLING_WINDOW } from "@/lib/supabase";

function StatPill({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: typeof Ticket;
  tone?: "default" | "positive" | "negative" | "info";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-300"
      : tone === "negative"
      ? "text-rose-300"
      : tone === "info"
      ? "text-sky-300"
      : "text-slate-200";
  return (
    <div className="card card-hover flex items-center gap-3 p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5">
        <Icon className="h-5 w-5 text-sky-400" />
      </div>
      <div>
        <p className="label">{label}</p>
        <p className={`text-lg font-bold ${toneClass}`}>{value}</p>
      </div>
    </div>
  );
}

export function Dashboard({
  station,
  draws,
  predictions,
}: {
  station: LotteryStation;
  draws: LotteryDraw[];
  predictions: LotteryPrediction[];
}) {
  const scoreData = useMemo(() => {
    if (draws.length === 0) return null;
    const ordered = [...draws].sort(
      (a, b) => new Date(a.draw_date).getTime() - new Date(b.draw_date).getTime()
    );
    const weights: Weights = { w1: station.w1, w2: station.w2, w3: station.w3 };
    return scoreDigits(ordered, weights);
  }, [draws, station]);

  const pendingCount = predictions.filter((p) => p.status === "PENDING").length;
  const evaluated = predictions.filter((p) => p.status === "EVALUATED");
  const avgHit =
    evaluated.length > 0
      ? evaluated.reduce((s, p) => s + p.hit_rate, 0) / evaluated.length
      : 0;
  const avgRoi =
    evaluated.length > 0
      ? evaluated.reduce((s, p) => s + p.roi, 0) / evaluated.length
      : 0;

  return (
    <div className="space-y-6">
      <div className="card overflow-hidden">
        <div className="relative p-6">
          <div className="absolute inset-0 bg-gradient-to-br from-sky-500/10 via-transparent to-cyan-400/5" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="chip bg-sky-500/15 text-sky-300">
                  {station.region}
                </span>
                <span className="chip bg-white/5 text-slate-300">
                  W {station.w1}:{station.w2}:{station.w3}
                </span>
              </div>
              <h1 className="text-2xl font-bold text-white">{station.name}</h1>
              <p className="mt-1 text-sm text-slate-400">
                Rolling {ROLLING_WINDOW}-draw prediction model · {draws.length} draws loaded
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500/20 to-cyan-400/10">
                <Ticket className="h-8 w-8 text-sky-300" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatPill
          label="Draws Loaded"
          value={`${draws.length}/${ROLLING_WINDOW}`}
          icon={Database}
          tone="info"
        />
        <StatPill
          label="Pending Predictions"
          value={String(pendingCount)}
          icon={Layers}
          tone={pendingCount > 0 ? "positive" : "default"}
        />
        <StatPill
          label="Avg Hit Rate"
          value={`${avgHit.toFixed(1)}%`}
          icon={Target}
          tone={avgHit >= 50 ? "positive" : avgHit > 0 ? "info" : "default"}
        />
        <StatPill
          label="Avg ROI"
          value={`${avgRoi >= 0 ? "+" : ""}${avgRoi.toFixed(1)}%`}
          icon={TrendingUp}
          tone={avgRoi >= 0 ? "positive" : "negative"}
        />
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <Wrench className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
            Hot / Cold Digit Heatmap
          </h2>
        </div>
        <Heatmap scoreData={scoreData} />
      </div>
    </div>
  );
}
