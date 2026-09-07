// 検索の実行。ジョブを作り、Phase 1 → （任意で）Phase 2 まで回す。
//
// 予算超過で止まった場合も 200 ではなく 402 にはせず、
// 「途中まで取得できた」という結果を返す。ここまでの成果は保持されており、
// /api/jobs/[id]/resume で続きから再開できる（§12-2）。

import type { NextRequest, NextResponse } from 'next/server';
import { createBudgetGuard, buildPhase1Deps, buildPhase2Deps } from '@/lib/orchestrator/deps';
import { planSubQueries } from '@/lib/orchestrator/subQueryPlanner';
import { runPhase1Job } from '@/lib/orchestrator/phase1';
import { enrichAndRescore } from '@/lib/orchestrator/enrichPipeline';
import { parseCriteria } from '@/lib/api/criteriaSchema';
import { badRequest, fail, ok } from '@/lib/api/respond';
import { isBudgetExceeded } from '@/lib/budget/budgetGuard';
import * as repo from '@/lib/db/repository';
import { env } from '@/config/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Phase 2 は1リクエストで回す件数に上限を設ける。時間もコストも青天井にしないため */
const PHASE2_BATCH_LIMIT = 25;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await req.json();
    const criteria = parseCriteria(body);

    // レート制限（§4-3）。異常な連続検索を止める。
    const recent = repo.countRecentSearches(60);
    if (recent >= env.searchRateLimitPerHour) {
      return badRequest(
        `直近1時間の検索回数が上限（${env.searchRateLimitPerHour}回）に達しました。` +
          'SEARCH_RATE_LIMIT_PER_HOUR で調整できます。'
      );
    }

    const budget = createBudgetGuard();
    const subQueries = planSubQueries(criteria);
    const job = repo.createJob(criteria, subQueries);

    // ---- Phase 1 ----
    const phase1 = await runPhase1Job(job, buildPhase1Deps(budget));

    // ---- Phase 2（Phase 1 を通過した店舗だけ）----
    let phase2Count = 0;
    const phase2Errors: string[] = [];
    let phase2StoppedByBudget = false;

    if (criteria.runPhase2 && !phase1.stoppedByBudget) {
      const targets = repo
        .listBusinesses({
          minPriority: criteria.minPriority ?? undefined,
          sort: 'leadScore',
          limit: PHASE2_BATCH_LIMIT,
        })
        .filter((b) => b.phase2CompletedAt === null);

      const deps = buildPhase2Deps(budget);
      for (const target of targets) {
        try {
          const outcome = await enrichAndRescore(target, deps, {
            runAiAnalysis: criteria.runAiAnalysis,
          });
          phase2Count++;
          phase2Errors.push(...outcome.errors.map((e) => `${target.name}: ${e}`));
        } catch (e) {
          if (isBudgetExceeded(e)) {
            phase2StoppedByBudget = true;
            phase2Errors.push(e.message);
            break;
          }
          phase2Errors.push(`${target.name}: ${e instanceof Error ? e.message : '不明なエラー'}`);
        }
      }
    }

    const finalJob = repo.getJob(job.id);
    const totalCost = budget.sessionSpend;

    repo.recordSearchLog({
      jobId: job.id,
      region: criteria.region.city ?? criteria.region.prefecture ?? '指定地点',
      category: criteria.categories.join(',') || '全業種',
      criteria,
      resultCount: phase1.fetched,
      qualifiedCount: phase1.qualified,
      newBusinessCount: phase1.created,
      duplicateCount: phase1.duplicates,
      apiRequestCount: finalJob?.totalSubQueries ?? 0,
      apiItemCount: phase1.fetched,
      apiCostUsd: phase1.costUsd,
      webSearchCostUsd: 0,
      aiCostUsd: 0,
      totalCostUsd: totalCost,
    });

    return ok({
      jobId: job.id,
      job: repo.getJob(job.id),
      phase1,
      phase2: {
        enrichedCount: phase2Count,
        stoppedByBudget: phase2StoppedByBudget,
        errors: phase2Errors.slice(0, 20),
        remaining: repo.listBusinesses({ limit: 1000 }).filter((b) => b.phase2CompletedAt === null).length,
      },
      actualCostUsd: totalCost,
      budget: budget.status(),
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'ZodError') return badRequest(`検索条件が不正です: ${e.message}`);
    return fail(e);
  }
}
