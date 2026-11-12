import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Station, DrawResult } from "@/lib/supabase";
import {
  fetchStations,
  fetchDraws,
  seedDemoDraws,
  generateAndSavePredictions,
  runAutoTune,
} from "@/lib/data";

export interface AppData {
  stations: Station[];
  selectedStation: Station | null;
  draws: DrawResult[];
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
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [draws, setDraws] = useState<DrawResult[]>([]);
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
      if (s.length > 0 && !selectedStation) {
        setSelectedStation(s[0]);
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
  }, [loadStations]);

  const selectStation = useCallback((id: string) => {
    setSelecting(true);
    setError(null);
    (async () => {
      try {
        const { data, error } = await supabase
          .from("stations")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (error) throw error;
        const station = data as Station;
        setSelectedStation(station);
        const d = await fetchDraws(id);
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
      const d = await fetchDraws(selectedStation.id);
      setDraws(d);
      const s = await fetchStations();
      setStations(s);
      const updated = s.find((x) => x.id === selectedStation.id);
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
      const d = await fetchDraws(selectedStation.id);
      setDraws(d);
      await generateAndSavePredictions(selectedStation, d);
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
      const d = await fetchDraws(selectedStation.id);
      setDraws(d);
      await runAutoTune(selectedStation, d);
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
        const d = await fetchDraws(selectedStation.id);
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
