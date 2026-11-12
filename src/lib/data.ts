import { supabase } from "./supabase";
import type {
  Station,
  DrawResult,
  Prediction,
  PredictionType,
} from "./supabase";
import { generatePredictionsFromDecay } from "./decayAlgorithm";

const ROLLING_WINDOW = 50;

/* ----------------------------- 1. STATIONS ----------------------------- */

export async function fetchStations(): Promise<Station[]> {
  const { data, error } = await supabase
    .from("stations")
    .select("*")
    .order("name", { ascending: true });
  if (error) return [];
  return (data ?? []) as Station[];
}

export async function fetchStation(id: string): Promise<Station | null> {
  const { data, error } = await supabase
    .from("stations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return null;
  return (data as Station) ?? null;
}

/* ------------------------------ 2. DRAWS ------------------------------- */

export async function fetchDraws(stationId: string): Promise<DrawResult[]> {
  const { data, error } = await supabase
    .from("draw_results")
    .select("*")
    .eq("station_id", stationId)
    .order("draw_date", { ascending: false })
    .limit(ROLLING_WINDOW);

  if (error) return [];
  return (data ?? []).map((d: any) => ({
    id: String(d.id),
    station_id: d.station_id,
    draw_date: d.draw_date,
    special_prize: d.special_prize || null,
    lo_numbers: d.lo_numbers || [],
    seventh_or_eighth: d.seventh_or_eighth || [],
  })) as DrawResult[];
}

/* -------------------------- 3. PREDICTIONS ----------------------------- */

export async function fetchRecentPredictions(
  stationId: string,
  limit = 24
): Promise<Prediction[]> {
  const { data, error } = await supabase
    .from("predictions")
    .select("*")
    .eq("station_id", stationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as Prediction[];
}

export async function fetchEvaluatedCount(stationId: string): Promise<number> {
  const { count, error } = await supabase
    .from("predictions")
    .select("*", { count: "exact", head: true })
    .eq("station_id", stationId)
    .eq("status", "EVALUATED");

  if (error) return 0;
  return count ?? 0;
}

export async function generateAndSavePredictions(
  station: Station,
  draws: DrawResult[]
): Promise<Prediction[]> {
  if (!station || draws.length === 0) return [];
  const targetStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const generated = generatePredictionsFromDecay(draws);

  const rows = [
    { station_id: station.id, target_draw_date: targetStr, prediction_type: "bao_lo_2d", numbers: generated.baoLo2D, status: "PENDING" },
    { station_id: station.id, target_draw_date: targetStr, prediction_type: "bao_lo_3d", numbers: generated.baoLo3D, status: "PENDING" },
    { station_id: station.id, target_draw_date: targetStr, prediction_type: "dau_duoi", numbers: generated.dauDuoi, status: "PENDING" },
    { station_id: station.id, target_draw_date: targetStr, prediction_type: "xien_2", numbers: generated.xien2, status: "PENDING" },
    { station_id: station.id, target_draw_date: targetStr, prediction_type: "xien_3", numbers: generated.xien3, status: "PENDING" },
    { station_id: station.id, target_draw_date: targetStr, prediction_type: "xien_truot", numbers: generated.xienTruot, status: "PENDING" },
    { station_id: station.id, target_draw_date: targetStr, prediction_type: "doc_dac", numbers: generated.docDac, status: "PENDING" },
  ];

  const { data, error } = await supabase.from("predictions").insert(rows).select("*");
  if (error) return [];
  return (data ?? []) as Prediction[];
}

export async function fetchTuningLogs(stationId: string, limit = 12) {
  return [];
}
