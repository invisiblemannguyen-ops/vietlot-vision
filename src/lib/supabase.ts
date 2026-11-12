import { createClient } from "@supabase/supabase-js";

// 🔴 THAY BẰNG LINK URL SUPABASE CỦA BẠN (Ví dụ: https://xyz.supabase.co)
const supabaseUrl = "https://YOUR_SUPABASE_PROJECT_ID.supabase.co";

// 🟢 KEY PUBLISHABLE CỦA BẠN ĐÃ ĐƯỢC ĐIỀN SẴN:
const supabaseAnonKey = "sb_publishable_gd0nNLRnNq4ppRWbMk6KEw_F8n13jQf";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type LotteryRegion = "XSMB" | "XSMN" | "XSMT";

export type PredictionType =
  | "bao_lo_2d"
  | "bao_lo_3d"
  | "dau_duoi"
  | "doc_dac"
  | "xien_2"
  | "xien_3";

export type PredictionStatus = "PENDING" | "EVALUATED";

export interface LotteryStation {
  id: string;
  name: string;
  region: LotteryRegion;
  w1: number;
  w2: number;
  w3: number;
  tuned_at: string | null;
  created_at: string;
}

export interface LotteryDraw {
  id: string;
  station_id: string;
  draw_date: string;
  special_prize: string | null;
  lo_numbers: string[];
  created_at: string;
}

export interface DigitScoreData {
  hundreds: number[];
  tens: number[];
  ones: number[];
  buckets: {
    bucket1: { hundreds: number[]; tens: number[]; ones: number[] };
    bucket2: { hundreds: number[]; tens: number[]; ones: number[] };
    bucket3: { hundreds: number[]; tens: number[]; ones: number[] };
  };
}

export interface LotteryPrediction {
  id: string;
  station_id: string;
  target_date: string;
  prediction_type: PredictionType;
  numbers: string[];
  score_data: DigitScoreData;
  weights: { w1: number; w2: number; w3: number };
  status: PredictionStatus;
  hits: string[];
  hit_count: number;
  total_predicted: number;
  hit_rate: number;
  payout: number;
  cost: number;
  roi: number;
  evaluated_at: string | null;
  created_at: string;
}

export interface LotteryTuningLog {
  id: string;
  station_id: string;
  evaluated_count: number;
  old_weights: { w1: number; w2: number; w3: number };
  new_weights: { w1: number; w2: number; w3: number };
  best_win_rate: number;
  candidates_tried: number;
  backtest_window: number;
  created_at: string;
}

export const PREDICTION_TYPES: PredictionType[] = [
  "bao_lo_2d",
  "bao_lo_3d",
  "dau_duoi",
  "doc_dac",
  "xien_2",
  "xien_3",
];

export const PREDICTION_TYPE_LABELS: Record<PredictionType, string> = {
  bao_lo_2d: "Bao Lô 2D",
  bao_lo_3d: "Bao Lô 3D",
  dau_duoi: "Đầu Đuôi",
  doc_dac: "Độc Đắc",
  xien_2: "Xiên 2",
  xien_3: "Xiên 3",
};

export const ROLLING_WINDOW = 50;
export const BUCKET_SIZES = [10, 15, 25]; // Bucket 1: 10, Bucket 2: 15, Bucket 3: 25
export const TUNING_INTERVAL = 100; // auto-tune every 100 evaluated draws
