// DataForSEOProvider — 課金ありの本番プロバイダ（§3-2）
//
// ⚠️ 単価は変わり得る。実運用の前に
//    https://dataforseo.com/pricing/business-data/business-listings-api
//    で現在の単価を確認し、.env.local の DATAFORSEO_COST_PER_* に反映すること。
//
// ⚠️ items[] の実フィールド名は scripts/test-dataforseo-search.mjs で実レスポンスを
//    確認して確定させること。zodスキーマがあるので、想定外の形が来れば静かに壊れず
//    パースエラーとして表面化する。

import type { BusinessCandidate, SubQueryParams } from '@/types/business';
import type {
  BusinessDataProvider,
  CostModel,
  ProviderStatus,
  SearchBusinessesParams,
  SearchBusinessesResult,
} from './BusinessDataProvider';
import type { BudgetGuard } from '@/lib/budget/budgetGuard';
import { DFS_OK, searchResponseSchema, type DataForSeoBusinessItem } from './dataForSeoSchema';

const BASE_URL = 'https://api.dataforseo.com/v3';
const SEARCH_PATH = '/business_data/business_listings/search/live';
const MAX_ITEMS_PER_REQUEST = 1000;

export interface DataForSEOConfig {
  login: string;
  password: string;
  costPerRequest: number;
  costPerItem: number;
}

export class DataForSEOProvider implements BusinessDataProvider {
  readonly name = 'dataforseo';
  readonly billable = true;

  constructor(
    private readonly config: DataForSEOConfig,
    private readonly budget: BudgetGuard
  ) {}

  getCostModel(): CostModel {
    return {
      perRequestUsd: this.config.costPerRequest,
      perItemUsd: this.config.costPerItem,
      maxItemsPerRequest: MAX_ITEMS_PER_REQUEST,
    };
  }

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.config.login}:${this.config.password}`).toString('base64')}`;
  }

  private buildRequestBody(p: SubQueryParams, minRating: number, minReviewCount: number, limit: number, cursor: string | null): unknown[] {
    // filters は条件の間に明示的に 'and' / 'or' を挟む構文（最大8条件）。
    const filters: unknown[] = [['rating.value', '>=', minRating], 'and', ['rating.votes_count', '>=', minReviewCount]];

    const body: Record<string, unknown> = { filters, limit };

    if (p.centerLat !== null && p.centerLng !== null) {
      body['location_coordinate'] = `${p.centerLat},${p.centerLng},${p.radiusKm ?? 5}`;
    }
    if (p.category) body['categories'] = [p.category];
    if (cursor) body['offset_token'] = cursor;

    return [body];
  }

  async searchBusinesses(params: SearchBusinessesParams): Promise<SearchBusinessesResult> {
    const limit = Math.min(params.limit ?? MAX_ITEMS_PER_REQUEST, MAX_ITEMS_PER_REQUEST);
    const body = this.buildRequestBody(
      params.params,
      params.minRating,
      params.minReviewCount,
      limit,
      params.cursor ?? null
    );

    // 事前見積もりは「最大取れた場合」で置く。実コストはレスポンスの cost で上書きする。
    const estimated = this.config.costPerRequest + limit * this.config.costPerItem;

    // 課金呼び出しは必ず budget.spend() の内側で実行する（§2-1）
    return this.budget.spend<SearchBusinessesResult>({
      kind: 'business_data',
      provider: 'dataforseo',
      estimatedCostUsd: estimated,
      jobId: params.jobId ?? null,
      note: `${params.params.city ?? ''} ${params.params.category ?? ''}`.trim() || null,
      run: async () => {
        const res = await fetch(`${BASE_URL}${SEARCH_PATH}`, {
          method: 'POST',
          headers: { Authorization: this.authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          throw new Error(`DataForSEO APIエラー: HTTP ${res.status} ${res.statusText}`);
        }

        // any を許容するのはこの1行だけ。直後に zod で型付きに変換する。
        const raw: unknown = await res.json();
        const parsed = searchResponseSchema.safeParse(raw);
        if (!parsed.success) {
          throw new Error(
            `DataForSEOのレスポンス構造が想定と異なります。APIの仕様変更の可能性があります: ${parsed.error.issues
              .slice(0, 3)
              .map((i) => `${i.path.join('.')}: ${i.message}`)
              .join(' / ')}`
          );
        }

        const json = parsed.data;
        if (json.status_code !== DFS_OK) {
          throw new Error(`DataForSEO: ${json.status_code} ${json.status_message}`);
        }

        const task = json.tasks?.[0];
        if (!task) throw new Error('DataForSEO: tasks が空です。認証情報を確認してください。');
        if (task.status_code !== DFS_OK) {
          throw new Error(`DataForSEO task: ${task.status_code} ${task.status_message}`);
        }

        const result = task.result?.[0];
        const items = result?.items ?? [];
        const businesses = items
          .map((item) => this.toCandidate(item, params.params))
          .filter((b): b is BusinessCandidate => b !== null);

        // 実コストはレスポンスの cost を優先する（見積もりではなく実測を記録する）
        const actualCost = task.cost ?? json.cost ?? estimated;

        return {
          value: {
            businesses,
            nextCursor: result?.offset_token ?? null,
            totalEstimated: result?.total_count ?? null,
            requestCount: 1,
            itemCount: items.length,
            costUsd: actualCost,
          },
          actualCostUsd: actualCost,
          requestCount: 1,
          itemCount: items.length,
        };
      },
    });
  }

  /** レスポンス1件を BusinessCandidate に変換する。IDが取れないものは捨てる（重複排除の軸を失うため） */
  private toCandidate(item: DataForSeoBusinessItem, p: SubQueryParams): BusinessCandidate | null {
    const id = item.place_id ?? item.cid ?? item.feature_id;
    const name = item.title;
    if (!id || !name) return null;

    const website = item.url ?? item.domain ?? null;

    return {
      sourceBusinessId: id,
      source: 'dataforseo',
      name,
      category: item.category ?? item.additional_categories?.[0] ?? '',
      address: item.address ?? item.address_info?.address ?? '',
      prefecture: item.address_info?.region ?? p.prefecture ?? '',
      city: item.address_info?.city ?? p.city ?? '',
      latitude: item.latitude ?? null,
      longitude: item.longitude ?? null,
      rating: item.rating?.value ?? null,
      reviewCount: item.rating?.votes_count ?? null,
      phone: item.phone ?? null,
      hasWebsiteFieldPopulated: Boolean(website),
      websiteUrlRaw: website,
    };
  }

  async getProviderStatus(): Promise<ProviderStatus> {
    if (!this.config.login || !this.config.password) {
      return {
        available: false,
        provider: 'dataforseo',
        billable: true,
        message: 'DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD が未設定です。',
      };
    }
    try {
      // 無料エンドポイントで疎通だけ確認する（課金されないので budget を通さない）
      const res = await fetch(`${BASE_URL}/appendix/user_data`, {
        headers: { Authorization: this.authHeader() },
      });
      if (!res.ok) {
        return { available: false, provider: 'dataforseo', billable: true, message: `HTTP ${res.status}` };
      }
      return { available: true, provider: 'dataforseo', billable: true, message: '疎通OK（課金あり）' };
    } catch (e) {
      return {
        available: false,
        provider: 'dataforseo',
        billable: true,
        message: e instanceof Error ? e.message : '不明なエラー',
      };
    }
  }
}
