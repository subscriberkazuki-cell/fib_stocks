// §8-4 営業機会検出パターン。
// AIに投げる前にルールベースで当てておくことで、AI無しでも営業角度が出る
// （＝AIプロバイダ未設定でもツールとして成立する）。

import type { SalesPattern, WebsiteStatus } from '@/types/business';
import { isMissingOwnWebsite } from '@/lib/detection/noWebsiteDetection';

export interface PatternInput {
  rating: number | null;
  reviewCount: number | null;
  websiteStatus: WebsiteStatus;
  websiteOpportunityScore: number | null;
  hasSns: boolean;
  isHighTicket: boolean;
  isReservationBased: boolean;
}

export interface PatternMatch {
  pattern: SalesPattern;
  label: string;
  reason: string;
  /** 提案内容の説明文 */
  recommendedOffer: string;
  /** offerings.ts のキー。UIから実際のプラン情報を引くために使う */
  offeringKey: string;
}

/** 最も強いパターンを1つ返す。上から順に優先度が高い */
export function detectSalesPattern(input: PatternInput): PatternMatch | null {
  const rating = input.rating ?? 0;
  const reviews = input.reviewCount ?? 0;
  const noSite = isMissingOwnWebsite(input.websiteStatus);
  const hasOldSite =
    (input.websiteStatus === 'official_low_quality') &&
    (input.websiteOpportunityScore ?? 0) >= 50;

  // パターンB: 高評価・多レビュー・古いHP → リニューアル営業
  // Lead Score だけでは拾えない層なので、パターンAより先に判定する
  if (rating >= 4.5 && reviews >= 300 && hasOldSite) {
    return {
      pattern: 'B',
      label: 'リニューアル営業',
      reason: `評価${rating}・レビュー${reviews}件と実績が十分ある一方、既存サイトの改善余地が大きい状態です。`,
      recommendedOffer: 'リニューアル提案（モバイル対応・予約導線・SEO基本設定の刷新）',
      offeringKey: 'site_renewal',
    };
  }

  // パターンA: 高評価・多レビュー・HPなし → 最優先
  if (rating >= 4.5 && reviews >= 100 && noSite) {
    return {
      pattern: 'A',
      label: '最優先ターゲット',
      reason: `評価${rating}・レビュー${reviews}件と商売が成立しているのに、公式サイトがない状態です。`,
      recommendedOffer: '5ページ型の公式サイト（店舗紹介・メニュー・アクセス・問い合わせ）',
      offeringKey: 'site_standard',
    };
  }

  // パターンD: 予約型業態 + HPなし → 予約導線
  if (input.isReservationBased && noSite) {
    return {
      pattern: 'D',
      label: '予約導線の構築',
      reason: '予約が売上に直結する業態でありながら、自前の予約導線がWeb上にない状態です。',
      recommendedOffer: '予約対応サイト（予約フォーム／外部予約システム連携）',
      offeringKey: 'site_reservation',
    };
  }

  // パターンE: 高単価業態 + HPなし
  if (input.isHighTicket && noSite) {
    return {
      pattern: 'E',
      label: '高単価業態',
      reason: '単価が高く、事前の情報収集が意思決定に影響する業態なのに、公式サイトがありません。',
      recommendedOffer: '体験・相談申込ページ（高単価業態は、まず試してもらう導線が効く）',
      offeringKey: 'lp_trial',
    };
  }

  // パターンC: SNSはある + HPなし → SNSから公式HPへの導線
  if (input.hasSns && noSite) {
    return {
      pattern: 'C',
      label: 'SNS→公式HP導線',
      reason: 'SNSでの発信はあるものの、受け皿となる公式サイトがなく、流入が取りこぼされている可能性があります。',
      recommendedOffer: '1ページ型サイト（SNSからの着地点／店舗情報と問い合わせに集約）',
      offeringKey: 'site_onepage',
    };
  }

  return null;
}
