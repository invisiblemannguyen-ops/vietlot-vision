import { Flame, Snowflake } from "lucide-react";
import { hotCold } from "@/lib/prediction";
import type { DigitScoreData } from "@/lib/supabase";

const POSITIONS: Array<{
  key: "hundreds" | "tens" | "ones";
  label: string;
  short: string;
}> = [
  { key: "hundreds", label: "Hundreds", short: "H" },
  { key: "tens", label: "Tens", short: "T" },
  { key: "ones", label: "Ones", short: "O" },
];

function colorFor(score: number, max: number): string {
  if (max <= 0) return "bg-white/5 text-slate-500";
  const ratio = score / max;
  if (ratio > 0.8) return "bg-rose-500/80 text-white";
  if (ratio > 0.6) return "bg-orange-500/70 text-white";
  if (ratio > 0.4) return "bg-amber-500/60 text-amber-50";
  if (ratio > 0.2) return "bg-sky-500/40 text-sky-50";
  return "bg-slate-700/50 text-slate-400";
}

export function Heatmap({ scoreData }: { scoreData: DigitScoreData | null }) {
  if (!scoreData) {
    return (
      <div className="card p-6">
        <p className="text-sm text-slate-400">No digit scores yet. Generate a prediction to see hot/cold analysis.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {POSITIONS.map((pos) => {
        const scores = scoreData[pos.key];
        const max = Math.max(...scores);
        const { hot, cold } = hotCold(scores, 3);

        return (
          <div key={pos.key} className="card card-hover p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {pos.label}
                </p>
                <p className="text-lg font-bold text-white">Digits 0–9</p>
              </div>
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500/20 to-cyan-400/10 text-sm font-bold text-sky-300`}>
                {pos.short}
              </div>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {scores.map((score, digit) => (
                <div
                  key={digit}
                  className={`flex flex-col items-center justify-center rounded-lg py-2.5 transition-transform hover:scale-105 ${colorFor(score, max)}`}
                  title={`Digit ${digit}: score ${score.toFixed(2)}`}
                >
                  <span className="text-sm font-bold">{digit}</span>
                  <span className="text-[10px] opacity-80">{score.toFixed(1)}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <Flame className="h-3.5 w-3.5 text-rose-400" />
                <span className="text-slate-400">Hot:</span>
                <div className="flex gap-1">
                  {hot.map((h) => (
                    <span key={h.digit} className="chip bg-rose-500/15 text-rose-300">
                      {h.digit}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Snowflake className="h-3.5 w-3.5 text-sky-300" />
                <span className="text-slate-400">Cold:</span>
                <div className="flex gap-1">
                  {cold.map((c) => (
                    <span key={c.digit} className="chip bg-sky-500/15 text-sky-300">
                      {c.digit}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
