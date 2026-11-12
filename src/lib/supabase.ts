import { createClient } from "@supabase/supabase-js";

// Khởi tạo Supabase Client trực tiếp
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://YOUR_PROJECT_ID.supabase.co";
const supabaseAnonKey = "sb_publishable_gd0nNLRnNq4ppRWbMk6KEw_F8n13jQf";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Mã vùng miền khớp 100% với cột region trong CSDL: 'BAC' | 'TRUNG' | 'NAM'
export type LotteryRegion = "BAC" | "TRUNG" | "NAM";

export type PredictionType =
  | "bao_lo_2d"
  | "bao_lo_3d"
  | "dau_duoi"
  | "doc_dac"
  | "xien_2"
  | "xien_3"
  | "xien_truot";

// Khớp với bảng `stations` trong Supabase
export interface Station {
  id: string; // VD: 'GIALAI', 'NINHTHUAN', 'MB', 'TPHCM'
  name: string; // VD: 'Gia Lai', 'Ninh Thuận'
  region: LotteryRegion; // 'BAC' | 'TRUNG' | 'NAM'
}

// Khớp với bảng `model_configs` trong Supabase
export interface ModelConfig {
  id: string;
  station_id: string;
  w1: number;
  w2: number;
  w3: number;
  updated_at?: string;
}

// Khớp với bảng `draw_results` trong Supabase
export interface DrawResult {
  id: string;
  station_id: string;
  draw_date: string;
  special_prize: string | null;
  lo_numbers: string[];
  seventh_or_eighth?: string[];
  created_at?: string;
}

// Khớp với bảng `predictions` trong Supabase
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
