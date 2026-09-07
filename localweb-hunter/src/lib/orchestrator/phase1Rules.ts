// Phase 1 のルールベース判定（§6）
//
// **このファイルにはAI呼び出しもDBアクセスも入れない。**
// Phase 1 で許されるのは数値フィルタとドメイン照合だけであり、
// それをファイル境界として表現している。純粋関数なので単体テストできる。

import type { Business, BusinessCandidate, SearchCriteria } from '@/types/business';
import { sourced } from '@/types/business';
import { determineWebsiteStatus, toCandidateUrl, isMissingOwnWebsite } from '@/lib/detection/noWebsiteDetection';
import { calculateWebPresenceScore } from '@/lib/scoring/websitePresenceScore';
import { calculateLeadScore, scoreToPriority } from '@/lib/scoring/leadScore';
import { isExcludedOrganization, regulatoryNotesFor } from '@/lib/rules/exclusions';
import { findCategoryPreset } from '@/config/defaults';
import type { LeadScoreWeights, PriorityThresholds } from '@/types/business';

export interface ScoringSettings {
  weights: LeadScoreWeights;
  thresholds: PriorityThresholds;
}

/**
 * ルールベースのフィルタ（§6）。AIは使わない。
 * プロバイダが評価を返さない場合（OSM等）は、評価条件を適用しない。
 * 「取れないものを0点として落とす」と、全件が消えてしまうため。
 */
export function passesPhase1Filter(
  c: BusinessCandidate,
  criteria: SearchCriteria,
  providerHasRatings: boolean
): boolean {
  if (isExcludedOrganization(c.name, c.category)) return false;

  if (providerHasRatings) {
    if (c.rating !== null && c.rating < criteria.minRating) return false;
    if (c.reviewCount !== null && c.reviewCount < criteria.minReviewCount) return false;
    // 評価が付いていない店舗は「商売が成立しているか」を判断できないので、
    // 最低レビュー件数が1件以上に設定されているなら落とす
    if (c.rating === null && criteria.minRating > 0) return false;
  }

  // Stage 1: プロバイダのwebsiteフィールドが埋まっているものを除外するか
  if (criteria.noWebsiteOnly && c.hasWebsiteFieldPopulated) {
    // ただし低品質サイトも対象に含める設定なら、ここでは落とさず Phase 2 で判定する
    if (!criteria.includeLowQualitySite) return false;
  }

  if (criteria.requirePhone && !c.phone) return false;

  return true;
}

/** Phase 1 時点の暫定スコア。Web検索・AI無しで出せる範囲だけで計算する */
export function scoreCandidate(
  c: BusinessCandidate,
  settings: ScoringSettings
): { business: Omit<Business, 'id' | 'createdAt' | 'updatedAt'>; } {
  const candidateUrls = c.websiteUrlRaw ? [toCandidateUrl(c.websiteUrlRaw)] : [];
  const { status, officialUrl, socialUrls } = determineWebsiteStatus({
    candidates: candidateUrls,
    hasProviderWebsiteField: c.hasWebsiteFieldPopulated,
    officialSiteQuality: null,
  });

  const preset = findCategoryPreset(c.category);
  const noWebsite = isMissingOwnWebsite(status);

  const breakdown = calculateLeadScore(
    {
      rating: c.rating,
      reviewCount: c.reviewCount,
      hasNoWebsite: noWebsite,
      hasSns: socialUrls.length > 0,
      hasPhone: Boolean(c.phone),
      isLocalDenseCategory: preset?.localDense ?? false,
      isFootTrafficCategory: preset?.footTraffic ?? false,
      // Phase 2 未実施の時点では、サイト無しなら改善余地1.0、
      // サイトありは未調査なので中庸の0.5に置く（未調査を「良い」と決めつけない）
      webImprovementPotential: noWebsite ? 1 : 0.5,
    },
    settings.weights
  );

  const nowIso = new Date().toISOString();

  return {
    business: {
      source: c.source,
      sourceBusinessId: c.sourceBusinessId,
      name: c.name,
      category: c.category,
      address: c.address,
      prefecture: c.prefecture,
      city: c.city,
      latitude: c.latitude,
      longitude: c.longitude,
      // 電話はプロバイダから取れたものだけ。推測生成はしない（§2-3）
      phone: c.phone ? sourced(c.phone, 'business_data_provider', { verified: true }) : null,
      email: null, // Phase 2 で公開情報から探す。見つからなければ null のまま
      rating: c.rating !== null ? sourced(c.rating, 'business_data_provider', { verified: true }) : null,
      reviewCount: c.reviewCount !== null ? sourced(c.reviewCount, 'business_data_provider', { verified: true }) : null,
      websiteUrl: officialUrl,
      websiteStatus: status,
      webPresenceScore: calculateWebPresenceScore(status),
      websiteOpportunityScore: null,
      websiteSignals: null,
      candidateUrls,
      socialUrls,
      googleMapsUrl: c.googleMapsUrl ?? null,
      openingHours: c.openingHours ?? null,
      leadScore: breakdown.total,
      leadScoreBreakdown: breakdown,
      salesPriority: scoreToPriority(breakdown.total, settings.thresholds),
      salesAnalysis: null,
      regulatoryNotes: regulatoryNotesFor(c.name, c.category),
      leadStatus: '未接触',
      nextAction: null,
      lastContactedAt: null,
      nextContactAt: null,
      salesNotes: null,
      dealValue: null,
      phase2CompletedAt: null,
      lastCheckedAt: nowIso,
    },
  };
}

