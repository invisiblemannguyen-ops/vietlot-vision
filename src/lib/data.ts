import { supabase, ROLLING_WINDOW } from "./supabase";
import type {
  LotteryStation,
  LotteryDraw,
  LotteryPrediction,
  LotteryTuningLog,
  PredictionType,
} from "./supabase";
import {
  scoreDigits,
  generatePredictions,
  type Weights,
} from "./prediction";
import { evaluatePrediction, autoTune, shouldTune } from "./evaluation";
import { TUNING_INTERVAL } from "./supabase";

/* ----------------------------- Stations ----------------------------- */

export async function fetchStations(): Promise<LotteryStation[]> {
  const { data, error } = await supabase
    .from("lottery_stations")
    .select("*")
    .order("region", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as LotteryStation[];
}

export async function fetchStation(id: string): Promise<LotteryStation | null> {
  const { data, error } = await supabase
    .from("lottery_stations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as LotteryStation) ?? null;
}

export async function updateStationWeights(
  id: string,
  weights: Weights
): Promise<void> {
  const { error } = await supabase
    .from("lottery_stations")
    .update({ w1: weights.w1, w2: weights.w2, w3: weights.w3, tuned_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/* ------------------------------ Draws ------------------------------- */

export async function fetchDraws(stationId: string): Promise<LotteryDraw[]> {
  const { data, error } = await supabase
    .from("lottery_draws")
    .select("*")
    .eq("station_id", stationId)
    .order("draw_date", { ascending: false })
    .limit(ROLLING_WINDOW);
  if (error) throw error;
  return (data ?? []) as LotteryDraw[];
}

export async function insertDraw(
  stationId: string,
  drawDate: string,
  specialPrize: string | null,
  loNumbers: string[]
): Promise<LotteryDraw> {
  const { data, error } = await supabase
    .from("lottery_draws")
    .insert({
      station_id: stationId,
      draw_date: drawDate,
      special_prize: specialPrize,
      lo_numbers: loNumbers,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as LotteryDraw;
}

export async function insertManyDraws(
  draws: Array<{
    station_id: string;
    draw_date: string;
    special_prize: string | null;
    lo_numbers: string[];
  }>
): Promise<void> {
  const { error } = await supabase.from("lottery_draws").insert(draws);
  if (error) throw error;
}

/* -------------------------- Predictions ----------------------------- */

export async function fetchPendingPredictions(
  stationId: string
): Promise<LotteryPrediction[]> {
  const { data, error } = await supabase
    .from("lottery_predictions")
    .select("*")
    .eq("station_id", stationId)
    .eq("status", "PENDING")
    .order("target_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as LotteryPrediction[];
}

export async function fetchRecentPredictions(
  stationId: string,
  limit = 24
): Promise<LotteryPrediction[]> {
  const { data, error } = await supabase
    .from("lottery_predictions")
    .select("*")
    .eq("station_id", stationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as LotteryPrediction[];
}

export async function fetchEvaluatedCount(stationId: string): Promise<number> {
  const { count, error } = await supabase
    .from("lottery_predictions")
    .select("*", { count: "exact", head: true })
    .eq("station_id", stationId)
    .eq("status", "EVALUATED");
  if (error) throw error;
  return count ?? 0;
}

/**
 * Stage 1: Generate predictions for the next draw day using the rolling
 * 50-draw history. Saves them with PENDING status.
 */
export async function generateAndSavePredictions(
  station: LotteryStation,
  draws: LotteryDraw[]
): Promise<LotteryPrediction[]> {
  // draws come newest-first; we need oldest-first for scoring
  const ordered = [...draws].sort(
    (a, b) => new Date(a.draw_date).getTime() - new Date(b.draw_date).getTime()
  );

  const weights: Weights = { w1: station.w1, w2: station.w2, w3: station.w3 };
  const scoreData = scoreDigits(ordered, weights);
  const preds = generatePredictions(scoreData);

  // Target date = day after the most recent draw
  const latest = ordered[ordered.length - 1];
  const target = new Date(latest.draw_date);
  target.setDate(target.getDate() + 1);

  const rows = preds.map((p) => ({
    station_id: station.id,
    target_date: target.toISOString().slice(0, 10),
    prediction_type: p.prediction_type,
    numbers: p.numbers,
    score_data: scoreData,
    weights,
    status: "PENDING" as const,
  }));

  const { data, error } = await supabase
    .from("lottery_predictions")
    .insert(rows)
    .select("*");
  if (error) throw error;
  return (data ?? []) as LotteryPrediction[];
}

/**
 * Stage 2: Evaluate pending predictions against a new draw result.
 * Computes hits, hit-rate, payout, ROI and marks them EVALUATED.
 */
export async function evaluatePendingPredictions(
  stationId: string,
  draw: LotteryDraw
): Promise<{ evaluated: number; tuningTriggered: boolean }> {
  const pending = await fetchPendingPredictions(stationId);
  if (pending.length === 0) return { evaluated: 0, tuningTriggered: false };

  const updates = pending.map((p) => {
    const r = evaluatePrediction(
      { prediction_type: p.prediction_type, numbers: p.numbers },
      draw
    );
    return {
      id: p.id,
      status: "EVALUATED" as const,
      hits: r.hits,
      hit_count: r.hit_count,
      total_predicted: r.total_predicted,
      hit_rate: r.hit_rate,
      payout: r.payout,
      cost: r.cost,
      roi: r.roi,
      evaluated_at: new Date().toISOString(),
    };
  });

  const { error } = await supabase.from("lottery_predictions").upsert(updates, {
    onConflict: "id",
  });
  if (error) throw error;

  // Check if auto-tuning should trigger
  const evaluatedCount = await fetchEvaluatedCount(stationId);
  return {
    evaluated: pending.length,
    tuningTriggered: shouldTune(evaluatedCount, TUNING_INTERVAL),
  };
}

/* --------------------------- Tuning logs ---------------------------- */

export async function fetchTuningLogs(
  stationId: string,
  limit = 12
): Promise<LotteryTuningLog[]> {
  const { data, error } = await supabase
    .from("lottery_tuning_logs")
    .select("*")
    .eq("station_id", stationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as LotteryTuningLog[];
}

export async function addTuningLog(
  stationId: string,
  entry: {
    evaluated_count: number;
    old_weights: Weights;
    new_weights: Weights;
    best_win_rate: number;
    candidates_tried: number;
    backtest_window: number;
  }
): Promise<void> {
  const { error } = await supabase.from("lottery_tuning_logs").insert({
    station_id: stationId,
    ...entry,
  });
  if (error) throw error;
}

/**
 * Run the auto-tuning loop for a station, persist the new weights + a log entry.
 */
export async function runAutoTune(
  station: LotteryStation,
  draws: LotteryDraw[]
): Promise<{ winRate: number; oldWeights: Weights; newWeights: Weights; improved: boolean }> {
  const oldWeights: Weights = { w1: station.w1, w2: station.w2, w3: station.w3 };
  const result = autoTune(draws, oldWeights);
  const newWeights = result.bestWeights;

  await updateStationWeights(station.id, newWeights);
  await addTuningLog(station.id, {
    evaluated_count: await fetchEvaluatedCount(station.id),
    old_weights: oldWeights,
    new_weights: newWeights,
    best_win_rate: result.bestWinRate,
    candidates_tried: result.candidatesTried,
    backtest_window: result.windowSize,
  });

  return {
    winRate: result.bestWinRate,
    oldWeights,
    newWeights,
    improved: result.improved,
  };
}

/* ------------------------- Demo data seeding ------------------------ */

/** Vietnamese-style lo numbers: 2-digit 00-99. Returns N unique draws. */
function generateLoNumbers(seed: number): { special: string; lo: string[] } {
  // Deterministic-ish pseudo random based on seed
  const rng = (s: number) => {
    const x = Math.sin(s * 9999) * 10000;
    return x - Math.floor(x);
  };

  // special prize: 5-digit number (XSMB style) or 6-digit (XSMN/XSMT)
  const specialLen = seed % 2 === 0 ? 5 : 6;
  let special = "";
  for (let i = 0; i < specialLen; i++) {
    special += Math.floor(rng(seed * 7 + i * 13) * 10).toString();
  }

  // Generate ~18 lo numbers (common daily count for a station)
  const loSet = new Set<string>();
  let s = seed;
  while (loSet.size < 18) {
    s += 1;
    const n = Math.floor(rng(s) * 100);
    loSet.add(n.toString().padStart(2, "0"));
  }

  return { special, lo: Array.from(loSet) };
}

/**
 * Seed 50 days of demo draws for every station, oldest = today-50.
 * Skips stations that already have draws.
 */
export async function seedDemoDraws(
  stations: LotteryStation[]
): Promise<{ stationId: string; seeded: number }[]> {
  const results: { stationId: string; seeded: number }[] = [];

  for (const station of stations) {
    const existing = await fetchDraws(station.id);
    if (existing.length >= ROLLING_WINDOW) {
      results.push({ stationId: station.id, seeded: 0 });
      continue;
    }

    const rows: Array<{
      station_id: string;
      draw_date: string;
      special_prize: string | null;
      lo_numbers: string[];
    }> = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = ROLLING_WINDOW - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const { special, lo } = generateLoNumbers(
        station.id.charCodeAt(0) * 100 + i
      );
      rows.push({
        station_id: station.id,
        draw_date: d.toISOString().slice(0, 10),
        special_prize: special,
        lo_numbers: lo,
      });
    }

    await insertManyDraws(rows);
    results.push({ stationId: station.id, seeded: rows.length });
  }

  return results;
}

export const PRED_TYPE_OPTIONS: PredictionType[] = [
  "bao_lo_2d",
  "bao_lo_3d",
  "dau_duoi",
  "doc_dac",
  "xien_2",
  "xien_3",
];
