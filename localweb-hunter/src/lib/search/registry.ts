import 'server-only';
import { env } from '@/config/env';
import type { BudgetGuard } from '@/lib/budget/budgetGuard';
import { NullSearchProvider, type WebSearchProvider } from './SearchProvider';
import { BraveSearchProvider, GoogleCseProvider } from './providers';
import { DataForSeoSerpProvider } from './DataForSeoSerpProvider';

export function getSearchProvider(budget: BudgetGuard): WebSearchProvider {
  switch (env.searchProvider) {
    case 'dataforseo': {
      // Business Listings と同じ認証情報を使う。アカウントも請求も1つで済む。
      const p = new DataForSeoSerpProvider(
        {
          login: env.dataforseo.login,
          password: env.dataforseo.password,
          costPerQuery: env.dataforseoSerp.costPerQuery,
          locationName: env.dataforseoSerp.locationName,
          languageCode: env.dataforseoSerp.languageCode,
        },
        budget
      );
      return p.isConfigured() ? p : new NullSearchProvider();
    }
    case 'google': {
      const p = new GoogleCseProvider(env.googleCse.apiKey, env.googleCse.cx, budget);
      return p.isConfigured() ? p : new NullSearchProvider();
    }
    case 'brave': {
      const p = new BraveSearchProvider(env.brave.apiKey, budget);
      return p.isConfigured() ? p : new NullSearchProvider();
    }
    case 'none':
    default:
      return new NullSearchProvider();
  }
}
