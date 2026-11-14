import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { LotteryStation, LotteryDraw } from "@/lib/supabase";
import {
  fetchStations,
  seedDemoDraws,
  generateAndSavePredictions,
  runAutoTune,
} from "@/lib/data";

const ROLLING_WINDOW = 50;

/**
 * Trình ánh xá ID từ Schedule / UI sang đúng station_id trong CSDL Supabase
 * do scrape_minhngoc.py lưu (VD: tay_ninh -> TAYNINH, xsmb -> MB, hue -> TTHUE)
 */
export function getPossibleStationIds(id: string): string[] {
  if (!id) return [];
  const raw = id.trim();
  const lower = raw.toLowerCase();
  const upperNoUnderscore = raw.toUpperCase().replace(/_/g, "");

  const map: Record<string, string> = {
    xsmb: "MB",
    mb: "MB",
    bac: "MB",
    hue: "TTHUE",
    tphcm: "TPHCM",
    hcm: "TPHCM",
  };

  const mapped = map[lower] || upperNoUnderscore;

  const set = new Set([
    mapped,
    upperNoUnderscore,
    raw,
    lower,
    raw.toUpperCase(),
  ]);

  return Array.from(set);
}

/**
 * Hàm fetchDraws chuẩn hóa ID truy vấn CSDL Supabase
 */
export async function fetchDrawsFromSupabase(stationId: string): Promise<LotteryDraw[]> {
  const sbIds = getPossibleStationIds(stationId);
  try {
    const { data, error } = await supabase
      .from("draw_results")
      .select("*")
      .in("station_id", sbIds)
      .order("draw_date", { ascending: false })
      .limit(ROLLING_WINDOW);

    if (error || !data) return [];

    return data.map((d: any) => ({
      id: String(d.id),
      station_id: d.station_id,
      draw_date: d.draw_date,
      special_prize: Array.isArray(d.special_prize)
        ? d.special_prize[0]
        : d.special_prize || null,
      lo_numbers: d.lo_numbers || [],
      seventh_or_eighth: d.seventh_or_eighth || [],
    })) as LotteryDraw[];
  } catch {
    return [];
  }
}

export interface AppData {
  stations: LotteryStation[];
  selectedStation: LotteryStation | null;
  draws: LotteryDraw[];
  loading: boolean;
  error: string | null;
  selecting: boolean;
  generating: boolean;
  tuning: boolean;
  refreshing: boolean;
  selectStation: (id: string) => void;
  refreshDraws: () => Promise<void>;
  generatePredictions: () => Promise<void>;
  runTuning: () => Promise<void>;
  seedDemo: () => Promise<void>;
}

export function useAppData(): AppData {
  const [stations, setStations] = useState<LotteryStation[]>([]);
  const [selectedStation, setSelectedStation] = useState<LotteryStation | null>(null);
  const [draws, setDraws] = useState<LotteryDraw[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [tuning, setTuning] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadStations = useCallback(async () => {
    try {
      const s = await fetchStations();
      setStations(s);
      if (s.length > 0) {
        const target = selectedStation || s[0];
        setSelectedStation(target);
        const d = await fetchDrawsFromSupabase(target.id);
        setDraws(d);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stations");
    }
  }, [selectedStation]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadStations();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectStation = useCallback((id: string) => {
    setSelecting(true);
    setError(null);
    (async () => {
      try {
        const sbIds = getPossibleStationIds(id);
        const { data } = await supabase
          .from("stations")
          .select("*")
          .in("id", sbIds)
          .maybeSingle();

        const station = (data as LotteryStation) || { id, name: id, region: "MN" };
        setSelectedStation(station);

        const d = await fetchDrawsFromSupabase(id);
        setDraws(d);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to select station");
      } finally {
        setSelecting(false);
      }
    })();
  }, []);

  const refreshDraws = useCallback(async () => {
    if (!selectedStation) return;
    setRefreshing(true);
    try {
      const d = await fetchDrawsFromSupabase(selectedStation.id);
      setDraws(d);
      const s = await fetchStations();
      setStations(s);
      const updated = s.find((x) => getPossibleStationIds(x.id).includes(selectedStation.id));
      if (updated) setSelectedStation(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  }, [selectedStation]);

  const generatePredictions = useCallback(async () => {
    if (!selectedStation) return;
    setGenerating(true);
    setError(null);
    try {
      const d = await fetchDrawsFromSupabase(selectedStation.id);
      setDraws(d);
      await generateAndSavePredictions(selectedStation, d as any);
      await refreshDraws();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate predictions");
    } finally {
      setGenerating(false);
    }
  }, [selectedStation, refreshDraws]);

  const runTuning = useCallback(async () => {
    if (!selectedStation) return;
    setTuning(true);
    setError(null);
    try {
      const d = await fetchDrawsFromSupabase(selectedStation.id);
      setDraws(d);
      await runAutoTune(selectedStation, d as any);
      await refreshDraws();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Auto-tuning failed");
    } finally {
      setTuning(false);
    }
  }, [selectedStation, refreshDraws]);

  const seedDemo = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      await seedDemoDraws(stations);
      await loadStations();
      if (selectedStation) {
        const d = await fetchDrawsFromSupabase(selectedStation.id);
        setDraws(d);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Seeding failed");
    } finally {
      setRefreshing(false);
    }
  }, [stations, selectedStation, loadStations]);

  return {
    stations,
    selectedStation,
    draws,
    loading,
    error,
    selecting,
    generating,
    tuning,
    refreshing,
    selectStation,
    refreshDraws,
    generatePredictions,
    runTuning,
    seedDemo,
  };
}
