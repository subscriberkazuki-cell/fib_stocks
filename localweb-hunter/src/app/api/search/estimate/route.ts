// 検索実行前の推定コスト（§2-1「必ずUIに表示し、明示的な確認を経てから実行」）
// この endpoint は外部APIを一切叩かない。単価表と分割数から計算するだけ。

import type { NextRequest, NextResponse } from 'next/server';
import { createBudgetGuard } from '@/lib/orchestrator/deps';
import { getBusinessDataProvider } from '@/lib/providers/registry';
import { getSearchProvider } from '@/lib/search/registry';
import { getAIProvider } from '@/lib/ai/registry';
import { planSubQueries } from '@/lib/orchestrator/subQueryPlanner';
import { DEFAULT_QUALIFIED_RATE, estimateTotal } from '@/lib/cost/costEstimator';
import { parseCriteria } from '@/lib/api/criteriaSchema';
import { badRequest, fail, ok } from '@/lib/api/respond';
import { env } from '@/config/env';

export const dynamic = 'force-dynamic';

/** 1サブクエリあたりの想定取得件数。実測が溜まったら調整する余地がある */
const ESTIMATED_ITEMS_PER_SUBQUERY = 200;
const ESTIMATED_ITEMS_PER_EXHAUSTIVE_SUBQUERY = 60;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const criteria = parseCriteria(await req.json());
    const budget = createBudgetGuard();
    const provider = getBusinessDataProvider(budget);
    const search = getSearchProvider(budget);
    const ai = getAIProvider(budget);

    const subQueries = planSubQueries(criteria);
    const perSubQuery = criteria.exhaustive
      ? ESTIMATED_ITEMS_PER_EXHAUSTIVE_SUBQUERY
      : ESTIMATED_ITEMS_PER_SUBQUERY;

    const estimate = estimateTotal({
      costModel: provider.getCostModel(),
      subQueryCount: subQueries.length,
      estimatedItemsPerSubQuery: perSubQuery,
      qualifiedRate: DEFAULT_QUALIFIED_RATE,
      phase2Rates: {
        webSearchPerBusiness: search.isConfigured() ? search.costPerQuery() : 0,
        aiPerBusiness: ai.billable ? env.aiCostPerBusiness : 0,
        crawlPerBusiness: 0,
      },
      runPhase2: criteria.runPhase2,
    });

    const budgetStatus = budget.status();

    return ok({
      estimate,
      subQueryCount: subQueries.length,
      subQueryLabels: subQueries.slice(0, 10).map((s) => s.label),
      providerName: provider.name,
      providerBillable: provider.billable,
      budget: budgetStatus,
      // 実行して予算を超えるなら、押す前に伝える
      exceedsBudget: !budget.canSpend(estimate.grandTotal),
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'ZodError') return badRequest(`検索条件が不正です: ${e.message}`);
    return fail(e);
  }
}
