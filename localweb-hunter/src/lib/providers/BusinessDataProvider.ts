// BusinessDataProvider — ビジネスデータ取得の抽象化（§2-2, §5）
//
// アプリ本体（スコアリング・UI・DB層）は、この interface にしか依存しない。
// DataForSEOProvider を直接importしてよいのは providers/registry.ts だけ。
//
// 課金を伴う実装は、コンストラクタで受け取った BudgetGuard.spend() の中でしか
// fetch を実行しないこと。これが予算ガードの漏れを構造的に防ぐ仕組み（§2-1）。

import type { BusinessCandidate, SubQueryParams } from '@/types/business';

export interface SearchBusinessesParams {
  /** サブクエリ単位のパラメータ。オーケストレータが分割して渡す */
  params: SubQueryParams;
  minRating: number;
  minReviewCount: number;
  cursor?: string | null;
  limit?: number;
  jobId?: string | null;
}

export interface SearchBusinessesResult {
  businesses: BusinessCandidate[];
  nextCursor: string | null;
  totalEstimated: number | null;
  requestCount: number;
  itemCount: number;
  costUsd: number;
}

export interface ProviderStatus {
  available: boolean;
  provider: string;
  /** 課金が発生するプロバイダか。UIで「$0」表示を出し分けるのに使う */
  billable: boolean;
  message: string;
}

export interface CostModel {
  perRequestUsd: number;
  perItemUsd: number;
  maxItemsPerRequest: number;
}

export interface BusinessDataProvider {
  readonly name: string;
  readonly billable: boolean;

  /** Phase 1: 安い一次スクリーニング */
  searchBusinesses(params: SearchBusinessesParams): Promise<SearchBusinessesResult>;

  /** 事前コスト表示のための単価情報（§2-1「推定コストをUIに表示」） */
  getCostModel(): CostModel;

  getProviderStatus(): Promise<ProviderStatus>;
}
