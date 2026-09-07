import { describe, expect, it } from 'vitest';
import { calculateLeadScore, meetsMinPriority, scoreToPriority } from '@/lib/scoring/leadScore';
import {
  calculateWebPresenceScore,
  evaluateWebsiteOpportunity,
  judgeOfficialSiteQuality,
} from '@/lib/scoring/websitePresenceScore';
import { detectSalesPattern } from '@/lib/scoring/salesPatterns';
import { DEFAULT_PRIORITY_THRESHOLDS, DEFAULT_WEIGHTS } from '@/config/defaults';
import type { WebsiteSignals } from '@/types/business';

const W = DEFAULT_WEIGHTS;

describe('calculateLeadScore', () => {
  const base = {
    rating: null,
    reviewCount: null,
    hasNoWebsite: false,
    hasSns: false,
    hasPhone: false,
    isLocalDenseCategory: false,
    isFootTrafficCategory: false,
    webImprovementPotential: 0,
  };

  it('何も条件を満たさなければ0点', () => {
    expect(calculateLeadScore(base, W).total).toBe(0);
  });

  it('すべて満たせば100点', () => {
    const r = calculateLeadScore(
      {
        rating: 5,
        reviewCount: 1000,
        hasNoWebsite: true,
        hasSns: true,
        hasPhone: true,
        isLocalDenseCategory: true,
        isFootTrafficCategory: true,
        webImprovementPotential: 1,
      },
      W
    );
    expect(r.total).toBe(100);
  });

  it('「評価4.7・レビュー200件・SNSあり・HPなし」が「評価4.0・レビュー5件・HPなし」を明確に上回る', () => {
    // これはこのスコアの存在理由そのもの（§8-2）
    const strong = calculateLeadScore(
      { ...base, rating: 4.7, reviewCount: 200, hasNoWebsite: true, hasSns: true, hasPhone: true, webImprovementPotential: 1 },
      W
    );
    const weak = calculateLeadScore(
      { ...base, rating: 4.0, reviewCount: 5, hasNoWebsite: true, hasPhone: true, webImprovementPotential: 1 },
      W
    );
    expect(strong.total).toBeGreaterThan(weak.total + 15);
  });

  it('評価は3.0を下限として正規化する（3.0で満点の6割入らない）', () => {
    const at3 = calculateLeadScore({ ...base, rating: 3.0 }, W);
    const at5 = calculateLeadScore({ ...base, rating: 5.0 }, W);
    expect(at3.rating).toBe(0);
    expect(at5.rating).toBe(W.rating);
  });

  it('レビュー件数は対数スケールで、500件付近で頭打ちになる', () => {
    const at500 = calculateLeadScore({ ...base, reviewCount: 500 }, W).reviewCount;
    const at5000 = calculateLeadScore({ ...base, reviewCount: 5000 }, W).reviewCount;
    expect(at500).toBeCloseTo(W.reviewCount, 1);
    expect(at5000).toBeCloseTo(W.reviewCount, 1);

    // 10件と100件では差がつく（頭打ちより手前では効いている）
    const at10 = calculateLeadScore({ ...base, reviewCount: 10 }, W).reviewCount;
    const at100 = calculateLeadScore({ ...base, reviewCount: 100 }, W).reviewCount;
    expect(at100).toBeGreaterThan(at10 + 2);
  });

  it('内訳の合計が total と一致する', () => {
    const r = calculateLeadScore(
      { ...base, rating: 4.2, reviewCount: 87, hasNoWebsite: true, hasSns: true, hasPhone: true, webImprovementPotential: 0.7 },
      W
    );
    const sum =
      r.rating + r.reviewCount + r.noWebsite + r.hasSns + r.hasPhone +
      r.localDensity + r.footTraffic + r.webImprovementPotential;
    expect(Math.round(sum)).toBe(r.total);
  });

  it('使った重みを内訳に含める（後から検証できるように）', () => {
    const r = calculateLeadScore(base, W);
    expect(r.weightsUsed).toEqual(W);
  });

  it('重みを変えると結果が変わる（ハードコードされていない）', () => {
    const custom = { ...W, noWebsite: 50 };
    const a = calculateLeadScore({ ...base, hasNoWebsite: true }, W).total;
    const b = calculateLeadScore({ ...base, hasNoWebsite: true }, custom).total;
    expect(b).toBe(50);
    expect(a).toBe(25);
  });

  it('webImprovementPotential は 0〜1 にクランプされる', () => {
    expect(calculateLeadScore({ ...base, webImprovementPotential: 5 }, W).webImprovementPotential)
      .toBe(W.webImprovementPotential);
    expect(calculateLeadScore({ ...base, webImprovementPotential: -3 }, W).webImprovementPotential).toBe(0);
  });
});

describe('scoreToPriority', () => {
  const T = DEFAULT_PRIORITY_THRESHOLDS;

  it('閾値どおりに割り当てる', () => {
    expect(scoreToPriority(90, T)).toBe('S');
    expect(scoreToPriority(85, T)).toBe('S');
    expect(scoreToPriority(84, T)).toBe('A');
    expect(scoreToPriority(70, T)).toBe('A');
    expect(scoreToPriority(55, T)).toBe('B');
    expect(scoreToPriority(40, T)).toBe('C');
    expect(scoreToPriority(39, T)).toBe('D');
  });

  it('閾値を変えると割り当ても変わる（設定から外出しされている）', () => {
    expect(scoreToPriority(60, { S: 60, A: 50, B: 40, C: 30 })).toBe('S');
  });
});

