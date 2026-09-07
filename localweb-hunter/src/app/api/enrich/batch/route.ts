// 未調査の店舗をまとめてPhase 2にかける。
// 検索時に上限で止まった残りを、あとから少しずつ進めるための入口。

import type { NextRequest, NextResponse } from 'next/server';
import { buildPhase2Deps, createBudgetGuard } from '@/lib/orchestrator/deps';
import { enrichAndRescore } from '@/lib/orchestrator/enrichPipeline';
import { isBudgetExceeded } from '@/lib/budget/budgetGuard';
import { listBusinesses } from '@/lib/db/repository';
import { fail, ok } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_BATCH = 25;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    let limit = 10;
    let runAiAnalysis = true;
    try {
      const body: unknown = await req.json();
      if (typeof body === 'object' && body !== null) {
        const b = body as { limit?: unknown; runAiAnalysis?: unknown };
        if (typeof b.limit === 'number') limit = Math.min(Math.max(1, b.limit), MAX_BATCH);
        if (typeof b.runAiAnalysis === 'boolean') runAiAnalysis = b.runAiAnalysis;
      }
    } catch {
      // ボディなしの呼び出しも許容
    }

    // Lead Score が高い（＝営業価値が高そうな）順に調査する。
    // 予算が尽きても、価値の高い店舗から順に埋まっている状態になる。
    const targets = listBusinesses({ sort: 'leadScore', limit: 500 })
      .filter((b) => b.phase2CompletedAt === null)
      .slice(0, limit);

    const budget = createBudgetGuard();
    const deps = buildPhase2Deps(budget);

    let enriched = 0;
    let stoppedByBudget = false;
    const errors: string[] = [];

    for (const target of targets) {
      try {
        const outcome = await enrichAndRescore(target, deps, { runAiAnalysis });
        enriched++;
        errors.push(...outcome.errors.map((e) => `${target.name}: ${e}`));
      } catch (e) {
        if (isBudgetExceeded(e)) {
          stoppedByBudget = true;
          errors.push(e.message);
          break;
        }
        errors.push(`${target.name}: ${e instanceof Error ? e.message : '不明なエラー'}`);
      }
    }

    const remaining = listBusinesses({ limit: 1000 }).filter((b) => b.phase2CompletedAt === null).length;

    return ok({
      enriched,
      remaining,
      stoppedByBudget,
      errors: errors.slice(0, 20),
      actualCostUsd: budget.sessionSpend,
      budget: budget.status(),
    });
  } catch (e) {
    return fail(e);
  }
}
