import type { LotteryRegion } from "./supabase";

export interface StationSchedule {
  id: string;
  name: string;
  region: LotteryRegion;
  drawTime: string;
}

export const SCHEDULE_BY_DAY: Record<string, StationSchedule[]> = {
  "Thứ 2": [
    { id: "xsmb", name: "Miền Bắc (Hà Nội)", region: "XSMB", drawTime: "18:15" },
    { id: "tphcm", name: "TP. Hồ Chí Minh", region: "XSMN", drawTime: "16:15" },
    { id: "dong_thap", name: "Đồng Tháp", region: "XSMN", drawTime: "16:15" },
    { id: "ca_mau", name: "Cà Mau", region: "XSMN", drawTime: "16:15" },
    { id: "hue", name: "Thừa Thiên Huế", region: "XSMT", drawTime: "17:15" },
    { id: "phu_yen", name: "Phú Yên", region: "XSMT", drawTime: "17:15" },
  ],
  "Thứ 3": [
    { id: "xsmb", name: "Miền Bắc (Quảng Ninh)", region: "XSMB", drawTime: "18:15" },
    { id: "ben_tre", name: "Bến Tre", region: "XSMN", drawTime: "16:15" },
    { id: "vung_tau", name: "Vũng Tàu", region: "XSMN", drawTime: "16:15" },
    { id: "bac_lieu", name: "Bạc Liêu", region: "XSMN", drawTime: "16:15" },
    { id: "dak_lak", name: "Đắk Lắk", region: "XSMT", drawTime: "17:15" },
    { id: "quang_nam", name: "Quảng Nam", region: "XSMT", drawTime: "17:15" },
  ],
  "Thứ 4": [
    { id: "xsmb", name: "Miền Bắc (Bắc Ninh)", region: "XSMB", drawTime: "18:15" },
    { id: "dong_nai", name: "Đồng Nai", region: "XSMN", drawTime: "16:15" },
    { id: "can_tho", name: "Cần Thơ", region: "XSMN", drawTime: "16:15" },
    { id: "soc_trang", name: "Sóc Trăng", region: "XSMN", drawTime: "16:15" },
    { id: "da_nang", name: "Đà Nẵng", region: "XSMT", drawTime: "17:15" },
    { id: "khanh_hoa", name: "Khánh Hòa", region: "XSMT", drawTime: "17:15" },
  ],
  "Thứ 5": [
    { id: "xsmb", name: "Miền Bắc (Hà Nội)", region: "XSMB", drawTime: "18:15" },
    { id: "tay_ninh", name: "Tây Ninh", region: "XSMN", drawTime: "16:15" },
    { id: "an_giang", name: "An Giang", region: "XSMN", drawTime: "16:15" },
    { id: "binh_thuan", name: "Bình Thuận", region: "XSMN", drawTime: "16:15" },
    { id: "binh_dinh", name: "Bình Định", region: "XSMT", drawTime: "17:15" },
    { id: "quang_tri", name: "Quảng Trị", region: "XSMT", drawTime: "17:15" },
    { id: "quang_binh", name: "Quảng Bình", region: "XSMT", drawTime: "17:15" },
  ],
  "Thứ 6": [
    { id: "xsmb", name: "Miền Bắc (Hải Phòng)", region: "XSMB", drawTime: "18:15" },
    { id: "binh_duong", name: "Bình Dương", region: "XSMN", drawTime: "16:15" },
    { id: "vinh_long", name: "Vĩnh Long", region: "XSMN", drawTime: "16:15" },
    { id: "tra_vinh", name: "Trà Vinh", region: "XSMN", drawTime: "16:15" },
    { id: "gia_lai", name: "Gia Lai", region: "XSMT", drawTime: "17:15" },
    { id: "ninh_thuan", name: "Ninh Thuận", region: "XSMT", drawTime: "17:15" },
  ],
  "Thứ 7": [
    { id: "xsmb", name: "Miền Bắc (Nam Định)", region: "XSMB", drawTime: "18:15" },
    { id: "tphcm", name: "TP. Hồ Chí Minh", region: "XSMN", drawTime: "16:15" },
    { id: "long_an", name: "Long An", region: "XSMN", drawTime: "16:15" },
    { id: "binh_phuoc", name: "Bình Phước", region: "XSMN", drawTime: "16:15" },
    { id: "hau_giang", name: "Hậu Giang", region: "XSMN", drawTime: "16:15" },
    { id: "da_nang", name: "Đà Nẵng", region: "XSMT", drawTime: "17:15" },
    { id: "quang_ngai", name: "Quảng Ngãi", region: "XSMT", drawTime: "17:15" },
    { id: "dak_nong", name: "Đắk Nông", region: "XSMT", drawTime: "17:15" },
  ],
  "Chủ Nhật": [
    { id: "xsmb", name: "Miền Bắc (Thái Bình)", region: "XSMB", drawTime: "18:15" },
    { id: "tien_giang", name: "Tiền Giang", region: "XSMN", drawTime: "16:15" },
    { id: "kien_giang", name: "Kiên Giang", region: "XSMN", drawTime: "16:15" },
    { id: "da_lat", name: "Đà Lạt", region: "XSMN", drawTime: "16:15" },
    { id: "khanh_hoa", name: "Khánh Hòa", region: "XSMT", drawTime: "17:15" },
    { id: "kon_tum", name: "Kon Tum", region: "XSMT", drawTime: "17:15" },
  ],
};

export function getTodayName(): string {
  const days = ["Chủ Nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
  return days[new Date().getDay()];
}

export function getStationsForToday(): StationSchedule[] {
  return SCHEDULE_BY_DAY[getTodayName()] || [];
}
