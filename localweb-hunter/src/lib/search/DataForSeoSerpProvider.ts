// DataForSeoSerpProvider — Stage 2（公式サイト候補の探索）を DataForSEO の SERP API で行う。
//
// なぜこれを第一候補にするか：
//   * Google Custom Search は新規申込停止（2027年1月終了予定）で、そもそも契約できない
//   * Brave は2026年2月に新規向け無料プランを廃止し、約$4〜5/1,000クエリ
//   * DataForSEO SERP は Live モードで $0.002/SERP（= $2/1,000クエリ）と**より安い**
//   * そして Business Listings と**同じアカウント・同じ請求・同じ予算ガード**で済む
//
// 柏市の例：Phase 1 を通過した180件を調べて 180 × $0.002 = 約$0.36。
// 標準キュー（$0.0006/SERP）ならさらに安いが、レスポンスが即時ではないので
// 対話的に使うこのアプリでは Live モードを採用している。
//
// ⚠️ 単価は変わり得る。https://dataforseo.com/pricing/google-serp/google-organic-serp-api
//    で確認して .env.local の DATAFORSEO_SERP_COST_PER_QUERY に反映すること。

import 'server-only';
import { z } from 'zod';
import type { SearchHit, WebSearchProvider } from './SearchProvider';
import type { BudgetGuard } from '@/lib/budget/budgetGuard';

const ENDPOINT = 'https://api.dataforseo.com/v3/serp/google/organic/live/advanced';

const organicItemSchema = z
  .object({
    type: z.string().optional(),
    url: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
  })
  .passthrough();

const serpResponseSchema = z
  .object({
    status_code: z.number(),
    status_message: z.string(),
    cost: z.number().nullable().optional(),
    tasks: z
      .array(
        z
          .object({
            status_code: z.number(),
            status_message: z.string(),
            cost: z.number().nullable().optional(),
            result: z
              .array(z.object({ items: z.array(organicItemSchema).nullable().optional() }).passthrough())
              .nullable()
              .optional(),
          })
          .passthrough()
      )
      .nullable()
      .optional(),
  })
  .passthrough();

const DFS_OK = 20000;

export interface DataForSeoSerpConfig {
  login: string;
  password: string;
  costPerQuery: number;
  /** 検索する地域。日本の検索結果を得るために必要 */
  locationName: string;
  languageCode: string;
}

export class DataForSeoSerpProvider implements WebSearchProvider {
  readonly name = 'dataforseo_serp';
  readonly billable = true;

  constructor(
    private readonly config: DataForSeoSerpConfig,
    private readonly budget: BudgetGuard
  ) {}

  isConfigured(): boolean {
    return this.config.login !== '' && this.config.password !== '';
  }

  costPerQuery(): number {
    return this.config.costPerQuery;
  }

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.config.login}:${this.config.password}`).toString('base64')}`;
  }

  async search(query: string, limit: number): Promise<SearchHit[]> {
    if (!this.isConfigured()) return [];

    return this.budget.spend<SearchHit[]>({
      kind: 'web_search',
      provider: 'dataforseo_serp',
      estimatedCostUsd: this.config.costPerQuery,
      note: query,
      run: async () => {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { Authorization: this.authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify([
            {
              keyword: query,
              location_name: this.config.locationName,
              language_code: this.config.languageCode,
              // depth を増やすと課金単位が増える。公式サイトは上位に出る前提で10件に抑える。
              depth: Math.min(Math.max(limit, 10), 10),
            },
          ]),
          signal: AbortSignal.timeout(30_000),
        });

        if (!res.ok) {
          throw new Error(`DataForSEO SERP: HTTP ${res.status} ${res.statusText}`);
        }

        const parsed = serpResponseSchema.safeParse(await res.json());
        if (!parsed.success) {
          throw new Error(
            `DataForSEO SERP のレスポンス構造が想定と異なります: ${parsed.error.issues
              .slice(0, 3)
              .map((i) => `${i.path.join('.')}: ${i.message}`)
              .join(' / ')}`
          );
        }

        const json = parsed.data;
        if (json.status_code !== DFS_OK) {
          throw new Error(`DataForSEO SERP: ${json.status_code} ${json.status_message}`);
        }

        const task = json.tasks?.[0];
        if (!task) throw new Error('DataForSEO SERP: tasks が空です');
        if (task.status_code !== DFS_OK) {
          throw new Error(`DataForSEO SERP task: ${task.status_code} ${task.status_message}`);
        }

        const items = task.result?.[0]?.items ?? [];
        const hits: SearchHit[] = items
          .filter((i) => i.type === 'organic' && typeof i.url === 'string' && i.url !== '')
          .map((i) => ({
            url: i.url as string,
            title: i.title ?? '',
            snippet: i.description ?? '',
          }));

        const actualCost = task.cost ?? json.cost ?? this.config.costPerQuery;
        return { value: hits, actualCostUsd: actualCost, requestCount: 1, itemCount: hits.length };
      },
    });
  }
}
