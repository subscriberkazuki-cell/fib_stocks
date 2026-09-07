// Phase 2 + AI分析 + 再スコアリングをまとめて1店舗に適用する。
//
// Phase 1 の暫定スコアは「サイト未調査」前提だったので、
// Phase 2 の実測結果が入った時点で必ず再計算する。
// このとき営業メモ・ステータスは絶対に触らない（ユーザーの入力だから）。

import 'server-only';
import type { DatabaseSync } from 'node:sqlite';
import type { Business, SalesAnalysis } from '@/types/business';
import type { Phase2Deps } from './phase2';
import { enrichBusiness } from './phase2';
import { calculateLeadScore, scoreToPriority } from '@/lib/scoring/leadScore';
import { evaluateWebsiteOpportunity } from '@/lib/scoring/websitePresenceScore';
import { isMissingOwnWebsite } from '@/lib/detection/noWebsiteDetection';
import { detectSalesPattern } from '@/lib/scoring/salesPatterns';
import { findCategoryPreset } from '@/config/defaults';
import { BudgetExceededError } from '@/lib/budget/budgetGuard';
import * as repo from '@/lib/db/repository';
import { describeStatus } from '@/lib/labels';

export { describeStatus };

export interface EnrichOutcome {
  business: Business;
  errors: string[];
  aiUsed: boolean;
}

export async function enrichAndRescore(
  biz: Business,
  deps: Phase2Deps,
  opts: { runAiAnalysis: boolean; db?: DatabaseSync }
): Promise<EnrichOutcome> {
  const settings = repo.getScoringSettings(opts.db);
  const enrichment = await enrichBusiness(biz, deps);

  const preset = findCategoryPreset(biz.category);
  const noWebsite = isMissingOwnWebsite(enrichment.websiteStatus);
  const opportunity = enrichment.websiteOpportunityScore;

  const breakdown = calculateLeadScore(
    {
      rating: biz.rating?.value ?? null,
      reviewCount: biz.reviewCount?.value ?? null,
      hasNoWebsite: noWebsite,
      hasSns: enrichment.socialUrls.length > 0,
      hasPhone: biz.phone !== null,
      isLocalDenseCategory: preset?.localDense ?? false,
      isFootTrafficCategory: preset?.footTraffic ?? false,
      // Phase 2 後は実測の Opportunity Score を使う（推測ではなく計測値）
      webImprovementPotential: (opportunity ?? 50) / 100,
    },
    settings.weights
  );

  const pattern = detectSalesPattern({
    rating: biz.rating?.value ?? null,
    reviewCount: biz.reviewCount?.value ?? null,
    websiteStatus: enrichment.websiteStatus,
    websiteOpportunityScore: opportunity,
    hasSns: enrichment.socialUrls.length > 0,
    isHighTicket: preset?.highTicket ?? false,
    isReservationBased: preset?.reservationBased ?? false,
  });

  const errors = [...enrichment.errors];
  let salesAnalysis: SalesAnalysis | null = biz.salesAnalysis;
  let aiUsed = false;

  if (opts.runAiAnalysis) {
    try {
      const observedWeaknesses = enrichment.websiteSignals
        ? evaluateWebsiteOpportunity(enrichment.websiteSignals)
            .items.filter((i) => !i.satisfied)
            .map((i) => i.label)
        : [];

      const payload = await deps.ai.analyzeSalesOpportunity({
        businessName: biz.name,
        category: biz.category,
        address: biz.address,
        rating: biz.rating?.value ?? null,
        reviewCount: biz.reviewCount?.value ?? null,
        websiteStatus: describeStatus(enrichment.websiteStatus),
        websiteOpportunityScore: opportunity,
        hasPhone: biz.phone !== null,
        hasEmail: enrichment.email !== null,
        socialUrls: enrichment.socialUrls,
        detectedPattern: pattern
          ? { label: pattern.label, reason: pattern.reason, recommendedOffer: pattern.recommendedOffer }
          : null,
        observedWeaknesses,
        regulatoryNotes: biz.regulatoryNotes,
      });

      aiUsed = true;

      if (payload) {
        salesAnalysis = {
          model: deps.ai.modelId,
          generatedAt: new Date().toISOString(),
          opportunityScore: payload.score,
          reason: payload.reason,
          strengths: payload.strengths,
          weaknesses: payload.weaknesses,
          salesAngle: payload.sales_angle,
          recommendedOffer: payload.recommended_offer,
          storeTypeTags: payload.store_type_tags,
          estimatedPriority: payload.estimated_priority,
          matchedPattern: pattern?.pattern ?? null,
          talk15s: payload.talk_15s,
          talk30s: payload.talk_30s,
          talk60s: payload.talk_60s,
          emailDraft: payload.email_draft,
          hpPlan: payload.hp_plan,
        };
      } else {
        // 3回リトライしても構造化出力が得られなかった。捏造で埋めずに記録だけ残す（§9-4）
        errors.push('AI営業分析: 構造化された出力が得られなかったため、AI分析は未生成のままです');
      }
    } catch (e) {
      if (e instanceof BudgetExceededError) throw e;
      errors.push(`AI営業分析に失敗: ${e instanceof Error ? e.message : '不明なエラー'}`);
    }
  }

  const updated: Business = {
    ...biz,
    websiteUrl: enrichment.officialSiteUrl,
    websiteStatus: enrichment.websiteStatus,
    webPresenceScore: enrichment.webPresenceScore,
    websiteOpportunityScore: enrichment.websiteOpportunityScore,
    websiteSignals: enrichment.websiteSignals,
    candidateUrls: enrichment.candidateUrls,
    socialUrls: enrichment.socialUrls,
    email: enrichment.email,
    leadScore: breakdown.total,
    leadScoreBreakdown: breakdown,
    salesPriority: scoreToPriority(breakdown.total, settings.thresholds),
    salesAnalysis,
    phase2CompletedAt: new Date().toISOString(),
    lastCheckedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  repo.upsertBusiness(updated, opts.db);

  // Phase 2 完了時点のスコアをスナップショットとして残す（§10-3）。
  // これが「高スコアの店が本当に成約したか」を後から検証する材料になる。
  repo.recordHistory(
    {
      businessId: updated.id,
      event: 'score_snapshot',
      rating: updated.rating?.value ?? null,
      reviewCount: updated.reviewCount?.value ?? null,
      websiteStatus: updated.websiteStatus,
      leadScore: updated.leadScore,
      leadScoreBreakdown: updated.leadScoreBreakdown,
      leadStatus: updated.leadStatus,
      note: `Phase2完了（${biz.leadScore} → ${updated.leadScore}点）`,
    },
    opts.db
  );

  return { business: updated, errors, aiUsed };
}
