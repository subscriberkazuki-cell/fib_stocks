// 中断したジョブの再開（§12-2）
// 未完了のサブクエリだけを実行するので、完了済みの分に再課金されない。

import { NextResponse } from 'next/server';
import { buildPhase1Deps, createBudgetGuard } from '@/lib/orchestrator/deps';
import { runPhase1Job } from '@/lib/orchestrator/phase1';
import { getJob, getPendingSubQueries } from '@/lib/db/repository';
import { fail, notFound, ok } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const job = getJob(id);
    if (!job) return notFound('ジョブが見つかりません');

    const pending = getPendingSubQueries(id);
    if (pending.length === 0) {
      return ok({ job, message: '未完了のサブクエリはありません（すでに完了しています）', phase1: null });
    }

    const budget = createBudgetGuard();
    const phase1 = await runPhase1Job(job, buildPhase1Deps(budget));

    return ok({
      job: getJob(id),
      phase1,
      resumedSubQueries: pending.length,
      actualCostUsd: budget.sessionSpend,
      budget: budget.status(),
    });
  } catch (e) {
    return fail(e);
  }
}
