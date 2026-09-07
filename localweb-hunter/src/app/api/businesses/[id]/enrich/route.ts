// 個別店舗のPhase 2実行（詳細画面の「調査する」「HP案を生成」ボタン用）

import { NextResponse } from 'next/server';
import { buildPhase2Deps, createBudgetGuard } from '@/lib/orchestrator/deps';
import { enrichAndRescore } from '@/lib/orchestrator/enrichPipeline';
import { getBusiness } from '@/lib/db/repository';
import { fail, notFound, ok } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const business = getBusiness(id);
    if (!business) return notFound('店舗が見つかりません');

    let runAiAnalysis = true;
    try {
      const body: unknown = await req.json();
      if (typeof body === 'object' && body !== null && 'runAiAnalysis' in body) {
        runAiAnalysis = Boolean((body as { runAiAnalysis: unknown }).runAiAnalysis);
      }
    } catch {
      // ボディなしの呼び出しも許容する
    }

    const budget = createBudgetGuard();
    const outcome = await enrichAndRescore(business, buildPhase2Deps(budget), { runAiAnalysis });

    return ok({
      business: outcome.business,
      errors: outcome.errors,
      aiUsed: outcome.aiUsed,
      actualCostUsd: budget.sessionSpend,
    });
  } catch (e) {
    return fail(e);
  }
}
