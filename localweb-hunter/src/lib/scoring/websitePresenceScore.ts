// Web Presence Score（§7）と Website Opportunity Score（§8-2）
//
// この2つは別物：
//   Web Presence Score        … Webでの露出がどれだけ弱いか（0=充実, 100=ほぼ無い）
//   Website Opportunity Score … 公式サイトがあっても営業機会がどれだけあるか
//
// 「評価4.6・レビュー300件・古いHPあり」をリニューアル営業として拾うには、
// 後者が要る。Lead Score だけでは拾えない（§8-2）。

import type { WebsiteSignals, WebsiteStatus } from '@/types/business';

const SCORE_BY_STATUS: Record<WebsiteStatus, number> = {
  official_good: 0,
  official_low_quality: 20,
  sns_only: 40,
  portal_only: 50,
  multiple_portals: 60,
  profile_only: 80,
  none: 100,
  unknown: 50, // 未調査。極端な値を入れて順位を歪めない
};

export function calculateWebPresenceScore(status: WebsiteStatus): number {
  return SCORE_BY_STATUS[status];
}

/**
 * Website Opportunity Score（0〜100・高いほど営業機会が大きい）。
 * §8-2 の評価項目を、実測できるシグナルに落として重み付けしたもの。
 * すべて実測値から計算し、AI推定は混ぜない。
 */
export interface OpportunityItem {
  key: string;
  label: string;
  weight: number;
  /** 満たしていれば true = 改善不要 */
  satisfied: boolean;
}

export function evaluateWebsiteOpportunity(signals: WebsiteSignals | null): {
  score: number;
  items: OpportunityItem[];
} {
  // サイトが無い/到達できない場合は「機会は最大」。
  if (!signals || !signals.reachable) {
    return { score: 100, items: [] };
  }

  const item = (key: string, label: string, weight: number, satisfied: boolean): OpportunityItem => ({
    key, label, weight, satisfied,
  });

  const recentlyUpdated = isRecentlyUpdated(signals.latestDateFound);

  const items: OpportunityItem[] = [
    item('ownDomain', '独自ドメイン', 8, signals.hasOwnDomain),
    item('ssl', 'SSL（https）', 8, signals.hasSsl),
    item('mobile', 'モバイル対応', 10, signals.isMobileFriendly),
    item('speed', '表示速度', 6, signals.responseTimeMs !== null && signals.responseTimeMs < 1500),
    item('content', '情報量', 8, signals.textLength >= 1200),
    item('photos', '店舗写真', 5, signals.imageCount >= 5),
    item('menu', 'メニュー・サービス情報', 7, signals.hasMenuOrServiceInfo),
    item('price', '価格情報', 5, signals.hasPriceInfo),
    item('hours', '営業時間', 4, signals.hasOpeningHours),
    item('access', 'アクセス情報', 4, signals.hasAccessInfo),
    item('tel', '電話導線', 6, signals.hasTelLink),
    item('form', '問い合わせフォーム', 6, signals.hasContactForm),
    item('reservation', '予約導線', 5, signals.hasReservationLink),
    item('sns', 'SNS連携', 3, signals.hasSnsLinks),
    item('map', '地図の埋め込み', 3, signals.hasMapEmbed),
    item('seoTitle', 'title設定', 3, signals.hasTitle),
    item('seoDesc', 'meta description', 3, signals.hasMetaDescription),
    item('ogp', 'OGP', 2, signals.hasOgp),
    item('schema', '構造化データ', 2, signals.hasStructuredData),
    item('updated', '更新状況（2年以内）', 2, recentlyUpdated),
  ];

  const totalWeight = items.reduce((a, i) => a + i.weight, 0);
  const missingWeight = items.filter((i) => !i.satisfied).reduce((a, i) => a + i.weight, 0);

  return { score: Math.round((missingWeight / totalWeight) * 100), items };
}

function isRecentlyUpdated(latestDateFound: string | null): boolean {
  if (!latestDateFound) return false;
  const t = Date.parse(latestDateFound);
  if (Number.isNaN(t)) return false;
  const twoYearsMs = 2 * 365 * 24 * 60 * 60 * 1000;
  return Date.now() - t < twoYearsMs;
}

/** Stage 4: 公式サイトを good / low に振り分ける。閾値は Opportunity Score で一本化してある */
export function judgeOfficialSiteQuality(signals: WebsiteSignals | null): 'good' | 'low' | null {
  if (!signals) return null;
  if (!signals.reachable) return 'low';
  const { score } = evaluateWebsiteOpportunity(signals);
  return score <= 30 ? 'good' : 'low';
}
