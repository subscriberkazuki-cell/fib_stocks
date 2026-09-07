// コスト試算（§2-1「検索実行前に推定コストを表示し、明示的な確認を経てから実行」）
//
// 単価はプロバイダの CostModel から受け取り、ここに定数として持たない。
// DataForSEO の単価は変わり得るので、.env.local の DATAFORSEO_COST_PER_* を正とする。

import type { CostModel } from '@/lib/providers/BusinessDataProvider';

export interface Phase1Estimate {
  subQueryCount: number;
  requestCount: number;
  estimatedItemCount: number;
  requestCost: number;
  itemCost: number;
  totalCost: number;
  costPerBusiness: number;
}

export interface Phase2Estimate {
  qualifiedCount: number;
  webSearchCost: number;
  aiCost: number;
  crawlCost: number;
  totalCost: number;
  costPerBusiness: number;
}

export interface TotalEstimate {
  phase1: Phase1Estimate;
  phase2: Phase2Estimate;
  grandTotal: number;
  /** 「$0で実行できます」とUIに出すための判定 */
  isFree: boolean;
}

export function estimatePhase1(
  costModel: CostModel,
  subQueryCount: number,
  estimatedItemsPerSubQuery: number
): Phase1Estimate {
  const perSubQueryRequests = Math.max(1, Math.ceil(estimatedItemsPerSubQuery / costModel.maxItemsPerRequest));
  const requestCount = subQueryCount * perSubQueryRequests;
  const estimatedItemCount = subQueryCount * estimatedItemsPerSubQuery;

  const requestCost = requestCount * costModel.perRequestUsd;
  const itemCost = estimatedItemCount * costModel.perItemUsd;
  const totalCost = requestCost + itemCost;

  return {
    subQueryCount,
    requestCount,
    estimatedItemCount,
    requestCost,
    itemCost,
    totalCost,
    costPerBusiness: estimatedItemCount > 0 ? totalCost / estimatedItemCount : 0,
  };
}

export interface Phase2Rates {
  /** Web検索1件あたり。無料枠内で運用するなら0 */
  webSearchPerBusiness: number;
  /** AI 1件あたり */
  aiPerBusiness: number;
  /** 自前クローラは通信費のみ。実質0 */
  crawlPerBusiness: number;
}

export function estimatePhase2(qualifiedCount: number, rates: Phase2Rates): Phase2Estimate {
  const webSearchCost = qualifiedCount * rates.webSearchPerBusiness;
  const aiCost = qualifiedCount * rates.aiPerBusiness;
  const crawlCost = qualifiedCount * rates.crawlPerBusiness;
  const totalCost = webSearchCost + aiCost + crawlCost;

  return {
    qualifiedCount,
    webSearchCost,
    aiCost,
    crawlCost,
    totalCost,
    costPerBusiness: qualifiedCount > 0 ? totalCost / qualifiedCount : 0,
  };
}

export interface EstimateInput {
  costModel: CostModel;
  subQueryCount: number;
  estimatedItemsPerSubQuery: number;
  /** Phase 1 を通過する割合。柏市の例（176/1284 ≒ 0.14）を初期値にしている */
  qualifiedRate: number;
  phase2Rates: Phase2Rates;
  runPhase2: boolean;
}

export function estimateTotal(input: EstimateInput): TotalEstimate {
  const phase1 = estimatePhase1(input.costModel, input.subQueryCount, input.estimatedItemsPerSubQuery);
  const qualifiedCount = input.runPhase2 ? Math.round(phase1.estimatedItemCount * input.qualifiedRate) : 0;
  const phase2 = estimatePhase2(qualifiedCount, input.phase2Rates);
  const grandTotal = phase1.totalCost + phase2.totalCost;

  return { phase1, phase2, grandTotal, isFree: grandTotal < 0.000001 };
}

export const DEFAULT_QUALIFIED_RATE = 0.14;

export function formatUsd(v: number): string {
  if (v === 0) return '$0.00';
  if (v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}
