import type { LotteryRegion } from "./supabase";

export interface StationMeta {
  id: string;
  name: string;
  region: LotteryRegion;
  short: string;
}

export const STATION_META: StationMeta[] = [
  { id: "xsmb", name: "Xổ Số Miền Bắc", region: "XSMB", short: "XSMB" },
  { id: "hanoi", name: "Hà Nội", region: "XSMB", short: "HNI" },
  { id: "hanoi_night", name: "Hà Nội (Tối)", region: "XSMB", short: "HNI-N" },
  { id: "hcm", name: "TP. Hồ Chí Minh", region: "XSMN", short: "HCM" },
  { id: "danang", name: "Đà Nẵng", region: "XSMT", short: "ĐNG" },
  { id: "cantho", name: "Cần Thơ", region: "XSMN", short: "CTO" },
];

export const REGION_LABELS: Record<LotteryRegion, string> = {
  XSMB: "Miền Bắc",
  XSMN: "Miền Nam",
  XSMT: "Miền Trung",
};

export const REGION_COLORS: Record<LotteryRegion, string> = {
  XSMB: "text-sky-400",
  XSMN: "text-emerald-400",
  XSMT: "text-amber-400",
};