describe('meetsMinPriority', () => {
  it('下限なしなら常に通る', () => {
    expect(meetsMinPriority('D', null)).toBe(true);
  });
  it('下限以上だけ通す', () => {
    expect(meetsMinPriority('S', 'A')).toBe(true);
    expect(meetsMinPriority('A', 'A')).toBe(true);
    expect(meetsMinPriority('B', 'A')).toBe(false);
  });
});

describe('calculateWebPresenceScore', () => {
  it('仕様どおりの7段階', () => {
    expect(calculateWebPresenceScore('official_good')).toBe(0);
    expect(calculateWebPresenceScore('official_low_quality')).toBe(20);
    expect(calculateWebPresenceScore('sns_only')).toBe(40);
    expect(calculateWebPresenceScore('portal_only')).toBe(50);
    expect(calculateWebPresenceScore('multiple_portals')).toBe(60);
    expect(calculateWebPresenceScore('profile_only')).toBe(80);
    expect(calculateWebPresenceScore('none')).toBe(100);
  });
});

function signals(over: Partial<WebsiteSignals> = {}): WebsiteSignals {
  return {
    reachable: true, hasOwnDomain: true, hasSsl: true, isMobileFriendly: true,
    responseTimeMs: 300, textLength: 3000, imageCount: 12,
    hasMenuOrServiceInfo: true, hasPriceInfo: true, hasOpeningHours: true, hasAccessInfo: true,
    hasTelLink: true, hasContactForm: true, hasReservationLink: true, hasSnsLinks: true,
    hasMapEmbed: true, hasTitle: true, hasMetaDescription: true, hasOgp: true,
    hasStructuredData: true, hasViewportMeta: true,
    latestDateFound: new Date().toISOString().slice(0, 10),
    ...over,
  };
}

describe('evaluateWebsiteOpportunity', () => {
  it('サイトが無い/到達できないなら機会は最大の100', () => {
    expect(evaluateWebsiteOpportunity(null).score).toBe(100);
    expect(evaluateWebsiteOpportunity(signals({ reachable: false })).score).toBe(100);
  });

  it('すべて満たしていれば0', () => {
    expect(evaluateWebsiteOpportunity(signals()).score).toBe(0);
  });

  it('欠けている項目が増えるほどスコアが上がる', () => {
    const some = evaluateWebsiteOpportunity(signals({ isMobileFriendly: false, hasSsl: false })).score;
    const more = evaluateWebsiteOpportunity(
      signals({ isMobileFriendly: false, hasSsl: false, hasContactForm: false, hasTelLink: false })
    ).score;
    expect(some).toBeGreaterThan(0);
    expect(more).toBeGreaterThan(some);
  });

  it('満たしていない項目を items で説明できる', () => {
    const r = evaluateWebsiteOpportunity(signals({ isMobileFriendly: false }));
    const missing = r.items.filter((i) => !i.satisfied).map((i) => i.key);
    expect(missing).toContain('mobile');
  });

  it('3年前の更新は「更新状況」を満たさない', () => {
    const old = new Date(Date.now() - 3 * 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const r = evaluateWebsiteOpportunity(signals({ latestDateFound: old }));
    expect(r.items.find((i) => i.key === 'updated')?.satisfied).toBe(false);
  });
});

describe('judgeOfficialSiteQuality', () => {
  it('未調査なら null（「良い」と決めつけない）', () => {
    expect(judgeOfficialSiteQuality(null)).toBeNull();
  });
  it('整備されたサイトは good', () => {
    expect(judgeOfficialSiteQuality(signals())).toBe('good');
  });
  it('到達できないサイトは low', () => {
    expect(judgeOfficialSiteQuality(signals({ reachable: false }))).toBe('low');
  });
  it('モバイル非対応・SSLなし・フォームなしなら low', () => {
    expect(
      judgeOfficialSiteQuality(
        signals({ isMobileFriendly: false, hasSsl: false, hasContactForm: false, hasTelLink: false, textLength: 200 })
      )
    ).toBe('low');
  });
});

describe('detectSalesPattern', () => {
  const base = {
    rating: 4.0, reviewCount: 20, websiteStatus: 'none' as const,
    websiteOpportunityScore: 100, hasSns: false, isHighTicket: false, isReservationBased: false,
  };

  it('パターンA: 高評価・多レビュー・HPなし', () => {
    const r = detectSalesPattern({ ...base, rating: 4.6, reviewCount: 150 });
    expect(r?.pattern).toBe('A');
  });

  it('パターンB: 高評価・レビュー300件超・古いHP → Aより優先される', () => {
    const r = detectSalesPattern({
      ...base, rating: 4.6, reviewCount: 350,
      websiteStatus: 'official_low_quality', websiteOpportunityScore: 70,
    });
    expect(r?.pattern).toBe('B');
  });

  it('パターンD: 予約型 + HPなし', () => {
    expect(detectSalesPattern({ ...base, isReservationBased: true })?.pattern).toBe('D');
  });

  it('パターンE: 高単価 + HPなし', () => {
    expect(detectSalesPattern({ ...base, isHighTicket: true })?.pattern).toBe('E');
  });

  it('パターンC: SNSあり + HPなし', () => {
    expect(detectSalesPattern({ ...base, hasSns: true })?.pattern).toBe('C');
  });

  it('整備済みのHPがあれば該当なし', () => {
    expect(
      detectSalesPattern({ ...base, websiteStatus: 'official_good', websiteOpportunityScore: 10 })
    ).toBeNull();
  });
});
