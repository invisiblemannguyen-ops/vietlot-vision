import { scoreDigits, generatePredictions, PAYOUT_MULTIPLIERS, STAKE_PER_NUMBER } from "./prediction";
import type { Weights } from "./prediction";
import type { LotteryDraw, LotteryPrediction, PredictionType, DigitScoreData } from "./supabase";
import { BUCKET_SIZES } from "./supabase";

/** Extract raw 2-digit lo numbers from a prediction's `numbers` array. */
function extractLoNumbers(numbers: string[]): string[] {
  const out: string[] = [];
  for (const n of numbers) {
    if (n.includes("-")) {
      // xiên string like "12 - 34 - 56"
      n.split("-")
        .map((s) => s.trim())
        .forEach((s) => {
          if (/^\d{2,3}$/.test(s)) out.push(s);
        });
    } else if (/^\d{2,3}$/.test(n)) {
      out.push(n);
    } else if (n.startsWith("Đầu ")) {
      // tens-digit prediction: matches any lo whose tens digit equals
      // represented as "ĐT<n>"
      out.push(`ĐT${n.slice(4)}`);
    } else if (n.startsWith("Đuôi ")) {
      out.push(`ĐO${n.slice(5)}`);
    }
  }
  return out;
}

function loHits(draw: LotteryDraw, candidate: string): boolean {
  if (candidate.startsWith("ĐT")) {
    const d = candidate.slice(2);
    return draw.lo_numbers.some((lo) => lo.padStart(2, "0")[0] === d);
  }
  if (candidate.startsWith("ĐO")) {
    const d = candidate.slice(2);
    return draw.lo_numbers.some((lo) => lo.padStart(2, "0").slice(-1) === d);
  }
  return draw.lo_numbers.includes(candidate.padStart(2, "0"));
}

export interface EvalResult {
  hits: string[];
  hit_count: number;
  total_predicted: number;
  hit_rate: number;
  payout: number;
  cost: number;
  roi: number;
}

/**
 * Evaluate a prediction against an actual draw result.
 * hit_rate = (numbers that hit) / (numbers predicted) * 100
 * payout = hit_count * multiplier * stake
 * roi = (payout - cost) / cost * 100
 */
export function evaluatePrediction(
  prediction: {
    prediction_type: PredictionType;
    numbers: string[];
  },
  draw: LotteryDraw
): EvalResult {
  const candidates = extractLoNumbers(prediction.numbers);
  const total = candidates.length || 1;
  const hits = candidates.filter((c) => loHits(draw, c));
  const hit_count = hits.length;
  const hit_rate = (hit_count / total) * 100;

  const multiplier = PAYOUT_MULTIPLIERS[prediction.prediction_type] ?? 0;
  const cost = total * STAKE_PER_NUMBER;
  const payout = hit_count * multiplier * STAKE_PER_NUMBER;
  const roi = cost > 0 ? ((payout - cost) / cost) * 100 : 0;

  return { hits, hit_count, total_predicted: total, hit_rate, payout, cost, roi };
}

/**
 * Backtest a weight configuration over a historical window.
 * For each draw in the window (older draws used as history), generate predictions
 * for that draw using the preceding 50 draws, then evaluate them.
 * Returns the average hit rate (%) across all predictions and draws.
 */
export function backtestWeights(
  draws: LotteryDraw[],
  weights: Weights,
  windowSize = 20
): { avgHitRate: number; evaluated: number } {
  const ordered = [...draws].sort(
    (a, b) => new Date(a.draw_date).getTime() - new Date(b.draw_date).getTime()
  );
  const needed = BUCKET_SIZES.reduce((a, b) => a + b, 0); // 50
  if (ordered.length <= needed) return { avgHitRate: 0, evaluated: 0 };

  const startIdx = ordered.length - needed - windowSize;
  const usable = Math.max(0, startIdx);

  let totalRate = 0;
  let count = 0;

  for (let i = ordered.length - windowSize; i < ordered.length; i++) {
    if (i < needed) continue;
    const history = ordered.slice(i - needed, i);
    const target = ordered[i];

    const scoreData = scoreDigits(history, weights);
    const preds = generatePredictions(scoreData);

    for (const p of preds) {
      const r = evaluatePrediction(p, target);
      totalRate += r.hit_rate;
      count += 1;
    }
  }

  return {
    avgHitRate: count > 0 ? totalRate / count : 0,
    evaluated: count,
  };
}

/** Candidate weight grids searched during auto-tuning. */
export function candidateWeightGrid(): Weights[] {
  const candidates: Weights[] = [];
  const base: Array<keyof Weights> = ["w1", "w2", "w3"];
  const options = [3, 4, 5, 6, 7, 8];
  for (const a of options) {
    for (const b of options) {
      for (const c of options) {
        if (a >= b && b >= c) {
          candidates.push({ w1: a, w2: b, w3: c });
        }
      }
    }
  }
  // ensure default present
  if (!candidates.some((w) => w.w1 === 5 && w.w2 === 3 && w.w3 === 2)) {
    candidates.push({ w1: 5, w2: 3, w3: 2 });
  }
  void base;
  return candidates;
}

export interface TuneResult {
  bestWeights: Weights;
  bestWinRate: number;
  candidatesTried: number;
  windowSize: number;
  improved: boolean;
}

/**
 * Run the auto-tuning loop: search the candidate grid for the weights
 * yielding the highest backtested average hit rate.
 */
export function autoTune(
  draws: LotteryDraw[],
  current: Weights,
  windowSize = 20
): TuneResult {
  const candidates = candidateWeightGrid();
  let best = current;
  let bestRate = -1;

  for (const w of candidates) {
    const r = backtestWeights(draws, w, windowSize);
    if (r.avgHitRate > bestRate) {
      bestRate = r.avgHitRate;
      best = w;
    }
  }

  const currentRate = backtestWeights(draws, current, windowSize).avgHitRate;
  return {
    bestWeights: best,
    bestWinRate: bestRate,
    candidatesTried: candidates.length,
    windowSize,
    improved: bestRate > currentRate,
  };
}

/** Count evaluated predictions for a station. */
export function shouldTune(evaluatedCount: number, interval: number): boolean {
  return evaluatedCount > 0 && evaluatedCount % interval === 0;
}

export type { DigitScoreData };
export type { LotteryPrediction };
