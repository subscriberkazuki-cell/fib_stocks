// 現在のプロバイダ構成と予算状況。UIの上部バナーに使う。

import { NextResponse } from 'next/server';
import { env } from '@/config/env';
import { createBudgetGuard } from '@/lib/orchestrator/deps';
import { getBusinessDataProvider } from '@/lib/providers/registry';
import { getSearchProvider } from '@/lib/search/registry';
import { getAIProvider } from '@/lib/ai/registry';
import { getDailySpend, countBusinesses } from '@/lib/db/repository';
import { fail } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const budget = createBudgetGuard();
    const provider = getBusinessDataProvider(budget);
    const search = getSearchProvider(budget);
    const ai = getAIProvider(budget);
    const providerStatus = await provider.getProviderStatus();

    return NextResponse.json({
      budget: { ...budget.status(), dailySpent: getDailySpend() },
      businessProvider: {
        name: provider.name,
        billable: provider.billable,
        available: providerStatus.available,
        message: providerStatus.message,
        costModel: provider.getCostModel(),
        hasRatings: provider.name !== 'osm',
      },
      searchProvider: { name: search.name, configured: search.isConfigured(), billable: search.billable },
      aiProvider: { name: ai.name, modelId: ai.modelId, billable: ai.billable },
      crawler: {
        userAgent: env.crawler.userAgent,
        minIntervalMs: env.crawler.minIntervalMs,
        timeoutMs: env.crawler.timeoutMs,
        maxRetries: env.crawler.maxRetries,
      },
      storedBusinesses: countBusinesses(),
    });
  } catch (e) {
    return fail(e);
  }
}
