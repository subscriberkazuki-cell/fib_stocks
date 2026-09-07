// Phase 1 のフィルタは「AIを使わない」ことが仕様の核。
// ここが緩むと Phase 2 に流れる件数が増え、コストが跳ねる。

import { describe, expect, it } from 'vitest';
import { passesPhase1Filter, scoreCandidate } from '@/lib/orchestrator/phase1';
import { DEFAULT_CRITERIA, DEFAULT_PRIORITY_THRESHOLDS, DEFAULT_WEIGHTS } from '@/config/defaults';
import type { BusinessCandidate, SearchCriteria } from '@/types/business';

function candidate(over: Partial<BusinessCandidate> = {}): BusinessCandidate {
  return {
    sourceBusinessId: 'c1', source: 'test', name: 'さくら整体院',
    category: '整体・リラクゼーション', address: '千葉県柏市旭町1-2-3',
    prefecture: '千葉県', city: '柏市', latitude: 35.86, longitude: 139.97,
    rating: 4.5, reviewCount: 60, phone: '04-7167-1111',
    hasWebsiteFieldPopulated: false, websiteUrlRaw: null,
    ...over,
  };
}

const criteria: SearchCriteria = { ...DEFAULT_CRITERIA };
const settings = { weights: DEFAULT_WEIGHTS, thresholds: DEFAULT_PRIORITY_THRESHOLDS };

describe('passesPhase1Filter', () => {
  it('条件を満たす候補を通す', () => {
    expect(passesPhase1Filter(candidate(), criteria, true)).toBe(true);
  });

  it('評価が閾値未満なら落とす', () => {
    expect(passesPhase1Filter(candidate({ rating: 3.5 }), criteria, true)).toBe(false);
  });

  it('レビュー件数が閾値未満なら落とす', () => {
    expect(passesPhase1Filter(candidate({ reviewCount: 2 }), criteria, true)).toBe(false);
  });

  it('評価が付いていない店舗は落とす（商売が成立しているか判断できない）', () => {
    expect(passesPhase1Filter(candidate({ rating: null }), criteria, true)).toBe(false);
  });

  it('公式サイトがある店舗は noWebsiteOnly なら落とす', () => {
    expect(
      passesPhase1Filter(
        candidate({ hasWebsiteFieldPopulated: true, websiteUrlRaw: 'https://x.jp/' }),
        criteria,
        true
      )
    ).toBe(false);
  });

  it('リニューアル営業を狙う設定なら、サイトありでも Phase 2 に進める', () => {
    expect(
      passesPhase1Filter(
        candidate({ hasWebsiteFieldPopulated: true, websiteUrlRaw: 'https://x.jp/' }),
        { ...criteria, includeLowQualitySite: true },
        true
      )
    ).toBe(true);
  });

  it('requirePhone のとき電話がなければ落とす', () => {
    expect(passesPhase1Filter(candidate({ phone: null }), { ...criteria, requirePhone: true }, true)).toBe(false);
  });

  it('営業対象外の組織（公共機関・宗教法人等）は除外する', () => {
    expect(passesPhase1Filter(candidate({ name: '柏市役所 沼南支所' }), criteria, true)).toBe(false);
    expect(passesPhase1Filter(candidate({ name: '諏訪神社' }), criteria, true)).toBe(false);
  });

  it('評価を持たないプロバイダでは評価条件を適用しない（全件消えないように）', () => {
    // OSM のように rating を持たないソースでは、評価フィルタで全滅させない
    expect(
      passesPhase1Filter(candidate({ rating: null, reviewCount: null }), criteria, false)
    ).toBe(true);
  });
});

describe('scoreCandidate', () => {
  it('電話が取れた場合だけ出所付きで保存する', () => {
    const { business } = scoreCandidate(candidate(), settings);
    expect(business.phone?.value).toBe('04-7167-1111');
    expect(business.phone?.source).toBe('business_data_provider');
  });

  it('電話がなければ null（推測しない）', () => {
    const { business } = scoreCandidate(candidate({ phone: null }), settings);
    expect(business.phone).toBeNull();
  });

  it('Phase 1 の時点ではメールは必ず null（まだ調べていない）', () => {
    const { business } = scoreCandidate(candidate(), settings);
    expect(business.email).toBeNull();
  });

  it('Phase 1 の時点ではAI分析を持たない', () => {
    const { business } = scoreCandidate(candidate(), settings);
    expect(business.salesAnalysis).toBeNull();
    expect(business.phase2CompletedAt).toBeNull();
  });

  it('サイトなしの店舗は Web Presence Score 100 になる', () => {
    const { business } = scoreCandidate(candidate(), settings);
    expect(business.websiteStatus).toBe('none');
    expect(business.webPresenceScore).toBe(100);
  });

  it('規制業種には注記が付くが、スコアは下がらない', () => {
    const clinic = scoreCandidate(
      candidate({ name: 'さくら歯科クリニック', category: 'クリニック・歯科' }),
      settings
    ).business;
    const plain = scoreCandidate(candidate({ category: 'クリニック・歯科' }), settings).business;

    expect(clinic.regulatoryNotes.length).toBeGreaterThan(0);
    expect(clinic.leadScore).toBe(plain.leadScore);
  });

  it('スコアの内訳を保存する（後から検証できるように）', () => {
    const { business } = scoreCandidate(candidate(), settings);
    expect(business.leadScoreBreakdown).not.toBeNull();
    expect(business.leadScoreBreakdown?.weightsUsed).toEqual(DEFAULT_WEIGHTS);
  });
});
