// 依存の組み立て。API Route からはこれを呼ぶだけでよい。

import 'server-only';
import { env } from '@/config/env';
import { createBudgetGuard } from '@/lib/budget/serverBudget';
import type { BudgetGuard } from '@/lib/budget/budgetGuard';
import { getBusinessDataProvider } from '@/lib/providers/registry';
import { getSearchProvider } from '@/lib/search/registry';
import { getAIProvider } from '@/lib/ai/registry';
import { PoliteHttpClient } from '@/lib/crawler/httpClient';
import type { Phase1Deps } from './phase1';
import type { Phase2Deps } from './phase2';

export function buildPhase1Deps(budget: BudgetGuard): Phase1Deps {
  return { provider: getBusinessDataProvider(budget), budget };
}

export function buildPhase2Deps(budget: BudgetGuard): Phase2Deps {
  return {
    search: getSearchProvider(budget),
    http: new PoliteHttpClient({
      userAgent: env.crawler.userAgent,
      minIntervalMs: env.crawler.minIntervalMs,
      timeoutMs: env.crawler.timeoutMs,
      maxRetries: env.crawler.maxRetries,
    }),
    ai: getAIProvider(budget),
    maxPagesPerSite: env.crawler.maxPagesPerSite,
  };
}

export { createBudgetGuard };
