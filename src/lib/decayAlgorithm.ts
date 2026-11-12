import type { DrawResult, DigitScoreData } from "./supabase";
import { generateXienTruot } from "./lotteryRules";

/**
 * Tính điểm suy giảm Decay thời gian trên 50 kỳ quay gần nhất:
 * - Decay Factor: exp(-0.04 * index)
 * - Trọng số nhóm kỳ quay: W1 (10 kỳ đầu), W2 (15 kỳ tiếp), W3 (25 kỳ cuối)
 */
export function calculateDecayScores(
  draws: DrawResult[],
  weights = { w1: 5.0, w2: 3.0, w3: 2.0 }
): DigitScoreData {
  const recent50 = draws.slice(0, 50);

  const hundreds = new Array(10).fill(0);
  const tens = new Array(10).fill(0);
  const ones = new Array(10).fill(0);

  recent50.forEach((draw, index) => {
    const decayFactor = Math.exp(-0.04 * index);
    const bucketWeight = index < 10 ? weights.w1 : index < 25 ? weights.w2 : weights.w3;
    const finalFactor = decayFactor * bucketWeight;

    (draw.lo_numbers || []).forEach((numStr) => {
      const num = parseInt(numStr, 10);
      if (!isNaN(num)) {
        const o = num % 10;
        const t = Math.floor((num % 100) / 10);
        const h = Math.floor((num % 1000) / 100);

        ones[o] += finalFactor;
        tens[t] += finalFactor;
        hundreds[h] += finalFactor;
      }
    });
  });

  return { hundreds, tens, ones };
}

function getSortedIndices(arr: number[]): number[] {
  return arr
    .map((val, idx) => ({ val, idx }))
    .sort((a, b) => b.val - a.val)
    .map((item) => item.idx);
}

/**
 * Tạo bộ dự đoán chuẩn theo số lượng quy định:
 * 1. Bao lô 2D: Đúng 1 số
 * 2. 3 Càng 3D: Đúng 1 số
 * 3. Đầu Đuôi: Đúng 1 số
 * 4. Xiên 2: Đúng bộ 2 số HOT nhất
 * 5. Xiên 3: Đúng bộ 3 số HOT nhất
 * 6. Xiên Trượt: Đúng bộ 4 số điểm thấp nhất (Lô gan)
 * 7. Độc Đắc: 1 số hot nhất (lấy thêm 2-3 số nếu tỷ lệ điểm suýt soát nhau >= 98%)
 */
export function generatePredictionsFromDecay(
  draws: DrawResult[],
  weights = { w1: 5.0, w2: 3.0, w3: 2.0 }
) {
  const scores = calculateDecayScores(draws, weights);

  const topOnes = getSortedIndices(scores.ones);
  const topTens = getSortedIndices(scores.tens);
  const topHundreds = getSortedIndices(scores.hundreds);

  // Tính tổng điểm ma trận 100 cặp 2D (từ 00 đến 99)
  const ranked2D: { num: string; score: number }[] = [];
  for (let t = 0; t <= 9; t++) {
    for (let o = 0; o <= 9; o++) {
      ranked2D.push({
        num: `${t}${o}`,
        score: scores.tens[t] + scores.ones[o],
      });
    }
  }
  ranked2D.sort((a, b) => b.score - a.score);

  // 1. Bao lô 2D (1 số)
  const baoLo2D = [`${topTens[0]}${topOnes[0]}`];

  // 2. 3 Càng 3D (1 số)
  const baoLo3D = [`${topHundreds[0]}${topTens[0]}${topOnes[0]}`];

  // 3. Đầu Đuôi (1 số)
  const dauDuoi = [`${topTens[0]}${topOnes[0]}`];

  // 4. Xiên 2 (2 số điểm cao nhất)
  const xien2 = [ranked2D[0].num, ranked2D[1].num];

  // 5. Xiên 3 (3 số điểm cao nhất)
  const xien3 = [ranked2D[0].num, ranked2D[1].num, ranked2D[2].num];

  // 6. Xiên Trượt (4 số điểm thấp nhất / lô gan)
  const xienTruot = generateXienTruot(scores.tens, scores.ones, 4);

  // 7. Độc Đắc (1 số chính, lấy thêm 2-3 số nếu điểm suýt soát)
  const docDac: string[] = [ranked2D[0].num];
  const maxScore = ranked2D[0].score;
  const threshold = maxScore * 0.98;

  if (ranked2D[1].score >= threshold) {
    docDac.push(ranked2D[1].num);
  }
  if (ranked2D[2].score >= threshold && docDac.length < 3) {
    docDac.push(ranked2D[2].num);
  }

  return {
    baoLo2D,
    baoLo3D,
    dauDuoi,
    xien2,
    xien3,
    xienTruot,
    docDac,
    scores,
  };
}
