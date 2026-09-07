// Lead Score（§8-1） — 「HP制作営業に向いている店舗」を0〜100点でランキングする
//
// 単純に評価が高い店を上位にしてはならない、というのがこのスコアの主張。
// 「評価4.0・レビュー5件・HPなし」より
// 「評価4.7・レビュー200件・Instagram活発・HPなし」が上に来ること。
//
// 重みも閾値もDBから渡される。ここに定数として持たない（§8-1, §8-3）。

import { REVIEW_COUNT_CAP } from '@/config/defaults';
import type {
  LeadPriority,
  LeadScoreBreakdown,
  LeadScoreWeights,
  PriorityThresholds,
} from '@/types/business';

export interface LeadScoreInput {
  rating: number | null;
  reviewCount: number | null;
  hasNoWebsite: boolean;
  hasSns: boolean;
  hasPhone: boolean;
  isLocalDenseCategory: boolean;
  isFootTrafficCategory: boolean;
  /** 0〜1。Website Opportunity Score / 100 を渡す */
  webImprovementPotential: number;
}

/**
 * 評価の正規化。
 * rating/5 をそのまま使うと、3.0の店でも6割の点が入ってしまい差がつかない。
 * 実質的な下限を3.0に置き、3.0〜5.0を0〜1に伸ばす。
 */
function normalizeRating(rating: number): number {
  const RATING_FLOOR = 3.0;
  if (rating <= RATING_FLOOR) return 0;
  return Math.min((rating - RATING_FLOOR) / (5 - RATING_FLOOR), 1);
}

/** レビュー件数は青天井なので対数スケールで正規化（500件で頭打ち, §8-1） */
function normalizeReviewCount(count: number): number {
  if (count <= 0) return 0;
  return Math.min(Math.log10(count + 1) / Math.log10(REVIEW_COUNT_CAP + 1), 1);
}

function clamp01(v: number): number {
  return Math.min(Math.max(v, 0), 1);
}

export function calculateLeadScore(input: LeadScoreInput, weights: LeadScoreWeights): LeadScoreBreakdown {
  const rating = input.rating !== null ? normalizeRating(input.rating) * weights.rating : 0;
  const reviewCount = input.reviewCount !== null ? normalizeReviewCount(input.reviewCount) * weights.reviewCount : 0;
  const noWebsite = input.hasNoWebsite ? weights.noWebsite : 0;
  const hasSns = input.hasSns ? weights.hasSns : 0;
  const hasPhone = input.hasPhone ? weights.hasPhone : 0;
  const localDensity = input.isLocalDenseCategory ? weights.localDensity : 0;
  const footTraffic = input.isFootTrafficCategory ? weights.footTraffic : 0;
  const webImprovementPotential = clamp01(input.webImprovementPotential) * weights.webImprovementPotential;

  const raw =
    rating + reviewCount + noWebsite + hasSns + hasPhone + localDensity + footTraffic + webImprovementPotential;

  const round1 = (v: number): number => Math.round(v * 10) / 10;

  return {
    rating: round1(rating),
    reviewCount: round1(reviewCount),
    noWebsite: round1(noWebsite),
    hasSns: round1(hasSns),
    hasPhone: round1(hasPhone),
    localDensity: round1(localDensity),
    footTraffic: round1(footTraffic),
    webImprovementPotential: round1(webImprovementPotential),
    total: Math.round(Math.min(raw, 100)),
    weightsUsed: { ...weights },
  };
}

export function scoreToPriority(score: number, thresholds: PriorityThresholds): LeadPriority {
  if (score >= thresholds.S) return 'S';
  if (score >= thresholds.A) return 'A';
  if (score >= thresholds.B) return 'B';
  if (score >= thresholds.C) return 'C';
  return 'D';
}

export const PRIORITY_RANK: Record<LeadPriority, number> = { S: 5, A: 4, B: 3, C: 2, D: 1 };

export function meetsMinPriority(priority: LeadPriority, min: LeadPriority | null): boolean {
  if (!min) return true;
  return PRIORITY_RANK[priority] >= PRIORITY_RANK[min];
}
