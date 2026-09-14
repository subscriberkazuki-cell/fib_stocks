// 検索の実行。ジョブを作り、Phase 1 →（任意で）Phase 2 まで回す。
//
// 途中で止まっても（予算上限・時間切れ・APIエラー）、そこまでの成果は必ずDBに残る。
// 続きは /api/jobs/[id]/resume と /api/enrich/batch から進められる（§12-2, §12-3）。

import type { NextRequest, NextResponse } from 'next/server';
import { createBudgetGuard, buildPhase1Deps, buildPhase2Deps } from '@/lib/orchestrator/deps';
import { planSubQueries } from '@/lib/orchestrator/subQueryPlanner';
import { runPhase1Job } from '@/lib/orchestrator/phase1';
import { runPhase2Batch } from '@/lib/orchestrator/phase2Batch';
import { parseCriteria } from '@/lib/api/criteriaSchema';
import { badRequest, fail, ok } from '@/lib/api/respond';
import * as repo from '@/lib/db/repository';
import { env } from '@/config/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** 1リクエストで着手する上限。時間切れの判定は phase2Batch 側の締め切りが行う */
const PHASE2_BATCH_LIMIT = 25;
/** maxDuration に対する余裕。レスポンス生成とログ書き込みの分を残す */
const DEADLINE_MARGIN_MS = 30_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();

  try {
    const criteria = parseCriteria(await req.json());

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
    let phase2 = {
      enriched: 0, qualified: 0, errors: [] as string[],
      stoppedByBudget: false, stoppedByDeadline: false,
    };

    if (criteria.runPhase2 && !phase1.stoppedByBudget) {
      // 未調査のものだけをSQL側で絞ってから上位N件を取る。
      // LIMIT してから未調査を絞ると、上位が調査済みのとき対象が0件になり
      // Phase 2 が永久に進まなくなる。
      const targets = repo.listBusinesses({
        phase2Done: false,
        minPriority: criteria.minPriority ?? undefined,
        sort: 'leadScore',
        limit: PHASE2_BATCH_LIMIT,
      });

      phase2 = await runPhase2Batch(targets, buildPhase2Deps(budget), {
        runAiAnalysis: criteria.runAiAnalysis,
        deadlineAt: startedAt + maxDuration * 1000 - DEADLINE_MARGIN_MS,
        postFilter: {
          includeSnsOnly: criteria.includeSnsOnly,
          requireEmail: criteria.requireEmail,
          requirePhone: criteria.requirePhone,
        },
      });
    }

    // 実際に課金された額を種別ごとに記録する。0固定にすると後からコスト分析ができない。
    const costs = repo.getJobCostBreakdown(job.id);
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
      apiRequestCount: repo.getJob(job.id)?.totalSubQueries ?? 0,
      apiItemCount: phase1.fetched,
      apiCostUsd: costs.business_data,
      webSearchCostUsd: costs.web_search,
      aiCostUsd: costs.ai,
      totalCostUsd: totalCost,
    });

    return ok({
      jobId: job.id,
      job: repo.getJob(job.id),
      phase1,
      phase2: {
        enrichedCount: phase2.enriched,
        qualifiedCount: phase2.qualified,
        stoppedByBudget: phase2.stoppedByBudget,
        stoppedByDeadline: phase2.stoppedByDeadline,
        errors: phase2.errors.slice(0, 20),
        remaining: repo.countPendingPhase2(),
      },
      actualCostUsd: totalCost,
      costBreakdown: costs,
      elapsedMs: Date.now() - startedAt,
      budget: budget.status(),
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'ZodError') return badRequest(`検索条件が不正です: ${e.message}`);
    return fail(e);
  }
}
