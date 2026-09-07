// プロバイダの組み立て。具体実装を import してよいのはこのファイルだけ（§2-2）。
// アプリ本体は getBusinessDataProvider() が返す interface しか見ない。

import 'server-only';
import { env } from '@/config/env';
import type { BudgetGuard } from '@/lib/budget/budgetGuard';
import type { BusinessDataProvider } from './BusinessDataProvider';
import { MockProvider } from './MockProvider';
import { OsmProvider } from './OsmProvider';
import { DataForSEOProvider } from './DataForSEOProvider';

export function getBusinessDataProvider(budget: BudgetGuard): BusinessDataProvider {
  switch (env.businessProvider) {
    case 'dataforseo':
      if (!env.dataforseo.login || !env.dataforseo.password) {
        throw new Error(
          'BUSINESS_DATA_PROVIDER=dataforseo ですが DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD が未設定です。' +
            '.env.local を確認するか、BUSINESS_DATA_PROVIDER=mock に戻してください。'
        );
      }
      return new DataForSEOProvider(
        {
          login: env.dataforseo.login,
          password: env.dataforseo.password,
          costPerRequest: env.dataforseo.costPerRequest,
          costPerItem: env.dataforseo.costPerItem,
        },
        budget
      );

    case 'osm':
      return new OsmProvider(env.overpass.endpoint, env.crawler.userAgent);

    case 'mock':
    default:
      return new MockProvider();
  }
}

/** そのプロバイダが評価・レビュー件数を返せるか。UIの注意書き出し分けに使う */
export function providerHasRatings(providerName: string): boolean {
  return providerName !== 'osm';
}
