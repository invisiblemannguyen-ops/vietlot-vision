import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://YOUR_PROJECT_ID.supabase.co";
const supabaseAnonKey = "sb_publishable_gd0nNLRnNq4ppRWbMk6KEw_F8n13jQf";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type LotteryRegion = "BAC" | "TRUNG" | "NAM" | "XSMB" | "XSMT" | "XSMN" | "MB" | "MT" | "MN";

export type PredictionType =
  | "bao_lo_2d"
  | "bao_lo_3d"
  | "dau_duoi"
  | "doc_dac"
  | "xien_2"
  | "xien_3"
  | "xien_truot";

export interface Station {
  id: string;
  name: string;
  region: LotteryRegion;
}

export interface ModelConfig {
  id: string;
  station_id: string;
  w1: number;
  w2: number;
  w3: number;
  updated_at?: string;
}

export interface DrawResult {
  id: string;
  station_id: string;
  draw_date: string;
  special_prize: string | null;
  lo_numbers: string[];
  seventh_or_eighth?: string[];
  created_at?: string;
}

export interface Prediction {
  id: string;
  station_id: string;
  target_draw_date: string;
  prediction_type: PredictionType;
  numbers: string[];
  status: "PENDING" | "EVALUATED";
  hit_count?: number;
  created_at?: string;
}

// Thêm Interface cho decayAlgorithm.ts
export interface DigitScoreData {
  hundreds: number[];
  tens: number[];
  ones: number[];
}

// Type Aliases hỗ trợ tương thích
export type LotteryStation = Station;
export type LotteryDraw = DrawResult;
export type LotteryPrediction = Prediction;
