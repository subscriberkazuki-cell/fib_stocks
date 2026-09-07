// Web検索プロバイダの実装（Google CSE / Brave）
//
// 無料枠（2026年時点の公開情報。変わり得るので使用前に必ず確認すること）：
//   Google Custom Search JSON API … 100クエリ/日まで無料。超過分は $5/1,000クエリ。
//   Brave Search API (Free)       … 1クエリ/秒・月2,000クエリまで無料。要クレジットカード登録。
//
// どちらも「無料枠を超えたら課金」なので、budget.spend() を通して呼ぶ。
// 無料枠内なら costPerQuery() は0を返し、記録上も $0 になる。

import 'server-only';
import type { SearchHit, WebSearchProvider } from './SearchProvider';
import type { BudgetGuard } from '@/lib/budget/budgetGuard';

interface GoogleCseItem {
  link?: string;
  title?: string;
  snippet?: string;
}

export class GoogleCseProvider implements WebSearchProvider {
  readonly name = 'google';
  readonly billable = true;

  constructor(
    private readonly apiKey: string,
    private readonly cx: string,
    private readonly budget: BudgetGuard
  ) {}

  isConfigured(): boolean {
    return this.apiKey !== '' && this.cx !== '';
  }

  /** 無料枠内は0。枠を超えると $0.005/クエリ。ここでは保守的に0で見積もる */
  costPerQuery(): number {
    return 0;
  }

  async search(query: string, limit: number): Promise<SearchHit[]> {
    if (!this.isConfigured()) return [];

    return this.budget.spend<SearchHit[]>({
      kind: 'web_search',
      provider: 'google_cse',
      estimatedCostUsd: this.costPerQuery(),
      note: query,
      run: async () => {
        const url = new URL('https://www.googleapis.com/customsearch/v1');
        url.searchParams.set('key', this.apiKey);
        url.searchParams.set('cx', this.cx);
        url.searchParams.set('q', query);
        url.searchParams.set('num', String(Math.min(limit, 10)));
        url.searchParams.set('hl', 'ja');

        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) {
          // 429（無料枠切れ）は例外にせず空で返す。検索できないだけで店舗は失わない。
          if (res.status === 429 || res.status === 403) {
            return { value: [], actualCostUsd: 0, requestCount: 1, itemCount: 0 };
          }
          throw new Error(`Google CSE: HTTP ${res.status}`);
        }

        const raw: unknown = await res.json();
        const items = (raw as { items?: GoogleCseItem[] }).items ?? [];
        const hits: SearchHit[] = items
          .filter((i): i is GoogleCseItem & { link: string } => typeof i.link === 'string')
          .map((i) => ({ url: i.link, title: i.title ?? '', snippet: i.snippet ?? '' }));

        return { value: hits, actualCostUsd: this.costPerQuery(), requestCount: 1, itemCount: hits.length };
      },
    });
  }
}

interface BraveWebResult {
  url?: string;
  title?: string;
  description?: string;
}

export class BraveSearchProvider implements WebSearchProvider {
  readonly name = 'brave';
  readonly billable = true;
  private lastRequestAt = 0;

  constructor(
    private readonly apiKey: string,
    private readonly budget: BudgetGuard
  ) {}

  isConfigured(): boolean {
    return this.apiKey !== '';
  }

  costPerQuery(): number {
    return 0;
  }

  async search(query: string, limit: number): Promise<SearchHit[]> {
    if (!this.isConfigured()) return [];

    // Freeプランは 1クエリ/秒 の制限があるので必ず間隔を空ける
    const wait = 1100 - (Date.now() - this.lastRequestAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequestAt = Date.now();

    return this.budget.spend<SearchHit[]>({
      kind: 'web_search',
      provider: 'brave',
      estimatedCostUsd: this.costPerQuery(),
      note: query,
      run: async () => {
        const url = new URL('https://api.search.brave.com/res/v1/web/search');
        url.searchParams.set('q', query);
        url.searchParams.set('count', String(Math.min(limit, 20)));
        url.searchParams.set('country', 'JP');
        url.searchParams.set('search_lang', 'jp');

        const res = await fetch(url, {
          headers: { Accept: 'application/json', 'X-Subscription-Token': this.apiKey },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
          if (res.status === 429) {
            return { value: [], actualCostUsd: 0, requestCount: 1, itemCount: 0 };
          }
          throw new Error(`Brave Search: HTTP ${res.status}`);
        }

        const raw: unknown = await res.json();
        const results = (raw as { web?: { results?: BraveWebResult[] } }).web?.results ?? [];
        const hits: SearchHit[] = results
          .filter((r): r is BraveWebResult & { url: string } => typeof r.url === 'string')
          .map((r) => ({ url: r.url, title: r.title ?? '', snippet: r.description ?? '' }));

        return { value: hits, actualCostUsd: this.costPerQuery(), requestCount: 1, itemCount: hits.length };
      },
    });
  }
}
