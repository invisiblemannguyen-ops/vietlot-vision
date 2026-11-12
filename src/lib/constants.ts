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

export const REGION_LABELS: Record<string, string> = {
  BAC: "Miền Bắc",
  TRUNG: "Miền Trung",
  NAM: "Miền Nam",
  XSMB: "Miền Bắc",
  XSMT: "Miền Trung",
  XSMN: "Miền Nam",
  MB: "Miền Bắc",
  MT: "Miền Trung",
  MN: "Miền Nam",
};

export const REGION_COLORS: Record<string, string> = {
  BAC: "text-sky-400",
  TRUNG: "text-amber-400",
  NAM: "text-emerald-400",
  XSMB: "text-sky-400",
  XSMT: "text-amber-400",
  XSMN: "text-emerald-400",
  MB: "text-sky-400",
  MT: "text-amber-400",
  MN: "text-emerald-400",
};
