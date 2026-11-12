import { BUCKET_SIZES } from "./supabase";
import type { LotteryDraw, DigitScoreData, PredictionType } from "./supabase";

export interface Weights {
  w1: number;
  w2: number;
  w3: number;
}

interface PositionCounts {
  hundreds: number[];
  tens: number[];
  ones: number[];
}

function emptyCounts(): PositionCounts {
  return {
    hundreds: new Array(10).fill(0),
    tens: new Array(10).fill(0),
    ones: new Array(10).fill(0),
  };
}

/** Decompose a 2-digit lo number into tens + ones digit. */
function digits2(num: string): [number, number] {
  const padded = num.padStart(2, "0").slice(-2);
  return [parseInt(padded[0], 10), parseInt(padded[1], 10)];
}

/** Count digit frequency at Hundreds/Tens/Ones for a set of lo numbers. */
function countPosition(loNumbers: string[]): PositionCounts {
  const counts = emptyCounts();
  for (const lo of loNumbers) {
    const [t, o] = digits2(lo);
    counts.tens[t] += 1;
    counts.ones[o] += 1;
  }
  return counts;
}

/**
 * Weighted time-decay scoring across 3 buckets.
 * Most-recent draws (bucket 1) receive the highest weight.
 * `draws` must be ordered oldest -> newest.
 */
export function scoreDigits(
  draws: LotteryDraw[],
  weights: Weights
): DigitScoreData {
  const recent = draws.slice(-BUCKET_SIZES.reduce((a, b) => a + b, 0));
  const [b1Size, b2Size, b3Size] = BUCKET_SIZES;

  // Buckets: most-recent slice is bucket 1, etc.
  const ordered = [...recent].reverse(); // newest first
  const bucket1Draws = ordered.slice(0, b1Size);
  const bucket2Draws = ordered.slice(b1Size, b1Size + b2Size);
  const bucket3Draws = ordered.slice(b1Size + b2Size, b1Size + b2Size + b3Size);

  const c1 = countPosition(bucket1Draws.flatMap((d) => d.lo_numbers));
  const c2 = countPosition(bucket2Draws.flatMap((d) => d.lo_numbers));
  const c3 = countPosition(bucket3Draws.flatMap((d) => d.lo_numbers));

  const total = weights.w1 + weights.w2 + weights.w3 || 1;
  const nW1 = weights.w1 / total;
  const nW2 = weights.w2 / total;
  const nW3 = weights.w3 / total;

  const combine = (a: number[], b: number[], c: number[]) =>
    a.map((_, i) => nW1 * a[i] + nW2 * b[i] + nW3 * c[i]);

  return {
    hundreds: combine(c1.hundreds, c2.hundreds, c3.hundreds),
    tens: combine(c1.tens, c2.tens, c3.tens),
    ones: combine(c1.ones, c2.ones, c3.ones),
    buckets: {
      bucket1: c1,
      bucket2: c2,
      bucket3: c3,
    },
  };
}

/** Rank digits by score, returning sorted [digit, score] pairs (desc). */
function rank(scores: number[]): { digit: number; score: number }[] {
  return scores
    .map((score, digit) => ({ digit, score }))
    .sort((a, b) => b.score - a.score);
}

/** Hot digits: top N. Cold digits: bottom N. */
export function hotCold(scores: number[], topN = 3) {
  const ranked = rank(scores);
  return {
    hot: ranked.slice(0, topN),
    cold: ranked.slice(-topN).reverse(),
    ranked,
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

export interface GeneratedPrediction {
  prediction_type: PredictionType;
  numbers: string[];
}

/**
 * Generate all prediction types from digit scores.
 * Strategy:
 * - Bao Lo 2D: cross of top tens x top ones digits (up to 6 numbers)
 * - Bao Lo 3D: top hundreds x top tens x top ones (up to 4 numbers)
 * - Dau Duoi: top 2 tens digits (đầu) + top 2 ones digits (đuôi)
 * - Doc Dac: single strongest 2D number (top tens + top ones)
 * - Xien 2: 2 strongest 2D numbers paired
 * - Xien 3: 3 strongest 2D numbers paired
 */
export function generatePredictions(
  scoreData: DigitScoreData
): GeneratedPrediction[] {
  const tensRank = rank(scoreData.tens);
  const onesRank = rank(scoreData.ones);
  const hundredsRank = rank(scoreData.hundreds);

  const topTens = tensRank.slice(0, 3).map((r) => r.digit);
  const topOnes = onesRank.slice(0, 3).map((r) => r.digit);
  const topHundreds = hundredsRank.slice(0, 2).map((r) => r.digit);

  // Bao Lo 2D: combine top tens x top ones
  const baoLo2D: string[] = [];
  for (const t of topTens) {
    for (const o of topOnes) {
      if (baoLo2D.length >= 6) break;
      baoLo2D.push(pad2(t * 10 + o));
    }
  }

  // Bao Lo 3D: top hundreds x top tens x top ones
  const baoLo3D: string[] = [];
  for (const h of topHundreds) {
    for (const t of topTens.slice(0, 2)) {
      for (const o of topOnes.slice(0, 2)) {
        if (baoLo3D.length >= 4) break;
        baoLo3D.push(pad3(h * 100 + t * 10 + o));
      }
    }
  }

  // Dau Duoi: top tens (đầu) + top ones (đuôi)
  const dauDuoi: string[] = [
    ...topTens.slice(0, 2).map((d) => `Đầu ${d}`),
    ...topOnes.slice(0, 2).map((d) => `Đuôi ${d}`),
  ];

  // Doc Dac: single strongest number
  const docDac: string[] = [pad2(tensRank[0].digit * 10 + onesRank[0].digit)];

  // Xien 2: 2 strongest numbers
  const strongest2: string[] = [];
  for (const t of topTens.slice(0, 2)) {
    for (const o of topOnes.slice(0, 2)) {
      if (strongest2.length >= 2) break;
      strongest2.push(pad2(t * 10 + o));
    }
  }
  const xien2: string[] = [strongest2.slice(0, 2).join(" - ")];

  // Xien 3: 3 strongest numbers
  const strongest3: string[] = [];
  for (const t of topTens.slice(0, 2)) {
    for (const o of topOnes.slice(0, 3)) {
      if (strongest3.length >= 3) break;
      strongest3.push(pad2(t * 10 + o));
    }
  }
  const xien3: string[] = [strongest3.slice(0, 3).join(" - ")];

  return [
    { prediction_type: "bao_lo_2d", numbers: baoLo2D },
    { prediction_type: "bao_lo_3d", numbers: baoLo3D },
    { prediction_type: "dau_duoi", numbers: dauDuoi },
    { prediction_type: "doc_dac", numbers: docDac },
    { prediction_type: "xien_2", numbers: xien2 },
    { prediction_type: "xien_3", numbers: xien3 },
  ];
}

/** Payout multipliers (approximated Vietnamese lottery odds, x stake). */
export const PAYOUT_MULTIPLIERS: Record<PredictionType, number> = {
  bao_lo_2d: 99.5, // 2D lo pays ~99.5x
  bao_lo_3d: 900, // 3D pays ~900x
  dau_duoi: 99,
  doc_dac: 99,
  xien_2: 30,
  xien_3: 150,
};

/** Cost per number in a prediction (staking 1 unit per number). */
export const STAKE_PER_NUMBER = 1;
