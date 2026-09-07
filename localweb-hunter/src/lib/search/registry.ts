import 'server-only';
import { env } from '@/config/env';
import type { BudgetGuard } from '@/lib/budget/budgetGuard';
import { NullSearchProvider, type WebSearchProvider } from './SearchProvider';
import { BraveSearchProvider, GoogleCseProvider } from './providers';

export function getSearchProvider(budget: BudgetGuard): WebSearchProvider {
  switch (env.searchProvider) {
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
