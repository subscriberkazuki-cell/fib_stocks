// Phase 1 — 安い一次スクリーニング（§6）
//
// **この段階でAIも Web検索も一切使わない。** 使ってよいのは数値フィルタと
// ドメイン照合だけ。ここを守ることが低コストを成立させる唯一の仕組み。
//
// レジューム対応（§12-2）：
//   各サブクエリの完了状態を都度DBに書き、途中で止まっても
//   未完了のサブクエリから再開できる。部分的な成功は必ず保持する。

import 'server-only';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  Business,
  BusinessCandidate,
  SearchCriteria,
  SearchJob,
  SubQuery,
} from '@/types/business';
import type { BusinessDataProvider } from '@/lib/providers/BusinessDataProvider';
import { BudgetExceededError, type BudgetGuard } from '@/lib/budget/budgetGuard';
import { dedupeBatch, findDuplicate, mergeCandidates } from '@/lib/dedupe/dedupe';
import { normalizePhone } from '@/lib/dedupe/phone';
import { meetsMinPriority } from '@/lib/scoring/leadScore';
import { passesPhase1Filter, scoreCandidate } from './phase1Rules';
import * as repo from '@/lib/db/repository';

export { passesPhase1Filter, scoreCandidate } from './phase1Rules';

export interface Phase1Progress {
  fetched: number;
  qualified: number;
  created: number;
  updated: number;
  duplicates: number;
  costUsd: number;
  errors: string[];
  stoppedByBudget: boolean;
  budgetMessage: string | null;
}

export interface Phase1Deps {
  provider: BusinessDataProvider;
  budget: BudgetGuard;
  db?: DatabaseSync;
}

/** 1サブクエリを実行する。ページングは上限まで自動で追う */
async function runSubQuery(
  sq: SubQuery,
  criteria: SearchCriteria,
  deps: Phase1Deps,
  jobId: string
): Promise<{ candidates: BusinessCandidate[]; costUsd: number; requestCount: number }> {
  const collected: BusinessCandidate[] = [];
  let cursor = sq.cursor;
  let costUsd = 0;
  let requestCount = 0;
  const MAX_PAGES = 5;

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await deps.provider.searchBusinesses({
      params: sq.params,
      minRating: criteria.minRating,
      minReviewCount: criteria.minReviewCount,
      cursor,
      jobId,
    });

    collected.push(...res.businesses);
    costUsd += res.costUsd;
    requestCount += res.requestCount;

    // ページングの途中経過もDBに残す。ここで落ちても次回はこのcursorから再開できる
    repo.updateSubQuery(
      sq.id,
      { cursor: res.nextCursor, fetchedCount: collected.length, costUsd },
      deps.db
    );

    if (!res.nextCursor || res.businesses.length === 0) break;
    cursor = res.nextCursor;
  }

  return { candidates: collected, costUsd, requestCount };
}

/**
 * ジョブを実行（または中断地点から再開）する。
 * 予算超過で止まった場合も、そこまでに取得した店舗はすべてDBに残る。
 */
