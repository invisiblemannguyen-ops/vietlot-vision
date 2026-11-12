import { useMemo } from "react";
import {
  TrendingUp,
  Target,
  Percent,
  Wallet,
  Award,
  type LucideIcon,
} from "lucide-react";
import type { LotteryPrediction } from "@/lib/supabase";
import { PREDICTION_TYPE_LABELS } from "@/lib/supabase";

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  tone?: "default" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-400"
      : tone === "negative"
      ? "text-rose-400"
      : "text-white";
  return (
    <div className="card card-hover p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="label">{label}</p>
        <Icon className="h-4 w-4 text-slate-500" />
      </div>
      <p className={`stat-value ${toneClass}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function MiniBarChart({ data }: { data: { label: string; value: number; max: number }[] }) {
  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-xs text-slate-400">{d.label}</span>
          <div className="h-6 flex-1 overflow-hidden rounded-lg bg-white/5">
            <div
              className="h-full rounded-lg bg-gradient-to-r from-sky-500 to-cyan-400 transition-all duration-500"
              style={{ width: `${d.max > 0 ? Math.max(2, (d.value / d.max) * 100) : 0}%` }}
            />
          </div>
          <span className="w-14 shrink-0 text-right font-mono text-xs text-slate-300">
            {d.value.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsPanel({
  predictions,
}: {
  predictions: LotteryPrediction[];
}) {
  const stats = useMemo(() => {
    const evaluated = predictions.filter((p) => p.status === "EVALUATED");
    const total = evaluated.length;
    const avgHitRate =
      total > 0 ? evaluated.reduce((s, p) => s + p.hit_rate, 0) / total : 0;
    const totalPayout = evaluated.reduce((s, p) => s + p.payout, 0);
    const totalCost = evaluated.reduce((s, p) => s + p.cost, 0);
    const roi = totalCost > 0 ? ((totalPayout - totalCost) / totalCost) * 100 : 0;
    const totalHits = evaluated.reduce((s, p) => s + p.hit_count, 0);

    const byType: Record<string, { rate: number; count: number }> = {};
    for (const p of evaluated) {
      const key = p.prediction_type;
      if (!byType[key]) byType[key] = { rate: 0, count: 0 };
      byType[key].rate += p.hit_rate;
      byType[key].count += 1;
    }
    const perType = Object.entries(byType).map(([k, v]) => ({
      label: PREDICTION_TYPE_LABELS[k as keyof typeof PREDICTION_TYPE_LABELS] ?? k,
      value: v.count > 0 ? v.rate / v.count : 0,
    }));
    const maxRate = Math.max(1, ...perType.map((t) => t.value));

    return {
      total,
      avgHitRate,
      roi,
      totalHits,
      totalPayout,
      totalCost,
      perType: perType.map((t) => ({ ...t, max: maxRate })),
      evaluated,
    };
  }, [predictions]);

  if (stats.total === 0) {
    return (
      <div className="card p-10 text-center">
        <Target className="mx-auto h-8 w-8 text-slate-500" />
        <p className="mt-3 text-base font-semibold text-slate-200">No evaluated predictions yet</p>
        <p className="mt-1 text-sm text-slate-400">
          Add a new draw result on the Draws &amp; Data tab to evaluate pending predictions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Avg Hit Rate"
          value={`${stats.avgHitRate.toFixed(1)}%`}
          sub={`${stats.total} evaluated predictions`}
          icon={Target}
        />
        <StatCard
          label="Overall ROI"
          value={`${stats.roi >= 0 ? "+" : ""}${stats.roi.toFixed(1)}%`}
          sub={`${stats.totalPayout.toFixed(0)} payout / ${stats.totalCost.toFixed(0)} cost`}
          icon={Percent}
          tone={stats.roi >= 0 ? "positive" : "negative"}
        />
        <StatCard
          label="Total Hits"
          value={String(stats.totalHits)}
          sub="across all prediction types"
          icon={Award}
          tone="positive"
        />
        <StatCard
          label="Net Profit"
          value={`${(stats.totalPayout - stats.totalCost).toFixed(0)}`}
          sub={stats.totalPayout - stats.totalCost >= 0 ? "in profit" : "at a loss"}
          icon={Wallet}
          tone={stats.totalPayout - stats.totalCost >= 0 ? "positive" : "negative"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-6">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-sky-400" />
            <h3 className="text-sm font-semibold text-white">Hit Rate by Prediction Type</h3>
          </div>
          <MiniBarChart data={stats.perType} />
        </div>

        <div className="card p-6">
          <div className="mb-4 flex items-center gap-2">
            <Award className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Recent Evaluated Predictions</h3>
          </div>
          <div className="space-y-2">
            {stats.evaluated.slice(0, 6).map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium text-slate-200">
                    {PREDICTION_TYPE_LABELS[p.prediction_type]}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {p.target_date} · {p.hit_count}/{p.total_predicted} hits
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-white">{p.hit_rate.toFixed(0)}%</p>
                  <p
                    className={`text-[11px] ${
                      p.roi >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {p.roi >= 0 ? "+" : ""}
                    {p.roi.toFixed(0)}% ROI
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
