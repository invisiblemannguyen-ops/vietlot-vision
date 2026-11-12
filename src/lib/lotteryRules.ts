import type { LotteryRegion } from "./supabase";

export interface HeadTailResult {
  head: string[]; // Các cặp số của giải Đầu (Giải 7 MB / Giải 8 MN-MT)
  tail: string[]; // Cặp số giải Đuôi (2 số cuối Giải Độc Đắc)
}

/**
 * Trích xuất Đầu - Đuôi chuẩn theo quy định từng Miền:
 * - Đuôi: 2 số cuối Giải Độc Đắc (áp dụng cho cả 3 Miền: BAC, TRUNG, NAM)
 * - Đầu: 
 *   + Miền Bắc ('BAC'): 2 số cuối của 4 giải thuộc Giải 7
 *   + Miền Trung/Nam ('TRUNG', 'NAM'): 2 số cuối của Giải 8
 */
export function extractHeadTail(
  region: LotteryRegion,
  specialPrize: string | null,
  seventhOrEighthPrize: string[]
): HeadTailResult {
  // 1. Đuôi: 2 số cuối Giải Độc Đắc
  const tailNumber = specialPrize ? specialPrize.slice(-2) : "";
  const tail = tailNumber ? [tailNumber] : [];

  // 2. Đầu: Trích xuất 2 số cuối của các giải trong seventhOrEighthPrize
  const head = (seventhOrEighthPrize || []).map((num) => num.slice(-2));

  return { head, tail };
}

/**
 * Thuật toán lọc XIÊN TRƯỢT (Bộ 4 số):
 * Tính tổng điểm ma trận 100 cặp 2D, chọn ra 4 bộ số có điểm Decay thấp nhất (Lô gan / ít xuất hiện nhất)
 */
export function generateXienTruot(
  tensScores: number[],
  onesScores: number[],
  count = 4
): string[] {
  const comboScores: Array<{ num: string; score: number }> = [];

  for (let t = 0; t <= 9; t++) {
    for (let o = 0; o <= 9; o++) {
      const numStr = `${t}${o}`;
      const score = tensScores[t] + onesScores[o];
      comboScores.push({ num: numStr, score });
    }
  }

  // Sắp xếp tăng dần theo điểm số (điểm thấp nhất / gan nhất lên đầu)
  comboScores.sort((a, b) => a.score - b.score);

  // Lấy `count` số trượt có điểm thấp nhất (Mặc định 4 số)
  return comboScores.slice(0, count).map((item) => item.num);
}
