import { useState } from "react";
import {
  Database,
  Plus,
  Sprout,
  CalendarDays,
  Hash,
  Sparkles,
  Loader2,
} from "lucide-react";
import type { LotteryStation, LotteryDraw } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";
import { Spinner } from "./Feedback";
import { insertDraw, evaluatePendingPredictions, runAutoTune } from "@/lib/data";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseLoInput(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.padStart(2, "0").slice(-2))
    .filter((s) => /^\d{2}$/.test(s));
}

export function DrawsTab({
  station,
  draws,
  onRefresh,
  onSeed,
  seeding,
  evaluatedCount,
}: {
  station: LotteryStation;
  draws: LotteryDraw[];
  onRefresh: () => Promise<void>;
  onSeed: () => Promise<void>;
  seeding: boolean;
  evaluatedCount: number;
}) {
  const [drawDate, setDrawDate] = useState(todayStr());
  const [special, setSpecial] = useState("");
  const [loInput, setLoInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const lo = parseLoInput(loInput);
      if (lo.length === 0) {
        setError("Enter at least one 2-digit lo number.");
        setSaving(false);
        return;
      }
      const draw = await insertDraw(station.id, drawDate, special || null, lo);
      const { tuningTriggered } = await evaluatePendingPredictions(station.id, draw);
      setMessage(
        tuningTriggered
          ? "Draw added. Predictions evaluated. Auto-tuning threshold reached!"
          : "Draw added and pending predictions evaluated."
      );
      if (tuningTriggered) {
        const refreshed = await fetchStationFresh(station.id);
        const freshDraws = draws; // refreshDraws will reload
        await runAutoTune(refreshed, [draw, ...freshDraws].sort(
          (a, b) => new Date(a.draw_date).getTime() - new Date(b.draw_date).getTime()
        ) as LotteryDraw[]);
      }
      setLoInput("");
      setSpecial("");
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add draw");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Database className="h-4 w-4 text-sky-400" />
          <h2 className="text-base font-semibold text-white">Rolling Draw Database</h2>
          <span className="ml-auto chip bg-white/5 text-slate-300">
            {draws.length} / 50 draws
          </span>
        </div>

        <p className="mb-5 text-sm text-slate-400">
          Each station keeps a rolling 50-draw history. Add a new draw result to
          trigger Stage 2 evaluation of any pending predictions for this station.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label className="label mb-1.5 block">Draw Date</label>
              <input
                type="date"
                value={drawDate}
                onChange={(e) => setDrawDate(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label mb-1.5 block">Special Prize (optional)</label>
              <input
                value={special}
                onChange={(e) => setSpecial(e.target.value)}
                placeholder="e.g. 12345"
                className="input font-mono"
              />
            </div>
            <div>
              <label className="label mb-1.5 block">Lo Numbers</label>
              <input
                value={loInput}
                onChange={(e) => setLoInput(e.target.value)}
                placeholder="e.g. 12 34 56 78 90"
                className="input font-mono"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Space or comma separated 2-digit numbers.
              </p>
            </div>
            <button className="btn-primary" onClick={handleAdd} disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              Add Draw &amp; Evaluate
            </button>
          </div>

          <div className="rounded-xl border border-white/5 bg-white/5 p-5">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-400" />
              <p className="text-sm font-semibold text-slate-200">Two-Stage Workflow</p>
            </div>
            <ol className="space-y-3 text-sm text-slate-400">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-sky-500/20 text-xs font-bold text-sky-300">
                  1
                </span>
                <span>
                  <strong className="text-slate-200">Predict</strong> — generate numbers
                  with status <em>PENDING</em> from the Predictions tab.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-xs font-bold text-emerald-300">
                  2
                </span>
                <span>
                  <strong className="text-slate-200">Evaluate</strong> — add a new draw
                  result here; pending predictions are scored and marked <em>EVALUATED</em>.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-xs font-bold text-amber-300">
                  3
                </span>
                <span>
                  <strong className="text-slate-200">Auto-Tune</strong> — every 100
                  evaluated predictions the model re-optimizes its weights.
                </span>
              </li>
            </ol>
            <div className="mt-4 rounded-lg bg-amber-500/5 px-3 py-2 text-xs text-amber-300/80">
              {evaluatedCount} evaluated predictions so far.
            </div>
          </div>
        </div>

        {message && (
          <div className="mt-4 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            {message}
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        )}
      </div>

      <div className="card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Recent Draws · {station.name}</h3>
          <button
            className="btn-secondary"
            onClick={onSeed}
            disabled={seeding}
            title="Generate 50 demo draws for empty stations"
          >
            {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sprout className="h-4 w-4" />}
            {seeding ? "Seeding..." : "Seed Demo Data"}
          </button>
        </div>

        {draws.length === 0 ? (
          <div className="rounded-xl bg-white/5 p-8 text-center">
            <p className="text-sm text-slate-400">
              No draws yet. Click "Seed Demo Data" to fill 50 days of sample history.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {draws.slice(0, 12).map((d) => (
              <div
                key={d.id}
                className="flex flex-col gap-2 rounded-xl bg-white/5 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <CalendarDays className="h-4 w-4 text-slate-500" />
                  <span className="text-sm font-medium text-slate-200">
                    {new Date(d.draw_date).toLocaleDateString()}
                  </span>
                  {d.special_prize && (
                    <span className="chip bg-amber-500/10 font-mono text-amber-300">
                      <Hash className="h-3 w-3" />
                      {d.special_prize}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {d.lo_numbers.slice(0, 18).map((lo, i) => (
                    <span
                      key={i}
                      className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs text-slate-300"
                    >
                      {lo}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

async function fetchStationFresh(id: string): Promise<LotteryStation> {
  const { data, error } = await supabase
    .from("lottery_stations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as LotteryStation;
}