export async function runPhase1Job(job: SearchJob, deps: Phase1Deps): Promise<Phase1Progress> {
  const criteria = job.criteria;
  const settings = repo.getScoringSettings(deps.db);
  const providerHasRatings = deps.provider.name !== 'osm';

  const progress: Phase1Progress = {
    fetched: job.fetchedCount,
    qualified: job.qualifiedCount,
    created: 0,
    updated: 0,
    duplicates: job.duplicateCount,
    costUsd: job.costUsd,
    errors: [],
    stoppedByBudget: false,
    budgetMessage: null,
  };

  repo.updateJob(job.id, { status: 'running', errorMessage: null }, deps.db);

  const pending = repo.getPendingSubQueries(job.id, deps.db);

  for (const sq of pending) {
    repo.updateSubQuery(sq.id, { status: 'running', attempts: sq.attempts + 1 }, deps.db);

    let candidates: BusinessCandidate[] = [];
    try {
      const result = await runSubQuery(sq, criteria, deps, job.id);
      candidates = result.candidates;
      progress.costUsd += result.costUsd;
      repo.updateSubQuery(sq.id, { status: 'completed', errorMessage: null }, deps.db);
    } catch (e) {
      if (e instanceof BudgetExceededError) {
        // 予算上限：即座に停止する。ここまでの成果は保持したまま抜ける（§12-3）
        repo.updateSubQuery(sq.id, { status: 'pending', errorMessage: e.message }, deps.db);
        repo.updateJob(
          job.id,
          {
            status: 'budget_stopped',
            errorMessage: e.message,
            fetchedCount: progress.fetched,
            qualifiedCount: progress.qualified,
            duplicateCount: progress.duplicates,
            costUsd: progress.costUsd,
          },
          deps.db
        );
        progress.stoppedByBudget = true;
        progress.budgetMessage = e.message;
        return progress;
      }

      const msg = e instanceof Error ? e.message : '不明なエラー';
      progress.errors.push(`${sq.label}: ${msg}`);
      // 失敗しても他のサブクエリは続ける。部分的成功を捨てない
      repo.updateSubQuery(sq.id, { status: 'failed', errorMessage: msg }, deps.db);
      continue;
    }

    progress.fetched += candidates.length;

    // バッチ内の重複を先に落としてからDBと照合する（DBアクセスを減らす）
    const { unique, duplicateCount } = dedupeBatch(candidates);
    progress.duplicates += duplicateCount;

    for (const c of unique) {
      if (!passesPhase1Filter(c, criteria, providerHasRatings)) continue;

      const existingCandidates = repo.findDedupeCandidates(
        {
          normalizedPhone: normalizePhone(c.phone),
          name: c.name,
          latitude: c.latitude,
          longitude: c.longitude,
        },
        deps.db
      );

      const dup = findDuplicate(c, existingCandidates);
      const merged = dup ? mergeIntoExisting(c, dup.existing) : c;
      const { business } = scoreCandidate(merged, settings);

      if (dup) {
        progress.duplicates++;
        progress.updated++;
        const before = dup.existing;
        // 既存レコードの営業メモ・ステータスは絶対に上書きしない
        repo.upsertBusiness(
          {
            ...business,
            id: before.id,
            createdAt: before.createdAt,
            updatedAt: new Date().toISOString(),
            leadStatus: before.leadStatus,
            nextAction: before.nextAction,
            lastContactedAt: before.lastContactedAt,
            nextContactAt: before.nextContactAt,
            salesNotes: before.salesNotes,
            dealValue: before.dealValue,
            // Phase 2 の調査結果も、再取得で消さない
            email: business.email ?? before.email,
            websiteSignals: business.websiteSignals ?? before.websiteSignals,
            websiteOpportunityScore: business.websiteOpportunityScore ?? before.websiteOpportunityScore,
            salesAnalysis: before.salesAnalysis,
            phase2CompletedAt: before.phase2CompletedAt,
          },
          deps.db
        );
        recordChangeIfAny(before, business, deps.db);
      } else {
        const id = randomUUID();
        const nowIso = new Date().toISOString();
        repo.upsertBusiness({ ...business, id, createdAt: nowIso, updatedAt: nowIso }, deps.db);
        repo.recordHistory(
          {
            businessId: id,
            event: 'created',
            rating: business.rating?.value ?? null,
            reviewCount: business.reviewCount?.value ?? null,
            websiteStatus: business.websiteStatus,
            leadScore: business.leadScore,
            leadScoreBreakdown: business.leadScoreBreakdown,
            leadStatus: business.leadStatus,
            note: null,
          },
          deps.db
        );
        progress.created++;
      }

      if (meetsMinPriority(business.salesPriority, criteria.minPriority)) progress.qualified++;
    }

    repo.updateJob(
      job.id,
      {
        fetchedCount: progress.fetched,
        qualifiedCount: progress.qualified,
        newCount: progress.created,
        duplicateCount: progress.duplicates,
        costUsd: progress.costUsd,
      },
      deps.db
    );
  }

  const stillPending = repo.getPendingSubQueries(job.id, deps.db);
  repo.updateJob(
    job.id,
    {
      status: stillPending.length > 0 ? 'paused' : 'completed',
      finishedAt: stillPending.length > 0 ? null : new Date().toISOString(),
      errorMessage: progress.errors.length > 0 ? progress.errors.slice(0, 5).join(' / ') : null,
    },
    deps.db
  );

  return progress;
}

/** 既存レコードの情報を候補にマージして、情報が減らないようにする */
function mergeIntoExisting(c: BusinessCandidate, existing: Business): BusinessCandidate {
  return mergeCandidates(c, {
    sourceBusinessId: existing.sourceBusinessId,
    source: existing.source,
    name: existing.name,
    category: existing.category,
    address: existing.address,
    prefecture: existing.prefecture,
    city: existing.city,
    latitude: existing.latitude,
    longitude: existing.longitude,
    rating: existing.rating?.value ?? null,
    reviewCount: existing.reviewCount?.value ?? null,
    phone: existing.phone?.value ?? null,
    hasWebsiteFieldPopulated: existing.websiteUrl !== null,
    websiteUrlRaw: existing.websiteUrl,
    googleMapsUrl: existing.googleMapsUrl ?? undefined,
    openingHours: existing.openingHours ?? undefined,
  });
}

/** 評価・レビュー数・Web状況が変わっていたら履歴に残す（§10-2） */
function recordChangeIfAny(
  before: Business,
  after: Omit<Business, 'id' | 'createdAt' | 'updatedAt'>,
  db?: DatabaseSync
): void {
  const ratingChanged = (before.rating?.value ?? null) !== (after.rating?.value ?? null);
  const reviewChanged = (before.reviewCount?.value ?? null) !== (after.reviewCount?.value ?? null);
  const siteChanged = before.websiteStatus !== after.websiteStatus;
  if (!ratingChanged && !reviewChanged && !siteChanged) return;

  const parts: string[] = [];
  if (ratingChanged) parts.push(`評価 ${before.rating?.value ?? '—'} → ${after.rating?.value ?? '—'}`);
  if (reviewChanged) parts.push(`レビュー ${before.reviewCount?.value ?? '—'} → ${after.reviewCount?.value ?? '—'}`);
  if (siteChanged) parts.push(`Web状況 ${before.websiteStatus} → ${after.websiteStatus}`);

  repo.recordHistory(
    {
      businessId: before.id,
      event: siteChanged ? 'website_changed' : 'rating_changed',
      rating: after.rating?.value ?? null,
      reviewCount: after.reviewCount?.value ?? null,
      websiteStatus: after.websiteStatus,
      leadScore: after.leadScore,
      leadScoreBreakdown: after.leadScoreBreakdown,
      leadStatus: before.leadStatus,
      note: parts.join(' / '),
    },
    db
  );
}
