import { supabase, type Station, type DrawResult, type Prediction } from "./supabase";
import { generatePredictionsFromDecay } from "./decayAlgorithm";

/* ----------------------------- 1. Stations & Configs ----------------------------- */

export async function fetchStations(): Promise<Station[]> {
  const { data, error } = await supabase
    .from("stations")
    .select("*")
    .order("region", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Station[];
}

export async function fetchModelConfig(stationId: string) {
  const { data, error } = await supabase
    .from("model_configs")
    .select("*")
    .eq("station_id", stationId)
    .maybeSingle();
  if (error) return { w1: 5.0, w2: 3.0, w3: 2.0 };
  return data ? { w1: data.w1, w2: data.w2, w3: data.w3 } : { w1: 5.0, w2: 3.0, w3: 2.0 };
}

/* ------------------------------ 2. Draws (50 Kỳ Quay) ------------------------------- */

export async function fetchRecentDraws(stationId: string, limit = 50): Promise<DrawResult[]> {
  const { data, error } = await supabase
    .from("draw_results")
    .select("*")
    .eq("station_id", stationId)
    .order("draw_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as DrawResult[];
}

/* -------------------------- 3. Stage 1: Dự đoán mới (PENDING) ----------------------------- */

export async function generateAndSavePredictions(stationId: string, targetDate: string) {
  const draws = await fetchRecentDraws(stationId, 50);
  if (draws.length === 0) return null;

  const weights = await fetchModelConfig(stationId);
  const predictions = generatePredictionsFromDecay(draws, weights);

  const rows = [
    { station_id: stationId, target_draw_date: targetDate, prediction_type: "bao_lo_2d", numbers: predictions.baoLo2D, status: "PENDING" },
    { station_id: stationId, target_draw_date: targetDate, prediction_type: "bao_lo_3d", numbers: predictions.baoLo3D, status: "PENDING" },
    { station_id: stationId, target_draw_date: targetDate, prediction_type: "dau_duoi", numbers: predictions.dauDuoi, status: "PENDING" },
    { station_id: stationId, target_draw_date: targetDate, prediction_type: "xien_2", numbers: predictions.xien2, status: "PENDING" },
    { station_id: stationId, target_draw_date: targetDate, prediction_type: "xien_3", numbers: predictions.xien3, status: "PENDING" },
    { station_id: stationId, target_draw_date: targetDate, prediction_type: "xien_truot", numbers: predictions.xienTruot, status: "PENDING" },
    { station_id: stationId, target_draw_date: targetDate, prediction_type: "doc_dac", numbers: predictions.docDac, status: "PENDING" },
  ];

  const { data, error } = await supabase.from("predictions").insert(rows).select("*");
  if (error) throw error;
  return data as Prediction[];
}

/* -------------------------- 4. Stage 2: Soi vé khi có KQ mới (EVALUATED) ----------------------------- */

export async function fetchPendingPredictions(stationId: string): Promise<Prediction[]> {
  const { data, error } = await supabase
    .from("predictions")
    .select("*")
    .eq("station_id", stationId)
    .eq("status", "PENDING")
    .order("target_draw_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Prediction[];
}
