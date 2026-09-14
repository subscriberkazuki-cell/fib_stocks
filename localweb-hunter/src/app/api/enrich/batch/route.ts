// 未調査の店舗をまとめてPhase 2にかける。
// 検索時のバッチ上限や時間切れで残った分を、あとから進めるための入口。

import type { NextRequest, NextResponse } from 'next/server';
import { buildPhase2Deps, createBudgetGuard } from '@/lib/orchestrator/deps';
import { runPhase2Batch } from '@/lib/orchestrator/phase2Batch';
import { countPendingPhase2, listBusinesses } from '@/lib/db/repository';
import { fail, ok } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_BATCH = 25;
const DEADLINE_MARGIN_MS = 30_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();

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

    // Lead Score が高い順に調査する。予算や時間が尽きても、
    // 営業価値の高い店舗から順に埋まっている状態になる。
    const targets = listBusinesses({ phase2Done: false, sort: 'leadScore', limit });

    const budget = createBudgetGuard();
    const result = await runPhase2Batch(targets, buildPhase2Deps(budget), {
      runAiAnalysis,
      deadlineAt: startedAt + maxDuration * 1000 - DEADLINE_MARGIN_MS,
    });

    return ok({
      enriched: result.enriched,
      remaining: countPendingPhase2(),
      stoppedByBudget: result.stoppedByBudget,
      stoppedByDeadline: result.stoppedByDeadline,
      errors: result.errors.slice(0, 20),
      actualCostUsd: budget.sessionSpend,
      elapsedMs: Date.now() - startedAt,
      budget: budget.status(),
    });
  } catch (e) {
    return fail(e);
  }
}
